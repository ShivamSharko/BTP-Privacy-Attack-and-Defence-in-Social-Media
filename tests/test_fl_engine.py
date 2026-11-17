"""Federated engine: sampling, client updates, clipping, noise, the round loop (plan task M3)."""

from __future__ import annotations

import hashlib
from pathlib import Path

import numpy as np
import pytest
import torch

from prism.config import ModelConfig, TrainConfig
from prism.data.bundle import DataBundle
from prism.data.synthetic import write_synthetic_dataset
from prism.eval.baselines import popularity_score_fn
from prism.eval.metrics import ranking_metrics
from prism.fl.aggregate import clip_rows, noisy_mean, robust_total
from prism.fl.client import make_delta_fn, split_history
from prism.fl.sampling import poisson_cohort
from prism.fl.server import evaluate, train
from prism.models.hybrid import content_base, init_flat, make_layout
from prism.seeding import stream, torch_generator

MODEL = ModelConfig(dim=8)


@pytest.fixture(scope="module")
def bundle(tmp_path_factory: pytest.TempPathFactory) -> DataBundle:
    out: Path = tmp_path_factory.mktemp("synthetic")
    return write_synthetic_dataset(out)


def _digest(flat: np.ndarray) -> str:
    return hashlib.sha256(np.ascontiguousarray(flat).tobytes()).hexdigest()


# ---------------------------------------------------------------- sampling


def test_poisson_cohort_rate_and_determinism() -> None:
    eligible = np.arange(20_000, dtype=np.int64)
    cohort = poisson_cohort(stream(0, "sampling"), eligible, 0.1)
    assert abs(cohort.size - 2_000) < 4 * np.sqrt(20_000 * 0.1 * 0.9)
    assert np.array_equal(cohort, poisson_cohort(stream(0, "sampling"), eligible, 0.1))
    assert np.all(np.diff(cohort) > 0)


def test_poisson_cohort_returns_ids_from_the_eligible_set() -> None:
    eligible = np.array([5, 9, 42], dtype=np.int64)
    cohort = poisson_cohort(stream(1, "sampling"), eligible, 1.0)
    assert np.array_equal(cohort, eligible)


def test_availability_scales_the_rate_and_never_raises_it() -> None:
    eligible = np.arange(20_000, dtype=np.int64)
    availability = np.full(20_000, 0.25)
    cohort = poisson_cohort(stream(0, "sampling"), eligible, 0.4, availability)
    assert abs(cohort.size - 2_000) < 4 * np.sqrt(20_000 * 0.1 * 0.9)
    with pytest.raises(ValueError):
        poisson_cohort(stream(0, "sampling"), eligible, 0.4, np.full(20_000, 1.5))


def test_sampling_consumes_a_fixed_number_of_draws() -> None:
    eligible = np.arange(100, dtype=np.int64)
    one, two = stream(3, "sampling"), stream(3, "sampling")
    poisson_cohort(one, eligible, 0.01)
    poisson_cohort(two, eligible, 0.99)
    assert one.random() == two.random()


# ---------------------------------------------------------------- clipping


def test_clip_rows_bounds_norms_and_leaves_small_rows_alone() -> None:
    deltas = torch.tensor([[3.0, 4.0], [0.3, 0.4], [0.0, 0.0]])
    result = clip_rows(deltas, 1.0)
    assert torch.allclose(result.clipped[0], torch.tensor([0.6, 0.8]))
    assert torch.equal(result.clipped[1], deltas[1])
    assert torch.equal(result.clipped[2], deltas[2])
    assert torch.allclose(result.norms, torch.tensor([5.0, 0.5, 0.0]))
    assert result.nonfinite == 0
    assert float(result.clipped.norm(dim=1).max()) <= 1.0 + 1e-6


def test_clip_rows_zeroes_and_counts_non_finite_rows() -> None:
    deltas = torch.tensor([[float("nan"), 1.0], [float("inf"), 0.0], [0.3, 0.4]])
    for clip in (1.0, None):
        result = clip_rows(deltas, clip)
        assert result.nonfinite == 2
        assert torch.count_nonzero(result.clipped[:2]) == 0
        assert torch.equal(result.clipped[2], deltas[2])
        assert bool(torch.isfinite(result.clipped).all())


