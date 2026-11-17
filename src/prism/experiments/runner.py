"""Run one experiment or a resumable grid of them.

Every run writes one JSON record (atomically) and, when it is a private run,
one ledger file with a receipt per round, a release receipt and a signed
checkpoint. A failed run is recorded as failed and retried next time; it is
never mistaken for a finished one.

What is published and what is not. Ledger receipts contain only values that do
not depend on who took part: the round number, the configuration hash, the
sampling rate, the noise multiplier, the clipping norm and the expected cohort size; the
release receipt adds the privacy spent and the hash of the released model.
The realised cohort size and update norms depend on the participants, so they
appear only in the run record under ``diagnostics``, which is a research aid
and is not covered by the privacy guarantee.
"""

from __future__ import annotations

import hashlib
import os
import time
import traceback
from concurrent.futures import ProcessPoolExecutor, as_completed
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any

import numpy as np
import numpy.typing as npt
import torch

from prism.config import RunConfig, config_hash
from prism.data.bundle import DataBundle, load_bundle
from prism.environment import collect_environment_report
from prism.eval.stats import user_bootstrap_ci
from prism.fl.sampling import expected_cohort
from prism.fl.server import RoundStats, evaluate_per_user, train
from prism.io import atomic_write_json, atomic_write_npz, read_json
from prism.ledger.gate import Budget, ReleaseGate
from prism.ledger.log import Ledger, verify_ledger
from prism.ledger.receipts import load_or_create_key, public_key_hex
from prism.privacy.accounting import delta_for, epsilon_report, max_rounds_within, pld_epsilon

KEY_FILE: str = "ledger_ed25519.pem"
LIMITATIONS: tuple[str, ...] = (
    "Privacy unit is one user (add or remove one user's whole history); delta = 1/(10 n).",
    "Epsilon assumes ideal Poisson sampling of clients, which real devices cannot guarantee.",
    "Gaussian noise is floating point from a seeded generator, not a hardened sampler.",
    "The clipping norm and hyperparameters were chosen on the same users' data; that selection "
    "is not covered by epsilon.",
    "Single-process simulation: no real network, devices or trust boundary.",
    "The 'diagnostics' block depends on who took part and would not be released in deployment.",
)


def code_sha256() -> str:
    """SHA-256 over every source file of the ``prism`` package (path and contents)."""
    package = Path(__file__).resolve().parents[1]
    digest = hashlib.sha256()
    for path in sorted(package.rglob("*.py")):
        digest.update(path.relative_to(package).as_posix().encode("utf-8"))
        digest.update(path.read_bytes())
    return digest.hexdigest()


@dataclass(frozen=True)
class Paths:
    """Where a run reads data and writes results and keys."""

    processed: Path
    results: Path
    keys: Path

    def record(self, config: RunConfig) -> Path:
        return self.results / "runs" / config.name / f"{config.identifier}.json"

    def ledger(self, config: RunConfig) -> Path:
        return self.results / "ledger" / config.name / f"{config.identifier}.jsonl"

    def checkpoint(self, config: RunConfig) -> Path:
        return self.processed / "models" / config.name / f"{config.identifier}.npz"


@lru_cache(maxsize=2)
def _bundle(processed: str) -> DataBundle:
    return load_bundle(Path(processed))


