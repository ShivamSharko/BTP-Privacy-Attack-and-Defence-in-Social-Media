"""RQ1: what user-level differential privacy costs in recommendation quality.

For each sampling regime the grid trains, per seed: a non-private reference, a
clip-only diagnostic (clipping but no noise, not private), one model per privacy
level, and optionally "what-if" models whose noise is divided by k.

Three numbers summarise each privacy level against the same-regime, same-seed
non-private model:

* retention = NDCG_private / NDCG_non-private (hypothesis H1: at least 0.90 at epsilon 8);
* personalisation retained = (NDCG_private - NDCG_MostPopular) / (NDCG_non-private - NDCG_MostPopular);
* a paired Wilcoxon test across seeds, Holm-corrected within the regime.

The what-if runs are a simulation, not a guarantee: dividing the noise by k is
what epsilon 8 would need if the platform had roughly k times as many users per
round. On this population that noise gives no useful guarantee, so these runs
carry no epsilon, write no ledger, and are labelled as simulations.
"""

from __future__ import annotations

import argparse
import time
from pathlib import Path
from typing import Any

import numpy as np

from prism.config import Phase, RunConfig
from prism.data.bundle import load_bundle
from prism.eval.stats import (
    bootstrap_ci,
    holm_adjust,
    paired_tests,
    personalisation_retained,
    retention,
)
from prism.experiments.baselines import evaluate_baselines
from prism.experiments.regimes import Frozen, default_paths, load_frozen, make_run
from prism.experiments.runner import Paths, run_grid
from prism.io import atomic_write_json

NAME: str = "privacy_utility"
H1_EPSILON: float = 8.0
H1_THRESHOLD: float = 0.90


def level_key(record: dict[str, Any]) -> str:
    """Privacy level of a run record: 'nondp', 'cliponly', 'eps8', or 'whatif-x5'."""
    variant = str(record["config"]["variant"])
    if variant.startswith("whatif"):
        return variant
    train = record["config"]["train"]
    if record["config"]["target_epsilon"] is None:
        return "nondp" if train["clip_norm"] is None else "cliponly"
    return f"eps{record['config']['target_epsilon']:g}"


def build_configs(
    frozen: Frozen,
    paths: Paths,
    n_users: int,
    *,
    phase: Phase = "final",
    regimes: tuple[str, ...] | None = None,
    seeds: tuple[int, ...] | None = None,
    whatif: tuple[int, ...] = (),
    whatif_seeds: int = 3,
) -> list[RunConfig]:
    """Every run of the grid. Noise calibration happens here, in the parent process."""
    configs: list[RunConfig] = []
    for regime in regimes or tuple(frozen.regimes):
        for seed in seeds or frozen.seeds:
            common = {
                "name": NAME,
                "regime": regime,
                "phase": phase,
                "seed": seed,
                "n_users": n_users,
                "paths": paths,
            }
            configs.append(make_run(frozen, epsilon=None, **common))  # type: ignore[arg-type]
            configs.append(make_run(frozen, epsilon=None, clip_only=True, **common))  # type: ignore[arg-type]
            for epsilon in frozen.epsilons:
                configs.append(make_run(frozen, epsilon=epsilon, **common))  # type: ignore[arg-type]
        for factor in whatif:
            base = make_run(
                frozen,
                name=NAME,
                regime=regime,
                phase=phase,
                seed=0,
                epsilon=H1_EPSILON,
                n_users=n_users,
                paths=paths,
            )
            noise = base.train.noise_multiplier / factor
            for seed in (seeds or frozen.seeds)[:whatif_seeds]:
                configs.append(
                    make_run(
                        frozen,
                        name=NAME,
                        regime=regime,
                        phase=phase,
                        seed=seed,
                        epsilon=H1_EPSILON,
                        n_users=n_users,
                        paths=paths,
                        noise_multiplier=noise,
                        privacy_claim=False,
                        variant=f"whatif-x{factor}",
                    )
                )
    return configs