def test_no_clip_passes_finite_rows_through() -> None:
    deltas = torch.tensor([[30.0, 40.0]])
    assert torch.equal(clip_rows(deltas, None).clipped, deltas)


# ---------------------------------------------------------------- client updates


def _deltas(bundle: DataBundle, users: np.ndarray, steps: int = 1) -> torch.Tensor:
    layout = make_layout(bundle.n_items, MODEL.dim)
    base = content_base(bundle.item_content, MODEL)
    flat = init_flat(layout, MODEL, stream(0, "init"))
    rows = torch.from_numpy(bundle.history_matrix("tune", users))
    visible, target = split_history(rows, steps, 0.5, torch_generator(stream(0, "masking")))
    return make_delta_fn(layout, base, MODEL, steps, 1.0)(flat, visible, target)


def test_split_history_partitions_each_users_items() -> None:
    rows = torch.zeros(3, 40)
    rows[0, :20] = 1.0
    rows[1, 5:9] = 1.0
    visible, target = split_history(rows, 2, 0.5, torch_generator(stream(0, "masking")))
    assert visible.shape == target.shape == (3, 2, 40)
    assert torch.equal(visible + target, rows.unsqueeze(1).expand(-1, 2, -1))
    assert float((visible * target).sum()) == 0.0
    assert not torch.equal(visible[:, 0], visible[:, 1])


def test_delta_shape_and_finiteness(bundle: DataBundle) -> None:
    deltas = _deltas(bundle, np.arange(6, dtype=np.int64))
    assert deltas.shape == (6, make_layout(bundle.n_items, MODEL.dim).total)
    assert bool(torch.isfinite(deltas).all())
    assert float(deltas.norm(dim=1).min()) > 0.0


def test_two_local_steps_differ_from_one(bundle: DataBundle) -> None:
    users = np.arange(4, dtype=np.int64)
    assert not torch.allclose(_deltas(bundle, users, 1), _deltas(bundle, users, 2)[:, :])


def test_one_user_changes_the_clipped_sum_by_at_most_the_clip_norm(bundle: DataBundle) -> None:
    """The sensitivity that the Gaussian mechanism is calibrated to."""
    clip = 0.05
    deltas = _deltas(bundle, np.arange(12, dtype=np.int64))
    assert float(deltas.norm(dim=1).max()) > clip  # the clip really binds
    clipped = clip_rows(deltas, clip).clipped
    with_user = clipped.sum(dim=0)
    for removed in range(12):
        keep = [i for i in range(12) if i != removed]
        without_user = clipped[keep].sum(dim=0)
        assert float((with_user - without_user).norm()) <= clip * (1.0 + 1e-5)


# ---------------------------------------------------------------- noise and averaging


def test_noisy_mean_divides_by_the_expected_cohort_not_the_realised_one() -> None:
    total = torch.full((4,), 10.0, dtype=torch.float64)
    mean = noisy_mean(
        total, expected=5.0, noise_multiplier=0.0, clip_norm=None, rng=stream(0, "noise")
    )
    assert torch.allclose(mean, torch.full((4,), 2.0, dtype=torch.float64))


def test_noisy_mean_noise_scale_is_multiplier_times_clip() -> None:
    total = torch.zeros(200_000, dtype=torch.float64)
    mean = noisy_mean(
        total, expected=4.0, noise_multiplier=1.5, clip_norm=2.0, rng=stream(0, "noise")
    )
    assert float(mean.std()) == pytest.approx(1.5 * 2.0 / 4.0, rel=0.02)
    assert abs(float(mean.mean())) < 0.01


def test_noisy_mean_never_divides_by_less_than_one() -> None:
    total = torch.full((3,), 2.0, dtype=torch.float64)
    mean = noisy_mean(
        total, expected=1e-9, noise_multiplier=0.0, clip_norm=None, rng=stream(0, "noise")
    )
    assert torch.allclose(mean, total)


