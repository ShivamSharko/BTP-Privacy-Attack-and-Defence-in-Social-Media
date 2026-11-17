"""Frozen hyperparameters and the single place run configurations are built from them.

``experiments/frozen.json`` is written once, after tuning on the validation
split, and before any test-split evaluation. Every experiment builds its runs
through ``make_run`` so that all of them share the same settings.

A regime is a sampling regime, not a trust model: with per-user clipping and
noise on the sum, "central" and "federated" training are the same mechanism and
differ only in sampling rate and number of rounds (design section 1.3 item 2).
"""

from __future__ import annotations

from pathlib import Path
from typing import Final, Literal

from pydantic import BaseModel, ConfigDict, Field

from prism.config import ModelConfig, Phase, RunConfig, TrainConfig
from prism.experiments.calibration import noise_for
from prism.experiments.runner import Paths
from prism.io import read_json

FROZEN_PATH: Final[Path] = Path("experiments/frozen.json")
CALIBRATION_FILE: Final[str] = "calibration.json"


class RegimeSpec(BaseModel):
    """Tuned settings of one sampling regime."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    sample_rate: float = Field(gt=0.0, le=1.0)
    rounds: int = Field(ge=1)
    server_opt: Literal["sgd", "adam"]
    server_lr: float = Field(gt=0.0)
    momentum: float = 0.9
    clip_norm: float = Field(gt=0.0)
    private_server_opt: Literal["sgd", "adam"] | None = None
    private_server_lr: float | None = None


class Frozen(BaseModel):
    """Everything fixed after tuning."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    version: int
    tuned_on: str
    model: ModelConfig
    regimes: dict[str, RegimeSpec]
    epsilons: tuple[float, ...]
    seeds: tuple[int, ...]
    notes: str = ""


def load_frozen(path: Path = FROZEN_PATH) -> Frozen:
    """Read the frozen hyperparameters."""
    return Frozen.model_validate(read_json(path))


def default_paths(root: Path = Path(".")) -> Paths:
    """Standard layout: data/processed, results, keys under the repository root."""
    return Paths(
        processed=root / "data" / "processed", results=root / "results", keys=root / "keys"
    )


def make_run(
    frozen: Frozen,
    *,
    name: str,
    regime: str,
    phase: Phase,
    seed: int,
    epsilon: float | None,
    n_users: int,
    paths: Paths,
    clip_only: bool = False,
    variant: str = "main",
    rounds: int | None = None,
    sample_rate: float | None = None,
    noise_multiplier: float | None = None,
    privacy_claim: bool = True,
) -> RunConfig:
    """Build one run.

    ``epsilon`` set: clip and add noise calibrated for ``n_users`` (or use the explicit
    ``noise_multiplier``). ``epsilon`` None with ``clip_only``: clip, no noise (a diagnostic,
    not private). ``epsilon`` None otherwise: the non-private reference, no clip, no noise.
    """
    if regime not in frozen.regimes:
        raise ValueError(f"unknown regime: {regime}")
    spec = frozen.regimes[regime]
    rate = spec.sample_rate if sample_rate is None else sample_rate
    total = spec.rounds if rounds is None else rounds
    private = epsilon is not None
    noise = 0.0
    if private:
        assert epsilon is not None
        noise = (
            noise_multiplier
            if noise_multiplier is not None
            else noise_for(rate, total, n_users, epsilon, paths.results / CALIBRATION_FILE)
        )
    clipped = private or clip_only
    use_private_server = clipped and spec.private_server_opt is not None
    train = TrainConfig(
        sample_rate=rate,
        rounds=total,
        server_opt=spec.private_server_opt if use_private_server else spec.server_opt,
        server_lr=(
            spec.private_server_lr
            if use_private_server and spec.private_server_lr is not None
            else spec.server_lr
        ),
        momentum=spec.momentum,
        clip_norm=spec.clip_norm if clipped else None,
        noise_multiplier=noise,
    )
    return RunConfig(
        name=name,
        regime=regime,
        phase=phase,
        seed=seed,
        target_epsilon=epsilon,
        model=frozen.model,
        train=train,
        variant=variant,
        privacy_claim=privacy_claim,
    )
