"""Tests for the non-learned baselines."""

from __future__ import annotations

import numpy as np

from prism.eval.baselines import (
    item_knn_similarity,
    item_popularity,
    knn_score_fn,
    popularity_score_fn,
)


def _train() -> list[np.ndarray]:
    return [
        np.array([0, 1], dtype=np.int64),
        np.array([0, 1], dtype=np.int64),
        np.array([2], dtype=np.int64),
    ]


def test_item_popularity_counts_users() -> None:
    popularity = item_popularity(_train(), 4)
    assert popularity.tolist() == [2.0, 2.0, 1.0, 0.0]


def test_popularity_scores_identical_across_users() -> None:
    score_fn = popularity_score_fn(_train(), 4)
    scores = score_fn(np.array([0, 2], dtype=np.int64))
    assert np.array_equal(scores[0], scores[1])


def test_knn_similarity_is_symmetric_without_self_loops() -> None:
    similarity = item_knn_similarity(_train(), 4, neighbours=10).toarray()
    assert np.allclose(similarity, similarity.T, atol=1e-6)
    assert np.allclose(np.diag(similarity), 0.0)
    assert similarity[0, 1] > 0.0
    assert similarity[0, 2] == 0.0


def test_knn_scores_prefer_co_occurring_items() -> None:
    score_fn = knn_score_fn(_train(), 4, neighbours=10)
    scores = score_fn(np.array([2], dtype=np.int64))[0]
    assert scores[2] == 0.0
    assert scores[0] == 0.0
