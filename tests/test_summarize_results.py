"""Tests for the summary statistics helpers."""

from __future__ import annotations

import numpy as np
import pytest
from summarize_results import bootstrap_ci, holm_adjust, min_two_sided_sign_p, paired_tests


def test_bootstrap_ci_brackets_the_mean() -> None:
    values = np.array([0.02, 0.022, 0.024, 0.021, 0.023])
    low, high = bootstrap_ci(values)
    assert low <= values.mean() <= high


def test_bootstrap_is_deterministic() -> None:
    values = np.array([0.01, 0.02, 0.03])
    assert bootstrap_ci(values) == bootstrap_ci(values)


def test_holm_rejects_only_small_pvalues() -> None:
    assert holm_adjust([0.001, 0.02, 0.9]) == [True, True, False]
    assert holm_adjust([0.5, 0.6]) == [False, False]


def test_min_two_sided_p_for_five_seeds() -> None:
    assert min_two_sided_sign_p(5) == pytest.approx(0.0625)
    assert min_two_sided_sign_p(6) == pytest.approx(0.03125)


def test_paired_tests_detects_uniform_degradation() -> None:
    control = np.array([0.024, 0.024, 0.024, 0.024, 0.024])
    treated = control - 0.002
    result = paired_tests(treated, control)
    assert result["seeds_degraded"] == 5
    assert result["mean_difference"] == pytest.approx(-0.002)
    assert result["sign_test_one_sided_p"] == pytest.approx(0.03125)


def test_min_two_sided_p_for_ten_seeds() -> None:
    assert min_two_sided_sign_p(10) == pytest.approx(0.001953125)
