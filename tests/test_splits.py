"""Tests for the chronological split protocol."""

from __future__ import annotations

import pandas as pd
import pytest
from hypothesis import given
from hypothesis import strategies as st

from prism.data.splits import (
    MIN_INTERACTIONS,
    assert_no_leakage,
    chronological_split,
    freeze_indices,
    split_counts,
)


def test_split_counts_exact() -> None:
    assert split_counts(15) == (11, 1, 3)
    assert split_counts(20) == (14, 2, 4)
    assert split_counts(100) == (70, 10, 20)
    assert split_counts(10) == (7, 1, 2)


def test_split_counts_rejects_short_history() -> None:
    with pytest.raises(ValueError):
        split_counts(MIN_INTERACTIONS - 1)


@given(st.integers(min_value=MIN_INTERACTIONS, max_value=100_000))
def test_split_counts_partition_the_history(n: int) -> None:
    n_train, n_val, n_test = split_counts(n)
    assert n_train + n_val + n_test == n
    assert n_train >= 1
    assert n_val >= 1
    assert n_test >= 1


def _frame(n_users: int = 3, per_user: int = 20) -> pd.DataFrame:
    rows = []
    for u in range(n_users):
        for i in range(per_user):
            rows.append(
                {
                    "user_id": f"u{u}",
                    "review_id": f"r{u}_{i:03d}",
                    "business_id": f"b{i % 5}",
                    "stars": 4.0,
                    "date": f"2020-01-{i + 1:02d} 10:00:00",
                }
            )
    return pd.DataFrame(rows)


def test_split_sizes_and_no_leakage() -> None:
    result = chronological_split(_frame())
    assert_no_leakage(result)
    counts = result.groupby(["user_id", "split"]).size().unstack("split")
    assert counts.loc["u0", "train"] == 14
    assert counts.loc["u0", "val"] == 2
    assert counts.loc["u0", "test"] == 4


def test_split_is_deterministic_under_row_shuffle() -> None:
    frame = _frame()
    shuffled = frame.sample(frac=1.0, random_state=7).reset_index(drop=True)
    first = chronological_split(frame).sort_values("review_id").reset_index(drop=True)
    second = chronological_split(shuffled).sort_values("review_id").reset_index(drop=True)
    pd.testing.assert_frame_equal(first, second)


def test_leakage_detector_catches_tampering() -> None:
    result = chronological_split(_frame())
    tampered = result.copy()
    idx = tampered.index[tampered["split"] == "test"][0]
    tampered.loc[idx, "date"] = "2000-01-01 00:00:00"
    with pytest.raises(ValueError):
        assert_no_leakage(tampered)


def test_freeze_indices_is_sorted_and_contiguous() -> None:
    mapping = freeze_indices(pd.Series(["b2", "b1", "b2", "b0"]))
    assert mapping == {"b0": 0, "b1": 1, "b2": 2}
