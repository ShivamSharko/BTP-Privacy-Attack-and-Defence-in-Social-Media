"""Tests for the two-tower model and the federated round."""

from __future__ import annotations

import numpy as np
import pytest
import torch

from prism.models.two_tower import (
    SCORE_TEMPERATURE,
    RoundConfig,
    TwoTower,
    aggregate_round,
    client_update,
    get_flat,
    sample_negatives,
    set_flat,
)


def _fixtures(n_users: int = 6, n_items: int = 12, dim: int = 8):
    rng = np.random.default_rng(0)
    items = rng.normal(size=(n_items, dim)).astype(np.float32)
    users = rng.normal(size=(n_users, dim)).astype(np.float32)
    train = [np.array([0, 1, 2], dtype=np.int64) for _ in range(n_users)]
    return items, users, train, n_items, n_users


def test_tower_parameter_count_matches_adr019() -> None:
    model = TwoTower(384, 6319)
    towers = sum(p.numel() for name, p in model.named_parameters() if "item_bias" not in name)
    assert towers == 115072
    assert sum(p.numel() for p in model.parameters()) == 115072 + 6319


def test_item_bias_is_zero_initialised() -> None:
    model = TwoTower(8, 12)
    assert model.item_bias.shape == (12,)
    assert torch.count_nonzero(model.item_bias).item() == 0


def test_flat_roundtrip_includes_bias() -> None:
    model = TwoTower(8, 12)
    flat = get_flat(model)
    changed = flat + 1.0
    set_flat(model, changed)
    assert np.allclose(get_flat(model), changed)
    assert torch.allclose(model.item_bias, torch.ones(12))


def test_set_flat_rejects_wrong_size() -> None:
    model = TwoTower(8, 12)
    with pytest.raises(ValueError):
        set_flat(model, np.zeros(3, dtype=np.float32))


def test_negatives_exclude_training_items() -> None:
    rng = np.random.default_rng(1)
    excluded = np.zeros(20, dtype=np.bool_)
    excluded[[0, 1, 2]] = True
    draws = sample_negatives(rng, 20, excluded, 30)
    assert draws.size == 30
    assert not np.isin(draws, [0, 1, 2]).any()


def test_client_update_respects_clip() -> None:
    items, users, train, n_items, _ = _fixtures()
    torch.manual_seed(0)
    model = TwoTower(items.shape[1], n_items)
    flat = get_flat(model)
    delta = client_update(
        model,
        flat,
        users[0],
        items,
        train[0],
        np.random.default_rng(0),
        n_items,
        1,
        0.5,
        0.01,
    )
    assert float(np.linalg.norm(delta)) <= 0.01 + 1e-6


def test_client_update_is_deterministic() -> None:
    items, users, train, n_items, _ = _fixtures()
    torch.manual_seed(0)
    model = TwoTower(items.shape[1], n_items)
    flat = get_flat(model)
    first = client_update(
        model,
        flat,
        users[0],
        items,
        train[0],
        np.random.default_rng(7),
        n_items,
        1,
        0.5,
        None,
    )
    second = client_update(
        model,
        flat,
        users[0],
        items,
        train[0],
        np.random.default_rng(7),
        n_items,
        1,
        0.5,
        None,
    )
    assert np.allclose(first, second)


def test_client_update_moves_item_bias() -> None:
    items, users, train, n_items, _ = _fixtures()
    torch.manual_seed(0)
    model = TwoTower(items.shape[1], n_items)
    flat = get_flat(model)
    delta = client_update(
        model,
        flat,
        users[0],
        items,
        train[0],
        np.random.default_rng(0),
        n_items,
        1,
        0.5,
        None,
    )
    assert float(np.linalg.norm(delta)) > 0.0
    assert torch.count_nonzero(model.item_bias).item() > 0


def test_dp_round_requires_clip_norm() -> None:
    items, users, train, n_items, n_users = _fixtures()
    torch.manual_seed(0)
    model = TwoTower(items.shape[1], n_items)
    config = RoundConfig(0.5, 1, 0.5, 1.0, None, 1.0)
    with pytest.raises(ValueError):
        aggregate_round(
            model,
            get_flat(model),
            np.array([0, 1], dtype=np.int64),
            users,
            items,
            train,
            np.random.default_rng(0),
            n_items,
            n_users,
            config,
        )


def test_nondp_round_moves_parameters() -> None:
    items, users, train, n_items, n_users = _fixtures()
    torch.manual_seed(0)
    model = TwoTower(items.shape[1], n_items)
    flat = get_flat(model)
    config = RoundConfig(0.5, 1, 0.5, 1.0, None, 0.0)
    updated, mean_norm = aggregate_round(
        model,
        flat,
        np.array([0, 1, 2], dtype=np.int64),
        users,
        items,
        train,
        np.random.default_rng(0),
        n_items,
        n_users,
        config,
    )
    assert not np.allclose(updated, flat)
    assert mean_norm > 0.0


def test_embeddings_are_unit_norm() -> None:
    model = TwoTower(8, 12)
    user_emb, item_emb = model(torch.randn(3, 8), torch.randn(5, 8))
    assert torch.allclose(user_emb.norm(dim=-1), torch.ones(3), atol=1e-5)
    assert torch.allclose(item_emb.norm(dim=-1), torch.ones(5), atol=1e-5)


def test_score_temperature_value() -> None:
    assert SCORE_TEMPERATURE == 10.0


def test_bias_learning_rate_multiplier() -> None:
    from prism.models.two_tower import BIAS_LR_MULTIPLIER

    assert BIAS_LR_MULTIPLIER == 10.0


def test_bias_moves_faster_than_towers() -> None:
    items, users, train, n_items, _ = _fixtures()
    torch.manual_seed(0)
    model = TwoTower(items.shape[1], n_items)
    flat = get_flat(model)
    client_update(
        model,
        flat,
        users[0],
        items,
        train[0],
        np.random.default_rng(0),
        n_items,
        1,
        0.1,
        None,
    )
    bias = model.item_bias.detach().numpy()
    tower_delta = get_flat(model)[:-n_items] - flat[:-n_items]
    assert float(np.abs(bias).max()) > 0.0
    assert float(np.linalg.norm(tower_delta)) > 0.0
