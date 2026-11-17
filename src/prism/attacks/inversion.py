"""History inversion: which items did a user interact with, judging from one model update?

With the hybrid model's loss (``prism.models.hybrid.user_loss``; the gradient is derived
in the docstring of ``prism.fl.fast``) one local step leaves two traces in the update:

* an item the client HID and tried to predict gets a positive bias change, because its
  gradient is softmax - 1/|T| and the softmax term is small;
* every item the client used as VISIBLE history gets the same extra embedding-row change,
  because the user vector is the mean of those rows. Visible items are masked from the
  softmax, so their bias change is zero.

Hidden plus visible items are the user's whole history, so the score of an item is the sum
of the z-score (across items) of its bias change and the z-score of the L2 norm of its
embedding-row change. Blocks are taken from ``layout.slices`` by name.

Threat model: an honest-but-curious server that sees one client's INDIVIDUAL update. It
does not apply to a securely aggregated sum of many clients, where the traces of one
client are mixed with the others'.
"""

from __future__ import annotations

import numpy as np
from numpy.typing import NDArray

from prism.attacks.membership import auc_score
from prism.models.hybrid import Layout

TOP_K = 10
_CONSTANT_TOLERANCE = 1e-12


def _zscore(values: NDArray[np.float64]) -> NDArray[np.float64]:
    """Standardise across items; a constant block gives zeros."""
    spread = float(np.ptp(values))
    if spread <= _CONSTANT_TOLERANCE * float(np.max(np.abs(values))):
        return np.zeros_like(values)
    return np.asarray((values - values.mean()) / values.std(), dtype=np.float64)


def history_scores(update: NDArray[np.floating], layout: Layout) -> NDArray[np.float64]:
    """One score per item: z(bias change) + z(norm of the embedding-row change)."""
    vector = np.asarray(update, dtype=np.float64)
    if vector.shape != (layout.total,):
        raise ValueError("update length does not match the layout")
    bias = vector[layout.slices["bias"]]
    rows = vector[layout.slices["emb"]].reshape(layout.shape("emb"))
    return _zscore(bias) + _zscore(np.linalg.norm(rows, axis=1))


def _precision_at_k(
    scores: NDArray[np.float64], is_history: NDArray[np.bool_], k: int = TOP_K
) -> float:
    """Share of the k top-scored items that are history; a tie at the cut is split evenly."""
    k = min(k, scores.size)
    cut = float(np.sort(scores)[::-1][k - 1])
    above = scores > cut
    tied = scores == cut
    expected = float(is_history[above].sum()) + (k - int(above.sum())) * float(
        is_history[tied].mean()
    )
    return expected / k


def _two_numbers(scores: NDArray[np.float64], history: NDArray[np.int64]) -> tuple[float, float]:
    is_history = np.zeros(scores.size, dtype=bool)
    is_history[history] = True
    if not is_history.any() or is_history.all():
        return float("nan"), float("nan")
    auc = auc_score(scores[is_history], scores[~is_history])
    return auc, _precision_at_k(scores, is_history)


def recovery_metrics(
    scores: NDArray[np.float64],
    history: NDArray[np.int64],
    popularity: NDArray[np.integer],
) -> dict[str, float]:
    """AUC and precision@10 of the scores, and of a popularity-only prior, for one user."""
    history = np.unique(np.asarray(history, dtype=np.int64))
    auc, precision = _two_numbers(np.asarray(scores, dtype=np.float64), history)
    prior_auc, prior_precision = _two_numbers(np.asarray(popularity, dtype=np.float64), history)
    return {
        "auc": auc,
        "precision_at_10": precision,
        "prior_auc": prior_auc,
        "prior_precision_at_10": prior_precision,
    }
