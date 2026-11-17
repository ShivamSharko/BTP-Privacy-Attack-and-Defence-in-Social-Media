"""Decentralised gossip training with local differential privacy."""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pytest
import torch

from prism.config import ModelConfig
from prism.data.bundle import DataBundle
from prism.data.social import graph_from_edges
from prism.data.synthetic import write_synthetic_dataset
from prism.eval.baselines import popularity_score_fn
from prism.eval.metrics import ranking_metrics_per_user
from prism.fl.client import split_history
from prism.fl.gossip import (
    GossipConfig,
    evaluate_nodes,
    gossip_train,
    make_node_delta_fn,
    mix_into,
    privatise_updates,
)
from prism.fl.server import evaluate_per_user
from prism.models.hybrid import content_base, init_flat, make_layout
from prism.seeding import stream, streams, torch_generator

MODEL = ModelConfig(dim=8)


@pytest.fixture(scope="module")
def bundle(tmp_path_factory: pytest.TempPathFactory) -> DataBundle:
    root: Path = tmp_path_factory.mktemp("gossip")
    return write_synthetic_dataset(root / "processed")


def _ring(n: int) -> np.ndarray:
    index = np.arange(n)
    return np.stack([(index - 1) % n, (index + 1) % n], axis=1).astype(np.int64)


def _initial(bundle: DataBundle, seed: int) -> np.ndarray:
    layout = make_layout(bundle.n_items, MODEL.dim)
    return init_flat(layout, MODEL, stream(seed, "init")).numpy()


def test_zero_learning_rate_leaves_every_model_at_the_initial_model(bundle: DataBundle) -> None:
    nodes = np.arange(40, dtype=np.int64)
    config = GossipConfig(rounds=1, degree=2, lr=0.0)
    result = gossip_train(bundle, "final", MODEL, config, nodes, _ring(40), seed=0)
    initial = _initial(bundle, 0)
    assert result.params.shape == (40, initial.size)
    assert result.params.dtype == np.float32
    assert np.array_equal(result.params, np.tile(initial, (40, 1)))
    assert result.rounds_completed == 1


def test_mixing_on_a_ring_conserves_the_mean_model() -> None:
    rng = np.random.default_rng(0)
    half = torch.from_numpy(rng.normal(size=(30, 50)).astype(np.float32))
    out = torch.empty_like(half)
    mix_into(out, half, _ring(30), chunk=7)
    assert torch.allclose(out.mean(dim=0), half.mean(dim=0), atol=1e-6)
    expected = (half + half.roll(1, dims=0) + half.roll(-1, dims=0)) / 3.0
    assert torch.allclose(out, expected, atol=1e-6)


def test_clipping_bounds_what_is_sent() -> None:
    rng = np.random.default_rng(1)
    deltas = torch.from_numpy(rng.normal(size=(20, 100)).astype(np.float32)) * 5.0
    sent = privatise_updates(deltas, 0.7, 0.0, np.random.default_rng(2))
    assert float(sent.norm(dim=1).max()) <= 0.7 + 1e-5
    small = deltas * 1e-4
    untouched = privatise_updates(small, 0.7, 0.0, np.random.default_rng(2))
    assert torch.allclose(untouched, small)
    # With no clip the update leaves unchanged.
    assert torch.equal(privatise_updates(deltas, None, 0.0, np.random.default_rng(2)), deltas)


def test_noise_scale_on_a_sent_update_is_multiplier_times_clip() -> None:
    zeros = torch.zeros(40, 4000)
    sent = privatise_updates(zeros, 0.5, 3.0, np.random.default_rng(3))
    assert abs(float(sent.std()) - 1.5) < 0.03
    assert abs(float(sent.mean())) < 0.03


def test_same_seed_is_deterministic_and_a_new_seed_changes_the_result(bundle: DataBundle) -> None:
    nodes = np.arange(30, dtype=np.int64)
    config = GossipConfig(rounds=2, degree=2, lr=0.5, clip_norm=0.5, noise_multiplier=0.5)
    first = gossip_train(bundle, "final", MODEL, config, nodes, _ring(30), seed=4, chunk=8)
    again = gossip_train(bundle, "final", MODEL, config, nodes, _ring(30), seed=4, chunk=8)
    other = gossip_train(bundle, "final", MODEL, config, nodes, _ring(30), seed=5, chunk=8)
    assert np.array_equal(first.params, again.params)
    assert not np.array_equal(first.params, other.params)


def test_result_reports_bytes_and_friend_share(bundle: DataBundle) -> None:
    nodes = np.arange(12, dtype=np.int64)
    is_friend = np.zeros((12, 2), dtype=np.bool_)
    is_friend[:6] = True
    config = GossipConfig(rounds=1, degree=2, lr=0.1, optimiser="sgd")
    result = gossip_train(
        bundle, "final", MODEL, config, nodes, _ring(12), seed=0, is_friend=is_friend
    )
    assert result.bytes_sent_per_node_per_round == 2 * result.params.shape[1] * 4
    assert result.friend_peer_share == pytest.approx(0.5)


