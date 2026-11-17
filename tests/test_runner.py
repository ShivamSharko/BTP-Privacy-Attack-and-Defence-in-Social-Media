"""Experiment runner and grid: records, ledger, gate, resume, failures (plan task M5)."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from prism.config import ModelConfig, RunConfig, TrainConfig
from prism.data.synthetic import write_synthetic_dataset
from prism.experiments.runner import Paths, run_grid, run_one
from prism.io import read_json
from prism.ledger.log import verify_ledger
from prism.ledger.receipts import load_or_create_key, public_key_hex

MODEL = ModelConfig(dim=8)


@pytest.fixture(scope="module")
def paths(tmp_path_factory: pytest.TempPathFactory) -> Paths:
    root: Path = tmp_path_factory.mktemp("runner")
    write_synthetic_dataset(root / "processed")
    return Paths(processed=root / "processed", results=root / "results", keys=root / "keys")


def _config(
    seed: int = 0, epsilon: float | None = 8.0, rounds: int = 6, noise: float = 4.0
) -> RunConfig:
    private = epsilon is not None
    return RunConfig(
        name="unit",
        regime="small",
        phase="tune",
        seed=seed,
        target_epsilon=epsilon,
        model=MODEL,
        train=TrainConfig(
            sample_rate=0.2,
            rounds=rounds,
            server_lr=0.05,
            clip_norm=0.05 if private else None,
            noise_multiplier=noise if private else 0.0,
        ),
    )


def test_private_run_writes_a_complete_record_and_a_verifying_ledger(paths: Paths) -> None:
    record = run_one(_config(), paths)
    assert record["status"] == "ok"
    assert record["rounds_completed"] == 6
    assert record["privacy"]["gate_ok"] is True
    assert 0.0 < record["privacy"]["of_record"] <= 8.0
    assert record["privacy"]["unit"] == "user"
    assert set(record["metrics"]) >= {"ndcg@10", "hr@10", "recall@20", "distinct@10"}
    low, high = record["ndcg_ci95"]
    assert low <= record["metrics"]["ndcg@10"] <= high
    assert len(record["config_hash"]) == 64
    assert record["limitations"]

    saved = read_json(paths.results / "runs" / "unit" / f"{record['id']}.json")
    assert saved == json.loads(json.dumps(record))

    ledger_path = paths.results / record["ledger"]["path"]
    key = load_or_create_key(paths.keys / "ledger_ed25519.pem")
    report = verify_ledger(ledger_path, public_key_hex(key))
    assert report.ok, report.errors
    lines = [json.loads(line) for line in ledger_path.read_text(encoding="utf-8").splitlines()]
    kinds = [line["receipt"]["kind"] for line in lines if line["type"] == "leaf"]
    assert kinds == ["round"] * 6 + ["release"]
    assert lines[-1]["type"] == "checkpoint"
    assert record["ledger"]["root_hex"] == lines[-1]["root_hex"]


def test_receipts_hold_only_data_independent_fields(paths: Paths) -> None:
    record = run_one(_config(seed=1), paths)
    ledger_path = paths.results / record["ledger"]["path"]
    for line in ledger_path.read_text(encoding="utf-8").splitlines():
        entry = json.loads(line)
        if entry["type"] != "leaf":
            continue
        receipt = entry["receipt"]
        # The realised cohort size and update norms depend on who took part: never published.
        assert not {"cohort", "mean_norm", "clipped_fraction"} & set(receipt)
        assert receipt["config_hash"] == record["config_hash"]


def test_non_private_run_has_no_privacy_claim_and_valid_json(paths: Paths) -> None:
    record = run_one(_config(epsilon=None), paths)
    assert record["status"] == "ok"
    assert record["privacy"] is None
    text = (paths.results / "runs" / "unit" / f"{record['id']}.json").read_text(encoding="utf-8")
    assert "Infinity" not in text and "NaN" not in text


def test_gate_halts_a_run_that_asks_for_more_rounds_than_its_noise_supports(paths: Paths) -> None:
    # Noise 2.0 at q = 0.2 supports far fewer than 400 rounds within epsilon = 2.
    record = run_one(_config(seed=2, epsilon=2.0, rounds=400, noise=2.0), paths)
    assert record["status"] == "ok"
    assert record["halted_by_gate"] is True
    assert 0 < record["rounds_completed"] < 400
    assert record["privacy"]["of_record"] <= 2.0
    ledger_path = paths.results / record["ledger"]["path"]
    kinds = [
        json.loads(line)["receipt"]["kind"]
        for line in ledger_path.read_text(encoding="utf-8").splitlines()
        if json.loads(line)["type"] == "leaf"
    ]
    assert kinds.count("refusal") == 1
    assert kinds[-1] == "release"
    assert kinds.count("round") == record["rounds_completed"]


def test_same_config_gives_the_same_metrics(paths: Paths) -> None:
    one = run_one(_config(seed=3), paths)
    two = run_one(_config(seed=3), paths)
    assert one["metrics"] == two["metrics"]
    assert one["model_sha256"] == two["model_sha256"]


def test_grid_resumes_and_records_failures(paths: Paths, monkeypatch: pytest.MonkeyPatch) -> None:
    configs = [_config(seed=10), _config(seed=11)]
    first = run_grid(configs, paths, workers=1, threads=1)
    assert [r["status"] for r in first] == ["ok", "ok"]
    assert all(not r["skipped"] for r in first)
    second = run_grid(configs, paths, workers=1, threads=1)
    assert all(r["skipped"] for r in second)

    import prism.experiments.runner as runner

    def explode(*args: object, **kwargs: object) -> None:
        raise RuntimeError("simulated failure")

    monkeypatch.setattr(runner, "train", explode)
    failed = run_grid([_config(seed=12)], paths, workers=1, threads=1)
    assert failed[0]["status"] == "failed"
    assert "simulated failure" in failed[0]["error"]
    saved = read_json(paths.results / "runs" / "unit" / f"{failed[0]['id']}.json")
    assert saved["status"] == "failed"
    monkeypatch.undo()
    # A failed run is retried, not skipped.
    retried = run_grid([_config(seed=12)], paths, workers=1, threads=1)
    assert retried[0]["status"] == "ok" and not retried[0]["skipped"]


def test_a_run_whose_first_round_is_over_budget_trains_nothing_and_releases_nothing(
    paths: Paths,
) -> None:
    record = run_one(_config(seed=4, epsilon=0.5, rounds=5, noise=0.9), paths)
    assert record["status"] == "refused_before_first_round"
    assert record["rounds_completed"] == 0
    assert record["ledger"] is None
    ledger_path = paths.results / "ledger" / "unit" / f"{record['id']}.jsonl"
    kinds = [
        json.loads(line)["receipt"]["kind"]
        for line in ledger_path.read_text(encoding="utf-8").splitlines()
        if json.loads(line)["type"] == "leaf"
    ]
    assert kinds == ["refusal"]


def test_refused_run_leaves_no_checkpoint(paths: Paths) -> None:
    """Review finding m5: a model that was not released must not be left on disk."""
    config = _config(seed=5, epsilon=0.5, rounds=5, noise=0.9)
    record = run_one(config, paths)
    assert record["status"] == "refused_before_first_round"
    assert not paths.checkpoint(config).exists()
    released = _config(seed=6)
    assert run_one(released, paths)["status"] == "ok"
    assert paths.checkpoint(released).exists()


def test_receipts_record_the_divisor_training_really_used(paths: Paths) -> None:
    """Review finding m3: with availability the expected cohort is rate x sum(availability)."""
    import numpy as np

    config = _config(seed=7)
    availability = np.full(400, 0.5)
    record = run_one(config, paths, availability=availability)
    ledger_path = paths.results / record["ledger"]["path"]
    first = json.loads(ledger_path.read_text(encoding="utf-8").splitlines()[0])["receipt"]
    assert first["expected_cohort"] == pytest.approx(0.2 * 400 * 0.5)


def test_records_identify_the_code_and_stale_records_are_flagged(
    paths: Paths, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Review finding M2: a record must say which code produced it, and reuse must be visible."""
    import prism.experiments.runner as runner

    config = _config(seed=8)
    record = run_grid([config], paths, workers=1, threads=1)[0]
    assert len(record["provenance"]["code_sha256"]) == 64
    assert record["provenance"]["git_dirty"] in (True, False, None)
    again = run_grid([config], paths, workers=1, threads=1)[0]
    assert again["skipped"] and again["stale_code"] is False

    monkeypatch.setattr(runner, "code_sha256", lambda: "0" * 64)
    reused = run_grid([config], paths, workers=1, threads=1)[0]
    assert reused["skipped"] and reused["stale_code"] is True
    monkeypatch.setenv("PRISM_STRICT_RESUME", "1")
    rerun = run_grid([config], paths, workers=1, threads=1)[0]
    assert not rerun["skipped"]
    assert rerun["provenance"]["code_sha256"] == "0" * 64
