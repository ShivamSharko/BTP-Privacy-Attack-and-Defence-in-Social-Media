"""Privacy accounting with three accountants and a consistency gate.

Unit of privacy: one user (add or remove one user's whole history).
Mechanism per round: Poisson-subsampled Gaussian, sampling rate q, noise
multiplier z. Composition over T rounds.

Accountants:
* PRV  - Opacus ``PRVAccountant`` (numerical, tight).
* PLD  - Google ``dp_accounting`` privacy-loss-distribution accountant (independent code base).
* RDP  - Opacus ``RDPAccountant`` (a looser bound; used as a sanity check).

Gate: PRV and PLD must agree within max(5%, 0.05), and RDP must not be smaller
than either by more than 0.01. A run that fails the gate is recorded as
``accounting_inconsistent`` and excluded from results. The epsilon of record is
the larger of PRV and PLD, at delta = 1 / (10 n).

Every report also gives epsilon at the stricter delta = 1 / n^2 (NIST SP 800-226
advises delta far below 1 / n) and epsilon without sampling amplification (what
holds if clients are not truly Poisson-sampled).

Limits, stated wherever these numbers are shown: the noise is floating-point
Gaussian from a seeded generator, the clipping norm and hyperparameters were
chosen on the same users' data, and none of that is covered by epsilon.
"""

from __future__ import annotations

import math
from dataclasses import asdict, dataclass
from typing import Any

import dp_accounting
from dp_accounting import pld

from prism.privacy.dp import privacy_epsilon, target_delta

GATE_RELATIVE: float = 0.05
GATE_ABSOLUTE: float = 0.05
RDP_SLACK: float = 0.01
CALIBRATION_LOW: float = 0.2
CALIBRATION_HIGH: float = 200.0


@dataclass(frozen=True)
class EpsilonReport:
    """All privacy numbers for one training configuration."""

    sample_rate: float
    noise_multiplier: float
    rounds: int
    n_users: int
    delta: float
    prv: float
    pld: float
    rdp: float
    of_record: float
    delta_n2: float
    at_delta_n2: float
    unamplified: float
    gate_ok: bool
    gate_reason: str

    def as_dict(self) -> dict[str, Any]:
        return asdict(self)


def delta_for(n_users: int) -> float:
    """delta = 1 / (10 n)."""
    return target_delta(n_users)


def _event(sample_rate: float, noise_multiplier: float, rounds: int) -> Any:
    gaussian = dp_accounting.GaussianDpEvent(noise_multiplier)
    step = (
        gaussian
        if sample_rate >= 1.0
        else dp_accounting.PoissonSampledDpEvent(sample_rate, gaussian)
    )
    return dp_accounting.SelfComposedDpEvent(step, rounds)


def pld_epsilon(sample_rate: float, noise_multiplier: float, rounds: int, delta: float) -> float:
    """Epsilon from the dp_accounting PLD accountant."""
    if noise_multiplier <= 0.0:
        raise ValueError("noise_multiplier must be positive")
    if not 0.0 < sample_rate <= 1.0:
        raise ValueError("sample_rate must be in (0, 1]")
    if rounds < 1:
        raise ValueError("rounds must be >= 1")
    accountant = pld.PLDAccountant()
    accountant.compose(_event(sample_rate, noise_multiplier, rounds))
    return float(accountant.get_epsilon(delta))


def check_gate(prv: float, pld: float, rdp: float) -> tuple[bool, str]:
    """Apply the consistency gate to three epsilons."""
    values = (prv, pld, rdp)
    if not all(math.isfinite(value) and value >= 0.0 for value in values):
        return False, "an accountant returned a non-finite epsilon"
    tolerance = max(GATE_RELATIVE * max(prv, pld), GATE_ABSOLUTE)
    if abs(prv - pld) > tolerance:
        return False, f"PRV {prv:.4f} and PLD {pld:.4f} disagree by more than {tolerance:.4f}"
    if rdp < max(prv, pld) - RDP_SLACK:
        return False, f"RDP {rdp:.4f} is below the tighter accountants ({max(prv, pld):.4f})"
    return True, "ok"


