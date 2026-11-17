"""RQ5 / H5: participation bias experiment, end to end on the synthetic dataset."""

from __future__ import annotations

import shutil
from pathlib import Path
from typing import Any

import numpy as np
import pytest

from prism.config import ModelConfig
from prism.experiments import participation
from prism.experiments.participation import cohort_check, run
from prism.experiments.regimes import Frozen, RegimeSpec
from prism.experiments.runner import Paths
from prism.io import read_json

SCENARIOS = ("always", "independent", "activity", "social")


def _frozen(rounds: int = 20) -> Frozen:
    return Frozen(
        version=1,
        tuned_on="unit test",
        model=ModelConfig(dim=8),
        regimes={
            "small": RegimeSpec(
                sample_rate=0.3, rounds=rounds, server_opt="adam", server_lr=0.05, clip_norm=0.5
            )
        },
        epsilons=(8.0,),
        seeds=(0, 1),
    )


def _paths(root: Path) -> Paths:
    return Paths(processed=root / "processed", results=root / "results", keys=root / "keys")


@pytest.fixture(scope="module")
def setup(tmp_path_factory: pytest.TempPathFactory) -> tuple[Paths, dict[str, Any]]:
    from prism.data.synthetic import write_synthetic_dataset

    root = tmp_path_factory.mktemp("participation")
    write_synthetic_dataset(root / "processed")
    paths = _paths(root)
    result = run(
        paths, _frozen(), scenarios=SCENARIOS, epsilons=(None,), seeds=(0, 1), workers=2, threads=1
    )
    return paths, result


def test_cohort_check_logic() -> None:
    ratio, ok = cohort_check(mean_cohort=57.0, sample_rate=0.3, availability_sum=200.0)
    assert ok and ratio == pytest.approx(0.95)
    assert cohort_check(40.0, 0.3, 200.0)[1] is False
    assert cohort_check(70.0, 0.3, 200.0)[1] is False
    assert cohort_check(0.0, 0.3, 0.0)[1] is False


def test_end_to_end_has_every_key(setup: tuple[Paths, dict[str, Any]]) -> None:
    paths, result = setup
    assert result["experiment"] == "participation"
    assert result["status"] == "VALID", result["invalid_reasons"]
    assert set(result) >= {
        "experiment", "status", "invalid_reasons", "controls", "settings", "results",
        "limitations", "wall_seconds",
    }  # fmt: skip
    assert set(result["controls"]) == {"sampling", "baseline"}
    for control in result["controls"].values():
        assert control["passed"] is True
    saved = read_json(paths.results / "participation.json")
    assert saved["status"] == "VALID"

    cells = result["results"]["cells"]
    assert set(cells) == set(SCENARIOS)
    for scenario in SCENARIOS:
        cell = cells[scenario]["nondp"]
        assert set(cell["overall_ndcg10"]) == {"mean", "min", "max"}
        assert len(cell["activity_groups_ndcg10"]) == 3
        assert len(cell["degree_groups_ndcg10"]) == 3
        assert set(cell["activity_gap"]) >= {"mean", "seed0"}
        assert set(cell["activity_gap"]["seed0"]) == {"gap", "low", "high"}
        assert set(cell["degree_gap"]) >= {"mean", "seed0"}
        assert cell["epsilon_note"]
    assert cells["always"]["nondp"]["gap_change_vs_independent"]["activity"] is not None
    for scenario in ("activity", "social"):
        change = cells[scenario]["nondp"]["gap_change_vs_independent"]
        assert set(change) == {"activity", "degree"}
        assert "wilcoxon_two_sided_p" in change["activity"]
        assert "mean_difference" in change["degree"]
    assert cells["independent"]["nondp"]["gap_change_vs_independent"] is None

    availability = result["results"]["availability"]
    assert set(availability) == set(SCENARIOS)
    act = availability["activity"]["activity_groups"]
    assert act[0] < act[2]
    assert availability["always"]["activity_groups"] == [1.0, 1.0, 1.0]
    assert set(result["results"]["h5"]) >= {"holds", "activity", "social"}
    text = " ".join(result["limitations"])
    assert "NOMINAL" in text and "synthetic" in text


def test_sampling_control_uses_seed_zero(setup: tuple[Paths, dict[str, Any]]) -> None:
    _, result = setup
    rows = result["controls"]["sampling"]["measured"]
    assert {row["scenario"] for row in rows} == set(SCENARIOS)
    for row in rows:
        assert 0.85 <= row["ratio"] <= 1.15


