"""Tests for full-catalogue ranking metrics."""

from __future__ import annotations

import numpy as np
import pytest

from prism.eval.metrics import ranking_metrics, ranking_metrics_per_user


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


def _reference(
    scores: np.ndarray,
    seen: list[np.ndarray],
    targets: list[np.ndarray],
) -> tuple[dict[str, float], np.ndarray]:
    """Slow, obviously-correct metrics: full sort by (-score, item index) per user."""
    n_users, n_items = scores.shape
    ndcg_users = np.full(n_users, np.nan)
    recall, hits, mrr = [], [], []
    exposure: set[int] = set()
    counts = np.zeros(n_items)
    for u in range(n_users):
        seen_set = {int(i) for i in seen[u]}
        target_set = {int(i) for i in targets[u]} - seen_set
        if not target_set:
            continue
        order = sorted(
            (i for i in range(n_items) if i not in seen_set),
            key=lambda i: (-float(scores[u, i]), i),
        )
        top10, top20 = order[:10], order[:20]
        dcg = sum(1.0 / np.log2(r + 2) for r, i in enumerate(top10) if i in target_set)
        ideal = sum(1.0 / np.log2(r + 2) for r in range(min(10, len(target_set))))
        ndcg_users[u] = dcg / ideal
        recall.append(sum(i in target_set for i in top20) / len(target_set))
        hits.append(float(any(i in target_set for i in top10)))
        mrr.append(1.0 / (1 + min(r for r, i in enumerate(order) if i in target_set)))
        exposure.update(top10)
        for i in top10:
            counts[i] += 1
    values = np.sort(counts)
    total = values.sum()
    gini = (
        float(
            2.0 * np.sum(np.arange(1, n_items + 1) * values) / (n_items * total)
            - (n_items + 1.0) / n_items
        )
        if total
        else 0.0
    )
    return (
        {
            "users_evaluated": float(len(mrr)),
            "ndcg@10": float(np.nanmean(ndcg_users)),
            "recall@20": float(np.mean(recall)),
            "hr@10": float(np.mean(hits)),
            "mrr": float(np.mean(mrr)),
            "coverage@10": len(exposure) / n_items,
            "distinct@10": float(len(exposure)),
            "exposure_gini": gini,
        },
        ndcg_users,
    )


