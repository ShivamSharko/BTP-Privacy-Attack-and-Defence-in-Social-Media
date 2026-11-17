"""Free-riding clients: what they cost everyone, what they gain, and whether they can be caught.

A fraction of accounts takes part in training but sends an update that costs it nothing and
reveals nothing (all zeros, or noise with the honest norm). Every run clips updates to the
frozen norm bound and adds no noise; the aggregator is the plain sum.

Questions
  cost       NDCG@10 of the trained model overall, against the 0% free-rider run.
  gain       NDCG@10 of free-riders against contributors under the same model (free-riders
             still get recommendations from their own history at serving time), with a
             bootstrap interval of the difference.
  detection  when the server sees individual updates (no secure aggregation), the AUC of
             separating free-riders from contributors by update norm and by cosine similarity
             to the mean of the other updates in the chunk, over the last 20 rounds. Under
             secure aggregation the server sees only the sum: "not_applicable".

Controls: for the "zero" behaviour norm-based detection AUC is at least 0.95; at fraction 0 the
overall NDCG@10 is at least 1.1 x MostPopular's on the test split. Whether the "noise"
behaviour evades norm detection and is caught by the cosine score is a readout, not a control.
"""

from __future__ import annotations

import argparse
import time
from collections.abc import Sequence
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path
from typing import Any

import numpy as np
import numpy.typing as npt
import torch

from prism.attacks.free_riding import (
    BEHAVIOURS,
    DetectionCollector,
    choose_free_riders,
    detection_aucs,
    make_free_rider_hook,
)
from prism.eval.baselines import popularity_score_fn
from prism.eval.metrics import ranking_metrics_per_user
from prism.experiments.regimes import Frozen, default_paths, load_frozen, make_run
from prism.experiments.runner import Paths, _bundle, _finished, payload_provenance, run_one
from prism.fl.server import evaluate_per_user
from prism.io import atomic_write_json
from prism.seeding import stream

NAME: str = "free_riding"
CLEAN: str = "none"
DETECTION_ROUNDS: int = 20
ZERO_AUC_MINIMUM: float = 0.95
SANITY_FACTOR: float = 1.1
EVASION_BAND: float = 0.1  # "near 0.5": |AUC - 0.5| at most this
CAUGHT_AUC: float = 0.8  # "caught": AUC at least this
SECURE_AGGREGATION: str = "not_applicable"
LIMITATIONS: tuple[str, ...] = (
    "Two simple free-riding behaviours (all zeros; noise with the honest mean norm).",
    "Free-riders do not adapt to detection; an adaptive free-rider could imitate honest updates.",
    "Detection needs the server to see individual updates, so it is unavailable under secure "
    "aggregation; this is the conflict the experiment illustrates, not a detector proposal.",
    "Detection scores are computed on the clipped updates a server would receive, over the "
    "last 20 rounds only.",
    "Clip-only runs with the plain sum: no DP noise, so no privacy guarantee applies.",
    "Three seeds by default; min and max over seeds are reported, per-seed bootstrap intervals "
    "treat users as independent draws.",
    "Run records are reused when the configuration matches; records produced on 17 November "
    "2026 predate the commit of the code that produced them.",
)


def bootstrap_difference(
    first: npt.NDArray[np.float64],
    second: npt.NDArray[np.float64],
    draws: int = 1000,
    seed: int = 0,
) -> tuple[float, float, float]:
    """Mean(first) - mean(second) with a percentile 95% interval; NaN entries are ignored."""
    a, b = first[np.isfinite(first)], second[np.isfinite(second)]
    if a.size == 0 or b.size == 0:
        return float("nan"), float("nan"), float("nan")
    rng = np.random.default_rng(seed)
    diffs = np.empty(draws, dtype=np.float64)
    for index in range(draws):
        diffs[index] = (
            a[rng.integers(0, a.size, size=a.size)].mean()
            - b[rng.integers(0, b.size, size=b.size)].mean()
        )
    return (
        float(a.mean() - b.mean()),
        float(np.percentile(diffs, 2.5)),
        float(np.percentile(diffs, 97.5)),
    )


