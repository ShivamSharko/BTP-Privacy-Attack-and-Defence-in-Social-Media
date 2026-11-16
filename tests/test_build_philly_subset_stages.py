"""Stage-level tests for the streaming subset pipeline, synthetic fixtures only."""

from __future__ import annotations

import gzip
import json
from pathlib import Path
from typing import Any

import build_philly_subset as builder
import pytest

PRIVATE_TEXT = "PRIVATE_REVIEW_TEXT_MUST_NEVER_BE_WRITTEN"


def _write_lines(path: Path, records: list[dict[str, Any]]) -> None:
    path.write_text("\n".join(json.dumps(record) for record in records) + "\n", encoding="utf-8")


@pytest.fixture
def raw_root(tmp_path: Path) -> Path:
    raw = tmp_path / "raw"
    raw.mkdir()
    businesses = [
        {
            "business_id": "b0",
            "name": "A",
            "city": "Philadelphia",
            "state": "PA",
            "latitude": 39.95,
            "longitude": -75.16,
            "stars": 4.0,
            "review_count": 6,
            "categories": "Mexican",
            "attributes": {"TakeOut": True},
        },
        {
            "business_id": "b1",
            "name": "B",
            "city": "Philadelphia",
            "state": "PA",
            "latitude": 40.0,
            "longitude": -75.0,
            "stars": 3.5,
            "review_count": 6,
            "categories": "Cafe",
            "attributes": {},
        },
        {
            "business_id": "b2",
            "name": "C",
            "city": "Philadelphia",
            "state": "PA",
            "latitude": 39.9,
            "longitude": -75.2,
            "stars": 5.0,
            "review_count": 6,
            "categories": "Bar",
            "attributes": {},
        },
        {
            "business_id": "b_out",
            "name": "D",
            "city": "New York",
            "state": "NY",
            "latitude": 40.7,
            "longitude": -74.0,
            "stars": 4.0,
            "review_count": 1,
            "categories": "Deli",
            "attributes": {},
        },
        {"business_id": "b_nolat", "name": "E", "longitude": -75.0},
    ]
    reviews: list[dict[str, Any]] = []
    for user in ("u0", "u1", "u2"):
        for business in ("b0", "b1", "b2"):
            for repeat in range(2):
                reviews.append(
                    {
                        "review_id": "r_" + user + "_" + business + "_" + str(repeat),
                        "user_id": user,
                        "business_id": business,
                        "stars": 4,
                        "date": "2020-01-" + f"{repeat * 3 + 1:02d}" + " 10:00:00",
                        "text": PRIVATE_TEXT,
                    }
                )
    reviews.append(
        {
            "review_id": "r_out",
            "user_id": "u0",
            "business_id": "b_out",
            "stars": 3,
            "date": "2019-01-01 09:00:00",
            "text": PRIVATE_TEXT,
        }
    )
    reviews.append(
        {
            "review_id": "r_ghost",
            "user_id": "u_ghost",
            "business_id": "b0",
            "stars": 5,
            "date": "2021-06-01 09:00:00",
            "text": PRIVATE_TEXT,
        }
    )
    users = [
        {"user_id": "u0", "friends": "u1, u2", "review_count": 6},
        {"user_id": "u1", "friends": "None", "review_count": 6},
        {"user_id": "u2", "friends": "u0", "review_count": 6},
        {"user_id": "u0", "friends": "u1, u2", "review_count": 6},
    ]
    _write_lines(raw / "yelp_academic_dataset_business.json", businesses)
    _write_lines(raw / "yelp_academic_dataset_review.json", reviews)
    _write_lines(raw / "yelp_academic_dataset_user.json", users)
    return raw


@pytest.fixture
def wired(tmp_path: Path, raw_root: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    out = tmp_path / "out"
    out.mkdir()
    monkeypatch.setattr(builder, "RAW", raw_root)
    monkeypatch.setattr(builder, "OUT", out)
    monkeypatch.setattr(builder, "REPORT", tmp_path / "report.json")
    return out


def test_stage1_geographic_filter(wired: Path) -> None:
    assert builder.filter_businesses() == {"b0", "b1", "b2"}


def test_stage2_drops_outside_and_never_writes_review_text(wired: Path) -> None:
    ids = builder.filter_businesses()
    reviewers, stats = builder.filter_reviews(ids)
    assert stats["reviews_kept"] == 19
    assert stats["reviews_dropped"] == 1
    assert reviewers == {"u0", "u1", "u2", "u_ghost"}
    with gzip.open(wired / "philly_reviews.csv.gz", "rt", encoding="utf-8") as handle:
        content = handle.read()
    assert PRIVATE_TEXT not in content
    assert "text" not in content.splitlines()[0]


def test_stage3_detects_orphans_and_duplicate_rows(wired: Path) -> None:
    ids = builder.filter_businesses()
    reviewers, _ = builder.filter_reviews(ids)
    found, stats = builder.filter_users(reviewers)
    assert found == {"u0", "u1", "u2"}
    assert stats["orphan_reviewer_ids"] == 1
    assert stats["duplicate_user_rows"] == 1


def test_stage4_and_stage5_measurements(wired: Path) -> None:
    ids = builder.filter_businesses()
    reviewers, _ = builder.filter_reviews(ids)
    found, _ = builder.filter_users(reviewers)
    report, survivors = builder.measure_kcore(found)
    assert report["users_after_integrity_filter"] == 3
    assert report["businesses_after_integrity_filter"] == 3
    assert report["kcore"]["5"]["users"] == 3
    assert report["kcore"]["5"]["interactions"] == 18
    assert report["kcore"]["10"]["users"] == 0
    friends = builder.measure_friends(survivors)
    assert friends["5"]["users_with_inner_friends"] == 2
    assert friends["5"]["max_inner_degree"] == 2


def test_main_end_to_end(wired: Path, tmp_path: Path) -> None:
    assert builder.main() == 0
    report = json.loads((tmp_path / "report.json").read_text(encoding="utf-8"))
    assert report["businesses_kept"] == 3
    assert PRIVATE_TEXT not in json.dumps(report)


def test_main_missing_raw_returns_error(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    empty = tmp_path / "empty"
    empty.mkdir()
    monkeypatch.setattr(builder, "RAW", empty)
    monkeypatch.setattr(builder, "OUT", tmp_path / "out2")
    assert builder.main() == 1
