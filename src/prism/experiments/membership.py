"""User-level membership inference against the released model.

Question: can an outsider holding the trained model tell whether a given user's data
was used to train it? This is the empirical check on the user-level DP guarantee.

Protocol (fixed). For each target seed s the users are split into two random halves,
members A_s and non-members B_s. Target models are trained on A_s only, with the noise
calibrated for len(A_s) users, so the epsilon tested is the epsilon claimed. Reference
models are non-private (the attacker is not bound by DP), each trained on its own random
half. A user's score is the mean reference loss over references that did not train on the
user, minus the target's loss, with the loss measured on a fixed visible/hidden split of
the user's "final" history. Two controls gate the result: an overfit model must be
attackable (the attack works) and a model trained independently of the labels must sit at
chance (the attack is not fooled by the split).
"""

from __future__ import annotations

import argparse
import time
from concurrent.futures import ProcessPoolExecutor, as_completed
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np
import numpy.typing as npt
import torch

from prism.attacks.membership import calibrate_scores, losses_for_models, summarise_scores
from prism.config import RunConfig, config_hash
from prism.data.bundle import load_bundle
from prism.experiments.regimes import Frozen, default_paths, load_frozen, make_run
from prism.experiments.runner import KEY_FILE, Paths, _clean, run_one
from prism.io import atomic_write_json, read_json
from prism.ledger.receipts import load_or_create_key
from prism.privacy.accounting import delta_for
from prism.seeding import stream

NAME = "membership"
METRICS: tuple[str, ...] = (
    "auc",
    "tpr_at_1pct_fpr",
    "tpr_at_0.1pct_fpr",
    "epsilon_lower_bound",
    "raw_auc",
    "raw_tpr_at_1pct_fpr",
)
OVERFIT_MIN_TPR: float = 0.02
OVERFIT_MIN_AUC: float = 0.55
INDEPENDENT_AUC_TOLERANCE: float = 0.03
H3_EPSILON: float = 8.0
H3_MAX_TPR: float = 0.02
REFERENCE_SEED_BASE: int = 1000
INDEPENDENT_SEED: int = 2000

LIMITATIONS: tuple[str, ...] = (
    "The attack is a loss-threshold test calibrated with reference models, not the "
    "strongest attack possible; a negative result bounds this attack only.",
    "Training on half the users halves n, so the noise is calibrated for n/2 users; the "
    "epsilon tested is that of the half-population model, not of the full-population one.",
    "Only a few target seeds are used, so per-level spreads are rough.",
    "The empirical epsilon lower bound joins two one-sided 95% Clopper-Pearson bounds, so its "
    "joint confidence is about 90%, not 95%. It is checked on several seeds and levels without "
    "correction for multiple looks, and members are an exact half of the users rather than "
    "independent draws. It is a sanity check that can detect only large violations of the "
    "claimed guarantee, not a 95% statement.",
    "Reference models are non-private and trained on the same architecture and data "
    "distribution, which is generous to the attacker.",
)


def split_half(n_users: int, seed: int) -> tuple[npt.NDArray[np.int64], npt.NDArray[np.int64]]:
    """Two random halves of the users (sorted), from the attack stream of ``seed``."""
    order = stream(seed, "attack").permutation(n_users).astype(np.int64)
    half = n_users // 2
    return np.sort(order[:half]), np.sort(order[half:])


def aggregate(per_seed: list[dict[str, Any]]) -> dict[str, dict[str, float]]:
    """Mean, min and max of every metric across target seeds."""
    out: dict[str, dict[str, float]] = {}
    for name in METRICS:
        values = np.array([float(entry[name]) for entry in per_seed], dtype=np.float64)
        out[name] = {
            "mean": float(values.mean()),
            "min": float(values.min()),
            "max": float(values.max()),
        }
    return out


def bound_within_claim(bounds: list[float], claimed: float | None) -> bool:
    """True when every empirical epsilon lower bound is at most the claimed epsilon."""
    if claimed is None:
        return True
    return all(bound <= claimed for bound in bounds)