def _worker(job: dict[str, Any]) -> dict[str, Any]:
    """One (behaviour, fraction, seed) run; top-level so a spawned process can import it."""
    behaviour, seed, fraction = job["behaviour"], job["seed"], job["fraction"]
    label = CLEAN if fraction == 0.0 else behaviour
    outcome: dict[str, Any] = {
        "behaviour": label,
        "seed": seed,
        "fraction": fraction,
        "status": "failed",
        "skipped": False,
        "users": 0,
        "ndcg": None,
        "ndcg_free_riders": None,
        "ndcg_contributors": None,
        "gain": None,
        "norm_auc": None,
        "cosine_auc": None,
        "error": None,
    }
    paths: Paths = job["paths"]
    try:
        torch.set_num_threads(job["threads"])
        bundle = _bundle(str(paths.processed))
        config = make_run(
            job["frozen"],
            name=NAME,
            regime=job["regime"],
            phase="final",
            seed=seed,
            epsilon=None,
            n_users=bundle.n_users,
            paths=paths,
            clip_only=True,
            variant=f"{label}-f{fraction}",
            rounds=job["rounds"],
            sample_rate=job["sample_rate"],
        )
        clip_norm = config.train.clip_norm
        free_riders = choose_free_riders(bundle.n_users, fraction, stream(seed, "free-riders"))
        record = _finished(config, paths)
        outcome["skipped"] = record is not None
        if (
            record is None
            or "detection" not in record
            or not paths.checkpoint(config).exists()
            or record.get("behaviour") != label
            or record.get("fraction") != fraction
            or record.get("aggregator") != "sum"
        ):
            outcome["skipped"] = False
            collector = DetectionCollector(from_round=max(0, job["rounds"] - DETECTION_ROUNDS))
            hook = make_free_rider_hook(
                free_riders, behaviour, seed, clip_norm=clip_norm, collector=collector
            )
            record = run_one(
                config,
                paths,
                threads=job["threads"],
                aggregator="sum",
                client_hook=hook,
                extra={"aggregator": "sum", "behaviour": label, "fraction": fraction},
            )
            if record.get("status") == "ok":
                record["detection"] = detection_aucs(*collector.arrays())
                atomic_write_json(paths.record(config), record)
        outcome["status"] = record["status"]
        outcome["users"] = int(record.get("users", bundle.n_users))
        outcome["error"] = record.get("error")
        if record["status"] == "ok":
            flat = np.load(paths.checkpoint(config))["flat"]
            metrics, per_user = evaluate_per_user(flat, bundle, "final", config.model)
            outcome["ndcg"] = float(metrics["ndcg@10"])
            outcome["norm_auc"] = record["detection"]["norm_auc"]
            outcome["cosine_auc"] = record["detection"]["cosine_auc"]
            rider = np.zeros(bundle.n_users, dtype=bool)
            rider[free_riders] = True
            if rider.any() and (~rider).any():
                outcome["ndcg_free_riders"] = float(np.nanmean(per_user[rider]))
                outcome["ndcg_contributors"] = float(np.nanmean(per_user[~rider]))
                diff, low, high = bootstrap_difference(per_user[rider], per_user[~rider], seed=seed)
                outcome["gain"] = {"difference": diff, "ci95_low": low, "ci95_high": high}
    except Exception as error:  # a failed run must invalidate the experiment, not crash it
        outcome["status"] = "failed"
        outcome["error"] = f"{type(error).__name__}: {error}"
    return outcome


def _stats(values: list[float]) -> dict[str, Any]:
    return {
        "mean": float(np.mean(values)),
        "min": float(np.min(values)),
        "max": float(np.max(values)),
        "per_seed": values,
    }


