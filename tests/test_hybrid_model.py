"""Hybrid recommender model (plan task M2). Hand-built data only."""

from __future__ import annotations

import numpy as np
import pytest
import torch

from prism.config import ModelConfig
from prism.models.hybrid import (
    content_base,
    flatten,
    init_flat,
    make_layout,
    score_matrix,
    unflatten,
    user_loss,
)

N_ITEMS, CONTENT_DIM, DIM = 30, 12, 4
CONFIG = ModelConfig(dim=DIM)


def _content(seed: int = 0) -> np.ndarray:
    rng = np.random.default_rng(seed)
    raw = rng.normal(size=(N_ITEMS, CONTENT_DIM)).astype(np.float32)
    return raw / np.linalg.norm(raw, axis=1, keepdims=True)


def test_layout_names_offsets_and_total() -> None:
    layout = make_layout(N_ITEMS, DIM)
    assert layout.names == ("emb", "umap", "bias")
    assert layout.total == N_ITEMS * DIM + DIM * DIM + N_ITEMS
    assert layout.slices["emb"] == slice(0, N_ITEMS * DIM)
    assert layout.slices["bias"] == slice(N_ITEMS * DIM + DIM * DIM, layout.total)


def test_real_dataset_parameter_count() -> None:
    assert make_layout(6319, 16).total == 107_679


def test_flatten_unflatten_round_trip() -> None:
    layout = make_layout(N_ITEMS, DIM)
    flat = torch.arange(layout.total, dtype=torch.float32)
    params = unflatten(flat, layout)
    assert params["emb"].shape == (N_ITEMS, DIM)
    assert params["umap"].shape == (DIM, DIM)
    assert params["bias"].shape == (N_ITEMS,)
    assert torch.equal(flatten(params, layout), flat)
    with pytest.raises(ValueError):
        unflatten(flat[:-1], layout)


def test_init_is_data_free_and_deterministic_with_content() -> None:
    layout = make_layout(N_ITEMS, DIM)
    params = unflatten(init_flat(layout, CONFIG, np.random.default_rng(0)), layout)
    assert torch.count_nonzero(params["emb"]) == 0
    assert torch.count_nonzero(params["bias"]) == 0
    assert torch.equal(params["umap"], torch.eye(DIM))


def test_ids_only_init_is_random_and_seeded() -> None:
    layout = make_layout(N_ITEMS, DIM)
    config = ModelConfig(dim=DIM, use_content=False)
    one = init_flat(layout, config, np.random.default_rng(1))
    two = init_flat(layout, config, np.random.default_rng(1))
    assert torch.equal(one, two)
    assert torch.count_nonzero(unflatten(one, layout)["emb"]) > 0


def test_content_base_shape_scale_and_determinism() -> None:
    base = content_base(_content(), CONFIG)
    assert base.shape == (N_ITEMS, DIM)
    assert base.dtype == torch.float32
    assert float(base.norm(dim=1).mean()) == pytest.approx(CONFIG.content_scale, rel=1e-4)
    assert torch.equal(base, content_base(_content(), CONFIG))


def test_content_base_is_zero_when_content_is_disabled_or_too_narrow() -> None:
    off = content_base(_content(), ModelConfig(dim=DIM, use_content=False))
    assert torch.count_nonzero(off) == 0
    narrow = content_base(_content()[:, :2], ModelConfig(dim=DIM))
    assert narrow.shape == (N_ITEMS, DIM)
    assert torch.count_nonzero(narrow[:, 2:]) == 0


def _problem() -> tuple[torch.Tensor, torch.Tensor, torch.Tensor, torch.Tensor]:
    layout = make_layout(N_ITEMS, DIM)
    flat = init_flat(layout, CONFIG, np.random.default_rng(0))
    base = content_base(_content(), CONFIG)
    visible = torch.zeros(N_ITEMS)
    visible[[1, 2, 3]] = 1.0
    target = torch.zeros(N_ITEMS)
    target[[4, 5]] = 1.0
    return flat, base, visible, target


def test_loss_is_finite_and_ignores_visible_items() -> None:
    flat, base, visible, target = _problem()
    layout = make_layout(N_ITEMS, DIM)
    loss = user_loss(unflatten(flat, layout), base, visible, target, CONFIG)
    assert torch.isfinite(loss)
    # Visible items are not candidates: their bias cannot change the loss.
    shifted = flat.clone()
    shifted[layout.slices["bias"]][[1, 2, 3]] = 50.0
    assert float(user_loss(unflatten(shifted, layout), base, visible, target, CONFIG)) == float(
        loss
    )
    # With no content signal every candidate is equally likely: loss = log(candidates).
    flat_base = torch.zeros_like(base)
    uniform = user_loss(unflatten(flat, layout), flat_base, visible, target, CONFIG)
    assert float(uniform) == pytest.approx(np.log(N_ITEMS - 3), abs=1e-4)