def evaluate_controls(
    overfit: dict[str, Any], independent: dict[str, Any]
) -> tuple[dict[str, dict[str, Any]], list[str]]:
    """Apply the two controls to the overfit and independent models' metrics."""
    tpr, auc = float(overfit["tpr_at_1pct_fpr"]), float(overfit["auc"])
    positive_ok = bool(tpr >= OVERFIT_MIN_TPR and auc >= OVERFIT_MIN_AUC)
    ind_auc = float(independent["auc"])
    negative_ok = bool(abs(ind_auc - 0.5) <= INDEPENDENT_AUC_TOLERANCE)
    controls: dict[str, dict[str, Any]] = {
        "positive_overfit": {
            "what": "attack on a non-private model trained for many more rounds on A_0",
            "measured": "attack on a non-private model trained for many more rounds on A_0",
            "values": {"tpr_at_1pct_fpr": tpr, "auc": auc},
            "threshold": {
                "tpr_at_1pct_fpr_min": OVERFIT_MIN_TPR,
                "auc_min": OVERFIT_MIN_AUC,
            },
            "passed": positive_ok,
        },
        "negative_independent": {
            "what": "attack on a model trained on an independent random half (not the labelled "
            "members)",
            "measured": "attack on a model trained on an independent random half",
            "values": {"auc": ind_auc},
            "threshold": {"auc_target": 0.5, "tolerance": INDEPENDENT_AUC_TOLERANCE},
            "passed": negative_ok,
        },
    }
    reasons: list[str] = []
    if not positive_ok:
        reasons.append(
            "positive control failed: the overfit model is not attackable "
            f"(tpr_at_1pct_fpr={tpr:.4f} needs >= {OVERFIT_MIN_TPR}, "
            f"auc={auc:.4f} needs >= {OVERFIT_MIN_AUC})"
        )
    if not negative_ok:
        reasons.append(
            "negative control failed: the independent model is not at chance "
            f"(auc={ind_auc:.4f}, needs within 0.5 +/- {INDEPENDENT_AUC_TOLERANCE})"
        )
    return controls, reasons


def train_job(
    config: RunConfig, paths: Paths, eligible: npt.NDArray[np.int64], threads: int
) -> dict[str, Any]:
    """Worker: train one model on its eligible users (top-level so it pickles on spawn)."""
    return run_one(config, paths, eligible=eligible, threads=threads)


def _done(config: RunConfig, paths: Paths) -> dict[str, Any] | None:
    path = paths.record(config)
    if not (path.exists() and paths.checkpoint(config).exists()):
        return None
    try:
        record: dict[str, Any] = read_json(path)
    except ValueError:
        return None
    if record.get("status") == "ok" and record.get("config_hash") == config_hash(config):
        return record
    return None


@dataclass(frozen=True)
class Job:
    """One model to train: its configuration and training half."""

    config: RunConfig
    eligible: npt.NDArray[np.int64]


def _train_all(
    jobs: list[Job], paths: Paths, workers: int, threads: int
) -> tuple[dict[str, dict[str, Any]], int]:
    records: dict[str, dict[str, Any]] = {}
    pending: list[Job] = []
    for job in jobs:
        done = _done(job.config, paths)
        if done is None:
            pending.append(job)
        else:
            records[job.config.identifier] = done
    if pending:
        load_or_create_key(paths.keys / KEY_FILE)  # once, so workers never race to create it
    if workers <= 1:
        for job in pending:
            records[job.config.identifier] = train_job(job.config, paths, job.eligible, threads)
    elif pending:
        with ProcessPoolExecutor(max_workers=workers) as pool:
            futures = {
                pool.submit(train_job, job.config, paths, job.eligible, threads): job
                for job in pending
            }
            for future in as_completed(futures):
                job = futures[future]
                records[job.config.identifier] = future.result()
                print(f"trained {job.config.identifier}", flush=True)
    return records, len(pending)


def _level_key(epsilon: float | None) -> str:
    return "nondp" if epsilon is None else f"eps{epsilon:g}"


