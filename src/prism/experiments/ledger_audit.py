"""RQ6: does the verifiable ledger hold up, and what does it cost?

Checks, over every ledger file written by the experiments:

* every ledger verifies against the public key (signatures, Merkle roots, order);
* every released private model has a ledger that ends in a release receipt (coverage);
* tampering is detected: single bytes of a copy are flipped one at a time;
* an over-budget run is stopped: a small run that asks for 20% more rounds than its
  noise supports is halted by the gate and the refusal is logged.

Costs measured: time to append a receipt, ledger bytes per round, inclusion-proof
size, time to verify a whole ledger, and the share of a run's wall-clock spent on
receipts.

A log proves what was recorded and that it was not changed afterwards. It does
not prove the recorded training actually happened as described, and it gives no
confidentiality.
"""

from __future__ import annotations

import argparse
import json
import tempfile
import time
from pathlib import Path
from typing import Any

import numpy as np

from prism.config import ModelConfig, RunConfig, TrainConfig
from prism.data.synthetic import write_synthetic_dataset
from prism.experiments.regimes import default_paths
from prism.experiments.runner import KEY_FILE, Paths, run_one
from prism.io import atomic_write_json, read_json
from prism.ledger.log import Ledger, prove_inclusion, verify_ledger
from prism.ledger.receipts import generate_key, load_or_create_key, public_key_hex
from prism.privacy.accounting import max_rounds_within

NAME: str = "ledger_audit"


def _leaf_kinds(path: Path) -> list[str]:
    kinds: list[str] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        entry = json.loads(line)
        if entry.get("type") == "leaf":
            kinds.append(str(entry["receipt"].get("kind")))
    return kinds


def verify_all(paths: Paths, public_hex: str) -> dict[str, Any]:
    """Verify every ledger file under ``results/ledger``."""
    files = sorted((paths.results / "ledger").rglob("*.jsonl"))
    failures: list[str] = []
    rounds = releases = refusals = 0
    total_bytes = 0
    for path in files:
        report = verify_ledger(path, public_hex)
        if not report.ok:
            failures.append(path.relative_to(paths.results).as_posix())
        kinds = _leaf_kinds(path)
        rounds += kinds.count("round")
        releases += kinds.count("release")
        refusals += kinds.count("refusal")
        total_bytes += path.stat().st_size
    return {
        "ledgers": len(files),
        "verified": len(files) - len(failures),
        "failures": failures,
        "round_receipts": rounds,
        "release_receipts": releases,
        "refusal_receipts": refusals,
        "bytes_per_round": total_bytes / rounds if rounds else None,
    }


def _entries(path: Path) -> list[dict[str, Any]]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line]


def coverage(paths: Paths) -> dict[str, Any]:
    """Every private run with status ok must have ITS OWN verified ledger ending in a release.

    Besides the stored verification flag this checks that the ledger belongs to the run: every
    checkpoint carries the origin of that run, and the final release receipt names its lineage,
    configuration hash and model hash. A valid ledger of another run therefore does not count.
    """
    private = missing = 0
    problems: list[str] = []
    for record_path in sorted((paths.results / "runs").rglob("*.json")):
        record = read_json(record_path)
        if record.get("status") != "ok" or not record.get("privacy"):
            continue
        private += 1
        identifier = str(record.get("id"))
        info = record.get("ledger") or {}
        ledger_path = paths.results / str(info.get("path", "missing"))
        if not ledger_path.exists() or not info.get("verified"):
            missing += 1
            problems.append(f"{identifier}: no verified ledger")
            continue
        entries = _entries(ledger_path)
        leaves = [e["receipt"] for e in entries if e.get("type") == "leaf"]
        origins = {e.get("origin") for e in entries if e.get("type") == "checkpoint"}
        expected_origin = f"prism-rec/{record['config']['name']}/{identifier}"
        release = leaves[-1] if leaves else {}
        if release.get("kind") != "release":
            missing += 1
            problems.append(f"{identifier}: ledger does not end in a release receipt")
        elif (
            origins != {expected_origin}
            or release.get("lineage") != identifier
            or release.get("config_hash") != record.get("config_hash")
            or release.get("model_sha256") != record.get("model_sha256")
        ):
            missing += 1
            problems.append(f"{identifier}: ledger and run record mismatch")
    return {
        "private_runs": private,
        "without_valid_release_receipt": missing,
        "coverage": (private - missing) / private if private else None,
        "problems": problems[:20],
    }


