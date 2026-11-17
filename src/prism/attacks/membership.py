"""Membership-inference metrics (roadmap section 11, RQ3).

The attack statistic is the model score: a member interaction should score higher
than a held-out one. AUC and TPR at a fixed low FPR are reported, never accuracy
alone, because the classes are imbalanced.

SCOPE: this is INTERACTION-level membership inference. It does not establish
user-level membership inference, which requires a held-out user population and
reference models.
"""

from __future__ import annotations

import numpy as np
import numpy.typing as npt
from scipy.stats import rankdata


def auc_score(
    member_scores: npt.NDArray[np.float64], nonmember_scores: npt.NDArray[np.float64]
) -> float:
    """Rank-based AUC with tie correction. 0.5 means the attack fails."""
    n_pos = int(member_scores.size)
    n_neg = int(nonmember_scores.size)
    if n_pos == 0 or n_neg == 0:
        return float("nan")
    combined = np.concatenate([member_scores, nonmember_scores])
    ranks = rankdata(combined)
    rank_sum = float(ranks[:n_pos].sum())
    return (rank_sum - n_pos * (n_pos + 1) / 2.0) / (n_pos * n_neg)


def tpr_at_fpr(
    member_scores: npt.NDArray[np.float64],
    nonmember_scores: npt.NDArray[np.float64],
    max_fpr: float = 0.01,
) -> float:
    """True-positive rate at a threshold giving at most max_fpr false positives."""
    if member_scores.size == 0 or nonmember_scores.size == 0:
        return float("nan")
    threshold = float(np.quantile(nonmember_scores, 1.0 - max_fpr, method="higher"))
    return float((member_scores > threshold).mean())


def attack_summary(
    member_scores: npt.NDArray[np.float64], nonmember_scores: npt.NDArray[np.float64]
) -> dict[str, float]:
    """Standard reporting triple for a membership attack."""
    return {
        "n_member": float(member_scores.size),
        "n_nonmember": float(nonmember_scores.size),
        "auc": auc_score(member_scores, nonmember_scores),
        "tpr_at_1pct_fpr": tpr_at_fpr(member_scores, nonmember_scores, 0.01),
        "member_mean": float(member_scores.mean()) if member_scores.size else float("nan"),
        "nonmember_mean": float(nonmember_scores.mean()) if nonmember_scores.size else float("nan"),
    }
