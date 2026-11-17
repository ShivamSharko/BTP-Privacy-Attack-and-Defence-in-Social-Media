"""Tests for DataBundle and load_bundle."""

from __future__ import annotations

import gzip
from pathlib import Path

import numpy as np
import pytest

from prism.data.bundle import DataBundle, load_bundle
from prism.data.synthetic import write_synthetic_dataset


def _arr(*values: int) -> np.ndarray:
    return np.array(values, dtype=np.int64)


def _bundle() -> DataBundle:
    return DataBundle(
        n_users=3,
        n_items=5,
        train=(_arr(0, 1), _arr(1), _arr(2, 3)),
        val=(_arr(2), _arr(0, 4), _arr(1)),
        test=(_arr(3), _arr(2), _arr(4)),
        item_content=np.eye(5, dtype=np.float32),
    )


def test_history_and_targets() -> None:
    b = _bundle()
    assert np.array_equal(b.history("tune")[0], _arr(0, 1))
    assert np.array_equal(b.history("final")[1], _arr(0, 1, 4))
    assert np.array_equal(b.targets("tune")[1], _arr(0, 4))
    assert np.array_equal(b.targets("final")[2], _arr(4))


def test_history_matrix() -> None:
    b = _bundle()
    full = b.history_matrix("tune")
    assert full.dtype == np.float32 and full.shape == (3, 5)
    assert full[0].tolist() == [1, 1, 0, 0, 0]
    sub = b.history_matrix("final", np.array([2, 0], dtype=np.int64))
    assert sub.shape == (2, 5)
    assert sub[0].tolist() == [0, 1, 1, 1, 0]
    assert sub[1].tolist() == [1, 1, 1, 0, 0]


def test_popularity_counts_distinct_users() -> None:
    b = _bundle()
    assert b.popularity("tune").tolist() == [1, 2, 1, 1, 0]
    assert b.popularity("final").tolist() == [2, 3, 2, 1, 1]


def test_history_matrix_scales(tmp_path: Path) -> None:
    rng = np.random.default_rng(0)
    n_users, n_items = 10_000, 6_500
    train = tuple(np.unique(rng.integers(0, n_items, 30)).astype(np.int64) for _ in range(n_users))
    empty = tuple(np.empty(0, dtype=np.int64) for _ in range(n_users))
    b = DataBundle(n_users, n_items, train, empty, empty, np.zeros((n_items, 2), np.float32))
    block = b.history_matrix("tune", np.arange(300, dtype=np.int64))
    assert block.shape == (300, n_items)
    assert block.sum() == sum(a.size for a in train[:300])


def _write(path: Path, rows: list[tuple[int, int]]) -> None:
    with gzip.open(path, "wt", encoding="utf-8") as handle:
        handle.write("user_idx,item_idx,rating,timestamp,split\n")
        for u, i in rows:
            handle.write(f"{u},{i},5,0,x\n")


def _manual(tmp_path: Path, train: list[tuple[int, int]], val: list[tuple[int, int]]) -> Path:
    _write(tmp_path / "dataset_train.csv.gz", train)
    _write(tmp_path / "dataset_val.csv.gz", val)
    _write(tmp_path / "dataset_test.csv.gz", [(0, 1)])
    np.savez_compressed(
        tmp_path / "features_semantic.npz",
        items=np.ones((3, 2), np.float32),
        users=np.ones((2, 2), np.float32),
    )
    return tmp_path


def test_load_ok_manual(tmp_path: Path) -> None:
    b = load_bundle(_manual(tmp_path, [(0, 0), (1, 2)], [(0, 1)]))
    assert (b.n_users, b.n_items) == (2, 3)
    assert np.allclose(np.linalg.norm(b.item_content, axis=1), 1.0)


def test_load_item_out_of_range(tmp_path: Path) -> None:
    with pytest.raises(ValueError, match="out of range"):
        load_bundle(_manual(tmp_path, [(0, 0), (1, 3)], []))


def test_load_user_out_of_range(tmp_path: Path) -> None:
    with pytest.raises(ValueError, match="out of range"):
        load_bundle(_manual(tmp_path, [(0, 0), (2, 1)], []))


def test_load_negative_index(tmp_path: Path) -> None:
    with pytest.raises(ValueError, match="out of range"):
        load_bundle(_manual(tmp_path, [(0, 0), (1, -1)], []))


def test_load_user_without_train(tmp_path: Path) -> None:
    with pytest.raises(ValueError, match="no train"):
        load_bundle(_manual(tmp_path, [(0, 0)], [(1, 1)]))


def test_load_missing_file(tmp_path: Path) -> None:
    with pytest.raises(FileNotFoundError):
        load_bundle(tmp_path)


def test_variant_selects_file(tmp_path: Path) -> None:
    write_synthetic_dataset(tmp_path, n_users=20, n_items=30)
    with pytest.raises(FileNotFoundError):
        load_bundle(tmp_path, variant="tfidf")
