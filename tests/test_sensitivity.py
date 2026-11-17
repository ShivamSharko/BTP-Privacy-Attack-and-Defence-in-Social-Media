"""Sensitivity analyses: list-length readout, conclusion stability, end-to-end on synthetic data."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

import prism.experiments.calibration as calibration
from prism.config import ModelConfig
from prism.data import variants as variant_module
from prism.data.synthetic import write_synthetic_dataset
from prism.data.variants import VARIANTS, Variant, variant_dir
from prism.experiments import runner, sensitivity
from prism.experiments.regimes import Frozen, RegimeSpec
from prism.io import read_json


def _record(
    seed: int, epsilon: float | None, ndcg10: float, ndcg20: float | None, regime: str = "small"
) -> dict[str, Any]:
    metrics: dict[str, float] = {"ndcg@10": ndcg10, "hr@10": 0.2, "distinct@10": 50.0}
    if ndcg20 is not None:
        metrics["ndcg@20"] = ndcg20
        metrics["hr@20"] = 0.3
    return {
        "id": f"{regime}-{seed}-{epsilon}",
        "status": "ok",
        "config": {
            "regime": regime,
            "seed": seed,
            "variant": "main",
            "target_epsilon": epsilon,
            "train": {"clip_norm": None if epsilon is None else 1.0},
        },
        "metrics": metrics,
    }


def test_list_length_readout_arithmetic() -> None:
    records = [
        _record(0, None, 0.04, 0.05),
        _record(1, None, 0.06, 0.07),
        _record(0, 8.0, 0.03, 0.04),
        _record(1, 8.0, 0.05, 0.06),
    ]
    readout = sensitivity.list_length_readout(records, "small", 8.0)
    assert readout["ndcg@10"] == pytest.approx(0.04 / 0.05)
    assert readout["ndcg@20"] == pytest.approx(0.05 / 0.06)
    assert readout["hr@20"] == pytest.approx(1.0)


def test_list_length_readout_is_none_without_ndcg20_or_pairs() -> None:
    records = [
        _record(0, None, 0.04, None),
        _record(1, None, 0.06, 0.07),
        _record(0, 8.0, 0.03, 0.04),
        _record(1, 8.0, 0.05, 0.06),
    ]
    readout = sensitivity.list_length_readout(records, "small", 8.0)
    assert readout["ndcg@20"] is None and readout["ndcg@10"] == pytest.approx(0.8)
    assert sensitivity.list_length_readout(records, "small", 1.0)["ndcg@10"] is None
    assert sensitivity.list_length_readout(records, "large", 8.0)["ndcg@10"] is None


def _block(met: bool | None, personalisation: float | None) -> dict[str, Any]:
    return {"h1_met": met, "epsilons": {"8": {"personalisation_retained": personalisation}}}


def test_conclusion_stable_readout() -> None:
    reference = _block(False, 0.6)
    same = sensitivity.conclusion_stable(_block(False, 0.3), reference)
    assert same == {"h1_verdict_same": True, "personalisation_sign_same": True, "stable": True}
    h1_flip = sensitivity.conclusion_stable(_block(True, 0.9), reference)
    assert h1_flip["h1_verdict_same"] is False and h1_flip["stable"] is False
    sign_flip = sensitivity.conclusion_stable(_block(False, -0.2), reference)
    assert sign_flip["personalisation_sign_same"] is False and sign_flip["stable"] is False
    unknown = sensitivity.conclusion_stable(_block(False, 0.3), None)
    assert unknown == {"h1_verdict_same": None, "personalisation_sign_same": None, "stable": None}
    assert sensitivity.conclusion_stable(_block(None, 0.3), reference)["stable"] is None


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


@pytest.fixture
def synthetic(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Two synthetic 'variants' written where variant_dir puts them; the build step is a no-op."""
    registry = {"va": Variant("va"), "vb": Variant("vb", k_core=10)}
    for index, variant in enumerate(registry.values()):
        write_synthetic_dataset(
            variant_dir(tmp_path, variant), n_users=150 + 30 * index, n_items=200, seed=index
        )
    for name, variant in registry.items():
        monkeypatch.setitem(VARIANTS, name, variant)
    monkeypatch.setattr(sensitivity, "build_variant", lambda root, variant, force=False: {})
    # ample noise keeps epsilon far below the budget, so no slow round search
    monkeypatch.setattr(calibration, "calibrate_noise", lambda *args: 6.0)
    monkeypatch.setattr(runner, "max_rounds_within", lambda budget, rate, noise, n, upper: upper)
    return tmp_path


