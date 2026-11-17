"""The training round loop, shared by every experiment.

One round: Poisson-sample a cohort, let each client compute its update, pass the
updates through an optional client hook (used to simulate malicious clients),
clip each update, aggregate, add noise once, average over the expected cohort,
and take a server optimiser step. Callers can veto a round before it runs
(``authorise``, used by the ledger's release gate) and observe it afterwards
(``on_round``).

The server optimiser only sees the noisy average, so it is post-processing and
does not affect the privacy guarantee.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

import numpy as np
import numpy.typing as npt
import torch

from prism.config import ModelConfig, Phase, TrainConfig
from prism.data.bundle import DataBundle
from prism.eval.metrics import ranking_metrics
from prism.fl.aggregate import AggregatorName, clip_rows, noisy_mean, robust_total
from prism.fl.client import make_delta_fn, split_history
from prism.fl.sampling import expected_cohort, poisson_cohort
from prism.models.hybrid import content_base, init_flat, make_layout, score_matrix
from prism.seeding import streams, torch_generator

ADAM_BETA1: float = 0.9
ADAM_BETA2: float = 0.99
ADAM_EPS: float = 1.0e-3

ClientHook = Callable[[npt.NDArray[np.int64], torch.Tensor, torch.Tensor, int], torch.Tensor]


@dataclass(frozen=True)
class RoundStats:
    """What happened in one round. Contains no user identifiers."""

    round: int
    cohort: int
    mean_norm: float
    clipped_fraction: float
    nonfinite: int


@dataclass(frozen=True)
class TrainResult:
    """Final parameters and the per-round record."""

    flat: npt.NDArray[np.float32]
    rounds_completed: int
    halted: bool
    stats: tuple[RoundStats, ...]


class _ServerOptimiser:
    """SGD with momentum, or Adam, applied to the averaged update."""

    def __init__(self, config: TrainConfig, size: int) -> None:
        self._config = config
        self._first = torch.zeros(size, dtype=torch.float64)
        self._second = torch.zeros(size, dtype=torch.float64)
        self._step = 0

    def step(self, flat: torch.Tensor, mean_delta: torch.Tensor) -> torch.Tensor:
        config = self._config
        self._step += 1
        if config.server_opt == "sgd":
            self._first = config.momentum * self._first + mean_delta
            direction = self._first
        else:
            self._first = ADAM_BETA1 * self._first + (1.0 - ADAM_BETA1) * mean_delta
            self._second = ADAM_BETA2 * self._second + (1.0 - ADAM_BETA2) * mean_delta**2
            first = self._first / (1.0 - ADAM_BETA1**self._step)
            second = self._second / (1.0 - ADAM_BETA2**self._step)
            direction = first / (second.sqrt() + ADAM_EPS)
        return (flat.to(torch.float64) + config.server_lr * direction).to(torch.float32)


def train(
    bundle: DataBundle,
    phase: Phase,
    model: ModelConfig,
    config: TrainConfig,
    seed: int,
    *,
    eligible: npt.NDArray[np.int64] | None = None,
    availability: npt.NDArray[np.float64] | None = None,
    client_hook: ClientHook | None = None,
    aggregator: AggregatorName = "sum",
    trim_fraction: float = 0.1,
    authorise: Callable[[int], bool] | None = None,
    on_round: Callable[[RoundStats, torch.Tensor], None] | None = None,
    chunk: int = 128,
) -> TrainResult:
    """Train one model. ``phase`` selects the history: train only, or train plus validation."""
    if aggregator != "sum" and config.noise_multiplier > 0.0:
        raise ValueError(
            "robust aggregators have no bounded sensitivity here; run them without DP noise"
        )
    rng = streams(seed)
    layout = make_layout(bundle.n_items, model.dim)
    base = content_base(bundle.item_content, model)
    flat = init_flat(layout, model, rng["init"])
    delta_fn = make_delta_fn(layout, base, model, config.local_steps, config.local_lr)
    mask_generator = torch_generator(rng["masking"])
    users_all = np.arange(bundle.n_users, dtype=np.int64) if eligible is None else eligible
    expected = expected_cohort(users_all.size, config.sample_rate, availability)
    optimiser = _ServerOptimiser(config, layout.total)
    stats: list[RoundStats] = []
    halted = False

    for round_index in range(1, config.rounds + 1):
        if authorise is not None and not authorise(round_index):
            halted = True
            break
        cohort = poisson_cohort(rng["sampling"], users_all, config.sample_rate, availability)
        total = torch.zeros(layout.total, dtype=torch.float64)
        norm_sum = 0.0
        clipped_count = 0
        nonfinite = 0
        collected: list[torch.Tensor] = []
        for start in range(0, cohort.size, chunk):
            users = cohort[start : start + chunk]
            rows = torch.from_numpy(bundle.history_matrix(phase, users))
            visible, target = split_history(
                rows, config.local_steps, config.hide_fraction, mask_generator
            )
            deltas = delta_fn(flat, visible, target)
            if client_hook is not None:
                deltas = client_hook(users, deltas, flat, round_index)
            result = clip_rows(deltas, config.clip_norm)
            norm_sum += float(result.norms.sum())
            nonfinite += result.nonfinite
            if config.clip_norm is not None:
                clipped_count += int((result.norms > config.clip_norm).sum())
            if aggregator == "sum":
                total += result.clipped.sum(dim=0).to(torch.float64)
            else:
                collected.append(result.clipped)
        if aggregator != "sum" and collected:
            total = robust_total(torch.cat(collected), aggregator, trim_fraction)
        mean_delta = noisy_mean(
            total, expected, config.noise_multiplier, config.clip_norm, rng["noise"]
        )
        flat = optimiser.step(flat, mean_delta)
        size = int(cohort.size)
        round_stats = RoundStats(
            round=round_index,
            cohort=size,
            mean_norm=norm_sum / size if size else 0.0,
            clipped_fraction=clipped_count / size if size else 0.0,
            nonfinite=nonfinite,
        )
        stats.append(round_stats)
        if on_round is not None:
            on_round(round_stats, flat)

    return TrainResult(
        flat=np.asarray(flat.numpy(), dtype=np.float32),
        rounds_completed=len(stats),
        halted=halted,
        stats=tuple(stats),
    )


def evaluate(
    flat: npt.NDArray[np.float32] | torch.Tensor,
    bundle: DataBundle,
    phase: Phase,
    model: ModelConfig,
) -> dict[str, float]:
    """Full-catalogue ranking metrics: validation targets for tune, test targets for final."""
    layout = make_layout(bundle.n_items, model.dim)
    base = content_base(bundle.item_content, model)
    tensor = flat if isinstance(flat, torch.Tensor) else torch.from_numpy(np.asarray(flat))

    def score_fn(users: npt.NDArray[np.int64]) -> npt.NDArray[np.float32]:
        return score_matrix(tensor, layout, base, bundle.history_matrix(phase, users), model)

    return ranking_metrics(score_fn, bundle.history(phase), bundle.targets(phase), bundle.n_items)
