"""RQ1 grid, its summary, and the baselines table."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest

from prism.config import ModelConfig
from prism.data.synthetic import write_synthetic_dataset
from prism.experiments import baselines, privacy_utility
from prism.experiments.regimes import Frozen, RegimeSpec
from prism.experiments.runner import Paths
from prism.io import read_json


@pytest.fixture(scope="module")
def paths(tmp_path_factory: pytest.TempPathFactory) -> Paths:
    root: Path = tmp_path_factory.mktemp("rq1")
    write_synthetic_dataset(root / "processed")
    return Paths(processed=root / "processed", results=root / "results", keys=root / "keys")


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
        seeds=(0, 1),
    )


def _record(
    regime: str, seed: int, ndcg: float, epsilon: float | None, clip: bool, variant: str = "main"
) -> dict[str, Any]:
    return {
        "id": f"{regime}-{seed}-{epsilon}-{clip}-{variant}",
        "status": "ok",
        "config": {
            "regime": regime,
            "seed": seed,
            "variant": variant,
            "target_epsilon": epsilon,
            "train": {"clip_norm": 1.0 if clip else None},
        },
        "metrics": {"ndcg@10": ndcg, "hr@10": 0.1, "distinct@10": 100.0},
        "privacy": None
        if epsilon is None
        else {
            "of_record": epsilon,
            "at_delta_n2": 9.0,
            "unamplified": 99.0,
            "noise_multiplier": 1.0,
        },
    }


def test_level_key() -> None:
    assert privacy_utility.level_key(_record("a", 0, 0.1, None, False)) == "nondp"
    assert privacy_utility.level_key(_record("a", 0, 0.1, None, True)) == "cliponly"
    assert privacy_utility.level_key(_record("a", 0, 0.1, 8.0, True)) == "eps8"
    assert privacy_utility.level_key(_record("a", 0, 0.1, 30.0, True, "whatif-x5")) == "whatif-x5"


def test_summary_arithmetic_and_h1() -> None:
    records = []
    for seed in range(6):
        records.append(_record("a", seed, 0.040 + 0.001 * seed, None, False))
        records.append(_record("a", seed, 0.030 + 0.001 * seed, 8.0, True))
        records.append(_record("a", seed, 0.039 + 0.001 * seed, None, True))
    records.append({"id": "bad", "status": "failed", "config": {"regime": "a"}})
    block = privacy_utility.summarise(records, most_popular_ndcg=0.020)["a"]
    eps8 = block["levels"]["eps8"]
    assert eps8["seeds"] == 6
    assert eps8["retention"] == pytest.approx(0.0325 / 0.0425)
    assert eps8["personalisation_retained"] == pytest.approx((0.0325 - 0.02) / (0.0425 - 0.02))
    assert eps8["paired"]["seeds_degraded"] == 6
    assert eps8["holm_rejects_no_difference"] is True
    assert eps8["epsilon_of_record"] == 8.0
    assert block["h1"]["met"] is False
    assert "retention" not in block["levels"]["nondp"]
    assert "holm_rejects_no_difference" not in block["levels"]["cliponly"]


def test_h1_met_when_retention_is_high() -> None:
    records = []
    for seed in range(3):
        records.append(_record("a", seed, 0.040, None, False))
        records.append(_record("a", seed, 0.038, 8.0, True))
    assert privacy_utility.summarise(records, 0.02)["a"]["h1"]["met"] is True


def test_grid_end_to_end_on_synthetic_data(paths: Paths) -> None:
    payload = privacy_utility.run(paths, _frozen(), phase="tune", whatif=(4,), workers=1, threads=1)
    assert payload["status"] == "VALID", payload["invalid_reasons"]
    assert payload["evaluated_on"] == "validation"
    # 2 seeds x (nondp + cliponly + eps8) + what-if for min(3, 2) seeds
    assert payload["runs"] == 2 * 3 + 2
    levels = payload["summary"]["small"]["levels"]
    assert set(levels) == {"nondp", "cliponly", "eps8", "whatif-x4"}
    assert levels["nondp"]["ndcg@10_mean"] > payload["baselines"]["most_popular"]["ndcg@10"]
    assert "epsilon_of_record" not in levels["whatif-x4"]  # a simulation claims no epsilon
    assert levels["whatif-x4"]["privacy_claim"] is False
    assert levels["whatif-x4"]["simulated_noise_multiplier"] == pytest.approx(
        levels["eps8"]["noise_multiplier"] / 4
    )
    assert not list((paths.results / "ledger").rglob("*whatif*"))
    assert read_json(paths.results / "privacy_utility.json")["runs"] == payload["runs"]
    again = privacy_utility.run(paths, _frozen(), phase="tune", whatif=(4,), workers=1, threads=1)
    assert again["summary"] == payload["summary"]  # resumed from records, nothing retrained


def test_baselines_table(paths: Paths) -> None:
    payload = baselines.run(paths)
    for split in ("validation", "test"):
        table = payload["phases"][split]
        assert {"most_popular", "item_knn", "item_ridge", "friends"} <= set(table)
        assert table["item_knn"]["ndcg@10"] > table["most_popular"]["ndcg@10"]
        low, high = table["most_popular"]["ndcg_ci95"]
        assert low <= table["most_popular"]["ndcg@10"] <= high
    assert read_json(paths.results / "baselines.json")["experiment"] == "baselines"
