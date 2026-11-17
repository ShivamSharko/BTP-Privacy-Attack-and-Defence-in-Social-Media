"""Gossip versus federated training on the same node population (RQ2 / H2)."""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path
from typing import Any

import numpy as np
import pytest

from prism.config import ModelConfig
from prism.data.bundle import load_bundle
from prism.data.synthetic import write_synthetic_dataset
from prism.eval.baselines import popularity_score_fn
from prism.eval.metrics import ranking_metrics_per_user
from prism.experiments.gossip import build_controls, cli, run, sample_nodes, summary_lines
from prism.experiments.regimes import Frozen, RegimeSpec
from prism.experiments.runner import Paths, run_one
from prism.fl.gossip import gossip_train
from prism.io import read_json

LEARNING_RATE = 0.02
TOP_KEYS = {
    "experiment",
    "status",
    "invalid_reasons",
    "controls",
    "settings",
    "results",
    "limitations",
    "wall_seconds",
}
RESULT_KEYS = {
    "gossip_ndcg10",
    "federated_ndcg10",
    "most_popular_ndcg10",
    "gap",
    "bytes",
    "epsilon_claimed",
    "local_noise_multiplier",
}


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
                momentum=0.9,
            )
        },
        epsilons=(8.0,),
        seeds=(0,),
    )


@pytest.fixture(scope="module")
def paths(tmp_path_factory: pytest.TempPathFactory) -> Paths:
    root: Path = tmp_path_factory.mktemp("gossip-experiment")
    write_synthetic_dataset(root / "processed")
    return Paths(processed=root / "processed", results=root / "results", keys=root / "keys")


def _cheap_noise(
    sample_rate: float, rounds: int, n_users: int, target_epsilon: float, cache: Path
) -> float:
    """Stand-in for the slow calibration: noise large enough to stay inside epsilon 8."""
    del rounds, n_users, target_epsilon, cache
    return 2.3 if sample_rate >= 1.0 else 1.2


@pytest.fixture(scope="module")
def output(paths: Paths) -> Iterator[dict[str, Any]]:
    patch = pytest.MonkeyPatch()
    patch.setattr("prism.experiments.gossip.noise_for", _cheap_noise)
    patch.setattr("prism.experiments.regimes.noise_for", _cheap_noise)
    try:
        yield run(
            paths,
            _frozen(),
            n_nodes=150,
            rounds=20,
            degree=4,
            epsilons=(None, 8.0),
            seeds=(0,),
            lr=LEARNING_RATE,
        )
    finally:
        patch.undo()


def test_every_key_is_present_and_written(paths: Paths, output: dict[str, Any]) -> None:
    assert set(output) >= TOP_KEYS
    assert output["experiment"] == "gossip"
    saved = read_json(paths.results / "gossip.json")
    assert saved["status"] == output["status"]
    assert output["limitations"] and output["wall_seconds"] > 0
    results = output["results"]
    assert {"nonprivate", "8.0"} <= set(results["by_epsilon"])
    for entry in results["by_epsilon"].values():
        assert set(entry) >= RESULT_KEYS
    assert results["nodes"] == 150
    assert 0.0 <= results["friend_peer_share"] <= 1.0
    assert results["mean_degree"] > 0.0
    assert results["h2"]["epsilon"] == 8.0
    settings = output["settings"]
    assert settings["phase"] == "final"
    assert settings["optimiser"] == "adam"
    assert settings["mix_moments"] is True
    controls = output["controls"]
    assert controls["gossip_beats_untrained"]["gating"] is True
    assert controls["gossip_learns"]["gating"] is False
    assert controls["gossip_learns"]["reason"]
    assert controls["gossip_share_of_federated"]["gating"] is False
    sent = results["by_epsilon"]["nonprivate"]["bytes"]
    assert sent["gossip_per_node_per_round"] == 3 * 4 * sent["parameters"] * 4
    assert settings["lr"] == LEARNING_RATE


