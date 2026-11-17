"""Free-riding experiment end to end on the synthetic dataset with tiny settings."""

from __future__ import annotations

from collections.abc import Callable
from pathlib import Path
from typing import Any

import numpy as np
import pytest
import torch

from prism.config import ModelConfig
from prism.data.synthetic import write_synthetic_dataset
from prism.experiments import free_riding
from prism.experiments.regimes import Frozen, RegimeSpec
from prism.experiments.runner import Paths
from prism.io import atomic_write_json, read_json

FRACTIONS = (0.0, 0.3)
BEHAVIOURS = ("zero", "noise")


def _frozen() -> Frozen:
    return Frozen(
        version=1,
        tuned_on="unit test",
        model=ModelConfig(dim=8),
        regimes={
            "small": RegimeSpec(
                sample_rate=0.3, rounds=30, server_opt="adam", server_lr=0.05, clip_norm=0.5
            )
        },
        epsilons=(8.0,),
        seeds=(0,),
    )


def _paths(root: Path) -> Paths:
    return Paths(processed=root / "processed", results=root / "results", keys=root / "keys")


def _run(paths: Paths) -> dict[str, Any]:
    return free_riding.run(
        paths, _frozen(), fractions=FRACTIONS, behaviours=BEHAVIOURS, seeds=(0,),
        sample_rate=0.3, rounds=25, workers=1, threads=1,
    )  # fmt: skip


@pytest.fixture(scope="module")
def outcome(tmp_path_factory: pytest.TempPathFactory) -> tuple[Paths, dict[str, Any]]:
    root = tmp_path_factory.mktemp("free_exp")
    write_synthetic_dataset(root / "processed")
    paths = _paths(root)
    return paths, _run(paths)


def test_end_to_end_keys_and_values(outcome: tuple[Paths, dict[str, Any]]) -> None:
    paths, result = outcome
    assert set(result) >= {
        "experiment", "status", "invalid_reasons", "controls", "settings", "results",
        "limitations", "wall_seconds", "provenance", "noise_readout",
    }  # fmt: skip
    assert result["experiment"] == "free_riding"
    assert result["provenance"].keys() >= {"engine_sha256", "module_sha256", "git_commit"}
    assert read_json(paths.results / "free_riding.json")["status"] == result["status"]
    assert {c["name"] for c in result["controls"]} == {
        "positive_zero_detection",
        "sanity_beats_most_popular",
    }
    clean = result["results"]["clean"]
    assert clean["ndcg"]["mean"] > 0
    for behaviour in BEHAVIOURS:
        cell = result["results"][behaviour]["0.3"]
        assert set(cell) >= {
            "ndcg", "ndcg_contributors", "ndcg_free_riders", "cost_to_everyone",
            "free_rider_gain", "detection",
        }  # fmt: skip
        gain = cell["free_rider_gain"]
        assert set(gain) >= {"difference_mean", "per_seed"}
        assert set(gain["per_seed"][0]) >= {"difference", "ci95_low", "ci95_high"}
        assert cell["detection"]["secure_aggregation"] == "not_applicable"
        assert 0.0 <= cell["detection"]["norm_auc"]["mean"] <= 1.0
        assert 0.0 <= cell["detection"]["cosine_auc"]["mean"] <= 1.0
    zero = result["results"]["zero"]["0.3"]
    assert zero["detection"]["norm_auc"]["mean"] >= 0.95
    assert result["limitations"] and "secure aggregation" in " ".join(result["limitations"])
    assert result["status"] == "VALID", result["invalid_reasons"]
    assert "evades_norm_detection" in result["noise_readout"]


def test_no_user_ids_in_the_output(outcome: tuple[Paths, dict[str, Any]]) -> None:
    paths, _ = outcome
    text = (paths.results / "free_riding.json").read_text(encoding="utf-8")
    assert "users_ids" not in text and "user_id" not in text


def test_fraction_zero_runs_once_per_seed(outcome: tuple[Paths, dict[str, Any]]) -> None:
    paths, result = outcome
    records = list((paths.results / "runs" / "free_riding").glob("*.json"))
    assert len(records) == 3
    assert result["settings"]["runs"] == 3
    stored = [read_json(p) for p in records]
    assert {r["behaviour"] for r in stored} == {"none", "zero", "noise"}
    assert all(r["aggregator"] == "sum" and "detection" in r for r in stored)


def test_rerun_resumes_and_reuses_cached_detection(
    outcome: tuple[Paths, dict[str, Any]], monkeypatch: pytest.MonkeyPatch
) -> None:
    paths, first = outcome

    def refuse(*_a: Any, **_k: Any) -> dict[str, Any]:
        raise AssertionError("a finished run must not be retrained")

    monkeypatch.setattr(free_riding, "run_one", refuse)
    again = _run(paths)
    assert again["settings"]["skipped_runs"] == 3
    assert again["results"] == first["results"]


def test_record_without_cached_detection_is_rerun(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    write_synthetic_dataset(tmp_path / "processed")
    paths = _paths(tmp_path)
    _run(paths)
    for path in (tmp_path / "results" / "runs" / "free_riding").glob("*.json"):
        record = read_json(path)
        if record["behaviour"] == "zero":
            record.pop("detection")
            atomic_write_json(path, record)
    calls: list[str] = []
    real = free_riding.run_one

    def counting(*args: Any, **kwargs: Any) -> dict[str, Any]:
        calls.append(kwargs["extra"]["behaviour"])
        return real(*args, **kwargs)  # type: ignore[no-any-return]

    monkeypatch.setattr(free_riding, "run_one", counting)
    _run(paths)
    assert calls == ["zero"]


def test_identity_hook_makes_the_positive_control_fail(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    write_synthetic_dataset(tmp_path / "processed")
    real = free_riding.make_free_rider_hook

    def lazy_factory(*args: Any, **kwargs: Any) -> Callable[..., torch.Tensor]:
        inner = real(np.zeros(0, dtype=np.int64), *args[1:], **kwargs)
        return inner  # type: ignore[no-any-return]

    monkeypatch.setattr(free_riding, "make_free_rider_hook", lazy_factory)
    result = _run(_paths(tmp_path))
    assert result["status"] == "INVALID"
    assert any("positive_zero_detection" in reason for reason in result["invalid_reasons"])


def test_sanity_control_fails_when_the_model_is_not_better_than_most_popular(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    write_synthetic_dataset(tmp_path / "processed")
    monkeypatch.setattr(free_riding, "SANITY_FACTOR", 1.0e6)
    result = _run(_paths(tmp_path))
    assert result["status"] == "INVALID"
    assert any("sanity_beats_most_popular" in reason for reason in result["invalid_reasons"])


def test_bootstrap_difference_and_validation() -> None:
    a = np.array([1.0, 1.0, 1.0, np.nan])
    b = np.array([0.0, 0.0, 0.0, 0.0])
    diff, low, high = free_riding.bootstrap_difference(a, b, draws=200, seed=0)
    assert diff == pytest.approx(1.0) and low == pytest.approx(1.0) and high == pytest.approx(1.0)
    nan = free_riding.bootstrap_difference(np.array([np.nan]), b, draws=10, seed=0)
    assert all(np.isnan(v) for v in nan)
    with pytest.raises(ValueError):
        free_riding.run(
            _paths(Path(".")), _frozen(), fractions=(0.1,), behaviours=("zero",), workers=1
        )
    with pytest.raises(ValueError):
        free_riding.run(
            _paths(Path(".")), _frozen(), fractions=(0.0, 0.1), behaviours=("noise",), workers=1
        )
