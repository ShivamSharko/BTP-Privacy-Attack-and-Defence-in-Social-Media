"""End-to-end update-leakage experiment on the synthetic dataset with tiny settings."""

from __future__ import annotations

import json
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import numpy as np
import pytest

from prism.config import ModelConfig
from prism.data.social import FRIENDS_FILE
from prism.data.synthetic import write_synthetic_dataset
from prism.experiments import update_leakage
from prism.experiments.calibration import _key
from prism.experiments.regimes import Frozen, RegimeSpec
from prism.experiments.runner import Paths
from prism.io import atomic_write_json, read_json

FROZEN = Frozen(
    version=1,
    tuned_on="synthetic",
    model=ModelConfig(dim=8),
    regimes={
        "small": RegimeSpec(
            sample_rate=0.3, rounds=30, server_opt="adam", server_lr=0.05, clip_norm=0.5
        )
    },
    epsilons=(8.0,),
    seeds=(0,),
)
KNOBS: dict[str, Any] = {
    "n_targets": 100,
    "cohort_sizes": (5, 20),
    "local_noise": (1.0, 5.0),
}


def _paths(root: Path, friends: bool = True) -> Paths:
    write_synthetic_dataset(root / "processed")
    if not friends:
        (root / "processed" / FRIENDS_FILE).unlink()
    results = root / "results"
    results.mkdir(parents=True, exist_ok=True)
    # Calibrating a noise multiplier takes tens of seconds; seed the cache instead.
    atomic_write_json(results / "calibration.json", {_key(0.3, 30, 400, 8.0): 0.8})
    return Paths(processed=root / "processed", results=results, keys=root / "keys")


@pytest.fixture(scope="module", autouse=True)
def synthetic_precision_ratio() -> Iterator[None]:
    """The synthetic catalogue is tiny and Zipf-skewed, so a popularity prior already reaches
    precision@10 of about 0.35 and the production 5x ratio is arithmetically impossible
    (precision cannot exceed 1). Test only: relax the ratio to 2x; production keeps 5x."""
    with pytest.MonkeyPatch.context() as patch:
        patch.setattr(update_leakage, "RAW_MIN_PRECISION_RATIO", 2.0)
        yield


def test_production_thresholds_are_the_specified_ones() -> None:
    source = Path(update_leakage.__file__).read_text(encoding="utf-8")
    assert "RAW_MIN_AUC = 0.80" in source
    assert "RAW_MIN_PRECISION_RATIO = 5.0" in source
    assert "MASKED_AUC_TOLERANCE = 0.05" in source


@pytest.fixture(scope="module")
def output(tmp_path_factory: pytest.TempPathFactory) -> tuple[dict[str, Any], Paths]:
    paths = _paths(tmp_path_factory.mktemp("leak"))
    return update_leakage.run(paths, FROZEN, **KNOBS), paths


def test_run_is_valid_and_controls_pass(output: tuple[dict[str, Any], Paths]) -> None:
    out, _ = output
    assert out["experiment"] == "update_leakage"
    assert out["status"] == "VALID", out["invalid_reasons"]
    assert out["invalid_reasons"] == []
    controls = out["controls"]
    assert controls["raw_recovers_history"]["passed"] is True
    assert controls["masked_is_chance"]["passed"] is True
    raw = out["results"]["raw"]["recovery"]
    assert raw["auc"]["mean"] >= 0.80
    assert raw["precision_at_10"]["mean"] >= 2 * raw["prior_precision_at_10"]["mean"]
    assert abs(out["results"]["masked"]["recovery"]["auc"]["mean"] - 0.5) <= 0.05
    assert out["model_state"]["source"] == "init_flat"
    assert out["limitations"] and out["wall_seconds"] > 0


