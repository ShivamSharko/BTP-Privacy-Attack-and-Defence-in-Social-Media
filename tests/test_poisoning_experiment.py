"""Poisoning experiment end to end on the synthetic dataset with tiny settings."""

from __future__ import annotations

from collections.abc import Callable
from pathlib import Path
from typing import Any

import numpy as np
import pytest
import torch

from prism.config import ModelConfig
from prism.data.synthetic import write_synthetic_dataset
from prism.experiments import poisoning
from prism.experiments.regimes import Frozen, RegimeSpec
from prism.experiments.runner import Paths
from prism.io import read_json

MODES = ("secure_sum_norm_bound", "plaintext_trimmed_mean")
FRACTIONS = (0.0, 0.3)


def _frozen() -> Frozen:
    return Frozen(
        version=1,
        tuned_on="unit test",
        model=ModelConfig(dim=8),
        regimes={
            "small": RegimeSpec(
                sample_rate=0.3,
                rounds=30,
                server_opt="adam",
                server_lr=0.05,
                clip_norm=0.5,
            )
        },
        epsilons=(8.0,),
        seeds=(0,),
    )


def _paths(root: Path) -> Paths:
    return Paths(processed=root / "processed", results=root / "results", keys=root / "keys")


def _run(paths: Paths) -> dict[str, Any]:
    return poisoning.run(
        paths,
        _frozen(),
        fractions=FRACTIONS,
        modes=MODES,
        seeds=(0,),
        sample_rate=0.3,
        rounds=25,
        workers=1,
        threads=1,
    )


@pytest.fixture(scope="module")
def outcome(tmp_path_factory: pytest.TempPathFactory) -> tuple[Paths, dict[str, Any]]:
    root = tmp_path_factory.mktemp("poison_exp")
    write_synthetic_dataset(root / "processed")
    paths = _paths(root)
    return paths, _run(paths)


def test_end_to_end_shape_and_exposure_jump(outcome: tuple[Paths, dict[str, Any]]) -> None:
    paths, result = outcome
    assert set(result) >= {
        "experiment",
        "status",
        "invalid_reasons",
        "controls",
        "settings",
        "results",
        "limitations",
        "wall_seconds",
        "h4",
    }
    assert result["experiment"] == "poisoning"
    assert result["limitations"]
    assert read_json(paths.results / "poisoning.json")["status"] == result["status"]
    cells = result["results"]
    assert set(cells) == set(MODES)
    for mode in MODES:
        for fraction in ("0.0", "0.3"):
            cell = cells[mode][fraction]
            assert set(cell) >= {
                "exposure",
                "ndcg",
                "utility_drop",
                "exposure_ratio",
            }
            assert set(cell["exposure"]) >= {"mean", "min", "max", "per_seed"}
    sum_cells = cells["secure_sum_norm_bound"]
    assert sum_cells["0.3"]["exposure"]["mean"] > 5 * max(
        sum_cells["0.0"]["exposure"]["mean"], 1.0 / 400
    )
    assert cells["plaintext_trimmed_mean"]["0.0"]["exposure_ratio"] == pytest.approx(1.0)
    assert sum_cells["0.0"]["utility_drop"] == pytest.approx(0.0)
    assert {c["name"] for c in result["controls"]} == {"positive_promotion", "negative_clean"}
    for control in result["controls"]:
        assert set(control) >= {"name", "measured", "threshold", "passed"}
    assert result["status"] == "VALID", result["invalid_reasons"]


def test_rerun_resumes_from_existing_records(outcome: tuple[Paths, dict[str, Any]]) -> None:
    paths, first = outcome
    again = _run(paths)
    assert again["results"] == first["results"]
    assert again["settings"]["skipped_runs"] == 4