def _random_case(
    rng: np.random.Generator, n_users: int, n_items: int, integer_scores: bool
) -> tuple[np.ndarray, list[np.ndarray], list[np.ndarray]]:
    if integer_scores:
        scores = rng.integers(0, 4, size=(n_users, n_items)).astype(np.float32)
    else:
        scores = rng.normal(size=(n_users, n_items)).astype(np.float32)
    seen = [
        rng.choice(n_items, size=rng.integers(0, n_items // 2), replace=False)
        for _ in range(n_users)
    ]
    targets = [rng.choice(n_items, size=rng.integers(0, 6), replace=False) for _ in range(n_users)]
    return (
        scores,
        [s.astype(np.int64) for s in seen],
        [t.astype(np.int64) for t in targets],
    )


@pytest.mark.parametrize("integer_scores", [True, False])
@pytest.mark.parametrize("n_items", [7, 20, 21, 64])
@pytest.mark.parametrize("batch_users", [3, 1024])
def test_vectorised_matches_slow_reference(
    n_items: int, integer_scores: bool, batch_users: int
) -> None:
    rng = np.random.default_rng(n_items * 7 + int(integer_scores))
    scores, seen, targets = _random_case(rng, 40, n_items, integer_scores)
    expected, expected_users = _reference(scores, seen, targets)
    got, got_users = ranking_metrics_per_user(
        lambda users: scores[users], seen, targets, n_items, batch_users=batch_users
    )
    for key, value in expected.items():
        assert got[key] == pytest.approx(value, abs=1e-9), key
    np.testing.assert_allclose(got_users, expected_users, equal_nan=True, atol=1e-12)
    plain = ranking_metrics(lambda users: scores[users], seen, targets, n_items)
    assert plain == pytest.approx(got, abs=1e-12)


def test_ties_broken_by_lower_item_index() -> None:
    n_items = 40
    seen = [np.empty(0, dtype=np.int64)]
    # all scores equal: order is 0, 1, 2, ...; target 12 is rank 13 -> outside top 10, inside 20
    metrics = ranking_metrics(
        lambda users: np.zeros((users.size, n_items), dtype=np.float32),
        seen,
        [np.array([12], dtype=np.int64)],
        n_items,
    )
    assert metrics["hr@10"] == 0.0
    assert metrics["recall@20"] == 1.0
    assert metrics["mrr"] == pytest.approx(1.0 / 13)
    assert metrics["distinct@10"] == 10.0
    # a tie straddling the top-20 boundary: items 5..39 all share the top score
    scores = np.zeros((1, n_items), dtype=np.float32)
    scores[0, 5:] = 3.0
    metrics = ranking_metrics(
        lambda users: scores[users],
        seen,
        [np.array([24, 25], dtype=np.int64)],
        n_items,
    )
    assert metrics["recall@20"] == pytest.approx(0.5)  # ranks: 5..24 -> item 24 is 20th
    assert metrics["mrr"] == pytest.approx(1.0 / 20)


def test_target_also_seen_is_dropped_and_user_skipped() -> None:
    n_items = 30
    seen = [np.array([3], dtype=np.int64), np.array([1], dtype=np.int64)]
    targets = [np.array([3], dtype=np.int64), np.array([1, 2], dtype=np.int64)]
    scores = np.zeros((2, n_items), dtype=np.float32)
    scores[:, 2] = 1.0
    metrics, per_user = ranking_metrics_per_user(
        lambda users: scores[users], seen, targets, n_items
    )
    assert metrics["users_evaluated"] == 1.0
    assert np.isnan(per_user[0])
    assert per_user[1] == pytest.approx(1.0)
    assert metrics["recall@20"] == pytest.approx(1.0)


def test_all_targets_seen_everywhere_raises() -> None:
    with pytest.raises(ValueError):
        ranking_metrics(
            lambda users: np.zeros((users.size, 5), dtype=np.float32),
            [np.array([0], dtype=np.int64)],
            [np.array([0], dtype=np.int64)],
            5,
        )


def test_small_catalogue_and_distinct_key() -> None:
    n_items = 5
    seen = [np.empty(0, dtype=np.int64)]
    metrics = ranking_metrics(
        lambda users: np.arange(n_items, dtype=np.float32)[None, :].repeat(users.size, 0),
        seen,
        [np.array([4], dtype=np.int64)],
        n_items,
    )
    assert metrics["mrr"] == 1.0
    assert metrics["distinct@10"] == 5.0
    assert metrics["coverage@10"] == 1.0


def test_fewer_unseen_than_ten_does_not_count_seen_items_as_exposed() -> None:
    n_items = 12
    seen = [np.arange(2, 12, dtype=np.int64)]
    metrics = ranking_metrics(
        lambda users: np.zeros((users.size, n_items), dtype=np.float32),
        seen,
        [np.array([1], dtype=np.int64)],
        n_items,
    )
    assert metrics["distinct@10"] == 2.0


def test_full_size_evaluation_is_fast() -> None:
    import time

    rng = np.random.default_rng(0)
    n_users, n_items = 2000, 3000
    scores = rng.normal(size=(n_users, n_items)).astype(np.float32)
    seen = [rng.choice(n_items, 30, replace=False).astype(np.int64) for _ in range(n_users)]
    targets = [rng.choice(n_items, 4, replace=False).astype(np.int64) for _ in range(n_users)]
    start = time.perf_counter()
    ranking_metrics(lambda users: scores[users], seen, targets, n_items)
    assert time.perf_counter() - start < 5.0
