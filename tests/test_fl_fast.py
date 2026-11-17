"""Fast clipped-sum path: must agree exactly with the materialised per-user path.

The fast path computes each user's update norm in closed form and then one
weighted backward pass. A wrong norm would be a wrong clip, which would break
the sensitivity bound, so every claim here is checked against autograd.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pytest
import torch
from torch.func import vmap

from prism.config import ModelConfig, TrainConfig
from prism.data.bundle import DataBundle
from prism.data.synthetic import write_synthetic_dataset
from prism.fl.aggregate import clip_rows
from prism.fl.client import make_delta_fn, split_history
from prism.fl.fast import batched_losses, clipped_sum_fast, update_norms
from prism.fl.server import train
from prism.models.hybrid import content_base, init_flat, make_layout, unflatten, user_loss
from prism.seeding import stream, torch_generator

MODEL = ModelConfig(dim=8)


@pytest.fixture(scope="module")
def bundle(tmp_path_factory: pytest.TempPathFactory) -> DataBundle:
    out: Path = tmp_path_factory.mktemp("synthetic_fast")
    return write_synthetic_dataset(out)


def _setup(
    bundle: DataBundle, model: ModelConfig = MODEL, perturb: float = 0.05
) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor, torch.Tensor]:
    layout = make_layout(bundle.n_items, model.dim)
    base = content_base(bundle.item_content, model)
    generator = torch.Generator().manual_seed(1)
    flat = init_flat(layout, model, stream(0, "init"))
    flat = flat + perturb * torch.randn(layout.total, generator=generator)
    rows = torch.from_numpy(bundle.history_matrix("tune", np.arange(24, dtype=np.int64)))
    visible, target = split_history(rows, 1, 0.5, torch_generator(stream(0, "masking")))
    visible, target = visible[:, 0].clone(), target[:, 0].clone()
    # Degenerate users: one with nothing visible, one with nothing hidden, one with no history.
    target[0] = target[0] + visible[0]
    visible[0] = 0.0
    visible[1] = visible[1] + target[1]
    target[1] = 0.0
    visible[2] = 0.0
    target[2] = 0.0
    return flat, base, visible, target


@pytest.mark.parametrize("model", [MODEL, ModelConfig(dim=8, use_content=False)])
def test_batched_losses_equal_the_per_user_loss(bundle: DataBundle, model: ModelConfig) -> None:
    flat, base, visible, target = _setup(bundle, model)
    layout = make_layout(bundle.n_items, model.dim)
    params = unflatten(flat, layout)
    reference = vmap(lambda v, t: user_loss(params, base, v, t, model))(visible, target)
    assert torch.allclose(
        batched_losses(params, base, visible, target, model), reference, atol=1e-5
    )


@pytest.mark.parametrize("model", [MODEL, ModelConfig(dim=8, use_content=False)])
@pytest.mark.parametrize("local_lr", [1.0, 0.3])
def test_closed_form_norms_equal_autograd_norms(
    bundle: DataBundle, model: ModelConfig, local_lr: float
) -> None:
    flat, base, visible, target = _setup(bundle, model)
    layout = make_layout(bundle.n_items, model.dim)
    deltas = make_delta_fn(layout, base, model, 1, local_lr)(
        flat, visible.unsqueeze(1), target.unsqueeze(1)
    )
    reference = deltas.norm(dim=1)
    fast = update_norms(unflatten(flat, layout), base, visible, target, model, local_lr)
    assert torch.allclose(fast, reference, rtol=2e-4, atol=1e-7)
    assert float(fast[1]) == 0.0  # nothing hidden: no loss, no update
    assert float(fast[2]) == 0.0  # no history at all
    assert float(fast[0]) > 0.0  # nothing visible still trains the bias


@pytest.mark.parametrize("clip", [None, 0.02, 0.2, 50.0])
def test_fast_clipped_sum_equals_the_materialised_one(
    bundle: DataBundle, clip: float | None
) -> None:
    flat, base, visible, target = _setup(bundle)
    layout = make_layout(bundle.n_items, MODEL.dim)
    deltas = make_delta_fn(layout, base, MODEL, 1, 1.0)(
        flat, visible.unsqueeze(1), target.unsqueeze(1)
    )
    reference = clip_rows(deltas, clip)
    total, norms, nonfinite = clipped_sum_fast(
        flat, layout, base, MODEL, visible, target, clip, 1.0
    )
    expected = reference.clipped.sum(dim=0).to(torch.float64)
    scale = float(expected.norm()) + 1e-12
    assert float((total - expected).norm()) / scale < 2e-4
    assert torch.allclose(norms, reference.norms, rtol=2e-4, atol=1e-7)
    assert nonfinite == 0
    assert total.dtype == torch.float64


def test_fast_path_respects_the_sensitivity_bound(bundle: DataBundle) -> None:
    flat, base, visible, target = _setup(bundle)
    layout = make_layout(bundle.n_items, MODEL.dim)
    clip = 0.02
    everyone, norms, _ = clipped_sum_fast(flat, layout, base, MODEL, visible, target, clip, 1.0)
    assert float(norms.max()) > clip
    for removed in range(visible.shape[0]):
        keep = [i for i in range(visible.shape[0]) if i != removed]
        rest, _, _ = clipped_sum_fast(
            flat, layout, base, MODEL, visible[keep], target[keep], clip, 1.0
        )
        assert float((everyone - rest).norm()) <= clip * (1.0 + 1e-3)


def test_non_finite_parameters_give_zero_weight_not_nan(bundle: DataBundle) -> None:
    flat, base, visible, target = _setup(bundle)
    layout = make_layout(bundle.n_items, MODEL.dim)
    broken = flat.clone()
    broken[layout.slices["bias"]][0] = float("nan")
    total, _, nonfinite = clipped_sum_fast(broken, layout, base, MODEL, visible, target, 0.1, 1.0)
    assert bool(torch.isfinite(total).all())
    assert nonfinite > 0


def test_training_uses_the_fast_path_and_matches_the_slow_one(bundle: DataBundle) -> None:
    config = TrainConfig(
        sample_rate=0.3, rounds=3, server_lr=0.05, clip_norm=0.05, noise_multiplier=1.0
    )
    fast = train(bundle, "tune", MODEL, config, seed=2)
    slow = train(bundle, "tune", MODEL, config, seed=2, force_materialised=True)
    assert [s.cohort for s in fast.stats] == [s.cohort for s in slow.stats]
    assert np.allclose(fast.flat, slow.flat, rtol=1e-3, atol=2e-5)
    for a, b in zip(fast.stats, slow.stats, strict=True):
        assert a.mean_norm == pytest.approx(b.mean_norm, rel=1e-3)
        assert a.clipped_fraction == pytest.approx(b.clipped_fraction, abs=0.02)


def test_one_non_finite_user_does_not_remove_the_other_users(bundle: DataBundle) -> None:
    """Review finding M3: a single bad user must cost that user only, never the whole chunk."""
    flat, base, visible, target = _setup(bundle)
    layout = make_layout(bundle.n_items, MODEL.dim)
    broken = visible.clone()
    broken[5, int(torch.nonzero(visible[5])[0])] = float("inf")
    deltas = make_delta_fn(layout, base, MODEL, 1, 1.0)(
        flat, broken.unsqueeze(1), target.unsqueeze(1)
    )
    reference = clip_rows(deltas, 0.02)
    assert reference.nonfinite == 1
    total, norms, nonfinite = clipped_sum_fast(flat, layout, base, MODEL, broken, target, 0.02, 1.0)
    expected = reference.clipped.sum(dim=0).to(torch.float64)
    assert nonfinite == 1
    assert bool(torch.isfinite(total).all())
    assert float(expected.norm()) > 0.0
    assert float((total - expected).norm()) / float(expected.norm()) < 1e-3
    assert float(norms[5]) == 0.0
