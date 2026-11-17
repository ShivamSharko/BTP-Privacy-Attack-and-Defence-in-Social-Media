"""Non-learned baselines: MostPopular and ItemKNN (roadmap section 11)."""

from __future__ import annotations

from collections.abc import Callable, Sequence

import numpy as np
import numpy.typing as npt
from scipy import sparse

KNN_NEIGHBOURS: int = 100


def item_popularity(
    train_items: Sequence[npt.NDArray[np.int64]], n_items: int
) -> npt.NDArray[np.float32]:
    """Count distinct training users per item."""
    counts = np.zeros(n_items, dtype=np.int64)
    for items in train_items:
        if items.size:
            np.add.at(counts, items, 1)
    return counts.astype(np.float32)


def popularity_score_fn(
    train_items: Sequence[npt.NDArray[np.int64]], n_items: int
) -> Callable[[npt.NDArray[np.int64]], npt.NDArray[np.float32]]:
    """Same popularity ranking for every user; this is the non-profiling mode."""
    popularity = item_popularity(train_items, n_items)

    def score_fn(users: npt.NDArray[np.int64]) -> npt.NDArray[np.float32]:
        return np.tile(popularity, (users.size, 1))

    return score_fn


def _binary_matrix(train_items: Sequence[npt.NDArray[np.int64]], n_items: int) -> sparse.csr_matrix:
    rows: list[int] = []
    cols: list[int] = []
    for user, items in enumerate(train_items):
        rows.extend([user] * int(items.size))
        cols.extend(int(value) for value in items)
    data = np.ones(len(rows), dtype=np.float32)
    return sparse.csr_matrix(
        (data, (np.array(rows, dtype=np.int64), np.array(cols, dtype=np.int64))),
        shape=(len(train_items), n_items),
    )


def item_knn_similarity(
    train_items: Sequence[npt.NDArray[np.int64]],
    n_items: int,
    neighbours: int = KNN_NEIGHBOURS,
) -> sparse.csr_matrix:
    """Cosine item-item similarity from co-occurrence, top-k sparsified."""
    matrix = _binary_matrix(train_items, n_items)
    cooccurrence = (matrix.T @ matrix).tocsr().astype(np.float32)
    cooccurrence.setdiag(0.0)
    cooccurrence.eliminate_zeros()
    popularity = np.asarray(matrix.sum(axis=0)).ravel().astype(np.float32)
    scale = np.sqrt(np.maximum(popularity, 1.0))
    norms = sparse.diags(1.0 / scale)
    similarity = (norms @ cooccurrence @ norms).tocsr()

    rows: list[int] = []
    cols: list[int] = []
    values: list[float] = []
    for item in range(n_items):
        start, stop = similarity.indptr[item], similarity.indptr[item + 1]
        row_values = similarity.data[start:stop]
        row_cols = similarity.indices[start:stop]
        if row_values.size > neighbours:
            keep = np.argpartition(-row_values, neighbours - 1)[:neighbours]
            row_values = row_values[keep]
            row_cols = row_cols[keep]
        rows.extend([item] * int(row_values.size))
        cols.extend(int(value) for value in row_cols)
        values.extend(float(value) for value in row_values)
    return sparse.csr_matrix(
        (
            np.array(values, dtype=np.float32),
            (np.array(rows, dtype=np.int64), np.array(cols, dtype=np.int64)),
        ),
        shape=(n_items, n_items),
    )


def knn_score_fn(
    train_items: Sequence[npt.NDArray[np.int64]],
    n_items: int,
    neighbours: int = KNN_NEIGHBOURS,
) -> Callable[[npt.NDArray[np.int64]], npt.NDArray[np.float32]]:
    """Score = sum of similarities to the user's training items."""
    matrix = _binary_matrix(train_items, n_items)
    similarity = item_knn_similarity(train_items, n_items, neighbours)

    def score_fn(users: npt.NDArray[np.int64]) -> npt.NDArray[np.float32]:
        block = matrix[users] @ similarity
        return np.asarray(block.todense(), dtype=np.float32)

    return score_fn


def ease_score_fn(
    train_items: Sequence[npt.NDArray[np.int64]], n_items: int, l2: float = 500.0
) -> Callable[[npt.NDArray[np.int64]], npt.NDArray[np.float32]]:
    """EASE: closed-form item-item ridge regression with a zero diagonal."""
    matrix = _binary_matrix(train_items, n_items)
    gram = (matrix.T @ matrix).toarray().astype(np.float64)
    gram[np.diag_indices(n_items)] += l2
    precision = np.linalg.inv(gram)
    weights = precision / -np.diag(precision)
    np.fill_diagonal(weights, 0.0)
    weights32 = weights.astype(np.float32)

    def score_fn(users: npt.NDArray[np.int64]) -> npt.NDArray[np.float32]:
        return np.asarray(matrix[users] @ weights32, dtype=np.float32)

    return score_fn
