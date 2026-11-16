"""Tests for split loaders and feature construction (no model download)."""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from prism.data.dataset import load_split, user_item_lists
from prism.data.features import (
    build_item_text,
    l2_normalize,
    pool_user_vectors,
    tfidf_features,
)


def test_build_item_text_is_deterministic() -> None:
    attributes = '{"RestaurantsTakeOut": true, "BusinessParking": {"garage": true, "lot": false}}'
    first = build_item_text("Garaje", "Mexican, Burgers", attributes)
    second = build_item_text("Garaje", "Mexican, Burgers", attributes)
    assert first == second
    assert "Garaje" in first
    assert "Mexican" in first
    assert "RestaurantsTakeOut" in first
    assert "BusinessParking.garage" in first
    assert "lot" not in first


def test_build_item_text_handles_bad_json() -> None:
    assert build_item_text("X", "", "not json") == "X."


def test_l2_normalize_keeps_zero_rows() -> None:
    vectors = np.array([[3.0, 4.0], [0.0, 0.0]], dtype=np.float32)
    result = l2_normalize(vectors)
    assert np.isclose(np.linalg.norm(result[0]), 1.0)
    assert np.linalg.norm(result[1]) == 0.0


def test_pool_user_vectors_uses_only_given_interactions() -> None:
    items = np.array([[1.0, 0.0], [0.0, 1.0], [1.0, 1.0]], dtype=np.float32)
    users = np.array([0, 0, 1], dtype=np.int64)
    idx = np.array([0, 1, 2], dtype=np.int64)
    pooled = pool_user_vectors(users, idx, items, 3)
    assert np.isclose(np.linalg.norm(pooled[0]), 1.0)
    assert np.isclose(pooled[0, 0], pooled[0, 1])
    assert np.linalg.norm(pooled[2]) == 0.0


def test_tfidf_features_shape_and_norm() -> None:
    texts = ["mexican tacos burrito", "italian pizza pasta", "coffee cafe espresso"] * 4
    vectors = tfidf_features(texts, dim=8)
    assert vectors.shape == (len(texts), 8)
    assert np.allclose(np.linalg.norm(vectors, axis=1), 1.0, atol=1e-5)


def test_user_item_lists_groups_and_sorts(tmp_path: Path) -> None:
    frame = pd.DataFrame({"user_idx": [1, 0, 1, 0], "item_idx": [5, 2, 3, 2]})
    lists = user_item_lists(frame, 2)
    assert lists[0].tolist() == [2]
    assert lists[1].tolist() == [3, 5]
    csv = tmp_path / "dataset_train.csv.gz"
    frame.to_csv(csv, index=False, compression="gzip")
    assert len(load_split("train", tmp_path)) == 4


def test_load_split_rejects_unknown(tmp_path: Path) -> None:
    with pytest.raises(ValueError):
        load_split("holdout", tmp_path)
