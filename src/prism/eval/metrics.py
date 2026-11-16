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


def ranking_metrics(
    score_fn: ScoreFn,
    train_items: Sequence[npt.NDArray[np.int64]],
    test_items: Sequence[npt.NDArray[np.int64]],
    n_items: int,
    batch_users: int = 1024,
) -> dict[str, float]:
    """Compute NDCG@10, Recall@20, HR@10, MRR, coverage@10 and exposure Gini."""
    n_users = len(test_items)
    discounts = 1.0 / np.log2(np.arange(2, 12, dtype=np.float64))
    ndcg_sum = 0.0
    recall_sum = 0.0
    hit_sum = 0.0
    mrr_sum = 0.0
    evaluated = 0
    exposure = np.zeros(n_items, dtype=np.int64)

    for start in range(0, n_users, batch_users):
        stop = min(start + batch_users, n_users)
        users = np.arange(start, stop, dtype=np.int64)
        scores = np.array(score_fn(users), dtype=np.float32, copy=True)
        for offset, user in enumerate(users):
            seen = train_items[int(user)]
            if seen.size:
                scores[offset, seen] = -np.inf
            targets = test_items[int(user)]
            if targets.size == 0:
                continue
            evaluated += 1
            row = scores[offset]
            top = np.argpartition(-row, 19)[:20]
            top = top[np.argsort(-row[top], kind="mergesort")]
            top10 = top[:10]
            target_set = {int(value) for value in targets}
            hits10 = sum(1 for item in top10 if int(item) in target_set)
            hits20 = sum(1 for item in top if int(item) in target_set)
            ideal = discounts[: min(10, targets.size)].sum()
            dcg = sum(
                float(discounts[rank]) for rank, item in enumerate(top10) if int(item) in target_set
            )
            ndcg_sum += dcg / float(ideal)
            recall_sum += hits20 / float(targets.size)
            hit_sum += 1.0 if hits10 > 0 else 0.0
            best = float(row[targets].max())
            rank_best = int((row > best).sum()) + 1
            mrr_sum += 1.0 / rank_best
            np.add.at(exposure, top10, 1)

    if evaluated == 0:
        raise ValueError("no users with test interactions")
    return {
        "users_evaluated": float(evaluated),
        "ndcg@10": ndcg_sum / evaluated,
        "recall@20": recall_sum / evaluated,
        "hr@10": hit_sum / evaluated,
        "mrr": mrr_sum / evaluated,
        "coverage@10": float(np.count_nonzero(exposure)) / float(n_items),
        "exposure_gini": _gini(exposure),
    }
