"""Tests for the non-learned baselines."""

from __future__ import annotations

import numpy as np
import pytest

from prism.data.social import graph_from_edges
from prism.eval.baselines import (
    friend_score_fn,
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


def test_ease_matches_closed_form_and_dtype() -> None:
    from prism.eval.baselines import ease_score_fn

    train = _train()
    n_items, l2 = 4, 2.0
    x = np.zeros((3, n_items))
    for user, items in enumerate(train):
        x[user, items] = 1.0
    precision = np.linalg.inv(x.T @ x + l2 * np.eye(n_items))
    weights = precision / -np.diag(precision)
    np.fill_diagonal(weights, 0.0)
    scores = ease_score_fn(train, n_items, l2=l2)(np.array([0, 1, 2], dtype=np.int64))
    assert scores.dtype == np.float32
    np.testing.assert_allclose(scores, x @ weights, atol=1e-5)


def test_ease_prefers_co_occurring_items_and_never_self_scores() -> None:
    from prism.eval.baselines import ease_score_fn

    scores = ease_score_fn(_train(), 4, l2=1.0)(np.array([0, 2], dtype=np.int64))
    assert scores[0, 1] > scores[0, 2]  # user 0 has item 0; item 1 co-occurs with it
    assert scores[0, 3] == pytest.approx(0.0, abs=1e-7)


def test_friend_score_counts_friends_items() -> None:
    graph = graph_from_edges(np.array([[0, 1], [0, 2]], dtype=np.int64), 4)
    train = [
        np.array([3], dtype=np.int64),
        np.array([0, 1], dtype=np.int64),
        np.array([1, 2], dtype=np.int64),
        np.array([0, 1], dtype=np.int64),
    ]
    scores = friend_score_fn(graph, train, 4)(np.array([0], dtype=np.int64))
    assert scores.shape == (1, 4)
    # friends 1 and 2 hold item 0 once, item 1 twice, item 2 once, item 3 never
    assert int(np.argmax(scores[0])) == 1
    assert 2.0 <= scores[0, 1] < 2.1
    assert 1.0 <= scores[0, 0] < 1.1 and 1.0 <= scores[0, 2] < 1.1
    assert scores[0, 3] < 0.1


def test_friend_score_isolated_user_is_popularity() -> None:
    graph = graph_from_edges(np.array([[0, 1]], dtype=np.int64), 4)
    train = [*_train(), np.array([0], dtype=np.int64)]
    users = np.array([3], dtype=np.int64)
    scores = friend_score_fn(graph, train, 4)(users)
    popular = popularity_score_fn(train, 4)(users)
    assert np.array_equal(
        np.argsort(-scores[0], kind="stable"), np.argsort(-popular[0], kind="stable")
    )