def test_missing_friend_graph_skips_social(
    setup: tuple[Paths, dict[str, Any]], tmp_path: Path
) -> None:
    paths, _ = setup
    root = tmp_path / "copy"
    shutil.copytree(paths.processed, root / "processed")
    (root / "processed" / "friends.npz").unlink()
    copy = _paths(root)
    result = run(
        copy, _frozen(), scenarios=SCENARIOS, epsilons=(None,), seeds=(0,), workers=1, threads=1
    )
    assert "social" not in result["results"]["cells"]
    assert "social" not in result["results"]["availability"]
    cell = result["results"]["cells"]["activity"]["nondp"]
    assert cell["degree_gap"] is None and cell["degree_groups_ndcg10"] is None
    assert "friend graph" in " ".join(result["results"]["notes"])
    assert result["results"]["h5"]["social"] is None


def test_failed_control_makes_the_result_invalid(
    setup: tuple[Paths, dict[str, Any]], monkeypatch: pytest.MonkeyPatch
) -> None:
    paths, _ = setup

    def oracle(train_items: Any, n_items: int) -> Any:
        from prism.data.bundle import load_bundle

        targets = load_bundle(paths.processed).targets("final")

        def score(users: np.ndarray) -> np.ndarray:
            out = np.zeros((users.size, n_items), dtype=np.float32)
            for row, user in enumerate(users):
                out[row, targets[int(user)]] = 1e9
            return out

        return score

    monkeypatch.setattr(participation, "popularity_score_fn", oracle)
    result = run(
        paths, _frozen(), scenarios=("always",), epsilons=(None,), seeds=(0,), workers=1, threads=1
    )
    assert result["status"] == "INVALID"
    assert result["controls"]["baseline"]["passed"] is False
    assert any("baseline" in reason for reason in result["invalid_reasons"])
    assert (paths.results / "participation.json").exists()


def _gaps(values: list[float]) -> dict[int, dict[str, float]]:
    return {seed: {"gap": value} for seed, value in enumerate(values)}


def _change(treated: list[float], control: list[float]) -> dict[str, Any]:
    change = participation._change(_gaps(treated), _gaps(control))
    assert change is not None
    return change


def test_h5_holds_only_when_every_seed_widens() -> None:
    base = [0.01] * 5
    all_up = _change([0.02, 0.03, 0.02, 0.04, 0.02], base)
    four_up = _change([0.02, 0.03, 0.02, 0.04, 0.005], base)
    result = participation.h5_readout({"8": all_up}, {"8": four_up})
    assert result["holds_activity"] is True and result["holds_social"] is False
    assert result["holds"] is True
    entry = result["activity"]["8"]
    assert entry["seeds"] == 5 and entry["seeds_improved"] == 5 and entry["seeds_degraded"] == 0
    assert entry["sign_test_p_all_improved"] == pytest.approx(0.03125)
    assert entry["wilcoxon_two_sided_p"] >= 0.0625 - 1e-12
    assert "underpowered" in entry["wilcoxon_note"] and "0.0625" in entry["wilcoxon_note"]
    assert "5 of 5" in result["rule"]
    assert result["social"]["8"]["sign_test_p_all_improved"] == 1.0

    none = participation.h5_readout({"8": four_up}, {"8": four_up})
    assert none["holds"] is False and none["holds_activity"] is False
    only_social = participation.h5_readout({"8": four_up}, {"8": all_up})
    assert only_social["holds_social"] is True and only_social["holds"] is True


def test_h5_any_epsilon_level_counts_and_missing_social() -> None:
    base = [0.01] * 3
    up = _change([0.02, 0.02, 0.02], base)
    down = _change([0.0, 0.0, 0.0], base)
    result = participation.h5_readout({"nondp": down, "8": up}, None)
    assert result["holds_activity"] is True
    assert result["social"] is None and result["holds_social"] is False
    assert participation.h5_readout({}, None)["holds"] is False


def test_privacy_marker_and_note() -> None:
    assert participation.privacy_marker("independent", 8.0) == "exact"
    assert participation.privacy_marker("always", 8.0) == "exact"
    assert participation.privacy_marker("activity", None) == "exact"
    for scenario in ("activity", "social"):
        marker = participation.privacy_marker(scenario, 8.0)
        assert "NOMINAL" in marker and "rank" in marker
        assert "NOMINAL" in participation.epsilon_note(scenario, 8.0)
    text = " ".join(participation.LIMITATIONS)
    assert "rank" in text and "other users" in text
    assert "without a" in text and "nominal" in text
    assert "predate the commit" in text


def test_run_records_carry_the_availability_marker(tmp_path: Path) -> None:
    from prism.data.synthetic import write_synthetic_dataset
    from prism.experiments.regimes import make_run

    write_synthetic_dataset(tmp_path / "processed")
    paths = _paths(tmp_path)
    config = make_run(
        _frozen(), name="participation", regime="small", phase="final", seed=0, epsilon=None,
        n_users=400, paths=paths, variant="activity",
    )  # fmt: skip
    record = participation._worker(config, paths, "activity", 1, privacy_note="a note")
    assert record["status"] == "ok", record
    assert record["availability_scenario"] == "activity"
    assert record["privacy_note"] == "a note"


