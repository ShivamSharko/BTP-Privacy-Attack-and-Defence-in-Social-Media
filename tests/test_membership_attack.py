"""User-level membership attack: fixed hidden split, calibration, metric summary."""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pytest
import torch

from prism.attacks.membership import (
    calibrate_scores,
    fixed_hidden,
    summarise_scores,
    user_losses,
)
from prism.config import ModelConfig
from prism.data.bundle import load_bundle
from prism.data.synthetic import write_synthetic_dataset
from prism.models.hybrid import init_flat, make_layout
from prism.seeding import stream

MODEL = ModelConfig(dim=8)


@pytest.fixture(scope="module")
def bundle(tmp_path_factory: pytest.TempPathFactory):  # type: ignore[no-untyped-def]
    root: Path = tmp_path_factory.mktemp("membership_attack")
    write_synthetic_dataset(root / "processed")
    return load_bundle(root / "processed")


def _flat(bundle, seed: int) -> torch.Tensor:  # type: ignore[no-untyped-def]
    layout = make_layout(bundle.n_items, MODEL.dim)
    return init_flat(layout, MODEL, stream(seed, "init"))


def test_hidden_is_deterministic_subset_of_history(bundle) -> None:  # type: ignore[no-untyped-def]
    users = np.arange(0, 40, dtype=np.int64)
    rows = bundle.history_matrix("final", users)
    first = fixed_hidden(rows, users, attack_seed=0)
    second = fixed_hidden(rows, users, attack_seed=0)
    assert np.array_equal(first, second)
    assert np.all(first <= rows)
    longer = rows.sum(axis=1) >= 2
    assert longer.any()
    # Both halves are non-empty for any user with at least two items.
    assert np.all(first[longer].sum(axis=1) >= 1)
    assert np.all((rows - first)[longer].sum(axis=1) >= 1)
    other = fixed_hidden(rows, users, attack_seed=1)
    assert not np.array_equal(first, other)


def test_hidden_row_depends_only_on_user_and_seed(bundle) -> None:  # type: ignore[no-untyped-def]
    a = np.array([3, 5], dtype=np.int64)
    b = np.array([5, 9, 3, 11], dtype=np.int64)
    hidden_a = fixed_hidden(bundle.history_matrix("final", a), a, 0)
    hidden_b = fixed_hidden(bundle.history_matrix("final", b), b, 0)
    assert np.array_equal(hidden_a[0], hidden_b[2])
    assert np.array_equal(hidden_a[1], hidden_b[0])


def test_losses_independent_of_chunking_and_model_state(bundle) -> None:  # type: ignore[no-untyped-def]
    users = np.arange(0, 60, dtype=np.int64)
    flat = _flat(bundle, 0)
    whole = user_losses(flat, bundle, MODEL, users, attack_seed=0, chunk=512)
    parts = user_losses(flat, bundle, MODEL, users, attack_seed=0, chunk=7)
    assert whole.shape == (60,)
    assert np.allclose(whole, parts, atol=1e-5)
    # A different model changes the losses but not the split they are computed on.
    shaken = flat + 0.5 * torch.randn(flat.shape, generator=torch.Generator().manual_seed(3))
    other = user_losses(shaken, bundle, MODEL, users, attack_seed=0)
    assert not np.allclose(whole, other)
    rows = bundle.history_matrix("final", users)
    assert np.array_equal(fixed_hidden(rows, users, 0), fixed_hidden(rows, users, 0))


def test_calibration_arithmetic_and_fallback() -> None:
    # 3 reference models, 4 users.
    ref_loss = np.array(
        [
            [1.0, 2.0, 3.0, 4.0],
            [3.0, 4.0, 5.0, 6.0],
            [5.0, 6.0, 7.0, 8.0],
        ]
    )
    in_ref = np.array(
        [
            [True, False, True, False],
            [False, False, True, False],
            [False, True, True, False],
        ]
    )
    target = np.array([0.5, 1.0, 1.0, 2.0])
    scores = calibrate_scores(target, ref_loss, in_ref)
    # user 0: out of refs 1,2 -> mean(3,5)=4 ; user 1: out of 0,1 -> mean(2,4)=3
    # user 2: in every reference -> mean(3,5,7)=5 ; user 3: out of all -> mean(4,6,8)=6
    assert np.allclose(scores, [4.0 - 0.5, 3.0 - 1.0, 5.0 - 1.0, 6.0 - 2.0])


def test_summary_separated_scores() -> None:
    rng = np.random.default_rng(0)
    members = rng.normal(2.0, 1.0, 5000)
    nonmembers = rng.normal(0.0, 1.0, 5000)
    scores = np.concatenate([members, nonmembers])
    is_member = np.concatenate([np.ones(5000, bool), np.zeros(5000, bool)])
    out = summarise_scores(scores, is_member, delta=1e-5)
    assert 0.90 < out["auc"] < 0.94  # Phi(2/sqrt(2)) = 0.921
    assert out["tpr_at_1pct_fpr"] > 0.3
    assert out["tpr_at_0.1pct_fpr"] <= out["tpr_at_1pct_fpr"]
    assert out["low_resolution"] is True
    assert out["epsilon_lower_bound"] > 0.5
    assert out["n_members"] == 5000 and out["n_nonmembers"] == 5000


def test_summary_equal_distributions_is_chance() -> None:
    rng = np.random.default_rng(1)
    scores = rng.normal(0.0, 1.0, 20000)
    is_member = np.zeros(20000, bool)
    is_member[:10000] = True
    out = summarise_scores(scores, is_member, delta=1e-5)
    assert abs(out["auc"] - 0.5) < 0.02
    assert abs(out["tpr_at_1pct_fpr"] - 0.01) < 0.007
    assert out["epsilon_lower_bound"] < 0.6