def tamper_detection(
    ledger_path: Path, public_hex: str, flips: int, seed: int = 0
) -> dict[str, Any]:
    """Flip single bytes of a copy of one ledger, one at a time, and count detections."""
    original = ledger_path.read_bytes()
    rng = np.random.default_rng(seed)
    detected = 0
    with tempfile.TemporaryDirectory() as folder:
        copy = Path(folder) / "tampered.jsonl"
        positions = rng.choice(len(original), size=min(flips, len(original)), replace=False)
        for position in positions:
            data = bytearray(original)
            data[int(position)] ^= 0x01
            copy.write_bytes(bytes(data))
            try:
                ok = verify_ledger(copy, public_hex).ok
            except Exception:
                ok = False  # an unreadable file is a detected tamper
            detected += 0 if ok else 1
        tried = len(positions)
    return {"flips": tried, "detected": detected, "rate": detected / tried if tried else None}


def costs(ledger_path: Path, public_hex: str, appends: int = 200) -> dict[str, Any]:
    """Time receipt appends, whole-ledger verification and one inclusion proof."""
    with tempfile.TemporaryDirectory() as folder:
        ledger = Ledger(Path(folder) / "bench.jsonl", generate_key(), origin="prism-rec/bench")
        receipt = {
            "kind": "round",
            "lineage": "bench",
            "config_hash": "0" * 64,
            "sample_rate": 0.05,
            "noise_multiplier": 1.0,
            "clip_norm": 5.0,
            "expected_cohort": 495.65,
        }
        started = time.perf_counter()
        for index in range(appends):
            ledger.append({**receipt, "round": index + 1})
        append_ms = (time.perf_counter() - started) * 1000.0 / appends
    started = time.perf_counter()
    report = verify_ledger(ledger_path, public_hex)
    verify_seconds = time.perf_counter() - started
    proof = prove_inclusion(ledger_path, 0)
    return {
        "append_ms_per_receipt": append_ms,
        "verify_seconds": verify_seconds,
        "verified_size": report.size,
        "inclusion_proof_hashes": len(proof["proof"]),
        "inclusion_proof_bytes": 32 * len(proof["proof"]),
    }


def blocked_release_demo(seed: int = 0) -> dict[str, Any]:
    """Train a small private model that asks for 20% more rounds than its budget allows."""
    with tempfile.TemporaryDirectory() as folder:
        root = Path(folder)
        bundle = write_synthetic_dataset(root / "processed")
        paths = Paths(processed=root / "processed", results=root / "results", keys=root / "keys")
        rate, noise, budget = 0.2, 2.0, 2.0
        allowed = max_rounds_within(budget, rate, noise, bundle.n_users, upper=400)
        asked = int(np.ceil(allowed * 1.2))
        config = RunConfig(
            name="blocked-release-demo",
            regime="demo",
            phase="tune",
            seed=seed,
            target_epsilon=budget,
            model=ModelConfig(dim=8),
            train=TrainConfig(
                sample_rate=rate,
                rounds=asked,
                server_lr=0.05,
                clip_norm=0.05,
                noise_multiplier=noise,
            ),
        )
        record = run_one(config, paths, save_checkpoint=False)
        kinds = _leaf_kinds(paths.ledger(config))
        return {
            "budget_epsilon": budget,
            "rounds_asked": asked,
            "rounds_allowed": allowed,
            "rounds_completed": record["rounds_completed"],
            "halted_by_gate": record["halted_by_gate"],
            "refusal_receipts": kinds.count("refusal"),
            "epsilon_released": (record.get("privacy") or {}).get("of_record"),
            "blocked": bool(
                record["halted_by_gate"]
                and record["rounds_completed"] == allowed
                and kinds.count("refusal") == 1
            ),
        }


