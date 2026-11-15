"""Tests for the Yelp inventory script, using synthetic fixtures only."""

from __future__ import annotations

import json
from pathlib import Path

import inspect_yelp as inspector
import pytest

SECRET_USER = "USERIDSHOULDNEVERAPPEAR"
SECRET_BUSINESS = "BUSINESSIDSHOULDNEVERAPPEAR"


def _write(path: Path, records: list[dict[str, object]]) -> None:
    path.write_text("\n".join(json.dumps(record) for record in records) + "\n", encoding="utf-8")


@pytest.fixture
def fake_root(tmp_path: Path) -> Path:
    _write(
        tmp_path / inspector.BUSINESS_FILE,
        [
            {"business_id": SECRET_BUSINESS, "city": "Philadelphia", "state": "PA"},
            {"business_id": "b2", "city": "Tampa", "state": "FL"},
            {"business_id": "b3", "city": "Philadelphia", "state": "PA"},
        ],
    )
    _write(
        tmp_path / inspector.REVIEW_FILE,
        [
            {
                "user_id": SECRET_USER,
                "business_id": SECRET_BUSINESS,
                "stars": 5,
                "date": "2019-01-01 00:00:00",
                "text": "private text",
            },
            {
                "user_id": "u2",
                "business_id": "b2",
                "stars": 3,
                "date": "2021-06-01 00:00:00",
                "text": "private text",
            },
        ],
    )
    _write(
        tmp_path / inspector.USER_FILE,
        [
            {"user_id": SECRET_USER, "friends": "u2, u3", "review_count": 10},
            {"user_id": "u2", "friends": "None", "review_count": 4},
        ],
    )
    return tmp_path


def test_counts_are_correct(fake_root: Path) -> None:
    profile = inspector.build_profile(fake_root)
    assert profile["businesses"]["count"] == 3
    assert profile["reviews"]["count"] == 2
    assert profile["users"]["count"] == 2
    assert profile["reviews"]["distinct_users"] == 2


def test_city_and_date_aggregates(fake_root: Path) -> None:
    profile = inspector.build_profile(fake_root)
    assert profile["businesses"]["top_cities"]["Philadelphia"] == 2
    assert profile["reviews"]["min_date"] == "2019-01-01 00:00:00"
    assert profile["reviews"]["max_date"] == "2021-06-01 00:00:00"


def test_friends_are_counted(fake_root: Path) -> None:
    profile = inspector.build_profile(fake_root)
    assert profile["users"]["friend_listings_total"] == 2
    assert profile["users"]["users_with_friends"] == 1
    assert profile["users"]["max_friend_degree"] == 2


def test_no_identifiers_or_text_leak(fake_root: Path) -> None:
    dumped = json.dumps(inspector.build_profile(fake_root))
    assert SECRET_USER not in dumped
    assert SECRET_BUSINESS not in dumped
    assert "private text" not in dumped


def test_limit_is_applied(fake_root: Path) -> None:
    profile = inspector.build_profile(fake_root, limit=1)
    assert profile["businesses"]["count"] == 1
    assert profile["limit_applied"] == 1


def test_malformed_lines_are_counted(tmp_path: Path) -> None:
    path = tmp_path / "broken.json"
    path.write_text('{"a": 1}\nnot json\n{"b": 2}\n', encoding="utf-8")
    stats = inspector.FileStats()
    records = list(inspector.iter_records(path, stats))
    assert len(records) == 2
    assert stats.bad_lines == 1


def test_missing_files_returns_error(tmp_path: Path) -> None:
    assert inspector.main(["--root", str(tmp_path), "--out", str(tmp_path / "p.json")]) == 1


def test_main_writes_output(fake_root: Path, tmp_path: Path) -> None:
    out = tmp_path / "out" / "profile.json"
    assert inspector.main(["--root", str(fake_root), "--out", str(out)]) == 0
    assert json.loads(out.read_text(encoding="utf-8"))["schema_version"] == 1
