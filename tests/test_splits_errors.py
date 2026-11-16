"""Error-path tests for the split protocol."""

from __future__ import annotations

import pandas as pd
import pytest

import prism.data.splits as splits


def test_chronological_split_requires_columns() -> None:
    with pytest.raises(ValueError):
        splits.chronological_split(pd.DataFrame({"user_id": ["u0"]}))


def test_leakage_check_requires_columns() -> None:
    with pytest.raises(ValueError):
        splits.assert_no_leakage(pd.DataFrame({"user_id": ["u0"]}))


def test_leakage_check_rejects_duplicate_review_id() -> None:
    frame = pd.DataFrame(
        {
            "user_id": ["u0", "u0"],
            "review_id": ["same", "same"],
            "date": ["2020-01-01 10:00:00", "2020-01-02 10:00:00"],
            "split": ["train", "test"],
        }
    )
    with pytest.raises(ValueError):
        splits.assert_no_leakage(frame)


def test_leakage_check_rejects_empty_split() -> None:
    frame = pd.DataFrame(
        {
            "user_id": ["u0", "u0"],
            "review_id": ["r0", "r1"],
            "date": ["2020-01-01 10:00:00", "2020-01-02 10:00:00"],
            "split": ["train", "train"],
        }
    )
    with pytest.raises(ValueError):
        splits.assert_no_leakage(frame)


def test_split_counts_rejects_when_no_training_left(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(splits, "MIN_INTERACTIONS", 1)
    with pytest.raises(ValueError):
        splits.split_counts(1)
