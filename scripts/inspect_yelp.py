"""Aggregate-only inventory of the Yelp Open Dataset (PROJECT_ROADMAP.md P0/G0).

Streams the extracted JSON-lines files one line at a time so memory stays flat
regardless of dataset size. Output contains counts and public place names only:
no user IDs, no business IDs, no review text (ADR-016, data minimisation).

Usage:
    uv run python scripts/inspect_yelp.py --root data/raw
    uv run python scripts/inspect_yelp.py --root data/raw --limit 10000
"""

from __future__ import annotations

import argparse
import json
from collections import Counter
from collections.abc import Iterable, Iterator
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Final

from prism.environment import collect_environment_report

BUSINESS_FILE: Final[str] = "yelp_academic_dataset_business.json"
REVIEW_FILE: Final[str] = "yelp_academic_dataset_review.json"
USER_FILE: Final[str] = "yelp_academic_dataset_user.json"
REQUIRED_FILES: Final[tuple[str, ...]] = (BUSINESS_FILE, REVIEW_FILE, USER_FILE)
TOP_N: Final[int] = 25
SCHEMA_VERSION: Final[int] = 1


@dataclass
class FileStats:
    """Per-file read statistics."""

    lines: int = 0
    bad_lines: int = 0
    keys: set[str] = field(default_factory=set)


def iter_records(
    path: Path, stats: FileStats, limit: int | None = None
) -> Iterator[dict[str, Any]]:
    """Yield JSON objects line by line, counting malformed lines instead of crashing."""
    with path.open("r", encoding="utf-8") as handle:
        for index, line in enumerate(handle):
            if limit is not None and index >= limit:
                break
            stripped = line.strip()
            if not stripped:
                continue
            stats.lines += 1
            try:
                record = json.loads(stripped)
            except json.JSONDecodeError:
                stats.bad_lines += 1
                continue
            if not isinstance(record, dict):
                stats.bad_lines += 1
                continue
            stats.keys.update(str(key) for key in record)
            yield record


def summarize_businesses(records: Iterable[dict[str, Any]]) -> dict[str, Any]:
    """Count businesses and their public city/state distribution."""
    cities: Counter[str] = Counter()
    states: Counter[str] = Counter()
    count = 0
    for record in records:
        count += 1
        city = record.get("city")
        state = record.get("state")
        if isinstance(city, str) and city:
            cities[city] += 1
        if isinstance(state, str) and state:
            states[state] += 1
    return {
        "count": count,
        "distinct_cities": len(cities),
        "distinct_states": len(states),
        "top_cities": dict(cities.most_common(TOP_N)),
        "top_states": dict(states.most_common(TOP_N)),
    }


def summarize_reviews(records: Iterable[dict[str, Any]]) -> dict[str, Any]:
    """Count interactions, distinct actors, date range and rating histogram."""
    users: set[str] = set()
    businesses: set[str] = set()
    stars: Counter[str] = Counter()
    min_date: str | None = None
    max_date: str | None = None
    count = 0
    for record in records:
        count += 1
        user_id = record.get("user_id")
        business_id = record.get("business_id")
        date = record.get("date")
        rating = record.get("stars")
        if isinstance(user_id, str):
            users.add(user_id)
        if isinstance(business_id, str):
            businesses.add(business_id)
        if isinstance(date, str) and date:
            if min_date is None or date < min_date:
                min_date = date
            if max_date is None or date > max_date:
                max_date = date
        if isinstance(rating, int | float):
            stars[str(int(rating))] += 1
    return {
        "count": count,
        "distinct_users": len(users),
        "distinct_businesses": len(businesses),
        "min_date": min_date,
        "max_date": max_date,
        "stars_histogram": dict(sorted(stars.items())),
    }


def summarize_users(records: Iterable[dict[str, Any]]) -> dict[str, Any]:
    """Count users and the size of the friends graph (directed listings)."""
    count = 0
    with_friends = 0
    listings = 0
    max_degree = 0
    review_count_sum = 0
    for record in records:
        count += 1
        friends = record.get("friends")
        degree = 0
        if isinstance(friends, str):
            tokens = [token.strip() for token in friends.split(",")]
            degree = len([token for token in tokens if token and token.lower() != "none"])
        if degree > 0:
            with_friends += 1
            listings += degree
            max_degree = max(max_degree, degree)
        reviews = record.get("review_count")
        if isinstance(reviews, int):
            review_count_sum += reviews
    return {
        "count": count,
        "users_with_friends": with_friends,
        "friend_listings_total": listings,
        "max_friend_degree": max_degree,
        "review_count_sum": review_count_sum,
    }


def build_profile(root: Path, limit: int | None = None) -> dict[str, Any]:
    """Profile all three files and return an aggregate-only dictionary."""
    business_stats = FileStats()
    review_stats = FileStats()
    user_stats = FileStats()

    print("Reading " + BUSINESS_FILE + " ...", flush=True)
    businesses = summarize_businesses(iter_records(root / BUSINESS_FILE, business_stats, limit))
    print("Reading " + REVIEW_FILE + " (largest file, several minutes) ...", flush=True)
    reviews = summarize_reviews(iter_records(root / REVIEW_FILE, review_stats, limit))
    print("Reading " + USER_FILE + " ...", flush=True)
    users = summarize_users(iter_records(root / USER_FILE, user_stats, limit))

    report = collect_environment_report()
    files: dict[str, Any] = {}
    for name, stats in (
        (BUSINESS_FILE, business_stats),
        (REVIEW_FILE, review_stats),
        (USER_FILE, user_stats),
    ):
        files[name] = {
            "size_bytes": (root / name).stat().st_size,
            "records_read": stats.lines,
            "bad_lines": stats.bad_lines,
            "keys": sorted(stats.keys),
        }

    return {
        "schema_version": SCHEMA_VERSION,
        "generated_utc": datetime.now(UTC).isoformat(timespec="seconds"),
        "limit_applied": limit,
        "provenance": {
            "prism_version": report.prism_version,
            "git_commit": report.git_commit,
            "uv_lock_sha256": report.uv_lock_sha256,
        },
        "files": files,
        "businesses": businesses,
        "reviews": reviews,
        "users": users,
    }


def main(argv: list[str] | None = None) -> int:
    """Write the profile JSON and print a short summary."""
    parser = argparse.ArgumentParser(description="Aggregate-only Yelp dataset inventory.")
    parser.add_argument(
        "--root", default="data/raw", help="folder holding the extracted JSON files"
    )
    parser.add_argument("--limit", type=int, default=None, help="read at most N lines per file")
    parser.add_argument("--out", default="results/dataset_profile.json", help="output JSON path")
    args = parser.parse_args(argv)

    root = Path(str(args.root))
    missing = [name for name in REQUIRED_FILES if not (root / name).is_file()]
    if missing:
        print("ERROR: missing required files in " + str(root))
        for name in missing:
            print("  - " + name)
        print("See docs/data-access.md for acquisition steps.")
        return 1

    profile = build_profile(root, args.limit)
    out = Path(str(args.out))
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(profile, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    print("Yelp dataset profile written to " + str(out))
    print("  businesses : " + str(profile["businesses"]["count"]))
    print("  reviews    : " + str(profile["reviews"]["count"]))
    print("  users      : " + str(profile["users"]["count"]))
    print("  reviewers  : " + str(profile["reviews"]["distinct_users"]))
    print(
        "  date range : "
        + str(profile["reviews"]["min_date"])
        + " .. "
        + str(profile["reviews"]["max_date"])
    )
    print("  friend listings : " + str(profile["users"]["friend_listings_total"]))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
