"""In-memory data bundle for experiments: per-user item arrays plus item content."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Literal

import numpy as np
import numpy.typing as npt
import pandas as pd  # type: ignore[import-untyped]

Phase = Literal["tune", "final"]
_SPLITS = ("train", "val", "test")
IntArrays = tuple[npt.NDArray[np.int64], ...]


def _same(left: IntArrays, right: IntArrays) -> bool:
    return len(left) == len(right) and all(
        np.array_equal(a, b) for a, b in zip(left, right, strict=True)
    )


@dataclass(frozen=True, eq=False)
class DataBundle:
    """Train, validation and test item arrays per user, plus L2-normalised item content."""

    n_users: int
    n_items: int
    train: IntArrays
    val: IntArrays
    test: IntArrays
    item_content: npt.NDArray[np.float32]
    _cache: dict[str, Any] = field(default_factory=dict, repr=False, compare=False)

    def __eq__(self, other: object) -> bool:
        """Array-wise equality over all fields except the cache."""
        if not isinstance(other, DataBundle):
            return NotImplemented
        return (
            self.n_users == other.n_users
            and self.n_items == other.n_items
            and _same(self.train, other.train)
            and _same(self.val, other.val)
            and _same(self.test, other.test)
            and np.array_equal(self.item_content, other.item_content)
        )

    __hash__ = None  # type: ignore[assignment]

    def history(self, phase: Phase) -> IntArrays:
        """Items each user has seen: train for tune, sorted unique train+val for final."""
        if phase == "tune":
            return self.train
        if "final" not in self._cache:
            self._cache["final"] = tuple(
                np.union1d(a, b).astype(np.int64) for a, b in zip(self.train, self.val, strict=True)
            )
        final: IntArrays = self._cache["final"]
        return final

    def targets(self, phase: Phase) -> IntArrays:
        """Held-out items to rank: val for tune, test for final."""
        return self.val if phase == "tune" else self.test

    def history_matrix(
        self, phase: Phase, users: npt.NDArray[np.int64] | None = None
    ) -> npt.NDArray[np.float32]:
        """Dense 0/1 history rows for the given users (all users if None), built on demand."""
        hist = self.history(phase)
        chosen = np.arange(self.n_users, dtype=np.int64) if users is None else users
        out = np.zeros((chosen.size, self.n_items), dtype=np.float32)
        if chosen.size == 0:
            return out
        parts = [hist[int(u)] for u in chosen]
        lengths = np.array([p.size for p in parts], dtype=np.int64)
        if lengths.sum():
            out[np.repeat(np.arange(chosen.size), lengths), np.concatenate(parts)] = 1.0
        return out

    def popularity(self, phase: Phase) -> npt.NDArray[np.int64]:
        """Distinct users per item in the phase's history."""
        counts = np.zeros(self.n_items, dtype=np.int64)
        for items in self.history(phase):
            counts[np.unique(items)] += 1
        return counts


def _group(frame: pd.DataFrame, n_users: int, n_items: int, name: str) -> IntArrays:
    users = frame["user_idx"].to_numpy(dtype=np.int64)
    items = frame["item_idx"].to_numpy(dtype=np.int64)
    if users.size and (users.min() < 0 or users.max() >= n_users):
        raise ValueError(f"{name}: user index out of range [0, {n_users})")
    if items.size and (items.min() < 0 or items.max() >= n_items):
        raise ValueError(f"{name}: item index out of range [0, {n_items})")
    order = np.argsort(users, kind="stable")
    users, items = users[order], items[order]
    bounds = np.searchsorted(users, np.arange(n_users + 1))
    return tuple(np.unique(items[bounds[u] : bounds[u + 1]]) for u in range(n_users))


def load_bundle(processed: Path, variant: str = "semantic") -> DataBundle:
    """Load split CSVs and the feature file from a processed directory into a DataBundle."""
    with np.load(processed / f"features_{variant}.npz") as features:
        content = np.asarray(features["items"], dtype=np.float32)
        n_users = int(features["users"].shape[0])
    n_items = int(content.shape[0])
    groups = {
        name: _group(pd.read_csv(processed / f"dataset_{name}.csv.gz"), n_users, n_items, name)
        for name in _SPLITS
    }
    if any(a.size == 0 for a in groups["train"]):
        raise ValueError("a user has no train item")
    norms = np.maximum(np.linalg.norm(content, axis=1, keepdims=True), 1e-12)
    return DataBundle(
        n_users=n_users,
        n_items=n_items,
        train=groups["train"],
        val=groups["val"],
        test=groups["test"],
        item_content=(content / norms).astype(np.float32),
    )
