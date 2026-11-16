"""Tests for full-catalogue ranking metrics."""

from __future__ import annotations

import numpy as np
import pytest

from prism.eval.metrics import ranking_metrics


def test_perfect_ranking_scores_one() -> None:
    n_items = 30
    train = [np.empty(0, dtype=np.int64) for _ in range(3)]
    test = [np.array([0], dtype=np.int64) for _ in range(3)]

    def score_fn(users: np.ndarray) -> np.ndarray:
        scores = np.zeros((users.size, n_items), dtype=np.float32)
        scores[:, 0] = 10.0
        return scores

    metrics = ranking_metrics(score_fn, train, test, n_items)
    assert metrics["ndcg@10"] == pytest.approx(1.0)
    assert metrics["hr@10"] == pytest.approx(1.0)
    assert metrics["mrr"] == pytest.approx(1.0)
    assert metrics["recall@20"] == pytest.approx(1.0)


def test_training_items_are_masked() -> None:
    n_items = 30
    train = [np.array([0], dtype=np.int64)]
    test = [np.array([1], dtype=np.int64)]

    def score_fn(users: np.ndarray) -> np.ndarray:
        scores = np.zeros((users.size, n_items), dtype=np.float32)
        scores[:, 0] = 100.0
        scores[:, 1] = 5.0
        return scores

    metrics = ranking_metrics(score_fn, train, test, n_items)
    assert metrics["mrr"] == pytest.approx(1.0)


def test_worst_ranking_gives_low_recall() -> None:
    n_items = 40
    train = [np.empty(0, dtype=np.int64)]
    test = [np.array([39], dtype=np.int64)]

    def score_fn(users: np.ndarray) -> np.ndarray:
        scores = np.zeros((users.size, n_items), dtype=np.float32)
        scores[:, 39] = -10.0
        return scores

    metrics = ranking_metrics(score_fn, train, test, n_items)
    assert metrics["hr@10"] == 0.0
    assert metrics["recall@20"] == 0.0
    assert metrics["mrr"] == pytest.approx(1.0 / 40)


def test_no_test_users_raises() -> None:
    with pytest.raises(ValueError):
        ranking_metrics(
            lambda users: np.zeros((users.size, 5), dtype=np.float32),
            [np.empty(0, dtype=np.int64)],
            [np.empty(0, dtype=np.int64)],
            5,
        )
