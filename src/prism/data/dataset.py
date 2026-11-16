"""Loaders for the integer-indexed split artifacts produced by build_dataset.py."""

from __future__ import annotations

from pathlib import Path
from typing import Final

import numpy as np
import numpy.typing as npt
import pandas as pd  # type: ignore[import-untyped]

PROCESSED: Final[Path] = Path("data/processed")
SPLIT_FILES: Final[dict[str, str]] = {
    "train": "dataset_train.csv.gz",
    "val": "dataset_val.csv.gz",
    "test": "dataset_test.csv.gz",
}


def load_split(name: str, processed: Path = PROCESSED) -> pd.DataFrame:
    """Read one split artifact."""
    if name not in SPLIT_FILES:
        raise ValueError(f"unknown split: {name}")
    return pd.read_csv(processed / SPLIT_FILES[name])


def user_item_lists(frame: pd.DataFrame, n_users: int) -> list[npt.NDArray[np.int64]]:
    """Group item indices per user, sorted and deduplicated."""
    result: list[npt.NDArray[np.int64]] = [np.empty(0, dtype=np.int64) for _ in range(n_users)]
    for user_idx, group in frame.groupby("user_idx", sort=True):
        result[int(user_idx)] = np.unique(group["item_idx"].to_numpy(dtype=np.int64))
    return result


def counts_from_card(card_path: Path) -> tuple[int, int]:
    """Read (n_users, n_items) from the committed dataset card."""
    import json

    card = json.loads(card_path.read_text(encoding="utf-8"))
    return int(card["users"]), int(card["items"])