def test_every_setting_is_reported(output: tuple[dict[str, Any], Paths]) -> None:
    out, _ = output
    expected = {
        "raw",
        "local_noise_z1",
        "local_noise_z5",
        "masked",
        "sum_5",
        "sum_20",
        "sum_20_dp",
        "reference_histories",
    }
    assert set(out["results"]) == expected
    assert set(out["settings"]["list"]) == expected
    for name in ("raw", "masked", "sum_5", "sum_20", "sum_20_dp", "local_noise_z1"):
        ci = out["results"][name]["recovery"]["auc"]["ci95"]
        assert len(ci) == 2
    assert out["results"]["local_noise_z1"]["single_release_epsilon"] > 0
    assert (
        out["results"]["local_noise_z5"]["single_release_epsilon"]
        < (out["results"]["local_noise_z1"]["single_release_epsilon"])
    )
    assert out["results"]["sum_5"]["link"] == "not_applicable"
    assert out["results"]["sum_20"]["link"] == "not_applicable"
    assert out["results"]["sum_20_dp"]["link"] == "not_applicable"
    assert out["results"]["sum_20_dp"]["noise_multiplier"] == pytest.approx(0.8)
    for name in ("raw", "masked", "local_noise_z1", "reference_histories"):
        assert out["results"][name]["link"]["pairs"] >= 0.0
    # a sum of k users hides each member better than the individual update does
    sums = [out["results"][f"sum_{k}"]["recovery"]["auc"]["mean"] for k in (5, 20)]
    assert sums[1] <= sums[0] + 0.05 < out["results"]["raw"]["recovery"]["auc"]["mean"]


def test_output_file_has_aggregates_only(output: tuple[dict[str, Any], Paths]) -> None:
    out, paths = output
    saved = read_json(paths.results / "update_leakage.json")
    assert saved == json.loads(json.dumps(out))

    def walk(node: Any) -> None:
        if isinstance(node, dict):
            assert not {"users", "targets", "user_ids", "items"} & set(node)
            for value in node.values():
                walk(value)
        elif isinstance(node, list):
            assert len(node) <= 10
            for value in node:
                walk(value)

    walk(saved)


def test_checkpoint_is_used_and_recorded(tmp_path: Path) -> None:
    paths = _paths(tmp_path)
    flat = np.zeros(300 * 8 + 64 + 300, dtype=np.float32)
    flat[300 * 8 : 300 * 8 + 64] = np.eye(8, dtype=np.float32).reshape(-1)
    checkpoint = tmp_path / "model.npz"
    np.savez(checkpoint, flat=flat)
    out = update_leakage.run(
        paths, FROZEN, n_targets=30, cohort_sizes=(5,), local_noise=(1.0,), checkpoint=checkpoint
    )
    assert out["model_state"]["source"] == "checkpoint"


def test_missing_friend_graph_still_valid(tmp_path: Path) -> None:
    paths = _paths(tmp_path, friends=False)
    out = update_leakage.run(paths, FROZEN, n_targets=60, cohort_sizes=(5,), local_noise=(1.0,))
    assert out["status"] == "VALID", out["invalid_reasons"]
    for name in ("raw", "masked", "local_noise_z1", "reference_histories"):
        assert out["results"][name]["link"] == "no_friend_graph"


def test_broken_scorer_makes_run_invalid(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    paths = _paths(tmp_path)
    rng = np.random.default_rng(0)
    monkeypatch.setattr(
        update_leakage, "history_scores", lambda update, layout: rng.normal(size=300)
    )
    out = update_leakage.run(paths, FROZEN, n_targets=60, cohort_sizes=(5,), local_noise=(1.0,))
    assert out["status"] == "INVALID"
    assert out["controls"]["raw_recovers_history"]["passed"] is False
    assert any("raw" in reason for reason in out["invalid_reasons"])
    assert (paths.results / "update_leakage.json").exists()


def test_replace_adjacency_epsilon_is_larger_and_documented(
    output: tuple[dict[str, Any], Paths],
) -> None:
    out, _ = output
    for z in ("local_noise_z1", "local_noise_z5"):
        entry = out["results"][z]
        assert entry["single_release_epsilon_replace_adjacency"] > entry["single_release_epsilon"]
    text = " ".join(out["limitations"])
    assert "add-or-remove" in text and "replace" in text and "2C" in text