def test_gradient_descent_reduces_the_loss() -> None:
    flat, base, visible, target = _problem()
    layout = make_layout(N_ITEMS, DIM)
    flat = flat.clone().requires_grad_(True)
    start = user_loss(unflatten(flat, layout), base, visible, target, CONFIG)
    (grad,) = torch.autograd.grad(start, flat)
    stepped = (flat - 0.5 * grad).detach()
    end = user_loss(unflatten(stepped, layout), base, visible, target, CONFIG)
    assert float(end) < float(start.detach())


def test_bias_gradient_is_zero_on_visible_items_and_negative_on_targets() -> None:
    flat, base, visible, target = _problem()
    layout = make_layout(N_ITEMS, DIM)
    flat = flat.clone().requires_grad_(True)
    loss = user_loss(unflatten(flat, layout), base, visible, target, CONFIG)
    (grad,) = torch.autograd.grad(loss, flat)
    bias_grad = grad[layout.slices["bias"]]
    assert torch.count_nonzero(bias_grad[[1, 2, 3]]) == 0
    assert bool((bias_grad[[4, 5]] < 0).all())


@pytest.mark.parametrize("empty", ["visible", "target", "both"])
def test_degenerate_users_give_finite_loss_and_finite_gradient(empty: str) -> None:
    flat, base, visible, target = _problem()
    layout = make_layout(N_ITEMS, DIM)
    if empty in ("visible", "both"):
        visible = torch.zeros(N_ITEMS)
    if empty in ("target", "both"):
        target = torch.zeros(N_ITEMS)
    flat = flat.clone().requires_grad_(True)
    loss = user_loss(unflatten(flat, layout), base, visible, target, CONFIG)
    (grad,) = torch.autograd.grad(loss, flat, allow_unused=True)
    assert torch.isfinite(loss)
    assert grad is None or bool(torch.isfinite(grad).all())
    if empty in ("target", "both"):
        assert float(loss) == 0.0
        assert grad is None or torch.count_nonzero(grad) == 0


def test_score_matrix_shape_and_bias_effect() -> None:
    layout = make_layout(N_ITEMS, DIM)
    flat = init_flat(layout, CONFIG, np.random.default_rng(0))
    base = content_base(_content(), CONFIG)
    history = np.zeros((2, N_ITEMS), dtype=np.float32)
    history[0, [1, 2]] = 1.0
    history[1, [7]] = 1.0
    scores = score_matrix(flat, layout, base, history, CONFIG)
    assert scores.shape == (2, N_ITEMS)
    assert scores.dtype == np.float32
    assert not np.allclose(scores[0], scores[1])
    boosted = flat.clone()
    boosted[layout.slices["bias"]][9] = 100.0
    assert (score_matrix(boosted, layout, base, history, CONFIG).argmax(axis=1) == 9).all()


def test_training_on_two_taste_groups_personalises() -> None:
    """Users of group A like items 0-9, group B items 10-19; the model must learn this."""
    layout = make_layout(N_ITEMS, DIM)
    config = ModelConfig(dim=DIM, use_content=False)
    flat = init_flat(layout, config, np.random.default_rng(0)).requires_grad_(True)
    base = content_base(_content(), config)
    rng = np.random.default_rng(0)
    optimiser = torch.optim.Adam([flat], lr=0.05)
    for _ in range(150):
        group = int(rng.integers(0, 2))
        items = rng.permutation(10)[:6] + 10 * group
        visible = torch.zeros(N_ITEMS)
        visible[items[:3]] = 1.0
        target = torch.zeros(N_ITEMS)
        target[items[3:]] = 1.0
        loss = user_loss(unflatten(flat, layout), base, visible, target, config)
        optimiser.zero_grad()
        loss.backward()  # type: ignore[no-untyped-call]
        optimiser.step()
    history = np.zeros((2, N_ITEMS), dtype=np.float32)
    history[0, [0, 1, 2]] = 1.0
    history[1, [10, 11, 12]] = 1.0
    scores = score_matrix(flat.detach(), layout, base, history, config)
    scores[0, [0, 1, 2]] = -np.inf
    scores[1, [10, 11, 12]] = -np.inf
    assert set(np.argsort(-scores[0])[:5]) <= set(range(10))
    assert set(np.argsort(-scores[1])[:5]) <= set(range(10, 20))
