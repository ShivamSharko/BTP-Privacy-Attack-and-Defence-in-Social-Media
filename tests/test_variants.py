"""Dataset variants: star filter, k-core, chronological splits, features, friends (made-up ids)."""

from __future__ import annotations

import json
import zlib
from pathlib import Path
from typing import Any

import numpy as np
import numpy.typing as npt
import pandas as pd
import pytest

from prism.data import variants
from prism.data.bundle import load_bundle
from prism.data.social import load_friend_graph
from prism.data.splits import split_counts
from prism.data.variants import VARIANTS, Variant, build_variant, select_interactions, variant_dir
from prism.io import read_json

# Tiers: A = 20 users with 22 reviews (items 0-21), B = 10 users with 17 (items 0-16),
# C = 10 users with 12 (items 0-11). Surviving users: k10 -> 40, k15 -> 30 (A+B), k20 -> 20 (A).
N_ITEMS = 22


def _tier(user: int) -> int:
    return 22 if user < 20 else 17 if user < 30 else 12


def _reviews() -> pd.DataFrame:
    rows = []
    for user in range(40):
        for j in range(_tier(user)):
            stars = 5.0
            if 20 <= user < 30 and j >= 10:
                stars = 3.0  # tier B: only 10 reviews are positive
            if user == 0 and j == 21:
                stars = 4.0  # boundary: exactly the threshold is kept
            rows.append(
                {
                    "review_id": f"r{user:02d}_{j:02d}",
                    "user_id": f"u{user:02d}",
                    "business_id": f"b{j:02d}",
                    "stars": stars,
                    "date": f"2019-03-{(j * 7) % 23 + 1:02d}",  # a permutation of days per user
                }
            )
    return pd.DataFrame(rows)


def _write_source(root: Path) -> None:
    processed = root / "data" / "processed"
    processed.mkdir(parents=True)
    _reviews().to_csv(processed / "philly_reviews.csv.gz", index=False)
    pd.DataFrame(
        {
            "business_id": [f"b{i:02d}" for i in range(N_ITEMS)],
            "name": [f"Shop {i}" for i in range(N_ITEMS)],
            "city": "Philadelphia",
            "state": "PA",
            "latitude": 39.95,
            "longitude": -75.16,
            "stars": 4.0,
            "review_count": 10,
            "categories": "Food",
            "attributes_json": "{}",
        }
    ).to_csv(processed / "philly_businesses.csv.gz", index=False)
    friends = {0: "u01, u02, u35", 1: "u00", 2: "u00", 35: "u00"}
    pd.DataFrame(
        {
            "user_id": [f"u{u:02d}" for u in range(40)],
            "friends": [friends.get(u, "None") for u in range(40)],
            "review_count": [_tier(u) for u in range(40)],
        }
    ).to_csv(processed / "philly_users.csv.gz", index=False)


def _fake_encode(texts: list[str]) -> npt.NDArray[np.float32]:
    rows = [np.random.default_rng(zlib.crc32(t.encode())).normal(size=8) for t in texts]
    matrix = np.stack(rows)
    return (matrix / np.linalg.norm(matrix, axis=1, keepdims=True)).astype(np.float32)


@pytest.fixture
def encoded(monkeypatch: pytest.MonkeyPatch) -> list[int]:
    """Replace the sentence-transformer; the list records how many texts each call encoded."""
    calls: list[int] = []

    def fake(texts: list[str]) -> npt.NDArray[np.float32]:
        calls.append(len(texts))
        return _fake_encode(texts)

    monkeypatch.setattr(variants, "encode_items", fake)
    return calls


def test_registry_and_directory(tmp_path: Path) -> None:
    assert VARIANTS["k10"].k_core == 10 and VARIANTS["k20"].k_core == 20
    assert VARIANTS["stars4"] == Variant("stars4", k_core=15, min_stars=4.0)
    assert variant_dir(tmp_path, VARIANTS["k10"]) == tmp_path / "data" / "processed_k10"


def test_kcore_levels_and_nesting() -> None:
    reviews = _reviews()
    users = {}
    for k in (10, 15, 20):
        kept = select_interactions(reviews, Variant(f"k{k}", k_core=k))
        users[k] = set(kept["user_id"])
        assert kept.groupby("user_id").size().min() >= k
        assert kept.groupby("business_id").size().min() >= k
    assert [len(users[k]) for k in (10, 15, 20)] == [40, 30, 20]
    assert users[20] < users[15] < users[10]


def test_star_filter_keeps_threshold_and_drops_lower() -> None:
    reviews = _reviews()
    positive = select_interactions(reviews, Variant("s", k_core=1, min_stars=4.0))
    assert positive["stars"].min() == 4.0
    assert len(positive) == int((reviews["stars"] >= 4.0).sum())
    assert ((positive["user_id"] == "u00") & (positive["stars"] == 4.0)).sum() == 1
    assert len(select_interactions(reviews, Variant("s", k_core=1))) == len(reviews)
    # tier B keeps 10 positive reviews, below k = 15, so it leaves the core; tier C too
    core = select_interactions(reviews, VARIANTS["stars4"])
    assert set(core["user_id"]) == {f"u{u:02d}" for u in range(20)}