def test_resume_reruns_when_the_checkpoint_is_missing(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    from prism.data.synthetic import write_synthetic_dataset

    write_synthetic_dataset(tmp_path / "processed")
    paths = _paths(tmp_path)
    calls: list[str] = []
    real = participation.run_one

    def counting(*args: Any, **kwargs: Any) -> dict[str, Any]:
        calls.append("run")
        return real(*args, **kwargs)  # type: ignore[no-any-return]

    monkeypatch.setattr(participation, "run_one", counting)

    def go() -> None:
        run(
            paths, _frozen(), scenarios=("independent",), epsilons=(None,), seeds=(0,),
            workers=1, threads=1,
        )  # fmt: skip

    go()
    assert len(calls) == 1
    go()
    assert len(calls) == 1  # finished: reused
    for checkpoint in (tmp_path / "processed" / "models").rglob("*.npz"):
        checkpoint.unlink()
    go()
    assert len(calls) == 2  # checkpoint gone: rerun


# ---------------------------------------------------------------- trace-based scenarios

TRACE_SCENARIOS = ("trace", "trace_activity", "trace_replay")
ALL_SEVEN = SCENARIOS + TRACE_SCENARIOS


def _write_trace_file(path: Path, devices: int = 60, finish: int = 86_400) -> Path:
    import collections
    import pickle

    rng = np.random.default_rng(11)
    entries: dict[int, dict[str, Any]] = {}
    for device in range(devices):
        share = 0.1 + 0.8 * device / devices
        n = int(rng.integers(2, 6))
        width = int(finish * share / n)
        starts = np.sort(rng.choice(np.arange(n) * (finish // n), size=n, replace=False))
        ends = starts + width
        entries[device] = {
            "duration": finish,
            "inactive": [int(e) for e in ends],
            "finish_time": finish,
            "active": [int(s) for s in starts],
            "model": "synthetic",
        }
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "wb") as handle:
        pickle.dump(collections.OrderedDict(entries), handle)
    return path


@pytest.fixture(scope="module")
def trace_setup(tmp_path_factory: pytest.TempPathFactory) -> tuple[Paths, dict[str, Any], Path]:
    from prism.data.synthetic import write_synthetic_dataset

    root = tmp_path_factory.mktemp("participation_trace")
    write_synthetic_dataset(root / "processed")
    paths = _paths(root)
    trace_path = _write_trace_file(root / "trace" / "client_behave_trace")
    result = run(
        paths, _frozen(rounds=12), scenarios=("independent", *TRACE_SCENARIOS),
        epsilons=(None,), seeds=(0, 1), workers=2, threads=1, trace_path=trace_path,
    )  # fmt: skip
    return paths, result, trace_path


def test_default_scenarios_are_the_four_plus_three() -> None:
    import inspect

    parameters = inspect.signature(run).parameters
    assert tuple(parameters["scenarios"].default) == ALL_SEVEN
    assert parameters["trace_path"].default is None


def test_trace_scenarios_end_to_end(trace_setup: tuple[Paths, dict[str, Any], Path]) -> None:
    paths, result, _ = trace_setup
    assert result["status"] == "VALID", result["invalid_reasons"]
    cells = result["results"]["cells"]
    assert set(cells) == {"independent", *TRACE_SCENARIOS}
    for scenario in TRACE_SCENARIOS:
        cell = cells[scenario]["nondp"]
        assert len(cell["activity_groups_ndcg10"]) == 3
        assert len(cell["degree_groups_ndcg10"]) == 3
        assert set(cell["activity_gap"]) >= {"mean", "seed0"}
        assert set(cell["degree_gap"]) >= {"mean", "seed0"}
        change = cell["gap_change_vs_independent"]
        assert set(change) == {"activity", "degree"}
        assert "wilcoxon_two_sided_p" in change["activity"]
    assert cells["trace_activity"]["nondp"]["gap_change_vs_trace"]["activity"] is not None
    assert cells["trace"]["nondp"]["gap_change_vs_trace"] is None
    availability = result["results"]["availability"]
    for scenario in TRACE_SCENARIOS:
        assert set(availability[scenario]) >= {"mean", "activity_groups", "degree_groups"}
    groups = availability["trace_activity"]["activity_groups"]
    assert groups[0] < groups[2]
    settings = result["settings"]
    assert settings["trace"]["seconds_per_round"] == 1800
    assert settings["trace"]["summary"]["devices"] == 60
    saved = read_json(paths.results / "participation.json")
    assert set(saved["results"]["cells"]) == set(cells)
    rows = result["controls"]["sampling"]["measured"]
    assert {row["scenario"] for row in rows} == {"independent", *TRACE_SCENARIOS}


def test_trace_readout_and_limitations(trace_setup: tuple[Paths, dict[str, Any], Path]) -> None:
    _, result, _ = trace_setup
    readout = result["results"]["trace_readout"]
    overall = readout["overall_ndcg10"]["nondp"]
    for key in ("trace", "trace_replay", "independent"):
        assert overall[key] > 0
    assert overall["always"] is None  # not run here
    assert overall["trace_minus_always"] is None
    assert overall["trace_minus_independent"] == pytest.approx(
        overall["trace"] - overall["independent"]
    )
    widen = readout["rank_matching_widens_activity_gap"]["nondp"]
    assert isinstance(widen["all_seeds_widened"], bool)
    assert widen["seeds"] == 2
    text = " ".join(result["limitations"])
    for phrase in ("different population", "30 minutes", "107,749", "research use"):
        assert phrase in text


def test_replay_record_stores_the_lr_factor(
    trace_setup: tuple[Paths, dict[str, Any], Path],
) -> None:
    paths, _, _ = trace_setup
    from prism.experiments.regimes import make_run

    config = make_run(
        _frozen(rounds=12), name="participation", regime="small", phase="final", seed=0, epsilon=None,
        n_users=400, paths=paths, variant="trace_replay",
    )  # fmt: skip
    folder = paths.results / "runs" / "participation"
    records = [read_json(p) for p in folder.glob("*trace_replay*seed0*")]
    assert records and records[0]["availability_scenario"] == "trace_replay"
    factor = records[0]["server_lr_factor"]
    # Only SGD runs are rescaled; Adam normalises the smaller average by itself.
    if config.train.server_opt == "sgd":
        assert factor > 1.0
    else:
        assert factor == 1.0
    assert records[0]["config"]["train"]["server_lr"] == pytest.approx(
        config.train.server_lr * factor
    )


def test_trace_scenarios_skipped_without_the_file(
    trace_setup: tuple[Paths, dict[str, Any], Path], tmp_path: Path
) -> None:
    paths, _, _ = trace_setup
    result = run(
        paths, _frozen(rounds=12), scenarios=("independent", *TRACE_SCENARIOS), epsilons=(None,),
        seeds=(0,), workers=1, threads=1, trace_path=tmp_path / "missing",
    )  # fmt: skip
    assert result["status"] == "VALID", result["invalid_reasons"]
    assert set(result["results"]["cells"]) == {"independent"}
    assert "trace" in " ".join(result["results"]["notes"])
    assert result["results"]["trace_readout"] is None
    assert result["settings"]["trace"] is None


def test_replay_hook_zeroes_exactly_the_unavailable_rows() -> None:
    import torch

    schedule = np.array([[True, False, True, False], [False, False, True, True]])
    hook = participation.replay_hook(schedule)
    users = np.array([3, 0, 1, 2], dtype=np.int64)
    deltas = torch.arange(1, 13, dtype=torch.float32).reshape(4, 3)
    flat = torch.zeros(3)
    out = hook(users, deltas, flat, 1)  # rounds are 1-based: schedule row 0
    assert out.shape == deltas.shape
    keep = schedule[0, users]
    assert keep.tolist() == [False, True, False, True]
    keep_t = torch.from_numpy(keep)
    assert torch.equal(out[keep_t], deltas[keep_t])
    assert torch.all(out[~keep_t] == 0)
    keep2 = torch.from_numpy(schedule[1, users])
    out2 = hook(users, deltas, flat, 2)
    assert torch.equal(out2[keep2], deltas[keep2]) and torch.all(out2[~keep2] == 0)
    bad = deltas.clone()
    bad[0, 0] = float("nan")  # an unavailable client's non-finite row must come out as zeros
    assert torch.all(hook(users, bad, flat, 1)[0] == 0)


def test_server_lr_factor_is_inverse_mean_availability() -> None:
    schedule = np.zeros((10, 4), dtype=bool)
    schedule[:, 0] = True
    schedule[:5, 1] = True
    assert participation.server_lr_factor(schedule) == pytest.approx(1 / 0.375)
    with pytest.raises(ValueError):
        participation.server_lr_factor(np.zeros((3, 3), dtype=bool))


def test_trace_epsilon_notes_and_markers() -> None:
    for scenario in ("trace", "trace_replay"):
        assert participation.privacy_marker(scenario, 8.0) == "exact"
        note = participation.epsilon_note(scenario, 8.0)
        assert "EXACT" in note and "NOMINAL" not in note
    assert "NOMINAL" in participation.epsilon_note("trace_activity", 8.0)
    assert "NOMINAL" in participation.privacy_marker("trace_activity", 8.0)
    assert participation.privacy_marker("trace_activity", None) == "exact"
    assert participation.epsilon_note("trace", None) == "non-private run"
