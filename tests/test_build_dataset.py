"""Tests for the final dataset builder, using synthetic fixtures only."""

from __future__ import annotations

import json
from pathlib import Path

import build_dataset as builder
import pandas as pd
import pytest


def _write_inputs(root: Path, n_users: int = 4, per_user: int = 20) -> None:
    businesses = []
    for i in range(6):
        businesses.append(
            {
                "business_id": f"b{i}",
                "name": f"Shop {i}",
                "city": "Philadelphia",
                "state": "PA",
                "latitude": 39.95,
                "longitude": -75.16,
                "stars": 4.0,
                "review_count": 10,
                "categories": "Mexican",
                "attributes_json": "{}",
            }
        )
    users = [
        {"user_id": f"u{u}", "friends": "None", "review_count": per_user} for u in range(n_users)
    ]
    reviews = []
    for u in range(n_users):
        for i in range(per_user):
            reviews.append(
                {
                    "review_id": f"r{u}_{i:03d}",
                    "user_id": f"u{u}",
                    "business_id": f"b{i % 6}",
                    "stars": 4.0,
                    "date": f"2020-01-{i + 1:02d} 10:00:00",
                }
            )
    pd.DataFrame(businesses).to_csv(
        root / "philly_businesses.csv.gz", index=False, compression="gzip"
    )
    pd.DataFrame(users).to_csv(root / "philly_users.csv.gz", index=False, compression="gzip")
    pd.DataFrame(reviews).to_csv(root / "philly_reviews.csv.gz", index=False, compression="gzip")


def test_missing_inputs_returns_error(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(builder, "PROCESSED", tmp_path)
    assert builder.main() == 1


def test_build_dataset_end_to_end(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    processed = tmp_path / "processed"
    processed.mkdir()
    _write_inputs(processed)
    monkeypatch.setattr(builder, "PROCESSED", processed)
    monkeypatch.setattr(builder, "CARD", tmp_path / "card.json")
    monkeypatch.setattr(builder, "K", 5)

    assert builder.main() == 0
    card = json.loads((tmp_path / "card.json").read_text(encoding="utf-8"))
    assert card["users"] == 4
    assert card["interactions"] == 80
    assert sum(card["split_counts"].values()) == 80
    for name in builder.ARTIFACT_NAMES:
        assert (processed / name).is_file()


def test_card_contains_no_identifiers(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    processed = tmp_path / "processed"
    processed.mkdir()
    _write_inputs(processed)
    monkeypatch.setattr(builder, "PROCESSED", processed)
    monkeypatch.setattr(builder, "CARD", tmp_path / "card.json")
    monkeypatch.setattr(builder, "K", 5)
    builder.main()
    dumped = (tmp_path / "card.json").read_text(encoding="utf-8")
    assert "r0_000" not in dumped
    assert '"u0"' not in dumped
    assert '"b0"' not in dumped