def test_identity_hook_makes_the_positive_control_fail(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    write_synthetic_dataset(tmp_path / "processed")

    def identity_factory(*_args: Any, **_kwargs: Any) -> Callable[..., torch.Tensor]:
        def hook(
            users: np.ndarray, deltas: torch.Tensor, flat: torch.Tensor, round_index: int
        ) -> torch.Tensor:
            return deltas

        return hook

    monkeypatch.setattr(poisoning, "make_promotion_hook", identity_factory)
    result = _run(_paths(tmp_path))
    assert result["status"] == "INVALID"
    assert any("positive_promotion" in reason for reason in result["invalid_reasons"])


def test_summarise_helpers_floor_and_h4() -> None:
    assert poisoning.exposure_ratio(0.2, 0.0, 400) == pytest.approx(0.2 / 0.0025)
    assert poisoning.exposure_ratio(0.2, 0.1, 400) == pytest.approx(2.0)
    assert poisoning.utility_drop(0.8, 1.0) == pytest.approx(0.2)
    exposure = {
        "secure_sum_norm_bound": {0.0: 0.0, 0.1: 0.2, 0.2: 0.5},
        "plaintext_trimmed_mean": {0.0: 0.0, 0.1: 0.05, 0.2: 0.1},
    }
    h4 = poisoning.h4_readout(exposure, (0.0, 0.1, 0.2))
    assert h4["holds"] is True
    exposure["plaintext_trimmed_mean"][0.2] = 0.6
    assert poisoning.h4_readout(exposure, (0.0, 0.1, 0.2))["holds"] is False


def _h4_for(gaps: list[float]) -> dict[str, Any]:
    fractions = (0.0, 0.1, 0.2, 0.3)
    summed = {0.0: 0.0}
    trimmed = {0.0: 0.0}
    for fraction, gap in zip(fractions[1:], gaps, strict=True):
        summed[fraction] = 0.5
        trimmed[fraction] = 0.5 - gap
    exposure = {"secure_sum_norm_bound": summed, "plaintext_trimmed_mean": trimmed}
    return poisoning.h4_readout(exposure, fractions)


def test_h4_rule_is_lower_everywhere_and_gap_largest_at_the_top_share() -> None:
    wiggly = _h4_for([0.02, 0.01, 0.03])
    assert wiggly["lower_at_every_share"] is True
    assert wiggly["gap_largest_at_max_share"] is True
    assert wiggly["holds"] is True
    shrinking = _h4_for([0.03, 0.02, 0.01])
    assert shrinking["lower_at_every_share"] is True
    assert shrinking["gap_largest_at_max_share"] is False
    assert shrinking["holds"] is False
    not_lower = _h4_for([0.02, -0.01, 0.03])
    assert not_lower["lower_at_every_share"] is False and not_lower["holds"] is False
    assert "largest at 30%" in wiggly["statement"] or "largest" in wiggly["statement"]


def test_changed_trim_fraction_reruns_trimmed_runs_only(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    write_synthetic_dataset(tmp_path / "processed")
    paths = _paths(tmp_path)
    calls: list[str] = []
    real = poisoning.run_one

    def counting(*args: Any, **kwargs: Any) -> dict[str, Any]:
        calls.append(kwargs["extra"]["aggregator"])
        return real(*args, **kwargs)  # type: ignore[no-any-return]

    monkeypatch.setattr(poisoning, "run_one", counting)

    def go(trim: float) -> dict[str, Any]:
        return poisoning.run(
            paths, _frozen(), fractions=FRACTIONS, modes=MODES, seeds=(0,), sample_rate=0.3,
            rounds=25, trim_fraction=trim, workers=1, threads=1,
        )  # fmt: skip

    go(0.35)
    assert sorted(calls) == ["sum", "sum", "trimmed_mean", "trimmed_mean"]
    calls.clear()
    assert go(0.35)["settings"]["skipped_runs"] == 4 and not calls
    go(0.2)
    assert calls == ["trimmed_mean", "trimmed_mean"]
    calls.clear()
    assert go(0.2)["settings"]["skipped_runs"] == 4 and not calls
    records = [read_json(p) for p in (tmp_path / "results" / "runs" / "poisoning").glob("*.json")]
    trimmed = [r for r in records if r.get("aggregator") == "trimmed_mean"]
    assert trimmed and all(r["trim_fraction"] == 0.2 for r in trimmed)
    # a legacy record without the field is accepted
    for path in (tmp_path / "results" / "runs" / "poisoning").glob("*.json"):
        record = read_json(path)
        record.pop("trim_fraction", None)
        record.pop("aggregator", None)
        from prism.io import atomic_write_json

        atomic_write_json(path, record)
    go(0.1)
    assert not calls
    assert "predate the commit" in " ".join(poisoning.LIMITATIONS)