def _safe(function: Any, *args: Any) -> float:
    try:
        return float(function(*args))
    except Exception:  # an accountant that cannot handle a regime fails the gate, not the run
        return float("nan")


def epsilon_report(
    sample_rate: float, noise_multiplier: float, rounds: int, n_users: int
) -> EpsilonReport:
    """Compute every privacy number for one configuration."""
    if noise_multiplier <= 0.0:
        raise ValueError("noise_multiplier must be positive for a privacy report")
    delta = delta_for(n_users)
    delta_n2 = 1.0 / float(n_users) ** 2
    prv = _safe(privacy_epsilon, sample_rate, noise_multiplier, rounds, delta, "prv")
    rdp = _safe(privacy_epsilon, sample_rate, noise_multiplier, rounds, delta, "rdp")
    pld_value = _safe(pld_epsilon, sample_rate, noise_multiplier, rounds, delta)
    ok, reason = check_gate(prv, pld_value, rdp)
    return EpsilonReport(
        sample_rate=sample_rate,
        noise_multiplier=noise_multiplier,
        rounds=rounds,
        n_users=n_users,
        delta=delta,
        prv=prv,
        pld=pld_value,
        rdp=rdp,
        of_record=max(prv, pld_value) if ok else float("nan"),
        delta_n2=delta_n2,
        at_delta_n2=_safe(pld_epsilon, sample_rate, noise_multiplier, rounds, delta_n2),
        unamplified=_safe(pld_epsilon, 1.0, noise_multiplier, rounds, delta),
        gate_ok=ok,
        gate_reason=reason,
    )


def calibrate_noise(
    sample_rate: float, rounds: int, n_users: int, target_epsilon: float, tolerance: float = 0.01
) -> float:
    """Smallest noise multiplier (to about 1%) whose epsilon of record is at most the target."""
    if target_epsilon <= 0.0:
        raise ValueError("target_epsilon must be positive")
    delta = delta_for(n_users)
    low, high = CALIBRATION_LOW, CALIBRATION_HIGH
    if pld_epsilon(sample_rate, high, rounds, delta) > target_epsilon:
        raise ValueError("target epsilon is unreachable within the search range")
    while high / low > 1.0 + tolerance / 4.0:
        middle = math.sqrt(low * high)
        if pld_epsilon(sample_rate, middle, rounds, delta) <= target_epsilon:
            high = middle
        else:
            low = middle
    noise = high
    # PRV can sit slightly above PLD: nudge the noise up until the value of record fits.
    for _ in range(20):
        report = epsilon_report(sample_rate, noise, rounds, n_users)
        if report.gate_ok and report.of_record <= target_epsilon:
            return round(noise, 5)
        noise *= 1.0 + tolerance / 4.0
    raise ValueError("calibration did not converge to a gate-consistent noise multiplier")


def max_rounds_within(
    budget_epsilon: float, sample_rate: float, noise_multiplier: float, n_users: int, upper: int
) -> int:
    """Largest number of rounds, at most ``upper``, whose epsilon of record stays within the budget.

    The search uses the fast PLD accountant; the answer is then confirmed with the full
    three-accountant report and reduced until the value of record (the larger of PRV and
    PLD) fits, so a run that trains for this many rounds can always be released.
    """
    candidate = _pld_rounds_within(budget_epsilon, sample_rate, noise_multiplier, n_users, upper)
    while candidate > 0:
        report = epsilon_report(sample_rate, noise_multiplier, candidate, n_users)
        if report.gate_ok and report.of_record <= budget_epsilon:
            return candidate
        candidate -= max(1, candidate // 100)
    return 0


def _pld_rounds_within(
    budget_epsilon: float, sample_rate: float, noise_multiplier: float, n_users: int, upper: int
) -> int:
    delta = delta_for(n_users)
    if pld_epsilon(sample_rate, noise_multiplier, 1, delta) > budget_epsilon:
        return 0
    low, high = 1, upper
    if pld_epsilon(sample_rate, noise_multiplier, upper, delta) <= budget_epsilon:
        return upper
    while high - low > 1:
        middle = (low + high) // 2
        if pld_epsilon(sample_rate, noise_multiplier, middle, delta) <= budget_epsilon:
            low = middle
        else:
            high = middle
    return low
