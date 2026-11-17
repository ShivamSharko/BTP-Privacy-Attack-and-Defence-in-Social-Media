"""User-level differential privacy mechanics (roadmap section 8.2, ADR-020/021/022).

Privacy unit: one user's entire contribution across all rounds.
Neighbourhood: add or remove one user.
Mechanism: per-client L2 clipping of the whole update, Gaussian noise added ONCE
by the aggregator to the summed update, divided by the EXPECTED cohort size.

This module holds the low-level pieces: delta, clipping of one vector, and the
Opacus PRV and RDP accountants. The value of record and the three-accountant
consistency gate (PRV, PLD, RDP) live in ``prism.privacy.accounting``.

LIMITATION (ADR-037): noise uses a seeded NumPy PCG64 generator and float
Gaussian draws so runs are reproducible from published seeds. Reported epsilon
is therefore accountant-derived under an ideal Gaussian mechanism. A deployment
must use an OS CSPRNG and a discrete mechanism to resist floating-point
precision attacks. This is a utility study, not a deployment.
"""

from __future__ import annotations

from typing import Any, Final

import numpy as np
import numpy.typing as npt

DEFAULT_DELTA_DIVISOR: Final[int] = 10
NOISE_SEARCH_LOW: Final[float] = 0.05
NOISE_SEARCH_HIGH: Final[float] = 64.0
NOISE_SEARCH_TOL: Final[float] = 0.02


def target_delta(n_users: int) -> float:
    """delta <= 1 / (10 n), per roadmap section 8.2."""
    if n_users <= 0:
        raise ValueError("n_users must be positive")
    return 1.0 / (DEFAULT_DELTA_DIVISOR * n_users)


def clip_l2(vector: npt.NDArray[np.float32], max_norm: float) -> npt.NDArray[np.float32]:
    """Scale a vector so its L2 norm is at most max_norm, preserving direction."""
    if max_norm <= 0.0:
        raise ValueError("max_norm must be positive")
    norm = float(np.linalg.norm(vector))
    if norm == 0.0 or norm <= max_norm:
        return vector.copy()
    return np.asarray(vector * (max_norm / norm), dtype=np.float32)


def privacy_epsilon(
    sample_rate: float, noise_multiplier: float, rounds: int, delta: float, mechanism: str = "prv"
) -> float:
    """Compose `rounds` Poisson-subsampled Gaussian steps and return epsilon."""
    if noise_multiplier <= 0.0:
        return float("inf")
    if not 0.0 < sample_rate <= 1.0:
        raise ValueError("sample_rate must be in (0, 1]")
    if rounds < 1:
        raise ValueError("rounds must be >= 1")

    from opacus.accountants import PRVAccountant, RDPAccountant

    accountant: Any
    if mechanism == "prv":
        accountant = PRVAccountant()
    elif mechanism == "rdp":
        accountant = RDPAccountant()
    else:
        raise ValueError(f"unknown mechanism: {mechanism}")
    for _ in range(rounds):
        accountant.step(noise_multiplier=noise_multiplier, sample_rate=sample_rate)
    return float(accountant.get_epsilon(delta=delta))


def calibrate_noise(sample_rate: float, rounds: int, delta: float, target_epsilon: float) -> float:
    """Smallest noise multiplier whose PRV epsilon is <= target (bisection)."""
    if target_epsilon <= 0.0:
        raise ValueError("target_epsilon must be positive")
    high = NOISE_SEARCH_HIGH
    if privacy_epsilon(sample_rate, high, rounds, delta) > target_epsilon:
        raise ValueError("target epsilon unreachable within search range")
    low = NOISE_SEARCH_LOW
    while high - low > NOISE_SEARCH_TOL:
        mid = (low + high) / 2.0
        if privacy_epsilon(sample_rate, mid, rounds, delta) <= target_epsilon:
            high = mid
        else:
            low = mid
    return round(high, 4)