def test_numbers_are_consistent(output: dict[str, Any]) -> None:
    private = output["results"]["by_epsilon"]["8.0"]
    gap = private["gap"]
    assert gap["ci95"][0] <= gap["mean"] <= gap["ci95"][1]
    expected = private["federated_ndcg10"]["mean"] - private["gossip_ndcg10"]["mean"]
    assert gap["mean"] == pytest.approx(expected, abs=1e-9)
    assert private["local_noise_multiplier"] > 0.0
    assert private["epsilon_claimed"]["gossip_local"] <= 8.0 + 1e-6
    assert private["epsilon_claimed"]["federated"] is not None
    sizes = private["bytes"]
    assert sizes["gossip_per_node_per_round"] == 3 * 4 * sizes["parameters"] * 4
    assert sizes["gossip_total_per_node"] == 20 * sizes["gossip_per_node_per_round"]
    assert sizes["federated_total_per_node_expected"] > 0
    assert output["results"]["by_epsilon"]["nonprivate"]["local_noise_multiplier"] == 0.0


def test_node_sample_is_seeded_and_has_friends(paths: Paths) -> None:
    first = sample_nodes(paths.processed, 100)
    again = sample_nodes(paths.processed, 100)
    assert np.array_equal(first, again)
    assert first.size == 100 and np.all(np.diff(first) > 0)
    everyone = sample_nodes(paths.processed, 10_000)
    assert everyone.size <= 400


def test_failed_positive_control_makes_the_run_invalid(
    paths: Paths, output: dict[str, Any]
) -> None:
    # A node that never updates keeps the untrained model, which must not pass as learning.
    broken = run(
        paths,
        _frozen(),
        n_nodes=150,
        rounds=2,
        degree=4,
        epsilons=(None,),
        seeds=(0,),
        lr=0.0,
    )
    assert broken["status"] == "INVALID"
    assert any("untrained" in reason for reason in broken["invalid_reasons"])
    control = broken["controls"]["gossip_beats_untrained"]
    assert control["passed"] is False
    assert control["threshold"] == pytest.approx(1.1)
    assert control["ratio"] == pytest.approx(1.0)
    assert output["controls"]["gossip_learns"]["passed"] is True
    assert output["status"] == "VALID"


def test_summary_lines_and_cli_help(
    output: dict[str, Any], capsys: pytest.CaptureFixture[str]
) -> None:
    text = " ".join(summary_lines(output))
    assert "gossip" in text and "8.0" in text and output["status"] in text
    with pytest.raises(SystemExit) as stop:
        cli(["--help"])
    assert stop.value.code == 0
    assert "--nodes" in capsys.readouterr().out


def test_tune_phase_uses_validation_targets_and_finished_runs_are_skipped(
    paths: Paths, output: dict[str, Any], monkeypatch: pytest.MonkeyPatch
) -> None:
    del output
    knobs: dict[str, Any] = {
        "n_nodes": 150,
        "rounds": 5,
        "degree": 4,
        "epsilons": (None,),
        "seeds": (0,),
        "lr": LEARNING_RATE,
        "phase": "tune",
    }
    first = run(paths, _frozen(), **knobs)
    assert first["settings"]["phase"] == "tune"

    bundle = load_bundle(paths.processed)
    nodes = sample_nodes(paths.processed, 150)
    history = [bundle.history("tune")[int(u)] for u in nodes]
    targets = [bundle.val[int(u)] for u in nodes]
    _, per_user = ranking_metrics_per_user(
        popularity_score_fn(history, bundle.n_items), history, targets, bundle.n_items
    )
    floor = first["results"]["by_epsilon"]["nonprivate"]["most_popular_ndcg10"]
    assert floor == pytest.approx(float(np.nanmean(per_user)))

    calls = {"gossip": 0, "federated": 0}

    def counted_gossip(*args: Any, **kwargs: Any) -> Any:
        calls["gossip"] += 1
        return gossip_train(*args, **kwargs)

    def counted_federated(*args: Any, **kwargs: Any) -> Any:
        calls["federated"] += 1
        return run_one(*args, **kwargs)

    monkeypatch.setattr("prism.experiments.gossip.gossip_train", counted_gossip)
    monkeypatch.setattr("prism.experiments.gossip.run_one", counted_federated)
    second = run(paths, _frozen(), **knobs)
    assert calls == {"gossip": 0, "federated": 0}
    assert (
        second["results"]["by_epsilon"]["nonprivate"]["gossip_ndcg10"]
        == first["results"]["by_epsilon"]["nonprivate"]["gossip_ndcg10"]
    )
    assert (
        second["results"]["by_epsilon"]["nonprivate"]["federated_ndcg10"]
        == first["results"]["by_epsilon"]["nonprivate"]["federated_ndcg10"]
    )
    cache = paths.processed / "models" / "gossip"
    assert list(cache.glob("gossip_tune_adam_mix1_lr0.02_n150_r5_d4_epsnone_seed0.npz"))


