"""Statistics shared by the summary script, the report and the attack harness."""

from __future__ import annotations

import math
from typing import Any, Final

import numpy as np
import numpy.typing as npt
from scipy import stats

BOOTSTRAP_DRAWS: Final[int] = 10000
ALPHA: Final[float] = 0.05


def bootstrap_ci(values: npt.NDArray[np.float64], seed: int = 0) -> tuple[float, float]:
    """Percentile bootstrap CI for the mean over seeds."""
    rng = np.random.default_rng(seed)
    n = values.size
    draws = rng.integers(0, n, size=(BOOTSTRAP_DRAWS, n))
    means = values[draws].mean(axis=1)
    return float(np.percentile(means, 2.5)), float(np.percentile(means, 97.5))


def holm_adjust(pvalues: list[float]) -> list[bool]:
    """Holm-Bonferroni step-down decisions at ALPHA."""
    m = len(pvalues)
    order = sorted(range(m), key=lambda i: pvalues[i])
    decisions = [False] * m
    for rank, index in enumerate(order):
        threshold = ALPHA / (m - rank)
        if pvalues[index] <= threshold:
            decisions[index] = True
        else:
            break
    return decisions


def min_two_sided_sign_p(n: int) -> float:
    """Smallest possible two-sided sign-test p-value for n paired seeds."""
    return min(1.0, 2.0 * math.pow(0.5, n))


def paired_tests(
    treated: npt.NDArray[np.float64], control: npt.NDArray[np.float64]
) -> dict[str, Any]:
    """Paired comparison of two seed-matched configurations."""
    diff = treated - control
    n = int(diff.size)
    negative = int((diff < 0).sum())
    positive = int((diff > 0).sum())
    try:
        wilcoxon_p = float(stats.wilcoxon(treated, control, zero_method="wilcox").pvalue)
    except ValueError:
        wilcoxon_p = 1.0
    return {
        "mean_difference": float(diff.mean()),
        "seeds_degraded": negative,
        "seeds_improved": positive,
        "wilcoxon_two_sided_p": wilcoxon_p,
        "min_possible_two_sided_p": min_two_sided_sign_p(n),
        "sign_test_one_sided_p": float(math.pow(0.5, n)) if negative == n else 1.0,
    }


def retention(private: float, non_private: float) -> float:
    """Private metric as a fraction of the non-private one (NaN if that is zero)."""
    return private / non_private if non_private != 0.0 else math.nan


def personalisation_retained(private: float, non_private: float, popularity: float) -> float:
    """Share of the gain over MostPopular that survives privacy (NaN if there is no gain)."""
    if non_private <= popularity:
        return math.nan
    return (private - popularity) / (non_private - popularity)


def clopper_pearson(successes: int, trials: int, alpha: float = 0.05) -> tuple[float, float]:
    """Exact one-sided lower and upper confidence bounds, each at level alpha."""
    if trials < 0 or successes < 0 or successes > trials:
        raise ValueError("need 0 <= successes <= trials")
    if trials == 0:
        return 0.0, 1.0
    lower = (
        0.0 if successes == 0 else float(stats.beta.ppf(alpha, successes, trials - successes + 1))
    )
    upper = (
        1.0
        if successes == trials
        else float(stats.beta.ppf(1.0 - alpha, successes + 1, trials - successes))
    )
    return lower, upper


def epsilon_lower_bound(
    true_pos: int,
    positives: int,
    false_pos: int,
    negatives: int,
    delta: float,
    alpha: float = 0.05,
) -> float:
    """Empirical (epsilon, delta) lower bound from an attack's TPR and FPR."""
    tpr_low, _ = clopper_pearson(true_pos, positives, alpha)
    if tpr_low <= delta:
        return 0.0
    _, fpr_high = clopper_pearson(false_pos, negatives, alpha)
    fpr_high = max(fpr_high, 1.0 / negatives)
    return max(0.0, math.log((tpr_low - delta) / fpr_high))