def run(paths: Paths, *, flips: int = 300, demo: bool = True) -> dict[str, Any]:
    """Audit every ledger and write ``results/ledger_audit.json``."""
    started = time.time()
    key = load_or_create_key(paths.keys / KEY_FILE)
    public_hex = public_key_hex(key)
    verification = verify_all(paths, public_hex)
    cover = coverage(paths)
    files = sorted((paths.results / "ledger").rglob("*.jsonl"))
    reasons: list[str] = []
    controls: dict[str, Any] = {}
    tamper: dict[str, Any] | None = None
    cost: dict[str, Any] | None = None
    if not files:
        reasons.append("no ledger files found: run a private experiment first")
    else:
        intact = [
            path
            for path in files
            if path.relative_to(paths.results).as_posix() not in verification["failures"]
        ]
        if intact:
            longest = max(intact, key=lambda p: p.stat().st_size)
            tamper = tamper_detection(longest, public_hex, flips)
            cost = costs(longest, public_hex)
        controls["all_ledgers_verify"] = {"passed": not verification["failures"]}
        controls["receipt_coverage_is_100_percent"] = {
            "passed": cover["without_valid_release_receipt"] == 0,
            "coverage": cover["coverage"],
        }
        controls["every_tamper_detected"] = {
            "passed": tamper is not None and tamper["detected"] == tamper["flips"],
            "rate": tamper["rate"] if tamper is not None else None,
        }
    blocked = blocked_release_demo() if demo else None
    if blocked is not None:
        controls["over_budget_run_is_blocked"] = {"passed": blocked["blocked"]}
    reasons += [f"control failed: {name}" for name, c in controls.items() if not c["passed"]]
    overhead = None
    if cost is not None:
        shares = []
        for record_path in sorted((paths.results / "runs").rglob("*.json")):
            record = read_json(record_path)
            if (
                record.get("status") == "ok"
                and record.get("privacy")
                and record.get("wall_seconds")
            ):
                spent = cost["append_ms_per_receipt"] * record["rounds_completed"] / 1000.0
                shares.append(spent / float(record["wall_seconds"]))
        if shares:
            overhead = {"mean_share_of_run_time": float(np.mean(shares)), "max": float(max(shares))}
    payload = {
        "experiment": NAME,
        "status": "VALID" if not reasons else "INVALID",
        "invalid_reasons": reasons,
        "controls": controls,
        "public_key_hex": public_hex,
        "results": {
            "verification": verification,
            "coverage": cover,
            "tamper_detection": tamper,
            "costs": cost,
            "receipt_overhead": overhead,
            "blocked_release_demo": blocked,
        },
        "limitations": [
            "The log shows what was recorded and that it was not altered; it does not prove the "
            "training ran as recorded, and it provides no confidentiality.",
            "One signing key on one machine: an operator who holds the key can write a different "
            "log from scratch. Publishing checkpoints to an outside witness would close this.",
            "Tamper detection is tested with single-byte flips of one ledger file.",
            "The blocked-release demonstration runs on the synthetic dataset.",
        ],
        "wall_seconds": round(time.time() - started, 2),
    }
    atomic_write_json(paths.results / f"{NAME}.json", payload)
    return payload


def cli(argv: list[str] | None = None) -> int:
    """``prism ledger``."""
    parser = argparse.ArgumentParser(prog="prism ledger", description=__doc__)
    parser.add_argument("--root", default=".")
    parser.add_argument("--flips", type=int, default=300)
    parser.add_argument("--no-demo", action="store_true")
    parser.add_argument("--prove", default=None, help="ledger file (relative to results/) to prove")
    parser.add_argument("--index", type=int, default=0, help="leaf index for --prove")
    args = parser.parse_args(argv)
    paths = default_paths(Path(args.root))
    if args.prove:
        print(json.dumps(prove_inclusion(paths.results / args.prove, args.index), indent=2))
        return 0
    payload = run(paths, flips=args.flips, demo=not args.no_demo)
    results = payload["results"]
    print(f"status={payload['status']} {payload['invalid_reasons']}")
    print(
        f"ledgers verified: {results['verification']['verified']}/{results['verification']['ledgers']}"
    )
    print(f"coverage: {results['coverage']}")
    print(f"tamper detection: {results['tamper_detection']}")
    print(f"costs: {results['costs']}")
    print(f"blocked release: {results['blocked_release_demo']}")
    return 0 if payload["status"] == "VALID" else 1
