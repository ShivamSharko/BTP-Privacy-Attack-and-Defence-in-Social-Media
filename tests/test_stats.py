"""Tests for the shared statistics helpers."""

from __future__ import annotations

import math

import numpy as np
import pytest
from scipy import stats as sp_stats

from prism.eval.stats import (
    bootstrap_ci,
    clopper_pearson,
    epsilon_lower_bound,
    holm_adjust,
    min_two_sided_sign_p,
    paired_tests,
    personalisation_retained,
    retention,
)


def test_moved_functions_keep_behaviour() -> None:
    assert holm_adjust([0.001, 0.02, 0.9]) == [True, True, False]
    assert min_two_sided_sign_p(5) == pytest.approx(0.0625)
    values = np.array([0.01, 0.02, 0.03])
    assert bootstrap_ci(values) == bootstrap_ci(values)
    result = paired_tests(values - 0.001, values)
    assert result["seeds_degraded"] == 3


def test_retention() -> None:
    assert retention(0.9, 1.0) == pytest.approx(0.9)
    assert math.isnan(retention(0.5, 0.0))


def test_personalisation_retained() -> None:
    assert personalisation_retained(0.03, 0.04, 0.02) == pytest.approx(0.5)
    assert math.isnan(personalisation_retained(0.03, 0.02, 0.02))
    assert math.isnan(personalisation_retained(0.03, 0.01, 0.02))


def test_clopper_pearson_known_values() -> None:
    low, high = clopper_pearson(5, 10, alpha=0.05)
    assert low == pytest.approx(sp_stats.beta.ppf(0.05, 5, 6))
    assert high == pytest.approx(sp_stats.beta.ppf(0.95, 6, 5))
    assert clopper_pearson(0, 10)[0] == 0.0
    assert clopper_pearson(10, 10)[1] == 1.0
    # rule of three: upper one-sided bound for 0/n is 1 - alpha**(1/n)
    assert clopper_pearson(0, 100)[1] == pytest.approx(1 - 0.05 ** (1 / 100))
    assert clopper_pearson(0, 0) == (0.0, 1.0)


def test_clopper_pearson_rejects_bad_input() -> None:
    with pytest.raises(ValueError):
        clopper_pearson(11, 10)
    with pytest.raises(ValueError):
        clopper_pearson(-1, 10)


def test_epsilon_lower_bound_zero_when_attack_is_chance() -> None:
    assert epsilon_lower_bound(50, 100, 50, 100, delta=1e-5) == 0.0
    assert epsilon_lower_bound(0, 100, 0, 100, delta=1e-5) == 0.0


def test_epsilon_lower_bound_perfect_attack() -> None:
    tpr_low = clopper_pearson(1000, 1000)[0]
    fpr_high = clopper_pearson(0, 1000)[1]  # about 3/1000, above the 1/negatives floor
    expected = math.log((tpr_low - 1e-5) / fpr_high)
    got = epsilon_lower_bound(1000, 1000, 0, 1000, delta=1e-5)
    assert got == pytest.approx(expected)
    assert got > 5.0


def test_epsilon_lower_bound_uses_upper_fpr_and_alpha() -> None:
    bound = epsilon_lower_bound(900, 1000, 0, 500, delta=0.0)
    manual = math.log(clopper_pearson(900, 1000)[0] / clopper_pearson(0, 500)[1])
    assert bound == pytest.approx(manual)
    # looser alpha gives a tighter (larger) bound
    assert epsilon_lower_bound(900, 1000, 10, 1000, 0.0, alpha=0.2) > epsilon_lower_bound(
        900, 1000, 10, 1000, 0.0, alpha=0.01
    )


def test_sign_test_keys_in_both_directions() -> None:
    control = np.array([0.02, 0.03, 0.04, 0.05, 0.06])
    worse = paired_tests(control - 0.01, control)
    assert worse["sign_test_p_all_degraded"] == pytest.approx(0.5**5)
    assert worse["sign_test_one_sided_p"] == worse["sign_test_p_all_degraded"]
    assert worse["sign_test_p_all_improved"] == 1.0
    better = paired_tests(control + 0.01, control)
    assert better["sign_test_p_all_improved"] == pytest.approx(0.03125)
    assert better["sign_test_p_all_degraded"] == 1.0
    assert better["sign_test_one_sided_p"] == 1.0
    mixed = control + np.array([0.01, 0.01, 0.01, 0.01, -0.01])
    result = paired_tests(mixed, control)
    assert result["sign_test_p_all_improved"] == 1.0
    assert result["sign_test_p_all_degraded"] == 1.0