def test_noise_without_a_clip_norm_is_an_error() -> None:
    with pytest.raises(ValueError):
        noisy_mean(torch.zeros(3, dtype=torch.float64), 1.0, 1.0, None, stream(0, "noise"))


# ---------------------------------------------------------------- robust aggregation


def test_robust_totals_ignore_one_extreme_row() -> None:
    honest = torch.ones(9, 5)
    deltas = torch.cat([honest, torch.full((1, 5), 1e6)])
    assert float(robust_total(deltas, "sum", 0.1).mean()) > 1e5
    assert torch.allclose(robust_total(deltas, "trimmed_mean", 0.1).float(), torch.full((5,), 10.0))
    assert torch.allclose(robust_total(deltas, "median", 0.1).float(), torch.full((5,), 10.0))
    with pytest.raises(ValueError):
        robust_total(deltas, "trimmed_mean", 0.5)


# ---------------------------------------------------------------- the round loop


def _config(**overrides: object) -> TrainConfig:
    values: dict[str, object] = {"sample_rate": 0.3, "rounds": 4, "server_lr": 0.05}
    values.update(overrides)
    return TrainConfig(**values)  # type: ignore[arg-type]


def test_training_is_deterministic_for_a_seed(bundle: DataBundle) -> None:
    config = _config(clip_norm=0.05, noise_multiplier=1.0)
    one = train(bundle, "tune", MODEL, config, seed=3)
    two = train(bundle, "tune", MODEL, config, seed=3)
    other = train(bundle, "tune", MODEL, config, seed=4)
    assert _digest(one.flat) == _digest(two.flat)
    assert _digest(one.flat) != _digest(other.flat)
    assert one.rounds_completed == 4
    assert not one.halted


def test_noise_does_not_change_which_users_are_sampled(bundle: DataBundle) -> None:
    plain = train(bundle, "tune", MODEL, _config(clip_norm=0.05), seed=5)
    noisy = train(bundle, "tune", MODEL, _config(clip_norm=0.05, noise_multiplier=2.0), seed=5)
    assert [s.cohort for s in plain.stats] == [s.cohort for s in noisy.stats]
    assert _digest(plain.flat) != _digest(noisy.flat)


def test_an_empty_cohort_round_is_still_noised_and_counted(bundle: DataBundle) -> None:
    config = _config(
        sample_rate=1e-9, rounds=1, server_lr=1.0, server_opt="sgd", momentum=0.0,
        clip_norm=2.0, noise_multiplier=1.5,
    )  # fmt: skip
    layout = make_layout(bundle.n_items, MODEL.dim)
    start = init_flat(layout, MODEL, stream(0, "init")).numpy()
    result = train(bundle, "tune", MODEL, config, seed=0)
    assert result.stats[0].cohort == 0
    assert result.rounds_completed == 1
    change = result.flat - start
    # Divisor is max(expected, 1) = 1, so the change is exactly the noise: std = z * C.
    assert float(change.std()) == pytest.approx(3.0, rel=0.06)


def test_clipping_bounds_the_effect_of_a_hostile_client(bundle: DataBundle) -> None:
    def hostile(
        users: np.ndarray, deltas: torch.Tensor, flat: torch.Tensor, round_index: int
    ) -> torch.Tensor:
        return deltas * 1e9

    config = _config(
        sample_rate=1.0, rounds=1, server_lr=1.0, server_opt="sgd", momentum=0.0, clip_norm=0.05
    )
    layout = make_layout(bundle.n_items, MODEL.dim)
    start = init_flat(layout, MODEL, stream(0, "init")).numpy()
    result = train(bundle, "tune", MODEL, config, seed=0, client_hook=hostile)
    # Mean of vectors each of norm <= C has norm <= C.
    assert float(np.linalg.norm(result.flat - start)) <= 0.05 * (1.0 + 1e-4)
    assert result.stats[0].clipped_fraction == 1.0