def summarise(records: list[dict[str, Any]], most_popular_ndcg: float) -> dict[str, Any]:
    """Aggregate run records into per-regime, per-level statistics and the H1 verdict."""
    usable = [r for r in records if r.get("status") == "ok"]
    summary: dict[str, Any] = {}
    for regime in sorted({r["config"]["regime"] for r in usable}):
        runs = [r for r in usable if r["config"]["regime"] == regime]
        by_level: dict[str, dict[int, dict[str, Any]]] = {}
        for record in runs:
            by_level.setdefault(level_key(record), {})[int(record["config"]["seed"])] = record
        reference = by_level.get("nondp", {})
        levels: dict[str, Any] = {}
        tested: list[str] = []
        for level, by_seed in by_level.items():
            seeds = sorted(by_seed)
            ndcg = np.array([by_seed[s]["metrics"]["ndcg@10"] for s in seeds], dtype=np.float64)
            entry: dict[str, Any] = {
                "seeds": len(seeds),
                "ndcg@10_mean": float(ndcg.mean()),
                "ndcg@10_ci95": list(bootstrap_ci(ndcg)) if ndcg.size > 1 else [None, None],
                "hr@10_mean": float(np.mean([by_seed[s]["metrics"]["hr@10"] for s in seeds])),
                "distinct@10_mean": float(
                    np.mean([by_seed[s]["metrics"]["distinct@10"] for s in seeds])
                ),
            }
            simulated = by_seed[seeds[0]].get("simulated_noise_multiplier")
            if simulated is not None:
                entry["simulated_noise_multiplier"] = simulated
                entry["privacy_claim"] = False
            privacy = by_seed[seeds[0]].get("privacy")
            if privacy:
                entry["epsilon_of_record"] = privacy["of_record"]
                entry["epsilon_at_delta_n2"] = privacy["at_delta_n2"]
                entry["epsilon_unamplified"] = privacy["unamplified"]
                entry["noise_multiplier"] = privacy["noise_multiplier"]
            paired = [s for s in seeds if s in reference]
            if level != "nondp" and paired:
                private = np.array([by_seed[s]["metrics"]["ndcg@10"] for s in paired])
                control = np.array([reference[s]["metrics"]["ndcg@10"] for s in paired])
                entry["retention"] = retention(float(private.mean()), float(control.mean()))
                entry["personalisation_retained"] = personalisation_retained(
                    float(private.mean()), float(control.mean()), most_popular_ndcg
                )
                entry["paired"] = paired_tests(private, control)
                if len(paired) > 1:
                    ratios = private / control
                    entry["retention_ci95"] = list(bootstrap_ci(ratios))
                if level.startswith("eps"):
                    tested.append(level)
            levels[level] = entry
        decisions = holm_adjust([levels[lv]["paired"]["wilcoxon_two_sided_p"] for lv in tested])
        for level, decision in zip(tested, decisions, strict=True):
            levels[level]["holm_rejects_no_difference"] = bool(decision)
        h1_level = f"eps{H1_EPSILON:g}"
        h1: dict[str, Any] = {"threshold": H1_THRESHOLD, "epsilon": H1_EPSILON, "met": None}
        if h1_level in levels and "retention" in levels[h1_level]:
            h1["retention"] = levels[h1_level]["retention"]
            h1["retention_ci95"] = levels[h1_level].get("retention_ci95")
            h1["met"] = bool(levels[h1_level]["retention"] >= H1_THRESHOLD)
        summary[regime] = {
            "levels": levels,
            "most_popular_ndcg@10": most_popular_ndcg,
            "h1": h1,
        }
    return summary


def run(
    paths: Paths,
    frozen: Frozen,
    *,
    phase: Phase = "final",
    regimes: tuple[str, ...] | None = None,
    seeds: tuple[int, ...] | None = None,
    whatif: tuple[int, ...] = (2, 5, 10),
    workers: int = 4,
    threads: int = 3,
) -> dict[str, Any]:
    """Run (or resume) the grid and write ``results/privacy_utility.json``."""
    started = time.time()
    bundle = load_bundle(paths.processed)
    configs = build_configs(
        frozen, paths, bundle.n_users, phase=phase, regimes=regimes, seeds=seeds, whatif=whatif
    )
    records = run_grid(configs, paths, workers=workers, threads=threads)
    baselines = evaluate_baselines(bundle, phase, paths.processed)
    failed = [r["id"] for r in records if r.get("status") != "ok"]
    payload = {
        "experiment": NAME,
        "status": "VALID" if not failed else "INVALID",
        "invalid_reasons": [f"run not ok: {identifier}" for identifier in failed],
        "evaluated_on": "validation" if phase == "tune" else "test",
        "runs": len(records),
        "frozen": frozen.model_dump(mode="json"),
        "baselines": baselines,
        "summary": summarise(records, float(baselines["most_popular"]["ndcg@10"])),
        "limitations": [
            "A regime is a sampling regime (rate and rounds), not a trust model; central and "
            "federated training are the same mechanism under user-level DP.",
            "The clip-only level is a diagnostic and is not private.",
            "What-if levels divide the epsilon-8 noise by k to simulate a population about k "
            "times larger; they claim no epsilon on this population and are not a guarantee.",
            "Hyperparameters were tuned on the validation split of the same users without "
            "accounting for the privacy cost of tuning.",
        ],
        "wall_seconds": round(time.time() - started, 2),
    }
    atomic_write_json(paths.results / f"{NAME}.json", payload)
    return payload


def cli(argv: list[str] | None = None) -> int:
    """``prism grid``."""
    parser = argparse.ArgumentParser(prog="prism grid", description=__doc__)
    parser.add_argument("--root", default=".")
    parser.add_argument("--phase", default="final", choices=["tune", "final"])
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--threads", type=int, default=3)
    parser.add_argument("--seeds", default=None, help="comma-separated, default: frozen seeds")
    parser.add_argument("--regimes", default=None, help="comma-separated, default: all")
    parser.add_argument("--whatif", default="2,5,10", help="noise divisors; empty for none")
    args = parser.parse_args(argv)
    root = Path(args.root)
    payload = run(
        default_paths(root),
        load_frozen(root / "experiments" / "frozen.json"),
        phase=args.phase,
        regimes=tuple(args.regimes.split(",")) if args.regimes else None,
        seeds=tuple(int(s) for s in args.seeds.split(",")) if args.seeds else None,
        whatif=tuple(int(k) for k in args.whatif.split(",")) if args.whatif else (),
        workers=args.workers,
        threads=args.threads,
    )
    print_summary(payload)
    return 0 if payload["status"] == "VALID" else 1


def print_summary(payload: dict[str, Any]) -> None:
    """Short table of the summary."""
    print(f"status={payload['status']} runs={payload['runs']} on {payload['evaluated_on']}")
    for regime, block in payload["summary"].items():
        print(f"[{regime}] MostPopular ndcg@10={block['most_popular_ndcg@10']:.4f}")
        for level, entry in block["levels"].items():
            line = f"  {level:<11} n={entry['seeds']:<2} ndcg@10={entry['ndcg@10_mean']:.4f}"
            if "retention" in entry:
                line += (
                    f" retention={entry['retention']:.3f}"
                    f" personalisation={entry['personalisation_retained']:.3f}"
                )
            if "epsilon_of_record" in entry:
                line += f" eps={entry['epsilon_of_record']:.2f}"
            print(line)
        print(f"  H1: {block['h1']}")