def test_run_end_to_end_on_two_synthetic_variants(synthetic: Path) -> None:
    payload = sensitivity.run(
        synthetic, _frozen(), variants=("va", "vb"), seeds=(0, 1), epsilons=(8.0,), workers=1,
        threads=1,
    )  # fmt: skip
    assert payload["status"] == "VALID", payload["invalid_reasons"]
    assert all(c["passed"] for c in payload["controls"])
    assert {c["variant"] for c in payload["controls"]} == {"va", "vb"}
    results = payload["results"]
    assert set(results) == {"va", "vb"}  # no reference row without a main privacy_utility.json
    for name, users in (("va", 150), ("vb", 180)):
        row = results[name]["small"]
        assert row["users"] == users and row["items"] == 200 and row["interactions"] > users
        assert row["nondp_ndcg@10"] >= 1.1 * row["most_popular_ndcg@10"]
        assert row["item_ridge_ndcg@10"] > 0
        assert set(row["epsilons"]) == {"8"}
        eps8 = row["epsilons"]["8"]
        assert eps8["retention"] == pytest.approx(eps8["ndcg@10"] / row["nondp_ndcg@10"], rel=1e-6)
        assert eps8["retention_ndcg@20"] is not None
        assert "personalisation_retained" in eps8
        assert row["conclusion_stable"]["stable"] is None
    assert len(list((synthetic / "results" / "sensitivity" / "va" / "runs").rglob("*.json"))) == 4
    written = read_json(synthetic / "results" / "sensitivity.json")
    assert written["experiment"] == "sensitivity" and written["status"] == "VALID"
    for key in ("settings", "limitations", "provenance", "wall_seconds", "invalid_reasons"):
        assert key in written
    assert any("frozen" in s.lower() or "re-tun" in s.lower() for s in written["limitations"])
    assert "u00" not in json.dumps(written)


def test_reference_row_comes_from_the_main_run_records(synthetic: Path) -> None:
    main = synthetic / "results"
    runs = main / "runs" / "privacy_utility"
    runs.mkdir(parents=True)
    for seed, nondp, eps in ((0, 0.04, 0.03), (1, 0.06, 0.05), (2, 0.5, 0.4)):
        for epsilon, ndcg in ((None, nondp), (8.0, eps)):
            record = _record(seed, epsilon, ndcg, ndcg + 0.01)
            record["config"]["phase"] = "final"
            record["config"]["name"] = "privacy_utility"
            (runs / f"{record['id']}.json").write_text(json.dumps(record), encoding="utf-8")
    (main / "privacy_utility.json").write_text(
        json.dumps(
            {"baselines": {"most_popular": {"ndcg@10": 0.02}, "item_ridge": {"ndcg@10": 0.05}}}
        ),
        encoding="utf-8",
    )
    payload = sensitivity.run(
        synthetic, _frozen(), variants=("va",), seeds=(0, 1), epsilons=(8.0,), workers=1, threads=1
    )
    reference = payload["results"]["k15"]["small"]
    assert reference["seeds"] == [0, 1]  # seed 2 is not part of this run
    assert reference["nondp_ndcg@10"] == pytest.approx(0.05)
    assert reference["epsilons"]["8"]["retention"] == pytest.approx(0.04 / 0.05)
    assert reference["epsilons"]["8"]["retention_ndcg@20"] == pytest.approx(0.05 / 0.06)
    assert reference["most_popular_ndcg@10"] == 0.02
    stable = payload["results"]["va"]["small"]["conclusion_stable"]
    assert set(stable) == {"h1_verdict_same", "personalisation_sign_same", "stable"}
    assert stable["stable"] in (True, False)


def test_invalid_when_control_fails(synthetic: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    def hopeless(*args: Any, **kwargs: Any) -> dict[str, Any]:
        return {
            "most_popular": {"ndcg@10": 10.0},
            "item_ridge": {"ndcg@10": 10.0},
        }

    monkeypatch.setattr(sensitivity, "evaluate_baselines", hopeless)
    payload = sensitivity.run(
        synthetic, _frozen(), variants=("va",), seeds=(0, 1), epsilons=(8.0,), workers=1, threads=1
    )
    assert payload["status"] == "INVALID"
    assert any("va" in reason for reason in payload["invalid_reasons"])
    assert not payload["controls"][0]["passed"]
    assert read_json(synthetic / "results" / "sensitivity.json")["status"] == "INVALID"


def test_cli_build_only_prints_summaries(
    synthetic: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    built: list[str] = []

    def fake_build(root: Path, variant: Variant, force: bool = False) -> dict[str, Any]:
        built.append(variant.name)
        return {"variant": variant.name, "users": 7}

    monkeypatch.setattr(sensitivity, "build_variant", fake_build)
    assert sensitivity.cli(["--root", str(synthetic), "--variants", "va,vb", "--build-only"]) == 0
    assert built == ["va", "vb"]
    assert '"users": 7' in capsys.readouterr().out
    assert variant_module.VARIANTS["va"].name == "va"