def _clean(value: Any) -> Any:
    """Make a structure JSON-safe: non-finite floats become None."""
    if isinstance(value, dict):
        return {str(key): _clean(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_clean(item) for item in value]
    if isinstance(value, (np.floating, float)):
        number = float(value)
        return number if np.isfinite(number) else None
    if isinstance(value, np.integer):
        return int(value)
    return value


def _diagnostics(stats: tuple[RoundStats, ...]) -> dict[str, Any]:
    if not stats:
        return {}
    cohorts = [s.cohort for s in stats]
    return {
        "mean_cohort": float(np.mean(cohorts)),
        "min_cohort": int(min(cohorts)),
        "max_cohort": int(max(cohorts)),
        "mean_update_norm_first": stats[0].mean_norm,
        "mean_update_norm_last": stats[-1].mean_norm,
        "mean_clipped_fraction": float(np.mean([s.clipped_fraction for s in stats])),
        "nonfinite_updates": int(sum(s.nonfinite for s in stats)),
    }


def run_one(
    config: RunConfig,
    paths: Paths,
    *,
    eligible: npt.NDArray[np.int64] | None = None,
    threads: int | None = None,
    save_checkpoint: bool = True,
    extra: dict[str, Any] | None = None,
    **train_kwargs: Any,
) -> dict[str, Any]:
    """Train, account, log and evaluate one configuration; write and return its record."""
    if threads is not None:
        torch.set_num_threads(threads)
    started = time.time()
    bundle = _bundle(str(paths.processed))
    n_users = int(bundle.n_users if eligible is None else eligible.size)
    digest = config_hash(config)
    train_config = config.train
    private = train_config.noise_multiplier > 0.0 and config.privacy_claim

    authorise = None
    on_round = None
    gate: ReleaseGate | None = None
    ledger_path = paths.ledger(config)
    allowed = train_config.rounds
    refused_at: list[int] = []
    key = None
    if private:
        if config.target_epsilon is None:
            raise ValueError("a private run needs target_epsilon as its budget")
        key = load_or_create_key(paths.keys / KEY_FILE)
        ledger_path.parent.mkdir(parents=True, exist_ok=True)
        if ledger_path.exists():
            ledger_path.unlink()  # a rerun starts a fresh lineage file
        ledger = Ledger(ledger_path, key, origin=f"prism-rec/{config.name}/{config.identifier}")
        budget = Budget(epsilon=config.target_epsilon, delta=delta_for(n_users))
        gate = ReleaseGate(ledger, budget, lineage=config.identifier)
        rate, noise = train_config.sample_rate, train_config.noise_multiplier
        allowed = max_rounds_within(
            config.target_epsilon, rate, noise, n_users, upper=train_config.rounds
        )
        bound = pld_epsilon(rate, noise, allowed, budget.delta) if allowed > 0 else 0.0
        receipt_fields = {
            "config_hash": digest,
            "sample_rate": rate,
            "noise_multiplier": noise,
            "clip_norm": train_config.clip_norm,
            "expected_cohort": expected_cohort(n_users, rate, train_kwargs.get("availability")),
        }
        active_gate = gate

        def authorise(round_index: int) -> bool:
            if round_index <= allowed:
                return active_gate.authorise_round(round_index, bound)
            # Beyond the allowed rounds the value of record (larger of PRV and PLD) decides.
            beyond = epsilon_report(rate, noise, round_index, n_users)
            finite = [v for v in (beyond.prv, beyond.pld) if np.isfinite(v)]
            over = max(finite) if finite else 2.0 * budget.epsilon
            granted = active_gate.authorise_round(round_index, over)
            if not granted:
                refused_at.append(round_index)
            return granted

        def on_round(stats: RoundStats, flat: torch.Tensor) -> None:
            active_gate.record_round(stats.round, receipt_fields)

    result = train(
        bundle,
        config.phase,
        config.model,
        train_config,
        config.seed,
        eligible=eligible,
        authorise=authorise,
        on_round=on_round,
        **train_kwargs,
    )

    model_sha = hashlib.sha256(np.ascontiguousarray(result.flat).tobytes()).hexdigest()
    privacy: dict[str, Any] | None = None
    ledger_info: dict[str, Any] | None = None
    status = "ok"
    if private and result.rounds_completed == 0:
        # The gate refused the first round: nothing was trained, nothing is released.
        status = "refused_before_first_round"
    elif private and gate is not None and key is not None:
        report = epsilon_report(
            train_config.sample_rate,
            train_config.noise_multiplier,
            result.rounds_completed,
            n_users,
        )
        privacy = {**report.as_dict(), "unit": "user", "adjacency": "add-or-remove one user"}
        privacy["budget_epsilon"] = config.target_epsilon
        privacy["excludes"] = "hyperparameter and clipping-norm selection"
        if not report.gate_ok:
            status = "accounting_inconsistent"
        else:
            checkpoint = gate.release(
                report.of_record,
                result.rounds_completed,
                {
                    "config_hash": digest,
                    "model_sha256": model_sha,
                    "epsilon_prv": report.prv,
                    "epsilon_pld": report.pld,
                    "epsilon_rdp": report.rdp,
                    "delta": report.delta,
                },
            )
            verified = verify_ledger(ledger_path, public_key_hex(key))
            ledger_info = {
                "path": ledger_path.relative_to(paths.results).as_posix(),
                "size": checkpoint["size"],
                "root_hex": checkpoint["root_hex"],
                "verified": verified.ok,
                "public_key_hex": public_key_hex(key),
                "refused_rounds": refused_at,
            }
            if not verified.ok:
                status = "ledger_invalid"

    metrics, per_user = evaluate_per_user(result.flat, bundle, config.phase, config.model)
    low, high = user_bootstrap_ci(per_user, seed=config.seed)
    # Only a released (or non-private) model is kept on disk; a refused one is removed.
    if save_checkpoint and status == "ok":
        atomic_write_npz(paths.checkpoint(config), flat=result.flat)
    elif status != "ok" and paths.checkpoint(config).exists():
        paths.checkpoint(config).unlink()
    environment = collect_environment_report()
    record: dict[str, Any] = {
        "id": config.identifier,
        "status": status,
        "config": config.model_dump(mode="json"),
        "config_hash": digest,
        "users": n_users,
        "items": bundle.n_items,
        "parameters": int(result.flat.size),
        "rounds_completed": result.rounds_completed,
        "halted_by_gate": bool(result.halted),
        "privacy": privacy,
        "ledger": ledger_info,
        "metrics": metrics,
        "ndcg_ci95": [low, high],
        "evaluated_on": "validation" if config.phase == "tune" else "test",
        "model_sha256": model_sha,
        "diagnostics": _diagnostics(result.stats),
        "simulated_noise_multiplier": (
            train_config.noise_multiplier if not config.privacy_claim else None
        ),
        "wall_seconds": round(time.time() - started, 2),
        "threads": torch.get_num_threads(),
        "torch_version": torch.__version__,
        "provenance": {
            "git_commit": environment.git_commit,
            "git_dirty": environment.git_dirty,
            "code_sha256": code_sha256(),
            "uv_lock_sha256": environment.uv_lock_sha256,
        },
        "limitations": list(LIMITATIONS),
    }
    if extra:
        record.update(extra)
    record = _clean(record)
    atomic_write_json(paths.record(config), record)
    return record


def _run_safely(config: RunConfig, paths: Paths, threads: int) -> dict[str, Any]:
    try:
        return run_one(config, paths, threads=threads)
    except Exception as error:
        record = {
            "id": config.identifier,
            "status": "failed",
            "config": config.model_dump(mode="json"),
            "config_hash": config_hash(config),
            "error": f"{type(error).__name__}: {error}",
            "traceback": traceback.format_exc(limit=8),
        }
        atomic_write_json(paths.record(config), record)
        return record


def _finished(config: RunConfig, paths: Paths) -> dict[str, Any] | None:
    """A finished record for this configuration, or None if the run must be (re)done.

    A record is reused when its status is ok and its configuration hash matches. Whether it
    was produced by the current source code is reported in ``stale_code`` (True also for
    records that predate the code hash). Set the environment variable PRISM_STRICT_RESUME=1
    to rerun such records instead of reusing them.
    """
    path = paths.record(config)
    if not path.exists():
        return None
    try:
        record: dict[str, Any] = read_json(path)
    except ValueError:
        return None
    if record.get("status") != "ok" or record.get("config_hash") != config_hash(config):
        return None
    stale = (record.get("provenance") or {}).get("code_sha256") != code_sha256()
    if stale and os.environ.get("PRISM_STRICT_RESUME") == "1":
        return None
    return {**record, "stale_code": stale}


def run_grid(
    configs: list[RunConfig], paths: Paths, workers: int = 4, threads: int = 2
) -> list[dict[str, Any]]:
    """Run every configuration not already finished. Returns records in input order."""
    records: dict[str, dict[str, Any]] = {}
    pending: list[RunConfig] = []
    for config in configs:
        done = _finished(config, paths)
        if done is not None:
            records[config.identifier] = {**done, "skipped": True}
        else:
            pending.append(config)
    if pending:
        # Create the signing key once, here, so parallel workers never race to create it.
        load_or_create_key(paths.keys / KEY_FILE)
    if workers <= 1:
        for config in pending:
            records[config.identifier] = {
                **_run_safely(config, paths, threads),
                "skipped": False,
                "stale_code": False,
            }
    elif pending:
        with ProcessPoolExecutor(max_workers=workers) as pool:
            futures = {pool.submit(_run_safely, c, paths, threads): c for c in pending}
            for future in as_completed(futures):
                config = futures[future]
                record = future.result()
                records[config.identifier] = {**record, "skipped": False, "stale_code": False}
                print(
                    f"{record['status']:>6} {config.identifier} "
                    f"ndcg@10={record.get('metrics', {}).get('ndcg@10', float('nan')):.4f}",
                    flush=True,
                )
    return [records[config.identifier] for config in configs]
