"""Poisoning attack pieces: target choice, malicious sets, crafted updates, target exposure."""

from __future__ import annotations

import numpy as np
import pytest
import torch

from prism.attacks.poisoning import (
    choose_malicious,
    choose_target_item,
    make_promotion_hook,
    target_exposure,
)
from prism.config import ModelConfig
from prism.data.bundle import DataBundle, load_bundle
from prism.data.synthetic import write_synthetic_dataset
from prism.models.hybrid import (
    Layout,
    content_base,
    init_flat,
    make_layout,
    score_matrix,
    unflatten,
)

MODEL = ModelConfig(dim=8)


@pytest.fixture(scope="module")
def bundle(tmp_path_factory: pytest.TempPathFactory) -> DataBundle:
    root = tmp_path_factory.mktemp("poison")
    write_synthetic_dataset(root / "processed")
    return load_bundle(root / "processed")


@pytest.fixture(scope="module")
def layout(bundle: DataBundle) -> Layout:
    return make_layout(bundle.n_items, MODEL.dim)


@pytest.fixture(scope="module")
def base(bundle: DataBundle) -> torch.Tensor:
    return content_base(bundle.item_content, MODEL)


def _flat(layout: Layout) -> torch.Tensor:
    return init_flat(layout, MODEL, np.random.default_rng(0))


def test_target_is_from_least_popular_third_and_deterministic() -> None:
    popularity = np.arange(30, dtype=np.int64)[::-1].copy()  # item 29 is least popular
    picks = {choose_target_item(popularity, np.random.default_rng(s)) for s in range(40)}
    assert picks <= set(range(20, 30))
    assert len(picks) > 3
    assert choose_target_item(popularity, np.random.default_rng(5)) == choose_target_item(
        popularity, np.random.default_rng(5)
    )


def test_target_ties_break_by_index() -> None:
    popularity = np.zeros(9, dtype=np.int64)
    picks = {choose_target_item(popularity, np.random.default_rng(s)) for s in range(40)}
    assert picks <= {0, 1, 2}


def test_malicious_sizes_sorted_unique_and_nested() -> None:
    assert choose_malicious(100, 0.0, np.random.default_rng(1)).size == 0
    small = choose_malicious(100, 0.1, np.random.default_rng(1))
    large = choose_malicious(100, 0.3, np.random.default_rng(1))
    assert small.size == 10 and large.size == 30
    for chosen in (small, large):
        assert chosen.dtype == np.int64
        assert np.array_equal(chosen, np.unique(chosen))
        assert chosen.min() >= 0 and chosen.max() < 100
    assert set(small.tolist()) <= set(large.tolist())


def test_hook_leaves_honest_rows_and_sets_malicious_norm(
    bundle: DataBundle, layout: Layout, base: torch.Tensor
) -> None:
    malicious = np.array([1, 3], dtype=np.int64)
    hook = make_promotion_hook(7, malicious, 0.25, bundle, "final", layout, base, MODEL)
    users = np.array([0, 1, 2, 3, 4], dtype=np.int64)
    generator = torch.Generator().manual_seed(0)
    deltas = torch.randn(5, layout.total, generator=generator)
    original = deltas.clone()
    out = hook(users, deltas, _flat(layout), 1)
    assert out.shape == original.shape
    for row in (0, 2, 4):
        assert torch.equal(out[row], original[row])
    for row in (1, 3):
        assert not torch.equal(out[row], original[row])
        assert float(out[row].norm()) == pytest.approx(0.25, rel=1e-5)


def test_hook_without_malicious_users_in_chunk_is_identity(
    bundle: DataBundle, layout: Layout, base: torch.Tensor
) -> None:
    malicious = np.array([5], dtype=np.int64)
    hook = make_promotion_hook(7, malicious, 0.5, bundle, "final", layout, base, MODEL)
    deltas = torch.ones(2, layout.total)
    out = hook(np.array([0, 1], dtype=np.int64), deltas, _flat(layout), 3)
    assert torch.equal(out, deltas)


