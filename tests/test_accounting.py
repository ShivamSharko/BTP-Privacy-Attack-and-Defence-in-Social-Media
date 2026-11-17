"""Three-accountant privacy accounting and its consistency gate (plan task M4)."""

from __future__ import annotations

import math

import pytest

from prism.privacy.accounting import (
    calibrate_noise,
    check_gate,
    delta_for,
    epsilon_report,
    max_rounds_within,
    pld_epsilon,
)

N_USERS = 9_913


def test_delta_is_one_over_ten_n() -> None:
    assert delta_for(N_USERS) == pytest.approx(1.0 / (10 * N_USERS))
    with pytest.raises(ValueError):
        delta_for(0)


def test_known_answer_matches_values_measured_on_17_nov_2026() -> None:
    """q = 0.01, z = 0.534, T = 400, n = 9,913: PRV 7.771, PLD 7.761, RDP 9.27."""
    report = epsilon_report(0.01, 0.534, 400, N_USERS)
    assert report.prv == pytest.approx(7.771, abs=0.03)
    assert report.pld == pytest.approx(7.761, abs=0.03)
    assert report.rdp == pytest.approx(9.27, abs=0.06)
    assert report.of_record == max(report.prv, report.pld)
    assert report.gate_ok, report.gate_reason
    assert report.delta == pytest.approx(delta_for(N_USERS))


def test_stricter_delta_and_no_amplification_both_cost_more() -> None:
    report = epsilon_report(0.01, 0.534, 400, N_USERS)
    assert report.at_delta_n2 > report.of_record
    assert report.unamplified > 10 * report.of_record
    assert report.delta_n2 == pytest.approx(1.0 / N_USERS**2)


def test_more_noise_means_less_epsilon_and_more_rounds_means_more() -> None:
    delta = delta_for(N_USERS)
    assert pld_epsilon(0.05, 1.0, 100, delta) > pld_epsilon(0.05, 1.5, 100, delta)
    assert pld_epsilon(0.05, 1.0, 200, delta) > pld_epsilon(0.05, 1.0, 100, delta)
    assert pld_epsilon(0.10, 1.0, 100, delta) > pld_epsilon(0.05, 1.0, 100, delta)


def test_gate_logic() -> None:
    assert check_gate(prv=8.0, pld=8.01, rdp=9.0) == (True, "ok")
    ok, reason = check_gate(prv=8.0, pld=9.0, rdp=10.0)
    assert not ok and "disagree" in reason
    ok, reason = check_gate(prv=8.0, pld=8.0, rdp=7.0)
    assert not ok and "RDP" in reason
    # Small epsilons use the absolute tolerance of 0.05.
    assert check_gate(prv=0.50, pld=0.54, rdp=0.60)[0]
    assert not check_gate(prv=float("nan"), pld=1.0, rdp=2.0)[0]


@pytest.mark.parametrize(("rate", "rounds", "target"), [(0.2, 40, 8.0), (0.02, 200, 1.0)])
def test_calibration_lands_just_under_the_target(rate: float, rounds: int, target: float) -> None:
    noise = calibrate_noise(rate, rounds, N_USERS, target)
    report = epsilon_report(rate, noise, rounds, N_USERS)
    assert report.gate_ok, report.gate_reason
    assert 0.98 * target <= report.of_record <= target


def test_max_rounds_within_budget_is_tight() -> None:
    delta = delta_for(N_USERS)
    noise = calibrate_noise(0.05, 100, N_USERS, 4.0)
    allowed = max_rounds_within(4.0, 0.05, noise, N_USERS, upper=200)
    assert 100 <= allowed < 200
    assert pld_epsilon(0.05, noise, allowed, delta) <= 4.0
    assert pld_epsilon(0.05, noise, allowed + 5, delta) > 4.0
    assert max_rounds_within(1e-6, 0.05, noise, N_USERS, upper=50) == 0


def test_zero_noise_is_rejected() -> None:
    with pytest.raises(ValueError):
        epsilon_report(0.01, 0.0, 10, N_USERS)
    assert math.isfinite(epsilon_report(1.0, 5.0, 10, 1_000).pld)
