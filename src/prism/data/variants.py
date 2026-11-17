"""Dataset variants for the pre-registered sensitivity analyses (k-core and positive feedback).

A variant starts from the same filtered source files as the main build
(``philly_{reviews,businesses,users}.csv.gz`` in ``data/processed``) and applies an optional star
filter, an iterative k-core, the per-user chronological 70/10/20 split, the frozen text embedding
of each business with train-only pooled user vectors, and the friend graph restricted to the
variant's users. Everything lands in ``data/processed_<name>`` (git-ignored); the aggregate card
goes to ``results/sensitivity/<name>/dataset_card.json`` and never holds identifiers.

Item embeddings of the main build are reused by business when they exist and a sample of them
re-encodes to the same vectors, i.e. the embedded text and model are provably unchanged;
otherwise the items are encoded.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Final

import numpy as np
import numpy.typing as npt
import pandas as pd  # type: ignore[import-untyped]

from prism.data.contracts import (
    ProcessedBusinessSchema,
    ProcessedReviewSchema,
    ProcessedUserSchema,
    SplitSchema,
    validate_referential_integrity,
)
from prism.data.dataset import SPLIT_FILES, load_split
from prism.data.features import build_item_text, encode_items, pool_user_vectors
from prism.data.filtering import iterative_kcore
from prism.data.social import FRIENDS_FILE, build_friend_graph, graph_summary, save_friend_graph
from prism.data.splits import assert_no_leakage, chronological_split, freeze_indices
from prism.io import atomic_write_json

SOURCE_FILES: Final[tuple[str, ...]] = (
    "philly_reviews.csv.gz",
    "philly_businesses.csv.gz",
    "philly_users.csv.gz",
)
FEATURES_FILE: Final[str] = "features_semantic.npz"
INDEX_FILES: Final[tuple[str, str]] = ("user_index.json", "item_index.json")
CARD_NAME: Final[str] = "dataset_card.json"
REUSE_SAMPLE: Final[int] = 64
REUSE_MIN_COSINE: Final[float] = 0.999


@dataclass(frozen=True)
class Variant:
    """A dataset construction: optional minimum star rating, then iterative k-core."""

    name: str
    k_core: int = 15
    min_stars: float | None = None


VARIANTS: dict[str, Variant] = {
    "k10": Variant("k10", k_core=10),
    "k20": Variant("k20", k_core=20),
    "stars4": Variant("stars4", k_core=15, min_stars=4.0),
}


def variant_dir(root: Path, variant: Variant) -> Path:
    """Processed folder of a variant."""
    return root / "data" / f"processed_{variant.name}"


def card_path(root: Path, variant: Variant) -> Path:
    """Aggregate dataset card of a variant."""
    return root / "results" / "sensitivity" / variant.name / CARD_NAME


def select_interactions(reviews: pd.DataFrame, variant: Variant) -> pd.DataFrame:
    """Star filter (stars >= min_stars) then iterative k-core over users and businesses."""
    frame = reviews
    if variant.min_stars is not None:
        frame = frame.loc[frame["stars"].astype(float) >= variant.min_stars]
    frame = frame.reset_index(drop=True)
    user_codes, user_index = pd.factorize(frame["user_id"], sort=False)
    item_codes, item_index = pd.factorize(frame["business_id"], sort=False)
    user_codes = np.asarray(user_codes, dtype=np.int64)
    item_codes = np.asarray(item_codes, dtype=np.int64)
    active_users, active_items = iterative_kcore(
        user_codes, item_codes, len(user_index), len(item_index), variant.k_core
    )
    keep = active_users[user_codes] & active_items[item_codes]
    kept: pd.DataFrame = frame.loc[keep].reset_index(drop=True)
    if kept.empty:
        raise ValueError(f"no interactions survive variant {variant.name}")
    return kept


def _complete(root: Path, variant: Variant) -> bool:
    folder = variant_dir(root, variant)
    names = (*SPLIT_FILES.values(), *INDEX_FILES, FEATURES_FILE, FRIENDS_FILE)
    return all((folder / name).is_file() for name in names) and card_path(root, variant).is_file()


def _item_texts(businesses: pd.DataFrame, ordered_ids: list[str]) -> list[str]:
    """Item texts exactly as the main feature build composes them."""
    if businesses["business_id"].duplicated().any():
        raise ValueError("duplicate business_id in the businesses file")
    rows = businesses.set_index("business_id").to_dict("index")
    texts: list[str] = []
    for business_id in ordered_ids:
        row = rows[business_id]
        texts.append(
            build_item_text(
                str(row.get("name") or ""),
                str(row.get("categories") or ""),
                str(row.get("attributes_json") or "{}"),
            )
        )
    return texts


def _main_embeddings(root: Path) -> tuple[dict[str, int], npt.NDArray[np.float32]] | None:
    main = root / "data" / "processed"
    index_file, feature_file = main / "item_index.json", main / FEATURES_FILE
    if not (index_file.is_file() and feature_file.is_file()):
        return None
    index: dict[str, int] = json.loads(index_file.read_text(encoding="utf-8"))
    with np.load(feature_file) as features:
        items = np.asarray(features["items"], dtype=np.float32)
    if items.shape[0] != len(index):
        return None
    return index, items


def _item_vectors(
    root: Path, ordered_ids: list[str], texts: list[str]
) -> tuple[npt.NDArray[np.float32], dict[str, Any]]:
    """Item embeddings: main-build rows by business where verified, encoded otherwise."""
    reused: npt.NDArray[np.int64] = np.zeros(0, dtype=np.int64)
    verified: bool | None = None
    main = _main_embeddings(root)
    if main is not None:
        index, main_items = main
        reused = np.array(
            [i for i, business in enumerate(ordered_ids) if business in index], dtype=np.int64
        )
        if reused.size:
            take = np.unique(
                np.linspace(0, reused.size - 1, min(REUSE_SAMPLE, reused.size)).astype(int)
            )
            sample = reused[take]
            fresh = encode_items([texts[i] for i in sample])
            rows = main_items[[index[ordered_ids[i]] for i in sample]]
            cosine = np.sum(fresh * rows, axis=1) / np.maximum(
                np.linalg.norm(fresh, axis=1) * np.linalg.norm(rows, axis=1), 1e-12
            )
            verified = bool(cosine.min() >= REUSE_MIN_COSINE)
            if not verified:
                reused = np.zeros(0, dtype=np.int64)
    vectors: npt.NDArray[np.float32] | None = None
    if reused.size and main is not None:
        index, main_items = main
        missing = np.setdiff1d(np.arange(len(ordered_ids)), reused)
        vectors = np.zeros((len(ordered_ids), main_items.shape[1]), dtype=np.float32)
        vectors[reused] = main_items[[index[ordered_ids[i]] for i in reused]]
        if missing.size:
            vectors[missing] = encode_items([texts[i] for i in missing])
        encoded = int(missing.size)
    else:
        vectors = encode_items(texts)
        encoded = len(ordered_ids)
    info = {
        "items_reused": int(reused.size),
        "items_encoded": encoded,
        "reuse_verified": verified,
    }
    return vectors, info


def _summary(
    variant: Variant,
    split_frame: pd.DataFrame,
    n_users: int,
    n_items: int,
    n_source: int,
    n_after_stars: int,
    features: dict[str, Any],
    friends: dict[str, float],
) -> dict[str, Any]:
    per_user = split_frame.groupby("user_id").size()
    return {
        "variant": variant.name,
        "k_core": variant.k_core,
        "min_stars": variant.min_stars,
        "protocol": "per-user chronological 70/10/20; ties broken by review_id",
        "source_reviews": n_source,
        "reviews_after_star_filter": n_after_stars,
        "users": n_users,
        "items": n_items,
        "interactions": len(split_frame),
        "split_counts": {
            name: int((split_frame["split"] == name).sum()) for name in ("train", "val", "test")
        },
        "per_user_interactions": {
            "min": int(per_user.min()),
            "median": float(per_user.median()),
            "mean": round(float(per_user.mean()), 3),
            "max": int(per_user.max()),
        },
        "features": features,
        "friends": friends,
    }


def build_variant(root: Path, variant: Variant, *, force: bool = False) -> dict[str, Any]:
    """Build the complete processed folder of a variant; returns (and writes) its aggregate card."""
    if _complete(root, variant) and not force:
        card: dict[str, Any] = json.loads(card_path(root, variant).read_text(encoding="utf-8"))
        return card
    source = root / "data" / "processed"
    businesses = ProcessedBusinessSchema.validate(pd.read_csv(source / SOURCE_FILES[1], dtype=str))
    users = ProcessedUserSchema.validate(pd.read_csv(source / SOURCE_FILES[2], dtype=str))
    reviews = ProcessedReviewSchema.validate(pd.read_csv(source / SOURCE_FILES[0], dtype=str))
    validate_referential_integrity(users, businesses, reviews)
    clean = reviews.loc[
        reviews["user_id"].isin(set(users["user_id"]))
        & reviews["business_id"].isin(set(businesses["business_id"]))
    ].reset_index(drop=True)

    kept = select_interactions(clean, variant)
    n_after_stars = (
        len(clean)
        if variant.min_stars is None
        else int((clean["stars"].astype(float) >= variant.min_stars).sum())
    )
    split_frame = chronological_split(kept)
    assert_no_leakage(split_frame)
    user_map = freeze_indices(kept["user_id"])
    item_map = freeze_indices(kept["business_id"])
    indexed = pd.DataFrame(
        {
            "user_idx": split_frame["user_id"].map(user_map).astype("int64"),
            "item_idx": split_frame["business_id"].map(item_map).astype("int64"),
            "rating": split_frame["stars"].astype("float64"),
            "timestamp": split_frame["date"].astype(str),
            "split": split_frame["split"].astype(str),
        }
    )
    SplitSchema.validate(indexed)

    folder = variant_dir(root, variant)
    folder.mkdir(parents=True, exist_ok=True)
    card_path(root, variant).unlink(missing_ok=True)  # incomplete until the card is rewritten
    for label, name in SPLIT_FILES.items():
        indexed.loc[indexed["split"] == label].to_csv(
            folder / name, index=False, compression="gzip"
        )
    for name, mapping in zip(INDEX_FILES, (user_map, item_map), strict=True):
        (folder / name).write_text(
            json.dumps(mapping, sort_keys=True), encoding="utf-8", newline="\n"
        )

    ordered_ids = sorted(item_map, key=item_map.__getitem__)
    item_vectors, feature_info = _item_vectors(
        root, ordered_ids, _item_texts(businesses, ordered_ids)
    )
    train = load_split("train", folder)
    user_vectors = pool_user_vectors(
        train["user_idx"].to_numpy(dtype=np.int64),
        train["item_idx"].to_numpy(dtype=np.int64),
        item_vectors,
        len(user_map),
    )
    np.savez_compressed(folder / FEATURES_FILE, items=item_vectors, users=user_vectors)

    graph = build_friend_graph(source / SOURCE_FILES[2], folder / INDEX_FILES[0])
    save_friend_graph(graph, folder)

    summary = _summary(
        variant,
        indexed.assign(user_id=split_frame["user_id"]),
        len(user_map),
        len(item_map),
        len(reviews),
        n_after_stars,
        feature_info,
        graph_summary(graph),
    )
    atomic_write_json(card_path(root, variant), summary)
    return summary