def test_crafted_update_raises_the_target_score(
    bundle: DataBundle, layout: Layout, base: torch.Tensor
) -> None:
    history = bundle.history("final")
    user = next(u for u in range(bundle.n_users) if len(history[u]) > 2)
    target = next(i for i in range(bundle.n_items) if i not in set(history[user].tolist()))
    hook = make_promotion_hook(
        target, np.array([user], dtype=np.int64), 0.5, bundle, "final", layout, base, MODEL
    )
    flat = _flat(layout)
    out = hook(np.array([user], dtype=np.int64), torch.zeros(1, layout.total), flat, 1)
    rows = bundle.history_matrix("final", np.array([user], dtype=np.int64))
    before = score_matrix(flat, layout, base, rows, MODEL)[0, target]
    after = score_matrix(flat + out[0], layout, base, rows, MODEL)[0, target]
    assert after > before


def test_crafted_update_when_target_is_in_history_is_finite_and_scaled(
    bundle: DataBundle, layout: Layout, base: torch.Tensor
) -> None:
    history = bundle.history("final")
    user = next(u for u in range(bundle.n_users) if len(history[u]) > 0)
    target = int(history[user][0])
    hook = make_promotion_hook(
        target, np.array([user], dtype=np.int64), 0.5, bundle, "final", layout, base, MODEL
    )
    out = hook(np.array([user], dtype=np.int64), torch.zeros(1, layout.total), _flat(layout), 1)
    assert bool(torch.isfinite(out).all())
    assert float(out[0].norm()) == pytest.approx(0.5, rel=1e-5)


def _bias_flat(layout: Layout, target: int, value: float) -> torch.Tensor:
    flat = _flat(layout)
    unflatten(flat, layout)["bias"][target] = value
    return flat


def test_exposure_one_when_target_bias_is_huge_and_zero_when_very_negative(
    bundle: DataBundle,
) -> None:
    layout = make_layout(bundle.n_items, MODEL.dim)
    holders = [u for u in range(bundle.n_users) if 5 in set(bundle.history("final")[u].tolist())]
    assert holders  # users who already have the item must not count against exposure
    high = target_exposure(_bias_flat(layout, 5, 1e3).numpy(), bundle, "final", MODEL, 5)
    low = target_exposure(_bias_flat(layout, 5, -1e3).numpy(), bundle, "final", MODEL, 5)
    assert high == 1.0
    assert low == 0.0


def test_exposure_matches_brute_force_and_respects_exclude(bundle: DataBundle) -> None:
    layout = make_layout(bundle.n_items, MODEL.dim)
    base = content_base(bundle.item_content, MODEL)
    generator = torch.Generator().manual_seed(3)
    flat = torch.randn(layout.total, generator=generator) * 0.3
    history = bundle.history_matrix("final")
    scores = score_matrix(flat, layout, base, history, MODEL)
    masked = np.where(history > 0, -np.inf, scores)
    top = np.argsort(-masked, axis=1)[:, :10]
    counts = np.bincount(top.ravel(), minlength=bundle.n_items)
    target = int(np.argmax(counts))
    assert counts[target] > 0

    def brute(exclude: np.ndarray) -> float:
        ok = np.ones(bundle.n_users, dtype=bool)
        ok[exclude] = False
        ok &= history[:, target] == 0
        return float((top[ok] == target).any(axis=1).mean())

    none = np.array([], dtype=np.int64)
    assert target_exposure(flat.numpy(), bundle, "final", MODEL, target) == pytest.approx(
        brute(none)
    )
    exposed = np.flatnonzero((top == target).any(axis=1) & (history[:, target] == 0))
    assert exposed.size > 0
    result = target_exposure(flat.numpy(), bundle, "final", MODEL, target, exclude=exposed)
    assert result == pytest.approx(brute(exposed))
    assert result == 0.0
    everyone = np.arange(bundle.n_users, dtype=np.int64)
    assert target_exposure(flat.numpy(), bundle, "final", MODEL, target, exclude=everyone) == 0.0