def _most_popular_ndcg(paths: Paths) -> float:
    bundle = _bundle(str(paths.processed))
    metrics, _ = ranking_metrics_per_user(
        popularity_score_fn(bundle.history("final"), bundle.n_items),
        bundle.history("final"),
        bundle.targets("final"),
        bundle.n_items,
    )
    return float(metrics["ndcg@10"])


def _is(outcome: dict[str, Any], behaviour: str, fraction: float) -> bool:
    return bool(outcome["behaviour"] == behaviour and outcome["fraction"] == fraction)


def noise_readout(results: dict[str, dict[str, Any]]) -> dict[str, Any]:
    """Does the noise behaviour evade norm detection, and does the cosine score catch it?"""
    rows: list[dict[str, Any]] = []
    for fraction, cell in results.get("noise", {}).items():
        norm, cosine = cell["detection"]["norm_auc"], cell["detection"]["cosine_auc"]
        rows.append(
            {
                "fraction": float(fraction),
                "norm_auc": None if norm is None else norm["mean"],
                "cosine_auc": None if cosine is None else cosine["mean"],
            }
        )
    norm_values = [r["norm_auc"] for r in rows if r["norm_auc"] is not None]
    cosine_values = [r["cosine_auc"] for r in rows if r["cosine_auc"] is not None]
    return {
        "statement": "noise with the honest mean norm evades the norm score (AUC near 0.5) "
        "but is caught by the cosine score",
        "evasion_band": EVASION_BAND,
        "caught_auc": CAUGHT_AUC,
        "per_fraction": rows,
        "evades_norm_detection": bool(norm_values)
        and all(abs(v - 0.5) <= EVASION_BAND for v in norm_values),
        "caught_by_cosine": bool(cosine_values) and all(v >= CAUGHT_AUC for v in cosine_values),
    }


def _cell(
    good: list[dict[str, Any]], behaviour: str, fraction: float, clean_mean: float
) -> dict[str, Any] | None:
    rows = [o for o in good if _is(o, behaviour, fraction)]
    if not rows:
        return None

    def pick(key: str) -> list[float]:
        return [float(o[key]) for o in rows if o[key] is not None]

    ndcgs = pick("ndcg")
    gains = [o["gain"] for o in rows if o["gain"]]
    norm_aucs, cosine_aucs = pick("norm_auc"), pick("cosine_auc")
    drop = (clean_mean - float(np.mean(ndcgs))) / clean_mean if clean_mean > 0.0 else 0.0
    return {
        "ndcg": _stats(ndcgs),
        "ndcg_contributors": _stats(pick("ndcg_contributors"))
        if pick("ndcg_contributors")
        else None,
        "ndcg_free_riders": _stats(pick("ndcg_free_riders")) if pick("ndcg_free_riders") else None,
        "cost_to_everyone": {"relative_ndcg_drop": drop, "clean_ndcg_mean": clean_mean},
        "free_rider_gain": {
            "definition": "mean NDCG@10 of free-riders minus contributors, same model",
            "difference_mean": float(np.mean([g["difference"] for g in gains])) if gains else None,
            "per_seed": [
                {
                    "difference": g["difference"],
                    "ci95_low": g["ci95_low"],
                    "ci95_high": g["ci95_high"],
                }
                for g in gains
            ],
        },
        "detection": {
            "secure_aggregation": SECURE_AGGREGATION,
            "plaintext_updates": "low norm or low cosine to the others is suspicious; AUC of "
            "separating free-riders from contributors over the last 20 rounds",
            "norm_auc": _stats(norm_aucs) if norm_aucs else None,
            "cosine_auc": _stats(cosine_aucs) if cosine_aucs else None,
        },
    }


