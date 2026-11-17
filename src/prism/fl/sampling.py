"""Client sampling.

Poisson sampling: every eligible user is included independently with the same
probability. This is the sampling scheme the privacy accountants assume, so the
realised cohort size varies from round to round and can be zero.
"""

from __future__ import annotations

import numpy as np
import numpy.typing as npt


def poisson_cohort(
    rng: np.random.Generator,
    eligible: npt.NDArray[np.int64],
    rate: float,
    availability: npt.NDArray[np.float64] | None = None,
) -> npt.NDArray[np.int64]:
    """Draw one cohort. User ``eligible[k]`` joins with probability rate * availability[k].

    Exactly ``eligible.size`` uniform numbers are consumed whatever the outcome, so
    the sampling stream stays aligned between runs that differ only in the rate.
    """
    if not 0.0 < rate <= 1.0:
        raise ValueError("rate must be in (0, 1]")
    probability: float | npt.NDArray[np.float64] = rate
    if availability is not None:
        if availability.shape != eligible.shape:
            raise ValueError("availability must have one entry per eligible user")
        if availability.size and (availability.min() < 0.0 or availability.max() > 1.0):
            raise ValueError(
                "availability must lie in [0, 1]: it may lower the rate, never raise it"
            )
        probability = rate * availability
    draws = rng.random(eligible.size)
    return np.asarray(eligible[draws < probability], dtype=np.int64)


def expected_cohort(
    n_eligible: int, rate: float, availability: npt.NDArray[np.float64] | None = None
) -> float:
    """Expected cohort size: a public constant, used as the averaging divisor."""
    if availability is None:
        return rate * n_eligible
    return float(rate * availability.sum())
