"""Full-catalogue ranking metrics (PREREGISTRATION section 4).

No sampled negatives: every item in the filtered catalogue is scored. Items a
user already interacted with in training are masked. The known inflation from
k-core catalogue filtering is documented in the dataset card.
"""

from __future__ import annotations

from collections.abc import Callable, Sequence

import numpy as np
import numpy.typing as npt

ScoreFn = Callable[[npt.NDArray[np.int64]], npt.NDArray[np.float32]]


def _gini(counts: npt.NDArray[np.int64]) -> float:
    """Gini coefficient of item exposure; 0 = perfectly equal."""
    values = np.sort(counts.astype(np.float64))
    total = values.sum()
    n = values.size
    if total == 0.0 or n == 0:
        return 0.0
    index = np.arange(1, n + 1, dtype=np.float64)
    return float((2.0 * np.sum(index * values)) / (n * total) - (n + 1.0) / n)


def _order_keys(
    scores: npt.NDArray[np.float32], valid: npt.NDArray[np.bool_]
) -> npt.NDArray[np.uint64]:
    """Unique uint64 keys whose descending order is (score desc, item index asc).

    Float32 bits are mapped to an order-preserving uint32 and combined with the
    reversed item index, so ties never depend on partition internals. Invalid
    entries get key 0, below every valid key.
    """
    clean = scores + np.float32(0.0)  # copy; also maps -0.0 to +0.0
    np.putmask(clean, np.isnan(clean), np.float32(-np.inf))
    bits = clean.view(np.uint32)
    sign_mask = (bits.view(np.int32) >> 31).view(np.uint32) | np.uint32(0x80000000)
    bits ^= sign_mask  # order-preserving map of float32 to uint32
    keys = bits.astype(np.uint64)
    keys <<= np.uint64(32)
    keys |= np.uint64(0xFFFFFFFF) - np.arange(scores.shape[1], dtype=np.uint64)
    np.putmask(keys, ~valid, np.uint64(0))
    return keys


def ranking_metrics_per_user(
    score_fn: ScoreFn,
    seen_items: Sequence[npt.NDArray[np.int64]],
    target_items: Sequence[npt.NDArray[np.int64]],
    n_items: int,
    batch_users: int = 1024,
) -> tuple[dict[str, float], npt.NDArray[np.float64]]:
    """Aggregate metrics plus per-user NDCG@10 (NaN for users with no unseen target)."""
    n_users = len(target_items)
    k = min(20, n_items)
    discounts = 1.0 / np.log2(np.arange(2, 12, dtype=np.float64))
    ideal_dcg = np.cumsum(discounts)
    ndcg_users = np.full(n_users, np.nan, dtype=np.float64)
    recall_sum = hit_sum = mrr_sum = 0.0
    evaluated = 0
    exposure = np.zeros(n_items, dtype=np.int64)

    for start in range(0, n_users, batch_users):
        stop = min(start + batch_users, n_users)
        size = stop - start
        scores = np.asarray(score_fn(np.arange(start, stop, dtype=np.int64)), dtype=np.float32)
        seen_mask = np.zeros((size, n_items), dtype=np.bool_)
        target_mask = np.zeros((size, n_items), dtype=np.bool_)
        for offset in range(size):
            seen_mask[offset, seen_items[start + offset]] = True
            target_mask[offset, target_items[start + offset]] = True
        target_mask &= ~seen_mask
        n_targets = target_mask.sum(axis=1)
        active = np.flatnonzero(n_targets > 0)
        if active.size == 0:
            continue
        scores, seen_mask, target_mask = scores[active], seen_mask[active], target_mask[active]
        n_targets = n_targets[active]
        valid = ~seen_mask
        rows = np.arange(active.size)

        keys = _order_keys(scores, valid)
        part = np.argpartition(keys, n_items - k, axis=1)[:, n_items - k :]
        part_keys = np.take_along_axis(keys, part, axis=1)
        top = np.take_along_axis(part, np.argsort(part_keys, axis=1)[:, ::-1], axis=1)
        top_valid = np.take_along_axis(valid, top, axis=1)
        top_hit = np.take_along_axis(target_mask, top, axis=1) & top_valid

        top10_hit = top_hit[:, :10]
        dcg = (top10_hit * discounts[: top10_hit.shape[1]]).sum(axis=1)
        ndcg = dcg / ideal_dcg[np.minimum(10, n_targets) - 1]
        ndcg_users[start + active] = ndcg
        recall_sum += float((top_hit.sum(axis=1) / n_targets).sum())
        hit_sum += float(top10_hit.any(axis=1).sum())

        best_scores = np.where(target_mask, scores, -np.inf)
        best = best_scores.argmax(axis=1)
        best_score = scores[rows, best][:, None]
        ahead = (valid & (scores > best_score)).sum(axis=1)
        tied = (valid & (scores == best_score) & (np.arange(n_items)[None, :] < best[:, None])).sum(
            axis=1
        )
        mrr_sum += float((1.0 / (ahead + tied + 1)).sum())

        top10 = top[:, :10][top_valid[:, :10]]
        exposure += np.bincount(top10, minlength=n_items)
        evaluated += int(active.size)

    if evaluated == 0:
        raise ValueError("no users with test interactions")
    distinct = int(np.count_nonzero(exposure))
    metrics = {
        "users_evaluated": float(evaluated),
        "ndcg@10": float(np.nansum(ndcg_users)) / evaluated,
        "recall@20": recall_sum / evaluated,
        "hr@10": hit_sum / evaluated,
        "mrr": mrr_sum / evaluated,
        "coverage@10": float(distinct) / float(n_items),
        "distinct@10": float(distinct),
        "exposure_gini": _gini(exposure),
    }
    return metrics, ndcg_users


def ranking_metrics(
    score_fn: ScoreFn,
    seen_items: Sequence[npt.NDArray[np.int64]],
    target_items: Sequence[npt.NDArray[np.int64]],
    n_items: int,
    batch_users: int = 1024,
) -> dict[str, float]:
    """NDCG@10, Recall@20, HR@10, MRR, coverage/distinct@10 and exposure Gini."""
    return ranking_metrics_per_user(score_fn, seen_items, target_items, n_items, batch_users)[0]