def run(
    paths: Paths,
    frozen: Frozen,
    *,
    fractions: Sequence[float] = (0.0, 0.1, 0.3),
    behaviours: Sequence[str] = BEHAVIOURS,
    seeds: Sequence[int] = (0, 1, 2),
    regime: str = "small",
    sample_rate: float = 0.02,
    rounds: int = 200,
    workers: int = 4,
    threads: int = 2,
) -> dict[str, Any]:
    """Run the grid, evaluate the controls and write ``results/free_riding.json``."""
    started = time.time()
    fractions = tuple(float(f) for f in fractions)
    if 0.0 not in fractions or max(fractions) <= 0.0:
        raise ValueError("fractions must include 0.0 and at least one positive value")
    if "zero" not in behaviours:
        raise ValueError("behaviours must include 'zero' (the positive control)")
    unknown = [b for b in behaviours if b not in BEHAVIOURS]
    if unknown:
        raise ValueError(f"unknown behaviours {unknown}")
    jobs = [
        {
            "behaviour": behaviour,
            "seed": seed,
            "fraction": fraction,
            "paths": paths,
            "frozen": frozen,
            "regime": regime,
            "sample_rate": sample_rate,
            "rounds": rounds,
            "threads": threads,
        }
        for fraction in fractions
        for behaviour in (behaviours if fraction > 0.0 else behaviours[:1])
        for seed in seeds
    ]
    outcomes: list[dict[str, Any]] = []
    if workers <= 1:
        outcomes = [_worker(job) for job in jobs]
    else:
        with ProcessPoolExecutor(max_workers=workers) as pool:
            futures = [pool.submit(_worker, job) for job in jobs]
            for future in as_completed(futures):
                outcome = future.result()
                outcomes.append(outcome)
                print(
                    f"{outcome['status']:>6} {outcome['behaviour']} f={outcome['fraction']} "
                    f"seed={outcome['seed']} ndcg={outcome['ndcg']}",
                    flush=True,
                )

    reasons: list[str] = []
    for outcome in outcomes:
        if outcome["status"] != "ok" or outcome["ndcg"] is None:
            reasons.append(
                f"run {outcome['behaviour']} f={outcome['fraction']} seed={outcome['seed']} "
                f"did not finish ({outcome['status']}: {outcome['error']})"
            )
    good = sorted((o for o in outcomes if o["ndcg"] is not None), key=lambda o: o["seed"])
    n_users = max((int(o["users"]) for o in outcomes), default=0)

    clean_ndcg = [float(o["ndcg"]) for o in good if _is(o, CLEAN, 0.0)]
    clean_mean = float(np.mean(clean_ndcg)) if clean_ndcg else 0.0
    results: dict[str, dict[str, Any]] = {
        "clean": {"ndcg": _stats(clean_ndcg)} if clean_ndcg else {}
    }
    for behaviour in behaviours:
        results[behaviour] = {}
        for fraction in (f for f in fractions if f > 0.0):
            cell = _cell(good, behaviour, fraction, clean_mean)
            if cell is not None:
                results[behaviour][str(fraction)] = cell

    zero_runs = [o for o in outcomes if o["behaviour"] == "zero"]
    zero_aucs = [float(o["norm_auc"]) for o in zero_runs if o["norm_auc"] is not None]
    worst_zero = min(zero_aucs) if zero_aucs and len(zero_aucs) == len(zero_runs) else None
    popular = _most_popular_ndcg(paths) if clean_ndcg else None
    controls: list[dict[str, Any]] = [
        {
            "name": "positive_zero_detection",
            "what": "lowest norm-based detection AUC of the 'zero' behaviour over fractions "
            "and seeds (plaintext updates)",
            "measured": worst_zero,
            "threshold": ZERO_AUC_MINIMUM,
            "passed": worst_zero is not None and worst_zero >= ZERO_AUC_MINIMUM,
        },
        {
            "name": "sanity_beats_most_popular",
            "what": "overall NDCG@10 at fraction 0 over MostPopular's NDCG@10 (test split)",
            "measured": clean_mean / popular if popular else None,
            "threshold": SANITY_FACTOR,
            "passed": popular is not None and clean_mean >= SANITY_FACTOR * popular,
        },
    ]
    for control in controls:
        if not control["passed"]:
            reasons.append(
                f"control {control['name']} failed: measured {control['measured']}, "
                f"threshold {control['threshold']}"
            )

    result: dict[str, Any] = {
        "experiment": NAME,
        "status": "INVALID" if reasons else "VALID",
        "invalid_reasons": reasons,
        "controls": controls,
        "settings": {
            "fractions": list(fractions),
            "behaviours": list(behaviours),
            "seeds": list(seeds),
            "regime": regime,
            "sample_rate": sample_rate,
            "rounds": rounds,
            "phase": "final",
            "noise": "none (clip only)",
            "aggregator": "sum",
            "clip_norm": frozen.regimes[regime].clip_norm,
            "users": n_users,
            "detection_rounds": DETECTION_ROUNDS,
            "runs": len(outcomes),
            "skipped_runs": sum(1 for o in outcomes if o["skipped"]),
            "most_popular_ndcg@10": popular,
        },
        "results": results,
        "noise_readout": noise_readout(results),
        "limitations": list(LIMITATIONS),
        "provenance": payload_provenance(__file__, extra=("attacks/free_riding.py",)),
        "wall_seconds": round(time.time() - started, 1),
    }
    atomic_write_json(paths.results / f"{NAME}.json", result)
    return result


