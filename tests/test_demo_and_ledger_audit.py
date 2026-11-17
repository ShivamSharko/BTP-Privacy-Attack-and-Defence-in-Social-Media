"""End-to-end demonstration, ledger audit, social build and the command line."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from prism import cli
from prism.experiments import demo, ledger_audit, social_build
from prism.experiments.runner import Paths
from prism.io import read_json
from prism.ledger.receipts import load_or_create_key, public_key_hex


@pytest.fixture(scope="module")
def demo_root(tmp_path_factory: pytest.TempPathFactory) -> tuple[Path, dict[str, object]]:
    root: Path = tmp_path_factory.mktemp("demo")
    return root, demo.run(root)


def test_demo_runs_the_whole_pipeline(demo_root: tuple[Path, dict[str, object]]) -> None:
    root, summary = demo_root
    assert summary["grid_status"] == "VALID"
    assert summary["ledger_status"] == "VALID"
    assert summary["over_budget_run_blocked"] is True
    assert summary["non_private_ndcg@10"] > summary["most_popular_ndcg@10"]  # type: ignore[operator]
    assert 0.0 < summary["epsilon_of_record"] <= 8.0  # type: ignore[operator]
    assert summary["ledgers_verified"] == 2  # one private run per seed
    assert (root / "results" / "privacy_utility.json").exists()
    assert (root / "results" / "baselines.json").exists()


def test_ledger_audit_controls_and_costs(demo_root: tuple[Path, dict[str, object]]) -> None:
    root, _ = demo_root
    audit = read_json(root / "results" / "ledger_audit.json")
    assert audit["status"] == "VALID"
    assert all(control["passed"] for control in audit["controls"].values())
    results = audit["results"]
    assert results["coverage"]["coverage"] == 1.0
    assert results["tamper_detection"]["rate"] == 1.0
    assert results["costs"]["append_ms_per_receipt"] > 0.0
    assert results["costs"]["inclusion_proof_hashes"] >= 1
    assert (
        results["blocked_release_demo"]["rounds_completed"]
        == results["blocked_release_demo"]["rounds_allowed"]
    )
    assert results["verification"]["release_receipts"] == 2


def test_audit_is_invalid_when_a_ledger_was_altered(
    demo_root: tuple[Path, dict[str, object]], tmp_path: Path
) -> None:
    import shutil

    root, _ = demo_root
    copy = tmp_path / "copy"
    shutil.copytree(root, copy)
    paths = Paths(processed=copy / "processed", results=copy / "results", keys=copy / "keys")
    victim = sorted((paths.results / "ledger").rglob("*.jsonl"))[0]
    lines = victim.read_text(encoding="utf-8").splitlines()
    entry = json.loads(lines[0])
    entry["receipt"]["noise_multiplier"] = 99.0  # claim more noise than was used
    lines[0] = json.dumps(entry, separators=(",", ":"), sort_keys=True)
    victim.write_text("\n".join(lines) + "\n", encoding="utf-8")
    audit = ledger_audit.run(paths, flips=10, demo=False)
    assert audit["status"] == "INVALID"
    assert audit["results"]["verification"]["failures"]


def test_audit_without_ledgers_is_invalid(tmp_path: Path) -> None:
    paths = Paths(processed=tmp_path / "p", results=tmp_path / "r", keys=tmp_path / "k")
    audit = ledger_audit.run(paths, demo=False)
    assert audit["status"] == "INVALID"
    assert "no ledger files" in audit["invalid_reasons"][0]
    assert len(public_key_hex(load_or_create_key(paths.keys / "ledger_ed25519.pem"))) == 64


def test_social_build_writes_graph_and_aggregates(tmp_path: Path) -> None:
    import gzip

    processed = tmp_path / "processed"
    processed.mkdir()
    with gzip.open(processed / social_build.USERS_FILE, "wt", encoding="utf-8") as handle:
        handle.write("user_id,friends,review_count\n")
        handle.write('u1,"u2, u3",5\nu2,u1,3\nu3,None,2\nu4,,1\n')
    (processed / social_build.INDEX_FILE).write_text(
        json.dumps({"u1": 0, "u2": 1, "u3": 2, "u4": 3}), encoding="utf-8"
    )
    paths = Paths(processed=processed, results=tmp_path / "results", keys=tmp_path / "keys")
    summary = social_build.run(paths)
    assert summary["users"] == 4 and summary["edges"] == 2
    assert (processed / "friends.npz").exists()
    saved = read_json(paths.results / "social_graph.json")
    assert "u1" not in json.dumps(saved)


def test_command_line_help_and_unknown_command(capsys: pytest.CaptureFixture[str]) -> None:
    assert cli.main([]) == 0
    assert "demo-small" in capsys.readouterr().out
    assert cli.main(["nonsense"]) == 2
    assert "unknown command" in capsys.readouterr().err
    for module_name, _ in cli.COMMANDS.values():
        if module_name.endswith(("report.build",)):
            continue  # built later in the plan
        __import__(module_name)


def test_audit_detects_one_runs_ledger_copied_over_another(
    demo_root: tuple[Path, dict[str, object]], tmp_path: Path
) -> None:
    """Review finding m4: a valid ledger of run A placed at run B's path must not pass."""
    import shutil

    root, _ = demo_root
    copy = tmp_path / "swap"
    shutil.copytree(root, copy)
    paths = Paths(processed=copy / "processed", results=copy / "results", keys=copy / "keys")
    first, second = sorted((paths.results / "ledger").rglob("*.jsonl"))[:2]
    shutil.copyfile(first, second)
    audit = ledger_audit.run(paths, flips=10, demo=False)
    assert audit["status"] == "INVALID"
    assert audit["results"]["coverage"]["without_valid_release_receipt"] >= 1
    assert any("mismatch" in reason for reason in audit["results"]["coverage"]["problems"])
