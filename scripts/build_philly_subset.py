"""Stream the Yelp dataset into a Philadelphia subset and measure k-core survival.

Stage 1: geo-filter businesses (ADR-031).
Stage 2: keep only reviews of those businesses; drop review text entirely.
Stage 3: keep only users who appear in those reviews; detect orphans and duplicates.
Stage 4: measure interaction histograms and iterative k-core survival.
Stage 5: measure the induced friends graph for each candidate k.

Outputs processed CSV.GZ under data/processed/ (git-ignored) and an aggregate-only
report at results/philly_filter_report.json (committed).
"""

from __future__ import annotations

import csv
import gzip
import json
from collections.abc import Iterator
from pathlib import Path
from typing import Any, Final

import numpy as np
import pandas as pd  # type: ignore[import-untyped]

from prism.data.filtering import (
    K_VALUES,
    PHILADELPHIA_BOUNDS,
    in_bounds,
    interaction_histogram,
    iterative_kcore,
    surviving_edge_count,
)
from prism.environment import collect_environment_report, file_sha256

# Python's csv module limits a single field to 131072 characters by default.
# Some Yelp users have friend lists far larger than that, which crashed Stage 5
# on the real dataset. 16 MiB is used instead of sys.maxsize because
# sys.maxsize overflows the signed 32-bit C long that csv.field_size_limit
# expects on Windows.
CSV_FIELD_LIMIT: Final[int] = 16_777_216
csv.field_size_limit(CSV_FIELD_LIMIT)

RAW: Final[Path] = Path("data/raw")
OUT: Final[Path] = Path("data/processed")
REPORT: Final[Path] = Path("results/philly_filter_report.json")
PROGRESS_EVERY: Final[int] = 1_000_000

BUSINESS_COLUMNS: Final[tuple[str, ...]] = (
    "business_id",
    "name",
    "city",
    "state",
    "latitude",
    "longitude",
    "stars",
    "review_count",
    "categories",
    "attributes_json",
)
REVIEW_COLUMNS: Final[tuple[str, ...]] = ("review_id", "user_id", "business_id", "stars", "date")
USER_COLUMNS: Final[tuple[str, ...]] = ("user_id", "friends", "review_count")


def read_json_lines(path: Path) -> Iterator[dict[str, Any]]:
    """Yield JSON objects, reporting progress on large files."""
    with path.open("r", encoding="utf-8") as handle:
        for index, line in enumerate(handle, start=1):
            if index % PROGRESS_EVERY == 0:
                print("    read " + str(index) + " lines from " + path.name, flush=True)
            stripped = line.strip()
            if not stripped:
                continue
            record = json.loads(stripped)
            if isinstance(record, dict):
                yield record


