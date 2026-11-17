"""Frozen hyperparameters and run construction."""

from __future__ import annotations

from pathlib import Path

import pytest

from prism.config import ModelConfig
from prism.experiments.calibration import noise_for
from prism.experiments.regimes import (
    FROZEN_PATH,
    Frozen,
    RegimeSpec,
    default_paths,
    load_frozen,
    make_run,
)
from prism.experiments.runner import Paths
from prism.io import read_json


def _frozen() -> Frozen:
    return Frozen(
        version=1,
        tuned_on="unit test",
        model=ModelConfig(dim=8),
        regimes={
            "small": RegimeSpec(
                sample_rate=0.2,
                rounds=10,
                server_opt="adam",
                server_lr=0.05,
                clip_norm=0.5,
                private_server_opt="sgd",
                private_server_lr=0.3,
            )
        },
        epsilons=(8.0,),
        seeds=(0, 1),
    )


def _paths(tmp_path: Path) -> Paths:
    return Paths(processed=tmp_path / "p", results=tmp_path / "r", keys=tmp_path / "k")


def test_repository_frozen_file_loads() -> None:
    root = Path(__file__).resolve().parents[1]
    frozen = load_frozen(root / FROZEN_PATH)
    assert {"large", "small"} <= set(frozen.regimes)
    assert frozen.model.dim >= 1


def test_default_paths_layout() -> None:
    paths = default_paths(Path("root"))
    assert paths.processed == Path("root/data/processed")
    assert paths.results == Path("root/results")


def test_non_private_reference_has_no_clip_and_no_noise(tmp_path: Path) -> None:
    run = make_run(
        _frozen(),
        name="x",
        regime="small",
        phase="tune",
        seed=0,
        epsilon=None,
        n_users=400,
        paths=_paths(tmp_path),
    )
    assert run.train.clip_norm is None and run.train.noise_multiplier == 0.0
    assert run.train.server_opt == "adam" and run.train.server_lr == 0.05
    assert "nondp" in run.identifier


def test_clip_only_run_clips_without_noise(tmp_path: Path) -> None:
    run = make_run(
        _frozen(),
        name="x",
        regime="small",
        phase="tune",
        seed=0,
        epsilon=None,
        n_users=400,
        paths=_paths(tmp_path),
        clip_only=True,
    )
    assert run.train.clip_norm == 0.5 and run.train.noise_multiplier == 0.0
    assert run.train.server_opt == "sgd" and run.train.server_lr == 0.3
    assert "cliponly" in run.identifier


def test_private_run_uses_cached_calibrated_noise(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    import prism.experiments.calibration as calibration

    calls: list[tuple[float, int, int, float]] = []

    def fake(rate: float, rounds: int, n_users: int, epsilon: float) -> float:
        calls.append((rate, rounds, n_users, epsilon))
        return 1.2345

    monkeypatch.setattr(calibration, "calibrate_noise", fake)
    paths = _paths(tmp_path)
    kwargs = {
        "name": "x",
        "regime": "small",
        "phase": "final",
        "seed": 1,
        "epsilon": 8.0,
        "n_users": 400,
        "paths": paths,
    }
    one = make_run(_frozen(), **kwargs)  # type: ignore[arg-type]
    two = make_run(_frozen(), **kwargs)  # type: ignore[arg-type]
    assert one.train.noise_multiplier == two.train.noise_multiplier == 1.2345
    assert one.train.clip_norm == 0.5
    assert calls == [(0.2, 10, 400, 8.0)]  # second call came from the cache
    assert list(read_json(paths.results / "calibration.json").values()) == [1.2345]
    assert noise_for(0.2, 10, 400, 8.0, paths.results / "calibration.json") == 1.2345


def test_overrides_and_unknown_regime(tmp_path: Path) -> None:
    run = make_run(
        _frozen(),
        name="x",
        regime="small",
        phase="tune",
        seed=0,
        epsilon=4.0,
        n_users=200,
        paths=_paths(tmp_path),
        rounds=3,
        sample_rate=0.5,
        noise_multiplier=2.0,
        variant="half",
    )
    assert (run.train.rounds, run.train.sample_rate, run.train.noise_multiplier) == (3, 0.5, 2.0)
    assert "half" in run.identifier
    with pytest.raises(ValueError):
        make_run(
            _frozen(),
            name="x",
            regime="nope",
            phase="tune",
            seed=0,
            epsilon=None,
            n_users=1,
            paths=_paths(tmp_path),
        )
