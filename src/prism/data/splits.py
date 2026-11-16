"""Deterministic chronological splitting and index freezing (PREREGISTRATION section 2).

Per user: the last 20% of interactions are test, the preceding 10% validation,
and all earlier interactions training. Counts use integer arithmetic so the
split is exact and reproducible. Ties on timestamp are broken by review_id.
"""

from __future__ import annotations

from typing import Final

import numpy as np
import pandas as pd  # type: ignore[import-untyped]

TEST_PERCENT: Final[int] = 20
VAL_PERCENT: Final[int] = 10
MIN_INTERACTIONS: Final[int] = 10
SPLITS: Final[tuple[str, ...]] = ("train", "val", "test")


def split_counts(n: int) -> tuple[int, int, int]:
    """Return exact (train, val, test) sizes for n interactions."""
    if n < MIN_INTERACTIONS:
        raise ValueError(f"user has {n} interactions, below minimum {MIN_INTERACTIONS}")
    n_test = max(1, (n * TEST_PERCENT) // 100)
    n_val = max(1, (n * VAL_PERCENT) // 100)
    n_train = n - n_test - n_val
    if n_train < 1:
        raise ValueError(f"no training interactions left for n={n}")
    return n_train, n_val, n_test


def chronological_split(frame: pd.DataFrame) -> pd.DataFrame:
    """Add a 'split' column using a per-user chronological 70/10/20 protocol."""
    required = {"user_id", "review_id", "date"}
    missing = required - set(frame.columns)
    if missing:
        raise ValueError(f"missing columns: {sorted(missing)}")

    ordered = frame.sort_values(["user_id", "date", "review_id"], kind="mergesort").reset_index(
        drop=True
    )

    labels = np.empty(len(ordered), dtype=object)
    for _, positions in ordered.groupby("user_id", sort=False).indices.items():
        n = len(positions)
        n_train, n_val, _ = split_counts(n)
        labels[positions[:n_train]] = "train"
        labels[positions[n_train : n_train + n_val]] = "val"
        labels[positions[n_train + n_val :]] = "test"

    ordered["split"] = labels
    return ordered


def assert_no_leakage(frame: pd.DataFrame) -> None:
    """Fail loudly if any split boundary or uniqueness invariant is violated."""
    required = {"user_id", "review_id", "date", "split"}
    missing = required - set(frame.columns)
    if missing:
        raise ValueError(f"missing columns: {sorted(missing)}")
    if frame["review_id"].duplicated().any():
        raise ValueError("duplicate review_id across splits")

    for user_id, group in frame.groupby("user_id", sort=False):
        train = group.loc[group["split"] == "train", "date"]
        val = group.loc[group["split"] == "val", "date"]
        test = group.loc[group["split"] == "test", "date"]
        if train.empty or val.empty or test.empty:
            raise ValueError(f"user {user_id} has an empty split")
        if train.max() > val.min():
            raise ValueError(f"train/val temporal overlap for user {user_id}")
        if val.max() > test.min():
            raise ValueError(f"val/test temporal overlap for user {user_id}")


def freeze_indices(values: pd.Series) -> dict[str, int]:
    """Map sorted unique identifiers to contiguous integer indices."""
    unique = sorted({str(value) for value in values})
    return {value: index for index, value in enumerate(unique)}
