"""Tests for membership metrics and analytic inversion."""

from __future__ import annotations

import numpy as np
import pytest

from prism.attacks.inversion import (
    absolute_cosine,
    first_layer_block,
    recover_direction,
    topk_item_recovery,
)
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


def test_inversion_recovers_rank_one_input() -> None:
    rng = np.random.default_rng(0)
    truth = rng.normal(size=384)
    truth = truth / np.linalg.norm(truth)
    error = rng.normal(size=128)
    block = np.outer(error, truth).astype(np.float32)
    direction = recover_direction(block)
    assert absolute_cosine(direction, truth.astype(np.float32)) > 0.999


def test_inversion_degrades_with_noise() -> None:
    rng = np.random.default_rng(1)
    truth = rng.normal(size=384)
    truth = truth / np.linalg.norm(truth)
    block = np.outer(rng.normal(size=128), truth).astype(np.float32)
    clean = absolute_cosine(recover_direction(block), truth.astype(np.float32))
    noisy_block = block + rng.normal(0.0, 5.0, size=block.shape).astype(np.float32)
    noisy = absolute_cosine(recover_direction(noisy_block), truth.astype(np.float32))
    assert clean > noisy


def test_first_layer_block_shape_and_guard() -> None:
    flat = np.zeros(128 * 384 + 10, dtype=np.float32)
    assert first_layer_block(flat, 128, 384).shape == (128, 384)
    with pytest.raises(ValueError):
        first_layer_block(np.zeros(10, dtype=np.float32), 128, 384)


def test_topk_recovery_hits() -> None:
    items = np.eye(8, dtype=np.float32)
    direction = np.zeros(8, dtype=np.float64)
    direction[3] = 1.0
    assert topk_item_recovery(direction, items, np.array([3], dtype=np.int64), 1) == 1.0
    assert topk_item_recovery(direction, items, np.array([5], dtype=np.int64), 1) == 0.0
