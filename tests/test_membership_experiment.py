"""User-level membership experiment: protocol, controls, status logic."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np
import pytest

from prism.config import ModelConfig
from prism.data.synthetic import write_synthetic_dataset
from prism.experiments import membership as exp
from prism.experiments import regimes
from prism.experiments.regimes import Frozen, RegimeSpec
from prism.experiments.runner import Paths
from prism.io import read_json

REGIME = RegimeSpec(sample_rate=0.3, rounds=30, server_opt="adam", server_lr=0.05, clip_norm=0.5)
FROZEN = Frozen(
    version=1,
    tuned_on="test",
    model=ModelConfig(dim=8),
    regimes={"small": REGIME, "large": REGIME},
    epsilons=(8.0,),
    seeds=(0,),
)
METRICS = {
    "auc",
    "tpr_at_1pct_fpr",
    "tpr_at_0.1pct_fpr",
    "epsilon_lower_bound",
    "raw_auc",
    "raw_tpr_at_1pct_fpr",
}


@pytest.fixture(scope="module")
def paths(tmp_path_factory: pytest.TempPathFactory) -> Paths:
    root: Path = tmp_path_factory.mktemp("membership_exp")
    write_synthetic_dataset(root / "processed")
    return Paths(processed=root / "processed", results=root / "results", keys=root / "keys")


@pytest.fixture(scope="module")
def result(paths: Paths) -> dict[str, Any]:
    return _run(paths)


def _run(paths: Paths) -> dict[str, Any]:
    # Noise calibration takes tens of seconds even for tiny settings; use a fixed multiplier.
    with pytest.MonkeyPatch.context() as patch:
        patch.setattr(regimes, "noise_for", lambda *args, **kwargs: 1.0)
        return _run_inner(paths)


def _run_inner(paths: Paths) -> dict[str, Any]:
    return exp.run(
        paths,
        FROZEN,
        epsilons=(None, 8.0),
        target_seeds=(0,),
        n_reference=2,
        overfit_factor=2,
        workers=1,
        threads=2,
    )


def test_run_produces_every_required_key(paths: Paths, result: dict[str, Any]) -> None:
    for key in (
        "experiment",
        "status",
        "invalid_reasons",
        "controls",
        "settings",
        "results",
        "limitations",
        "wall_seconds",
    ):
        assert key in result
    assert result["experiment"] == "membership"
    assert read_json(paths.results / "membership.json")["status"] == result["status"]
    levels = result["results"]["levels"]
    assert set(levels) == {"nondp", "eps8"}
    for level in levels.values():
        assert len(level["per_seed"]) == 1
        for name in METRICS:
            assert set(level["aggregate"][name]) == {"mean", "min", "max"}
        assert "claimed_epsilon" in level
        assert "low_resolution" in level["per_seed"][0]
    assert levels["nondp"]["claimed_epsilon"] is None
    assert levels["eps8"]["claimed_epsilon"] <= 8.0
    assert isinstance(levels["eps8"]["bound_within_claim"], bool)
    h3 = result["results"]["hypotheses"]["H3"]
    assert isinstance(h3["holds"], bool)
    assert set(result["controls"]) == {"positive_overfit", "negative_independent"}
    for control in result["controls"].values():
        assert isinstance(control["passed"], bool)


def test_status_follows_controls(result: dict[str, Any]) -> None:
    passed = all(c["passed"] for c in result["controls"].values())
    assert (result["status"] == "VALID") == passed
    if not passed:
        assert result["invalid_reasons"]


def test_second_run_is_resumed(paths: Paths, result: dict[str, Any]) -> None:
    again = _run(paths)
    assert (
        again["results"]["levels"]["nondp"]["aggregate"]
        == (result["results"]["levels"]["nondp"]["aggregate"])
    )
    assert again["results"]["training"]["trained_now"] == 0


def test_controls_logic_flags_failures() -> None:
    good_over = {"tpr_at_1pct_fpr": 0.5, "auc": 0.8}
    good_ind = {"auc": 0.51}
    controls, reasons = exp.evaluate_controls(good_over, good_ind)
    assert reasons == [] and all(c["passed"] for c in controls.values())

    controls, reasons = exp.evaluate_controls({"tpr_at_1pct_fpr": 0.01, "auc": 0.8}, good_ind)
    assert not controls["positive_overfit"]["passed"] and len(reasons) == 1
    controls, reasons = exp.evaluate_controls({"tpr_at_1pct_fpr": 0.5, "auc": 0.54}, good_ind)
    assert not controls["positive_overfit"]["passed"]
    controls, reasons = exp.evaluate_controls(good_over, {"auc": 0.60})
    assert not controls["negative_independent"]["passed"] and len(reasons) == 1
    controls, reasons = exp.evaluate_controls(good_over, {"auc": float("nan")})
    assert not controls["negative_independent"]["passed"]


def test_broken_scoring_gives_invalid(paths: Paths, monkeypatch: pytest.MonkeyPatch) -> None:
    def constant(scores: Any, is_member: Any, delta: float) -> dict[str, Any]:
        return {
            "n_members": 1,
            "n_nonmembers": 1,
            "auc": 0.5,
            "tpr_at_1pct_fpr": 0.0,
            "tpr_at_0.1pct_fpr": 0.0,
            "low_resolution": True,
            "epsilon_lower_bound": 0.0,
        }

    monkeypatch.setattr(exp, "summarise_scores", constant)
    out = exp.run(
        paths,
        FROZEN,
        epsilons=(None,),
        target_seeds=(0,),
        n_reference=2,
        overfit_factor=2,
        workers=1,
        threads=2,
    )
    assert out["status"] == "INVALID"
    assert any("positive" in r for r in out["invalid_reasons"])


def test_aggregate_and_violation_detection() -> None:
    per_seed = [dict.fromkeys(METRICS, value) for value in (0.1, 0.3)]
    agg = exp.aggregate(per_seed)
    assert agg["auc"] == {"mean": pytest.approx(0.2), "min": 0.1, "max": 0.3}
    assert exp.bound_within_claim([0.5, 1.0], 1.0) is True
    assert exp.bound_within_claim([0.5, 1.5], 1.0) is False
    assert exp.bound_within_claim([0.5], None) is True


def test_splits_are_deterministic_halves() -> None:
    a1, b1 = exp.split_half(100, 0)
    a2, b2 = exp.split_half(100, 0)
    assert np.array_equal(a1, a2) and np.array_equal(b1, b2)
    assert a1.size == 50 and b1.size == 50
    assert np.intersect1d(a1, b1).size == 0
    a3, _ = exp.split_half(100, 1)
    assert not np.array_equal(a1, a3)


def test_negative_control_text_and_limitations_are_honest() -> None:
    good = {"tpr_at_1pct_fpr": 0.5, "auc": 0.9}
    controls, _ = exp.evaluate_controls(good, {"auc": 0.5})
    assert "independent random half" in controls["negative_independent"]["what"]
    assert "neither half" not in controls["negative_independent"]["what"]
    assert controls["positive_overfit"]["what"]
    text = " ".join(exp.LIMITATIONS)
    assert "two one-sided" in text and "90%" in text
    assert "without correction" in text and "exact half" in text
    assert "sanity check" in text