def filter_businesses() -> set[str]:
    """Stage 1: write Philadelphia businesses and return their id set."""
    print("Stage 1: filtering businesses by bounding box ...", flush=True)
    kept: set[str] = set()
    target = OUT / "philly_businesses.csv.gz"
    with gzip.open(target, "wt", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(BUSINESS_COLUMNS)
        for record in read_json_lines(RAW / "yelp_academic_dataset_business.json"):
            lat = record.get("latitude")
            lon = record.get("longitude")
            bid = record.get("business_id")
            if not isinstance(bid, str) or not isinstance(lat, int | float):
                continue
            if not isinstance(lon, int | float):
                continue
            if not in_bounds(float(lat), float(lon), PHILADELPHIA_BOUNDS):
                continue
            kept.add(bid)
            writer.writerow(
                [
                    bid,
                    record.get("name") or "",
                    record.get("city") or "",
                    record.get("state") or "",
                    lat,
                    lon,
                    record.get("stars") or "",
                    record.get("review_count") or 0,
                    record.get("categories") or "",
                    json.dumps(record.get("attributes") or {}, sort_keys=True),
                ]
            )
    print("  businesses kept: " + str(len(kept)), flush=True)
    return kept


def filter_reviews(business_ids: set[str]) -> tuple[set[str], dict[str, Any]]:
    """Stage 2: write reviews of Philadelphia businesses; never write text."""
    print("Stage 2: filtering reviews (largest file, several minutes) ...", flush=True)
    reviewers: set[str] = set()
    kept = 0
    scanned = 0
    min_date: str | None = None
    max_date: str | None = None
    target = OUT / "philly_reviews.csv.gz"
    with gzip.open(target, "wt", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(REVIEW_COLUMNS)
        for record in read_json_lines(RAW / "yelp_academic_dataset_review.json"):
            scanned += 1
            bid = record.get("business_id")
            if not isinstance(bid, str) or bid not in business_ids:
                continue
            uid = record.get("user_id")
            rid = record.get("review_id")
            if not isinstance(uid, str) or not isinstance(rid, str):
                continue
            date = record.get("date")
            date_text = date if isinstance(date, str) else ""
            if date_text:
                if min_date is None or date_text < min_date:
                    min_date = date_text
                if max_date is None or date_text > max_date:
                    max_date = date_text
            reviewers.add(uid)
            kept += 1
            writer.writerow([rid, uid, bid, record.get("stars") or "", date_text])
    stats = {
        "reviews_scanned": scanned,
        "reviews_kept": kept,
        "reviews_dropped": scanned - kept,
        "distinct_reviewers": len(reviewers),
        "min_date": min_date,
        "max_date": max_date,
    }
    print("  reviews kept: " + str(kept) + " of " + str(scanned), flush=True)
    return reviewers, stats


def filter_users(reviewers: set[str]) -> tuple[set[str], dict[str, Any]]:
    """Stage 3: write reviewers' records; find orphans and duplicate ids."""
    print("Stage 3: filtering users ...", flush=True)
    found: set[str] = set()
    duplicates = 0
    scanned = 0
    target = OUT / "philly_users.csv.gz"
    with gzip.open(target, "wt", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(USER_COLUMNS)
        for record in read_json_lines(RAW / "yelp_academic_dataset_user.json"):
            scanned += 1
            uid = record.get("user_id")
            if not isinstance(uid, str) or uid not in reviewers:
                continue
            if uid in found:
                duplicates += 1
                continue
            found.add(uid)
            friends = record.get("friends")
            writer.writerow(
                [
                    uid,
                    friends if isinstance(friends, str) else "",
                    record.get("review_count") or 0,
                ]
            )
    orphans = reviewers - found
    stats = {
        "users_scanned": scanned,
        "users_kept": len(found),
        "duplicate_user_rows": duplicates,
        "orphan_reviewer_ids": len(orphans),
    }
    print(
        "  users kept: " + str(len(found)) + ", orphan reviewers: " + str(len(orphans)), flush=True
    )
    return found, stats


def measure_kcore(valid_users: set[str]) -> tuple[dict[str, Any], dict[int, set[str]]]:
    """Stage 4: histograms and iterative k-core survival on the user-item graph."""
    print("Stage 4: measuring interaction distribution and k-core survival ...", flush=True)
    frame = pd.read_csv(
        OUT / "philly_reviews.csv.gz",
        usecols=["user_id", "business_id"],
        dtype={"user_id": "string", "business_id": "string"},
    )
    frame = frame[frame["user_id"].isin(valid_users)]
    user_codes, user_index = pd.factorize(frame["user_id"], sort=False)
    item_codes, item_index = pd.factorize(frame["business_id"], sort=False)
    user_codes = np.asarray(user_codes, dtype=np.int64)
    item_codes = np.asarray(item_codes, dtype=np.int64)
    n_users = len(user_index)
    n_items = len(item_index)

    user_counts = np.bincount(user_codes, minlength=n_users)
    item_counts = np.bincount(item_codes, minlength=n_items)

    report: dict[str, Any] = {
        "interactions_after_integrity_filter": len(frame),
        "users_after_integrity_filter": n_users,
        "businesses_after_integrity_filter": n_items,
        "mean_interactions_per_user": round(float(user_counts.mean()), 3),
        "median_interactions_per_user": float(np.median(user_counts)),
        "user_interaction_histogram": interaction_histogram(user_counts),
        "business_interaction_histogram": interaction_histogram(item_counts),
        "kcore": {},
    }

    survivors: dict[int, set[str]] = {}
    for k in K_VALUES:
        active_users, active_items = iterative_kcore(user_codes, item_codes, n_users, n_items, k)
        edges = surviving_edge_count(user_codes, item_codes, active_users, active_items)
        kept_ids = {str(user_index[i]) for i in np.flatnonzero(active_users)}
        survivors[k] = kept_ids
        report["kcore"][str(k)] = {
            "users": int(active_users.sum()),
            "businesses": int(active_items.sum()),
            "interactions": edges,
            "mean_interactions_per_user": round(edges / max(int(active_users.sum()), 1), 3),
        }
        print(
            "  k="
            + str(k)
            + " -> users "
            + str(int(active_users.sum()))
            + ", interactions "
            + str(edges),
            flush=True,
        )
    return report, survivors


def measure_friends(survivors: dict[int, set[str]]) -> dict[str, Any]:
    """Stage 5: induced friends-graph statistics for each candidate k."""
    print("Stage 5: measuring induced friends graph ...", flush=True)
    totals: dict[int, dict[str, int]] = {
        k: {"users": 0, "users_with_friends": 0, "degree_sum": 0, "max_degree": 0}
        for k in survivors
    }
    with gzip.open(OUT / "philly_users.csv.gz", "rt", encoding="utf-8", newline="") as handle:
        for row in csv.DictReader(handle):
            uid = row["user_id"]
            relevant = [k for k, ids in survivors.items() if uid in ids]
            if not relevant:
                continue
            raw = row.get("friends") or ""
            tokens = [t.strip() for t in raw.split(",")]
            friends = [t for t in tokens if t and t.lower() != "none"]
            for k in relevant:
                ids = survivors[k]
                degree = sum(1 for friend in friends if friend in ids)
                bucket = totals[k]
                bucket["users"] += 1
                if degree > 0:
                    bucket["users_with_friends"] += 1
                    bucket["degree_sum"] += degree
                    bucket["max_degree"] = max(bucket["max_degree"], degree)
    result: dict[str, Any] = {}
    for k, bucket in totals.items():
        connected = bucket["users_with_friends"]
        result[str(k)] = {
            "users_with_inner_friends": connected,
            "share_connected": round(connected / max(bucket["users"], 1), 4),
            "avg_inner_degree_among_connected": round(bucket["degree_sum"] / max(connected, 1), 2),
            "max_inner_degree": bucket["max_degree"],
        }
    return result


def main() -> int:
    """Run all stages and write the aggregate-only report."""
    required = [
        RAW / "yelp_academic_dataset_business.json",
        RAW / "yelp_academic_dataset_review.json",
        RAW / "yelp_academic_dataset_user.json",
    ]
    missing = [str(path) for path in required if not path.is_file()]
    if missing:
        print("ERROR: missing raw files:")
        for path in missing:
            print("  - " + path)
        return 1

    OUT.mkdir(parents=True, exist_ok=True)
    business_ids = filter_businesses()
    reviewers, review_stats = filter_reviews(business_ids)
    valid_users, user_stats = filter_users(reviewers)
    kcore_report, survivors = measure_kcore(valid_users)
    friends_report = measure_friends(survivors)

    for k, stats in kcore_report["kcore"].items():
        stats.update(friends_report[k])

    env = collect_environment_report()
    processed = {
        name: {
            "size_bytes": (OUT / name).stat().st_size,
            "sha256": file_sha256(OUT / name),
        }
        for name in ("philly_businesses.csv.gz", "philly_reviews.csv.gz", "philly_users.csv.gz")
    }

    report = {
        "schema_version": 1,
        "metro": "philadelphia",
        "bounds": PHILADELPHIA_BOUNDS,
        "provenance": {
            "git_commit": env.git_commit,
            "git_dirty": env.git_dirty,
            "uv_lock_sha256": env.uv_lock_sha256,
        },
        "businesses_kept": len(business_ids),
        "reviews": review_stats,
        "users": user_stats,
        "measurement": kcore_report,
        "processed_files": processed,
    }
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    print("\nReport written to " + str(REPORT))
    print("\n=== k-core survival (Philadelphia) ===")
    print("k | users | businesses | interactions | mean/user | connected | share | avg_inner_deg")
    for k, row in kcore_report["kcore"].items():
        print(
            str(k)
            + " | "
            + str(row["users"])
            + " | "
            + str(row["businesses"])
            + " | "
            + str(row["interactions"])
            + " | "
            + str(row["mean_interactions_per_user"])
            + " | "
            + str(row["users_with_inner_friends"])
            + " | "
            + str(row["share_connected"])
            + " | "
            + str(row["avg_inner_degree_among_connected"])
        )
    print("\nUser interaction histogram (before k-core):")
    for label, count in kcore_report["user_interaction_histogram"].items():
        print("  " + label + " : " + str(count))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
