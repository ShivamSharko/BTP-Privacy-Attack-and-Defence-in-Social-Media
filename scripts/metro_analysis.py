"""Geographic metro analysis for Yelp dataset (ADR-031).

Evaluates candidate metros using latitude/longitude bounding boxes to avoid
city-name fragmentation (e.g., "Saint Louis" vs "St. Louis").
"""

from __future__ import annotations

import argparse
import json
from collections import defaultdict
from pathlib import Path
from typing import Any, Final

# Central coordinates and rough bounding box radii (degrees) for top candidates
# Based on Yelp's documented metro areas.
METROS: Final[dict[str, dict[str, float]]] = {
    "philadelphia": {"lat_min": 39.8, "lat_max": 40.2, "lon_min": -75.3, "lon_max": -74.9},
    "tampa_bay": {"lat_min": 27.7, "lat_max": 28.2, "lon_min": -82.8, "lon_max": -82.2},
    "tucson": {"lat_min": 32.0, "lat_max": 32.5, "lon_max": -110.7, "lon_min": -111.2},
    "indianapolis": {"lat_min": 39.6, "lat_max": 40.0, "lon_min": -86.4, "lon_max": -86.0},
}


def in_metro(lat: float, lon: float, metro: dict[str, float]) -> bool:
    return (
        metro["lat_min"] <= lat <= metro["lat_max"] and metro["lon_min"] <= lon <= metro["lon_max"]
    )


def analyze_metros(root: Path) -> dict[str, Any]:
    business_file = root / "yelp_academic_dataset_business.json"
    review_file = root / "yelp_academic_dataset_review.json"
    user_file = root / "yelp_academic_dataset_user.json"

    # 1. Index businesses by metro
    metro_businesses: dict[str, set[str]] = defaultdict(set)
    business_in_metro: dict[str, str] = {}  # business_id -> metro_name

    with business_file.open("r", encoding="utf-8") as f:
        for line in f:
            b = json.loads(line)
            lat = b.get("latitude")
            lon = b.get("longitude")
            bid = b.get("business_id")
            if isinstance(lat, (int, float)) and isinstance(lon, (int, float)):
                for metro_name, bounds in METROS.items():
                    if in_metro(lat, lon, bounds):
                        metro_businesses[metro_name].add(bid)
                        business_in_metro[bid] = metro_name
                        break

    # 2. Count reviews and distinct users per metro
    metro_reviews: dict[str, int] = defaultdict(int)
    metro_users: dict[str, set[str]] = defaultdict(set)

    with review_file.open("r", encoding="utf-8") as f:
        for line in f:
            r = json.loads(line)
            bid = r.get("business_id")
            uid = r.get("user_id")
            if bid in business_in_metro:
                metro = business_in_metro[bid]
                metro_reviews[metro] += 1
                if isinstance(uid, str):
                    metro_users[metro].add(uid)

    # 3. Estimate friend graph density for users in each metro
    # (Sample-based to avoid loading all 1.9M users into memory at once if not needed,
    # but for accuracy we stream and check if user is in metro_users)
    metro_friend_degrees: dict[str, list[int]] = defaultdict(list)

    with user_file.open("r", encoding="utf-8") as f:
        for line in f:
            u = json.loads(line)
            uid = u.get("user_id")
            # Check if this user reviewed in any of our target metros
            user_in_target_metro = any(uid in users for users in metro_users.values())
            if user_in_target_metro:
                friends = u.get("friends", "")
                if isinstance(friends, str) and friends.lower() != "none":
                    degree = len([x for x in friends.split(",") if x.strip()])
                    # We don't know *which* metro they belong to if they reviewed in multiple,
                    # so we attribute their degree to all metros they reviewed in.
                    for metro, users in metro_users.items():
                        if uid in users:
                            metro_friend_degrees[metro].append(degree)

    results = {}
    for metro in METROS:
        degrees = metro_friend_degrees.get(metro, [])
        avg_degree = sum(degrees) / len(degrees) if degrees else 0.0
        max_degree = max(degrees) if degrees else 0
        results[metro] = {
            "businesses": len(metro_businesses[metro]),
            "reviews": metro_reviews[metro],
            "distinct_users": len(metro_users[metro]),
            "avg_friend_degree": round(avg_degree, 2),
            "max_friend_degree": max_degree,
            "reviews_per_user": round(metro_reviews[metro] / len(metro_users[metro]), 2)
            if metro_users[metro]
            else 0.0,
        }

    return results


def main(argv: list[str] | None = None) -> int:
    """Run the geographic metro comparison and print a table."""
    parser = argparse.ArgumentParser(description="Geographic metro analysis (ADR-031).")
    parser.add_argument("--root", default="data/raw", help="folder holding the raw JSON files")
    parser.add_argument("--out", default=None, help="optional JSON output path")
    args = parser.parse_args(argv)

    root = Path(str(args.root))
    required = (
        "yelp_academic_dataset_business.json",
        "yelp_academic_dataset_review.json",
        "yelp_academic_dataset_user.json",
    )
    missing = [name for name in required if not (root / name).is_file()]
    if missing:
        print("ERROR: missing raw files in " + str(root))
        for name in missing:
            print("  - " + name)
        return 1

    results = analyze_metros(root)
    print("\n=== Metro Analysis (Geographic Bounding Box) ===")
    header = "Metro | Businesses | Reviews | Users | Rev/User | AvgFriendDeg"
    print(header)
    print("-" * len(header))
    for metro, stats in sorted(results.items(), key=lambda item: item[1]["reviews"], reverse=True):
        print(
            str(metro)
            + " | "
            + str(stats["businesses"])
            + " | "
            + str(stats["reviews"])
            + " | "
            + str(stats["distinct_users"])
            + " | "
            + str(stats["reviews_per_user"])
            + " | "
            + str(stats["avg_friend_degree"])
        )
    if args.out:
        out = Path(str(args.out))
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(
            json.dumps(results, indent=2, sort_keys=True) + "\n", encoding="utf-8", newline="\n"
        )
        print("\nWritten to " + str(out))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
