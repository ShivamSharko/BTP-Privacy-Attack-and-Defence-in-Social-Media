"""Apply k=15, validate contracts, build chronological splits, write artifacts.

Reads data/processed/philly_*.csv.gz. Writes integer-indexed split artifacts and
identifier maps under data/processed/ (git-ignored, Yelp derivative works).
Writes ONLY aggregate counts, hashes and metadata to results/dataset_card.json.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Final

import numpy as np
import pandas as pd  # type: ignore[import-untyped]

from prism.data.contracts import (
    ProcessedBusinessSchema,
    ProcessedReviewSchema,
    ProcessedUserSchema,
    SplitSchema,
    validate_referential_integrity,
)
from prism.data.filtering import PHILADELPHIA_BOUNDS, iterative_kcore
from prism.data.splits import assert_no_leakage, chronological_split, freeze_indices
from prism.environment import collect_environment_report, file_sha256

PROCESSED: Final[Path] = Path("data/processed")
CARD: Final[Path] = Path("results/dataset_card.json")
K: Final[int] = 15
ARTIFACT_NAMES: Final[tuple[str, ...]] = (
    "dataset_train.csv.gz",
    "dataset_val.csv.gz",
    "dataset_test.csv.gz",
)


def load_inputs() -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """Read and contract-validate the three processed files."""
    businesses = ProcessedBusinessSchema.validate(
        pd.read_csv(PROCESSED / "philly_businesses.csv.gz", dtype=str)
    )
    users = ProcessedUserSchema.validate(pd.read_csv(PROCESSED / "philly_users.csv.gz", dtype=str))
    reviews = ProcessedReviewSchema.validate(
        pd.read_csv(PROCESSED / "philly_reviews.csv.gz", dtype=str)
    )
    return businesses, users, reviews


def apply_kcore(reviews: pd.DataFrame, k: int) -> pd.DataFrame:
    """Keep only interactions whose user and business survive iterative k-core."""
    user_codes, user_index = pd.factorize(reviews["user_id"], sort=False)
    item_codes, item_index = pd.factorize(reviews["business_id"], sort=False)
    user_codes = np.asarray(user_codes, dtype=np.int64)
    item_codes = np.asarray(item_codes, dtype=np.int64)
    active_users, active_items = iterative_kcore(
        user_codes, item_codes, len(user_index), len(item_index), k
    )
    keep = active_users[user_codes] & active_items[item_codes]
    return reviews.loc[keep].reset_index(drop=True)


def build_card(
    split_frame: pd.DataFrame,
    integrity: dict[str, int],
    n_users: int,
    n_items: int,
) -> dict[str, Any]:
    """Assemble an aggregate-only dataset card. Never includes identifiers."""
    per_user = split_frame.groupby("user_id").size()
    ranges = split_frame.groupby("split")["date"].agg(["min", "max"])
    env = collect_environment_report()
    artifacts = {
        name: {
            "size_bytes": (PROCESSED / name).stat().st_size,
            "sha256": file_sha256(PROCESSED / name),
        }
        for name in ARTIFACT_NAMES
    }
    return {
        "schema_version": 1,
        "metro": "philadelphia",
        "bounds": PHILADELPHIA_BOUNDS,
        "k_core": K,
        "protocol": "per-user chronological 70/10/20; ties broken by review_id",
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
        "split_date_ranges": {
            name: {"min": str(ranges.loc[name, "min"]), "max": str(ranges.loc[name, "max"])}
            for name in ("train", "val", "test")
        },
        "referential_integrity": integrity,
        "artifacts": artifacts,
        "provenance": {
            "git_commit": env.git_commit,
            "git_dirty": env.git_dirty,
            "uv_lock_sha256": env.uv_lock_sha256,
        },
        "known_limitations": [
            "k-core removes 74.8% of Philadelphia businesses, so full-catalogue ranking is over the filtered catalogue and absolute NDCG is inflated relative to the raw catalogue.",
            "Per-user chronological splits allow the model to observe other users' later interactions. A global time-cutoff variant is a Could robustness check, not the primary protocol.",
            "Dataset vintage is the Jan-2022 Yelp release.",
        ],
    }


def main() -> int:
    """Build the final dataset and write the aggregate-only card."""
    required = [
        PROCESSED / "philly_businesses.csv.gz",
        PROCESSED / "philly_users.csv.gz",
        PROCESSED / "philly_reviews.csv.gz",
    ]
    missing = [str(path) for path in required if not path.is_file()]
    if missing:
        print("ERROR: missing processed files. Run scripts/build_philly_subset.py first.")
        for path in missing:
            print("  - " + path)
        return 1

    print("Loading and validating processed files ...", flush=True)
    businesses, users, reviews = load_inputs()
    integrity = validate_referential_integrity(users, businesses, reviews)
    print("  referential integrity: " + json.dumps(integrity), flush=True)

    valid_users = set(users["user_id"])
    valid_businesses = set(businesses["business_id"])
    clean = reviews.loc[
        reviews["user_id"].isin(valid_users) & reviews["business_id"].isin(valid_businesses)
    ].reset_index(drop=True)
    integrity["reviews_dropped_for_integrity"] = int(len(reviews) - len(clean))

    print("Applying iterative k-core with k=" + str(K) + " ...", flush=True)
    kept = apply_kcore(clean, K)
    n_users = kept["user_id"].nunique()
    n_items = kept["business_id"].nunique()
    print(
        "  users " + str(n_users) + ", items " + str(n_items) + ", interactions " + str(len(kept)),
        flush=True,
    )

    print("Building chronological splits ...", flush=True)
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

    for name, label in zip(ARTIFACT_NAMES, ("train", "val", "test"), strict=True):
        subset = indexed.loc[indexed["split"] == label]
        subset.to_csv(PROCESSED / name, index=False, compression="gzip")
        print("  wrote " + name + " (" + str(len(subset)) + " rows)", flush=True)

    (PROCESSED / "user_index.json").write_text(
        json.dumps(user_map, sort_keys=True), encoding="utf-8", newline="\n"
    )
    (PROCESSED / "item_index.json").write_text(
        json.dumps(item_map, sort_keys=True), encoding="utf-8", newline="\n"
    )

    card = build_card(
        indexed.assign(user_id=split_frame["user_id"], date=split_frame["date"]),
        integrity,
        n_users,
        n_items,
    )
    CARD.parent.mkdir(parents=True, exist_ok=True)
    CARD.write_text(
        json.dumps(card, indent=2, sort_keys=True) + "\n", encoding="utf-8", newline="\n"
    )

    print("\nDataset card written to " + str(CARD))
    print("  users        : " + str(card["users"]))
    print("  items        : " + str(card["items"]))
    print("  interactions : " + str(card["interactions"]))
    print("  train/val/test : " + json.dumps(card["split_counts"]))
    print("  per-user min/median/max : " + json.dumps(card["per_user_interactions"]))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
