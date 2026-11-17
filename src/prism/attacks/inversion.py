"""Analytic first-layer inversion against a single client update (RQ3).

For a linear layer, the weight gradient is an outer product of the backpropagated
error and the layer input. With one local epoch the returned delta is -lr times
that gradient, so the top right singular vector of the first-layer block recovers
the client's pooled input direction up to sign.

The sign ambiguity is resolved by the attacker trying both signs, so retrieval
uses absolute cosine. This is deliberately favourable to the attacker, which makes
any resulting privacy claim conservative.

Threat model: an honest-but-curious coordinator that observes an INDIVIDUAL update,
which is the non-SecAgg+ mode in the roadmap. It does not apply to a securely
aggregated sum.
"""

from __future__ import annotations

import numpy as np
import numpy.typing as npt


def first_layer_block(
    flat: npt.NDArray[np.float32], hidden: int, dim_in: int
) -> npt.NDArray[np.float32]:
    """Extract the user-tower first-layer weight matrix from a flat vector."""
    size = hidden * dim_in
    if flat.size < size:
        raise ValueError("flat vector too short for the first layer")
    return flat[:size].reshape(hidden, dim_in)


def recover_direction(block: npt.NDArray[np.float32]) -> npt.NDArray[np.float64]:
    """Top right singular vector of the gradient block, unit-normalised."""
    _, _, vt = np.linalg.svd(np.asarray(block, dtype=np.float64), full_matrices=False)
    direction: npt.NDArray[np.float64] = np.asarray(vt[0], dtype=np.float64)
    norm = float(np.linalg.norm(direction))
    if norm == 0.0:
        return direction
    return np.asarray(direction / norm, dtype=np.float64)


def absolute_cosine(direction: npt.NDArray[np.float64], target: npt.NDArray[np.float32]) -> float:
    """Sign-invariant cosine similarity to the true pooled vector."""
    denom = float(np.linalg.norm(direction)) * float(np.linalg.norm(target))
    if denom == 0.0:
        return 0.0
    return abs(float(direction @ np.asarray(target, dtype=np.float64))) / denom


def topk_item_recovery(
    direction: npt.NDArray[np.float64],
    item_vectors: npt.NDArray[np.float32],
    true_items: npt.NDArray[np.int64],
    k: int = 10,
) -> float:
    """Fraction of a client's training items appearing in the top-k retrieval."""
    if true_items.size == 0:
        return float("nan")
    sims = np.abs(np.asarray(item_vectors, dtype=np.float64) @ direction)
    k = min(k, sims.size)
    top = np.argpartition(-sims, k - 1)[:k]
    hits = len({int(i) for i in top} & {int(i) for i in true_items})
    return hits / float(true_items.size)