def test_identical_models_evaluate_like_the_shared_model(bundle: DataBundle) -> None:
    nodes = np.arange(5, 65, dtype=np.int64)
    rng = np.random.default_rng(7)
    layout = make_layout(bundle.n_items, MODEL.dim)
    flat = _initial(bundle, 0) + 0.05 * rng.normal(size=layout.total).astype(np.float32)
    params = np.tile(flat, (nodes.size, 1))
    metrics, per_node = evaluate_nodes(params, bundle, "final", MODEL, nodes)
    _, per_user = evaluate_per_user(torch.from_numpy(flat), bundle, "final", MODEL)
    assert np.allclose(per_node, per_user[nodes], atol=1e-6, equal_nan=True)
    assert metrics["ndcg@10"] == pytest.approx(float(np.nanmean(per_user[nodes])), abs=1e-6)


def test_non_private_gossip_beats_most_popular(bundle: DataBundle) -> None:
    nodes = np.arange(bundle.n_users, dtype=np.int64)
    edges = np.stack([nodes, (nodes + 1) % nodes.size], axis=1)
    graph = graph_from_edges(edges, nodes.size)
    peers, is_friend = graph.peer_table(4, stream(0, "sampling"))
    config = GossipConfig(rounds=20, degree=4, lr=0.02)
    result = gossip_train(bundle, "final", MODEL, config, nodes, peers, seed=0, is_friend=is_friend)
    metrics, _ = evaluate_nodes(result.params, bundle, "final", MODEL, nodes)
    floor, _ = ranking_metrics_per_user(
        popularity_score_fn(bundle.history("final"), bundle.n_items),
        bundle.history("final"),
        bundle.targets("final"),
        bundle.n_items,
    )
    assert metrics["ndcg@10"] > 1.1 * floor["ndcg@10"]


def _self_only(n: int) -> np.ndarray:
    return np.zeros((n, 1), dtype=np.int64)


def _one_node_displacement(
    bundle: DataBundle, config: GossipConfig, user: int = 3, seed: int = 0
) -> np.ndarray:
    nodes = np.array([user], dtype=np.int64)
    result = gossip_train(bundle, "final", MODEL, config, nodes, _self_only(1), seed=seed)
    return np.asarray(result.params[0] - _initial(bundle, seed))


def test_clip_binds_on_the_raw_gradient_whatever_the_learning_rate(bundle: DataBundle) -> None:
    c = 0.05
    small = _one_node_displacement(
        bundle, GossipConfig(rounds=1, degree=1, lr=0.01, optimiser="sgd", clip_norm=c)
    )
    large = _one_node_displacement(
        bundle, GossipConfig(rounds=1, degree=1, lr=1.0, optimiser="sgd", clip_norm=c)
    )
    assert np.linalg.norm(large) <= c + 1e-5
    # the step is lr times the same clipped gradient, so the clip does not depend on lr
    assert np.allclose(small / 0.01, large / 1.0, atol=1e-4)
    # and the clip really bound: the raw gradient norm is larger than c
    unclipped = _one_node_displacement(
        bundle, GossipConfig(rounds=1, degree=1, lr=1.0, optimiser="sgd")
    )
    assert np.linalg.norm(unclipped) > c


def test_noise_on_the_sent_gradient_does_not_depend_on_the_learning_rate(
    bundle: DataBundle,
) -> None:
    c, z = 0.5, 3.0
    for lr in (0.01, 0.5):
        config = GossipConfig(
            rounds=1, degree=1, lr=lr, optimiser="sgd", clip_norm=c, noise_multiplier=z
        )
        sent = _one_node_displacement(bundle, config) / lr
        assert abs(float(sent.std()) - z * c) < 0.1 * z * c


def test_sgd_without_clip_is_own_model_plus_lr_times_gradient_direction(
    bundle: DataBundle,
) -> None:
    user, seed, lr = 3, 0, 0.3
    config = GossipConfig(rounds=1, degree=1, lr=lr, optimiser="sgd")
    displacement = _one_node_displacement(bundle, config, user, seed)
    layout = make_layout(bundle.n_items, MODEL.dim)
    base = content_base(bundle.item_content, MODEL)
    rows = torch.from_numpy(bundle.history_matrix("final", np.array([user])))
    generator = torch_generator(streams(seed)["masking"])
    visible, target = split_history(rows, 1, config.hide_fraction, generator)
    delta_fn = make_node_delta_fn(layout, base, MODEL, 1.0)
    start = torch.from_numpy(_initial(bundle, seed)).unsqueeze(0)
    expected = lr * delta_fn(start, visible[:, 0], target[:, 0])[0]
    assert float(expected.norm()) > 0.0
    assert np.allclose(displacement, expected.numpy(), atol=1e-6)