def test_only_a_failed_gating_control_makes_the_run_invalid() -> None:
    # below MostPopular but well above the untrained model: reported, not gating
    controls, reasons = build_controls(gossip=0.02, floor=0.05, untrained=0.01, federated=0.03)
    assert controls["gossip_learns"]["passed"] is False
    assert controls["gossip_learns"]["gating"] is False
    assert controls["gossip_beats_untrained"]["passed"] is True
    assert controls["gossip_share_of_federated"]["ratio"] == pytest.approx(2 / 3)
    assert reasons == []
    # no better than the untrained model: gating
    controls, reasons = build_controls(gossip=0.0105, floor=0.01, untrained=0.01, federated=0.03)
    assert controls["gossip_beats_untrained"]["passed"] is False
    assert len(reasons) == 1 and "untrained" in reasons[0]


def test_replace_adjacency_epsilon_is_larger_and_limitations_say_which(
    output: dict[str, Any],
) -> None:
    claimed = output["results"]["by_epsilon"]["8.0"]["epsilon_claimed"]
    assert claimed["gossip_local_replace_adjacency"] > claimed["gossip_local"]
    assert (
        output["results"]["by_epsilon"]["nonprivate"]["epsilon_claimed"][
            "gossip_local_replace_adjacency"
        ]
        is None
    )
    text = " ".join(output["limitations"])
    assert "add-or-remove" in text and "replace" in text and "2C" in text
    assert "predate the commit" in text


def test_cache_with_a_different_settings_hash_is_ignored(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    from prism.experiments import gossip as module
    from prism.io import atomic_write_npz

    write_synthetic_dataset(tmp_path / "processed")
    local = Paths(
        processed=tmp_path / "processed", results=tmp_path / "results", keys=tmp_path / "keys"
    )
    knobs: dict[str, Any] = {
        "n_nodes": 150, "rounds": 4, "degree": 4, "epsilons": (None,), "seeds": (0,),
        "lr": LEARNING_RATE, "phase": "tune",
    }  # fmt: skip
    calls = {"gossip": 0}

    def counted(*args: Any, **kwargs: Any) -> Any:
        calls["gossip"] += 1
        return gossip_train(*args, **kwargs)

    monkeypatch.setattr(module, "gossip_train", counted)
    run(local, _frozen(), **knobs)
    assert calls["gossip"] == 1
    run(local, _frozen(), **knobs)
    assert calls["gossip"] == 1  # matching hash: reused
    (cache,) = (local.processed / "models" / "gossip").glob("gossip_tune_*.npz")
    with np.load(cache) as stored:
        arrays = {name: np.asarray(stored[name]) for name in stored.files}
    assert "settings_hash" in arrays
    atomic_write_npz(cache, **{**arrays, "settings_hash": np.asarray("not-the-hash")})
    run(local, _frozen(), **knobs)
    assert calls["gossip"] == 2  # different hash: ignored and retrained
    arrays.pop("settings_hash")
    atomic_write_npz(cache, **arrays)
    run(local, _frozen(), **knobs)
    assert calls["gossip"] == 2  # legacy cache without the field: accepted


def test_settings_hash_depends_on_every_setting() -> None:
    from prism.experiments.gossip import settings_hash
    from prism.fl.gossip import GossipConfig

    base = GossipConfig(rounds=5, clip_norm=0.5, lr=0.05)
    args = (base, ModelConfig(dim=8), 150, "final", 8.0, 0)
    assert settings_hash(*args) == settings_hash(*args)
    other = GossipConfig(rounds=5, clip_norm=0.5, lr=0.06)
    assert settings_hash(other, *args[1:]) != settings_hash(*args)
    assert settings_hash(*args[:-1], 1) != settings_hash(*args)
    assert settings_hash(base, ModelConfig(dim=16), *args[2:]) != settings_hash(*args)