def test_everything_pruned_raises() -> None:
    with pytest.raises(ValueError, match="no interactions"):
        select_interactions(_reviews(), Variant("k25", k_core=25))


def test_build_variant_files_splits_and_card(tmp_path: Path, encoded: list[int]) -> None:
    _write_source(tmp_path)
    summary = build_variant(tmp_path, VARIANTS["k20"])
    folder = variant_dir(tmp_path, VARIANTS["k20"])
    for name in (
        "dataset_train.csv.gz",
        "dataset_val.csv.gz",
        "dataset_test.csv.gz",
        "item_index.json",
        "user_index.json",
        "features_semantic.npz",
        "friends.npz",
    ):
        assert (folder / name).is_file()
    assert summary["users"] == 20 and summary["items"] == 22
    assert summary["interactions"] == 20 * 22
    n_train, n_val, n_test = split_counts(22)
    assert summary["split_counts"] == {
        "train": 20 * n_train,
        "val": 20 * n_val,
        "test": 20 * n_test,
    }
    assert summary["per_user_interactions"]["median"] == 22.0
    # chronological and leak free: per user, train <= val <= test in time, rows disjoint
    frames = {s: pd.read_csv(folder / f"dataset_{s}.csv.gz") for s in ("train", "val", "test")}
    for user, train in frames["train"].groupby("user_idx"):
        val = frames["val"][frames["val"]["user_idx"] == user]
        test = frames["test"][frames["test"]["user_idx"] == user]
        assert train["timestamp"].max() < val["timestamp"].min()
        assert val["timestamp"].max() < test["timestamp"].min()
        items = [set(f["item_idx"]) for f in (train, val, test)]
        assert not (items[0] & items[1]) and not (items[0] & items[2]) and not (items[1] & items[2])
    # bundle, friend graph restricted to the variant's users, card without identifiers
    bundle = load_bundle(folder)
    assert (bundle.n_users, bundle.n_items) == (20, 22)
    graph = load_friend_graph(folder)
    assert graph.n_users == 20 and graph.n_edges == 2  # the edge to u35 is dropped
    assert summary["friends"]["users"] == 20.0
    card_path = tmp_path / "results" / "sensitivity" / "k20" / "dataset_card.json"
    assert read_json(card_path) == json.loads(json.dumps(summary))
    assert "u00" not in card_path.read_text(encoding="utf-8")
    assert summary["features"] == {"items_reused": 0, "items_encoded": 22, "reuse_verified": None}


def test_complete_folder_is_skipped_unless_forced(tmp_path: Path, encoded: list[int]) -> None:
    _write_source(tmp_path)
    first = build_variant(tmp_path, VARIANTS["k10"])
    assert encoded == [22]
    again = build_variant(tmp_path, VARIANTS["k10"])
    assert again == first and len(encoded) == 1
    build_variant(tmp_path, VARIANTS["k10"], force=True)
    assert len(encoded) == 2


def _write_main_features(root: Path, rows: dict[str, Any]) -> None:
    processed = root / "data" / "processed"
    ids = list(rows)  # deliberately not in sorted order
    index = {business: i for i, business in enumerate(ids)}
    (processed / "item_index.json").write_text(json.dumps(index), encoding="utf-8")
    items = np.stack([rows[b] for b in ids]).astype(np.float32)
    np.savez_compressed(processed / "features_semantic.npz", items=items, users=items[:1])


def test_embeddings_of_the_main_build_are_reused_by_business(
    tmp_path: Path, encoded: list[int]
) -> None:
    _write_source(tmp_path)
    texts = {
        f"b{i:02d}": variants.build_item_text(f"Shop {i}", "Food", "{}") for i in range(N_ITEMS)
    }
    # main build holds 16 of the 22 businesses, in reverse order, embedded from identical text
    held = {b: _fake_encode([texts[b]])[0] for b in sorted(texts)[:16][::-1]}
    _write_main_features(tmp_path, held)
    summary = build_variant(tmp_path, VARIANTS["k20"])
    assert summary["features"] == {"items_reused": 16, "items_encoded": 6, "reuse_verified": True}
    items = np.load(variant_dir(tmp_path, VARIANTS["k20"]) / "features_semantic.npz")["items"]
    assert items.shape == (22, 8)
    for position, business in enumerate(sorted(texts)):  # variant index is sorted by id
        assert np.allclose(items[position], _fake_encode([texts[business]])[0], atol=1e-6)


def test_reuse_is_refused_when_the_embedded_text_differs(
    tmp_path: Path, encoded: list[int]
) -> None:
    _write_source(tmp_path)
    rng = np.random.default_rng(0)
    other = {f"b{i:02d}": rng.normal(size=8) for i in range(N_ITEMS)}  # not what we would encode
    _write_main_features(tmp_path, other)
    summary = build_variant(tmp_path, VARIANTS["k20"])
    assert summary["features"] == {"items_reused": 0, "items_encoded": 22, "reuse_verified": False}