def run(
    paths: Paths,
    frozen: Frozen,
    *,
    epsilons: tuple[float | None, ...] = (None, 8.0, 1.0),
    target_seeds: tuple[int, ...] = (0, 1, 2),
    n_reference: int = 4,
    regime: str = "small",
    overfit_factor: int = 5,
    attack_seed: int = 0,
    workers: int = 4,
    threads: int = 2,
) -> dict[str, Any]:
    """Train targets, references and controls, attack, write ``results/membership.json``."""
    started = time.time()
    torch.set_num_threads(threads)
    bundle = load_bundle(paths.processed)
    n = bundle.n_users
    spec = frozen.regimes[regime]
    halves = {seed: split_half(n, seed) for seed in target_seeds}
    ref_halves = [split_half(n, REFERENCE_SEED_BASE + j)[0] for j in range(n_reference)]
    indep_half = split_half(n, INDEPENDENT_SEED)[0]
    first = target_seeds[0]

    def build(seed: int, epsilon: float | None, half: npt.NDArray[np.int64], **kw: Any) -> Job:
        config = make_run(
            frozen,
            name=NAME,
            regime=regime,
            phase="final",
            seed=seed,
            epsilon=epsilon,
            n_users=int(half.size),
            paths=paths,
            **kw,
        )
        return Job(config, half)

    ref_jobs = [
        build(REFERENCE_SEED_BASE + j, None, ref_halves[j], variant=f"ref{j}")
        for j in range(n_reference)
    ]
    overfit_job = build(
        first,
        None,
        halves[first][0],
        variant="overfit",
        rounds=overfit_factor * spec.rounds,
    )
    indep_job = build(INDEPENDENT_SEED, None, indep_half, variant="indep")
    target_jobs = {
        (eps, seed): build(seed, eps, halves[seed][0], variant="target")
        for eps in epsilons
        for seed in target_seeds
    }
    jobs = [*ref_jobs, overfit_job, indep_job, *target_jobs.values()]
    records, trained_now = _train_all(jobs, paths, workers, threads)

    invalid: list[str] = []
    for job in jobs:
        record = records[job.config.identifier]
        if record.get("status") != "ok":
            invalid.append(f"training run {job.config.identifier} ended {record.get('status')}")

    flats = {
        job.config.identifier: torch.as_tensor(
            np.load(paths.checkpoint(job.config))["flat"], dtype=torch.float32
        )
        for job in jobs
    }
    everyone = np.arange(n, dtype=np.int64)
    losses = losses_for_models(flats, bundle, frozen.model, everyone, attack_seed)
    ref_loss = np.stack([losses[j.config.identifier] for j in ref_jobs])
    in_ref = np.zeros((n_reference, n), dtype=bool)
    for j, half in enumerate(ref_halves):
        in_ref[j, half] = True

    def labels(seed: int) -> npt.NDArray[np.bool_]:
        out = np.zeros(n, dtype=bool)
        out[halves[seed][0]] = True
        return out

    def attack(loss: npt.NDArray[np.float64], seed: int, delta: float) -> dict[str, Any]:
        member = labels(seed)
        calibrated = summarise_scores(calibrate_scores(loss, ref_loss, in_ref), member, delta)
        raw = summarise_scores(-loss, member, delta)
        calibrated["raw_auc"] = raw["auc"]
        calibrated["raw_tpr_at_1pct_fpr"] = raw["tpr_at_1pct_fpr"]
        return calibrated

    delta_half = delta_for(n // 2)
    overfit_summary = attack(losses[overfit_job.config.identifier], first, delta_half)
    indep_summary = attack(losses[indep_job.config.identifier], first, delta_half)
    controls, reasons = evaluate_controls(overfit_summary, indep_summary)
    invalid.extend(reasons)

    levels: dict[str, Any] = {}
    for eps in epsilons:
        per_seed: list[dict[str, Any]] = []
        claims: list[float | None] = []
        for seed in target_seeds:
            job = target_jobs[(eps, seed)]
            record = records[job.config.identifier]
            claimed = None if record.get("privacy") is None else record["privacy"]["of_record"]
            claims.append(claimed)
            summary = attack(losses[job.config.identifier], seed, delta_for(int(job.eligible.size)))
            per_seed.append(
                {
                    "seed": seed,
                    **summary,
                    "claimed_epsilon": claimed,
                    "rounds_completed": record.get("rounds_completed"),
                    "ndcg@10": record.get("metrics", {}).get("ndcg@10"),
                }
            )
        key = _level_key(eps)
        claimed_max = None if eps is None else max(c for c in claims if c is not None)
        within = all(
            bound_within_claim([entry["epsilon_lower_bound"]], claim)
            for entry, claim in zip(per_seed, claims, strict=True)
        )
        if not within:
            invalid.append(
                f"{key}: an empirical epsilon lower bound exceeds the claimed epsilon; "
                "the DP implementation would be broken"
            )
        levels[key] = {
            "target_epsilon": eps,
            "claimed_epsilon": claimed_max,
            "per_seed": per_seed,
            "aggregate": aggregate(per_seed),
            "bound_within_claim": within,
        }

    hypotheses: dict[str, Any] = {}
    h3_key = _level_key(H3_EPSILON)
    if h3_key in levels:
        tprs = [entry["tpr_at_1pct_fpr"] for entry in levels[h3_key]["per_seed"]]
        mean_tpr = float(np.mean(tprs))
        hypotheses["H3"] = {
            "statement": f"at epsilon = {H3_EPSILON:g}, tpr_at_1pct_fpr <= {H3_MAX_TPR}",
            "holds": bool(mean_tpr <= H3_MAX_TPR),
            "mean_tpr_at_1pct_fpr": mean_tpr,
            "max_tpr_at_1pct_fpr": float(np.max(tprs)),
            "decided_on": "mean over target seeds",
        }

    payload: dict[str, Any] = {
        "experiment": NAME,
        "status": "INVALID" if invalid else "VALID",
        "invalid_reasons": invalid,
        "controls": controls,
        "settings": {
            "epsilons": list(epsilons),
            "target_seeds": list(target_seeds),
            "n_reference": n_reference,
            "regime": regime,
            "overfit_factor": overfit_factor,
            "attack_seed": attack_seed,
            "n_users": n,
            "n_members_per_target": int(n // 2),
            "regime_rounds": spec.rounds,
            "regime_sample_rate": spec.sample_rate,
            "delta": delta_half,
            "score": "mean reference loss over references not trained on the user, minus "
            "target loss; loss on a fixed 50/50 visible/hidden split of the final history",
        },
        "results": {
            "levels": levels,
            "controls_detail": {"overfit": overfit_summary, "independent": indep_summary},
            "hypotheses": hypotheses,
            "training": {"models": len(jobs), "trained_now": trained_now},
        },
        "limitations": list(LIMITATIONS),
        "wall_seconds": round(time.time() - started, 2),
    }
    payload = _clean(payload)
    atomic_write_json(paths.results / f"{NAME}.json", payload)
    return payload


def _parse_epsilons(text: str) -> tuple[float | None, ...]:
    return tuple(None if t.strip().lower() == "none" else float(t) for t in text.split(","))


def cli(argv: list[str] | None = None) -> int:
    """``prism membership``."""
    parser = argparse.ArgumentParser(prog="prism membership", description=__doc__)
    parser.add_argument("--root", default=".")
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--threads", type=int, default=2)
    parser.add_argument("--epsilons", default="none,8,1", help="comma-separated; none = non-DP")
    parser.add_argument("--seeds", default="0,1,2")
    parser.add_argument("--n-reference", type=int, default=4)
    parser.add_argument("--regime", default="small")
    parser.add_argument("--overfit-factor", type=int, default=5)
    parser.add_argument("--attack-seed", type=int, default=0)
    args = parser.parse_args(argv)
    root = Path(args.root)
    payload = run(
        default_paths(root),
        load_frozen(root / "experiments" / "frozen.json"),
        epsilons=_parse_epsilons(args.epsilons),
        target_seeds=tuple(int(s) for s in args.seeds.split(",")),
        n_reference=args.n_reference,
        regime=args.regime,
        overfit_factor=args.overfit_factor,
        attack_seed=args.attack_seed,
        workers=args.workers,
        threads=args.threads,
    )
    print(f"status: {payload['status']}")
    for reason in payload["invalid_reasons"]:
        print(f"  INVALID: {reason}")
    print(f"{'level':<8} {'claimed':>8} {'auc':>7} {'tpr@1%':>8} {'eps_lb':>7}")
    for key, level in payload["results"]["levels"].items():
        agg = level["aggregate"]
        claimed = level["claimed_epsilon"]
        print(
            f"{key:<8} {'-' if claimed is None else f'{claimed:.2f}':>8} "
            f"{agg['auc']['mean']:7.4f} {agg['tpr_at_1pct_fpr']['mean']:8.4f} "
            f"{agg['epsilon_lower_bound']['max']:7.3f}"
        )
    for name, control in payload["controls"].items():
        print(f"control {name}: {'pass' if control['passed'] else 'FAIL'} {control['values']}")
    h3 = payload["results"]["hypotheses"].get("H3")
    if h3:
        print(f"H3 holds: {h3['holds']} (mean tpr@1% {h3['mean_tpr_at_1pct_fpr']:.4f})")
    return 0
