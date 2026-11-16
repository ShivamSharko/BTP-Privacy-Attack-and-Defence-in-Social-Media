"""Regression tests for the Philadelphia subset pipeline.

A single Yelp user's friends field can exceed Python's default csv field limit
of 131072 characters. That crashed Stage 5 on the real dataset, so the limit is
raised at import time and the behaviour is locked in here.
"""

from __future__ import annotations

import csv
import gzip
from pathlib import Path

import build_philly_subset as builder
import pytest

DEFAULT_CSV_LIMIT = 131_072


def test_csv_field_limit_is_raised() -> None:
    assert builder.CSV_FIELD_LIMIT > DEFAULT_CSV_LIMIT
    assert csv.field_size_limit() >= builder.CSV_FIELD_LIMIT


def test_measure_friends_handles_oversized_field(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(builder, "OUT", tmp_path)
    padding = [f"pad{i:07d}" for i in range(12_000)]
    field = ", ".join(["friend000000", "friend000001", *padding])
    assert len(field) > DEFAULT_CSV_LIMIT

    target = tmp_path / "philly_users.csv.gz"
    with gzip.open(target, "wt", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(builder.USER_COLUMNS)
        writer.writerow(["u1", field, 42])

    result = builder.measure_friends({5: {"u1", "friend000000", "friend000001"}})
    assert result["5"]["users_with_inner_friends"] == 1
    assert result["5"]["avg_inner_degree_among_connected"] == 2.0
    assert result["5"]["max_inner_degree"] == 2


def test_measure_friends_ignores_none_and_counts_inner_edges(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(builder, "OUT", tmp_path)
    target = tmp_path / "philly_users.csv.gz"
    with gzip.open(target, "wt", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(builder.USER_COLUMNS)
        writer.writerow(["u1", "None", 1])
        writer.writerow(["u2", "u1", 1])

    result = builder.measure_friends({5: {"u1", "u2"}})
    assert result["5"]["users_with_inner_friends"] == 1
    assert result["5"]["max_inner_degree"] == 1
    assert result["5"]["share_connected"] == 0.5