def cli(argv: list[str] | None = None) -> int:
    """Command line wrapper around ``run``."""
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0] if __doc__ else None)
    parser.add_argument("--root", default=".")
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--threads", type=int, default=2)
    parser.add_argument("--regime", default="small")
    parser.add_argument("--sample-rate", type=float, default=0.02)
    parser.add_argument("--rounds", type=int, default=200)
    parser.add_argument("--fractions", type=float, nargs="+", default=[0.0, 0.1, 0.3])
    parser.add_argument("--seeds", type=int, nargs="+", default=[0, 1, 2])
    parser.add_argument("--behaviours", nargs="+", default=list(BEHAVIOURS))
    args = parser.parse_args(argv)
    root = Path(args.root)
    frozen = load_frozen(root / "experiments" / "frozen.json")
    result = run(
        default_paths(root),
        frozen,
        fractions=tuple(args.fractions),
        behaviours=tuple(args.behaviours),
        seeds=tuple(args.seeds),
        regime=args.regime,
        sample_rate=args.sample_rate,
        rounds=args.rounds,
        workers=args.workers,
        threads=args.threads,
    )
    print(f"free_riding: {result['status']} ({result['wall_seconds']} s)")
    clean = result["results"]["clean"]
    if clean:
        print(f"clean (0% free-riders) NDCG@10: {clean['ndcg']['mean']:.4f}")
    print(
        f"{'behaviour':<10}{'frac':>6}{'ndcg@10':>9}{'cost':>8}{'gain':>9}"
        f"{'norm AUC':>10}{'cos AUC':>9}"
    )

    def fmt(value: float | None, width: int, digits: int = 3) -> str:
        return f"{'-':>{width}}" if value is None else f"{value:>{width}.{digits}f}"

    for behaviour, cells in result["results"].items():
        if behaviour == "clean":
            continue
        for fraction, cell in cells.items():
            norm, cosine = cell["detection"]["norm_auc"], cell["detection"]["cosine_auc"]
            print(
                f"{behaviour:<10}{fraction:>6}{cell['ndcg']['mean']:>9.4f}"
                f"{cell['cost_to_everyone']['relative_ndcg_drop']:>8.3f}"
                f"{fmt(cell['free_rider_gain']['difference_mean'], 9, 4)}"
                f"{fmt(None if norm is None else norm['mean'], 10)}"
                f"{fmt(None if cosine is None else cosine['mean'], 9)}"
            )
    for reason in result["invalid_reasons"]:
        print(f"INVALID: {reason}")
    return 0 if result["status"] == "VALID" else 1


if __name__ == "__main__":
    raise SystemExit(cli())