def test_non_finite_client_updates_are_dropped_and_counted(bundle: DataBundle) -> None:
    def broken(
        users: np.ndarray, deltas: torch.Tensor, flat: torch.Tensor, round_index: int
    ) -> torch.Tensor:
        out = deltas.clone()
        out[0] = float("nan")
        return out

    result = train(
        bundle, "tune", MODEL, _config(rounds=2, clip_norm=0.05), seed=0, client_hook=broken
    )
    assert np.isfinite(result.flat).all()
    assert all(s.nonfinite >= 1 for s in result.stats)


def test_the_gate_can_halt_training_before_a_round(bundle: DataBundle) -> None:
    seen: list[int] = []

    def authorise(round_index: int) -> bool:
        seen.append(round_index)
        return round_index < 3

    result = train(bundle, "tune", MODEL, _config(rounds=5), seed=0, authorise=authorise)
    assert seen == [1, 2, 3]
    assert result.rounds_completed == 2
    assert result.halted


def test_round_callback_sees_every_completed_round(bundle: DataBundle) -> None:
    rounds: list[int] = []
    train(
        bundle,
        "tune",
        MODEL,
        _config(rounds=3),
        seed=0,
        on_round=lambda s, flat: rounds.append(s.round),
    )
    assert rounds == [1, 2, 3]


def test_training_only_on_eligible_users(bundle: DataBundle) -> None:
    eligible = np.arange(0, bundle.n_users, 2, dtype=np.int64)
    seen: list[np.ndarray] = []

    def spy(
        users: np.ndarray, deltas: torch.Tensor, flat: torch.Tensor, round_index: int
    ) -> torch.Tensor:
        seen.append(users.copy())
        return deltas

    train(bundle, "tune", MODEL, _config(rounds=2), seed=0, eligible=eligible, client_hook=spy)
    assert all(np.isin(users, eligible).all() for users in seen)


def test_robust_aggregator_runs_in_the_loop(bundle: DataBundle) -> None:
    result = train(
        bundle, "tune", MODEL, _config(rounds=2, clip_norm=0.05), seed=0, aggregator="median"
    )
    assert np.isfinite(result.flat).all()
    with pytest.raises(ValueError):
        train(
            bundle, "tune", MODEL, _config(rounds=1, clip_norm=0.05, noise_multiplier=1.0),
            seed=0, aggregator="median",
        )  # fmt: skip


def test_non_private_training_beats_most_popular(bundle: DataBundle) -> None:
    """The reason the model was rebuilt: it must personalise, not just learn popularity."""
    config = _config(sample_rate=0.3, rounds=80, server_lr=0.05)
    result = train(bundle, "tune", MODEL, config, seed=0)
    model_ndcg = evaluate(result.flat, bundle, "tune", MODEL)["ndcg@10"]
    popular = ranking_metrics(
        popularity_score_fn(bundle.history("tune"), bundle.n_items),
        bundle.history("tune"),
        bundle.targets("tune"),
        bundle.n_items,
    )["ndcg@10"]
    assert model_ndcg > 1.3 * popular


def test_a_custom_aggregator_receives_the_clipped_cohort_and_its_own_stream(
    bundle: DataBundle,
) -> None:
    seen: list[tuple[int, float]] = []

    def aggregate(deltas: torch.Tensor, rng: np.random.Generator) -> torch.Tensor:
        seen.append((deltas.shape[0], float(deltas.norm(dim=1).max())))
        assert 0.0 <= rng.random() < 1.0
        return deltas.sum(dim=0).to(torch.float64)

    config = _config(rounds=2, clip_norm=0.05)
    custom = train(bundle, "tune", MODEL, config, seed=0, aggregator=aggregate)
    plain = train(bundle, "tune", MODEL, config, seed=0, force_materialised=True)
    assert len(seen) == 2
    assert all(size > 0 and largest <= 0.05 * (1 + 1e-5) for size, largest in seen)
    assert [s.cohort for s in custom.stats] == [s.cohort for s in plain.stats]
    assert np.allclose(custom.flat, plain.flat, rtol=1e-5, atol=1e-7)
    with pytest.raises(ValueError):
        train(
            bundle,
            "tune",
            MODEL,
            _config(rounds=1, clip_norm=0.05, noise_multiplier=1.0),
            seed=0,
            aggregator=aggregate,
        )
