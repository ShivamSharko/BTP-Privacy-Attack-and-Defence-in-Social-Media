"""Tests for membership metrics."""

from __future__ import annotations

import numpy as np
import pytest

from prism.attacks.membership import attack_summary, auc_score, tpr_at_fpr


def test_auc_perfect_separation() -> None:
    assert auc_score(np.array([3.0, 4.0]), np.array([1.0, 2.0])) == pytest.approx(1.0)


def test_auc_reversed_separation() -> None:
    assert auc_score(np.array([1.0, 2.0]), np.array([3.0, 4.0])) == pytest.approx(0.0)


def test_auc_all_ties_is_half() -> None:
    assert auc_score(np.ones(5), np.ones(5)) == pytest.approx(0.5)


def test_tpr_at_fpr_respects_budget() -> None:
    members = np.arange(100, dtype=np.float64)
    nonmembers = np.arange(100, dtype=np.float64)
    assert tpr_at_fpr(members, nonmembers, 0.01) == pytest.approx(0.0)
    assert tpr_at_fpr(members + 1000.0, nonmembers, 0.01) == pytest.approx(1.0)


def test_attack_summary_keys() -> None:
    summary = attack_summary(np.array([2.0, 3.0]), np.array([0.0, 1.0]))
    assert summary["auc"] == pytest.approx(1.0)
    assert summary["n_member"] == 2.0