def test_adam_state_is_per_node_and_zero_lr_keeps_the_initial_model(bundle: DataBundle) -> None:
    nodes = np.array([3, 4], dtype=np.int64)
    ring = np.array([[0], [1]], dtype=np.int64)  # each node mixes only with itself
    moving = gossip_train(
        bundle, "final", MODEL, GossipConfig(rounds=2, degree=1, lr=0.05), nodes, ring, seed=0
    )
    assert not np.allclose(moving.params[0], moving.params[1])
    frozen = gossip_train(
        bundle, "final", MODEL, GossipConfig(rounds=2, degree=1, lr=0.0), nodes, ring, seed=0
    )
    assert np.array_equal(frozen.params, np.tile(_initial(bundle, 0), (2, 1)))


def test_first_adam_step_is_lr_times_the_normalised_sign_of_the_gradient(
    bundle: DataBundle,
) -> None:
    lr = 0.05
    adam = _one_node_displacement(bundle, GossipConfig(rounds=1, degree=1, lr=lr))
    raw = _one_node_displacement(bundle, GossipConfig(rounds=1, degree=1, lr=1.0, optimiser="sgd"))
    # bias-corrected first step: lr * g / (|g| + 1e-3)
    assert np.allclose(adam, lr * raw / (np.abs(raw) + 1e-3), atol=1e-6)


def test_tune_phase_is_scored_against_validation_targets(bundle: DataBundle) -> None:
    nodes = np.arange(10, 70, dtype=np.int64)
    rng = np.random.default_rng(9)
    layout = make_layout(bundle.n_items, MODEL.dim)
    flat = _initial(bundle, 0) + 0.05 * rng.normal(size=layout.total).astype(np.float32)
    params = np.tile(flat, (nodes.size, 1))
    _, tune = evaluate_nodes(params, bundle, "tune", MODEL, nodes)
    _, final = evaluate_nodes(params, bundle, "final", MODEL, nodes)
    _, reference = evaluate_per_user(torch.from_numpy(flat), bundle, "tune", MODEL)
    assert np.allclose(tune, reference[nodes], atol=1e-6, equal_nan=True)
    assert not np.allclose(tune, final, equal_nan=True)


def test_consensus_on_params_and_moments_is_a_fixed_point(bundle: DataBundle) -> None:
    n = 12
    nodes = np.full(n, 3, dtype=np.int64)  # identical data on every node
    # hide_fraction 1 hides the whole history, so every node computes the same gradient
    config = GossipConfig(rounds=3, degree=2, lr=0.05, hide_fraction=1.0)
    result = gossip_train(bundle, "final", MODEL, config, nodes, _ring(n), seed=0)
    assert result.first_moment is not None and result.second_moment is not None
    for array in (result.params, result.first_moment, result.second_moment):
        assert np.allclose(array, array[:1], atol=1e-6)
    assert float(np.abs(result.second_moment).max()) > 0.0
    assert float(np.abs(result.params[0] - _initial(bundle, 0)).max()) > 0.0


def test_complete_peer_table_gives_every_node_the_population_mean_moments(
    bundle: DataBundle,
) -> None:
    n = 4
    nodes = np.arange(3, 3 + n, dtype=np.int64)
    complete = np.array([[j for j in range(n) if j != i] for i in range(n)], dtype=np.int64)
    base = GossipConfig(rounds=1, degree=n - 1, lr=0.05, mix_moments=False)
    separate = gossip_train(bundle, "final", MODEL, base, nodes, complete, seed=0)
    mixed_config = GossipConfig(rounds=1, degree=n - 1, lr=0.05, mix_moments=True)
    mixed = gossip_train(bundle, "final", MODEL, mixed_config, nodes, complete, seed=0)
    assert separate.first_moment is not None and separate.second_moment is not None
    assert mixed.first_moment is not None and mixed.second_moment is not None
    assert not np.allclose(separate.first_moment[0], separate.first_moment[1])
    for own, shared in (
        (separate.first_moment, mixed.first_moment),
        (separate.second_moment, mixed.second_moment),
    ):
        assert np.allclose(shared, own.mean(axis=0, keepdims=True), atol=1e-7)
    # parameters were updated before mixing, so they are the same with or without moment mixing
    assert np.allclose(mixed.params, separate.params, atol=1e-7)


def test_bytes_triple_when_moments_are_gossiped(bundle: DataBundle) -> None:
    nodes = np.arange(6, dtype=np.int64)
    sizes = {}
    for label, optimiser, mix in (
        ("sgd", "sgd", True),
        ("own", "adam", False),
        ("mix", "adam", True),
    ):
        config = GossipConfig(rounds=1, degree=2, lr=0.01, optimiser=optimiser, mix_moments=mix)  # type: ignore[arg-type]
        sizes[label] = gossip_train(
            bundle, "final", MODEL, config, nodes, _ring(6), seed=0
        ).bytes_sent_per_node_per_round
    assert sizes["sgd"] == sizes["own"]
    assert sizes["mix"] == 3 * sizes["own"]
