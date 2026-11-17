"""Model poisoning by malicious accounts, with and without secure aggregation.

A fraction of accounts is attacker-controlled and pushes one unpopular target
business into everyone's top-10. Every run clips updates to the frozen norm bound
and adds no noise (robust aggregators and DP noise are not combined here).

Modes
  secure_sum_norm_bound   the server sees only the sum of clipped updates, so it cannot
                          filter anything; norm clipping is its only protection.
  plaintext_trimmed_mean  the server sees every update and takes a coordinate-wise
                          trimmed mean (needs plaintext updates, so no secure aggregation).
  plaintext_median        the same with the coordinate-wise median.
  committee_median_size4  secure-aggregation committees of 4 clients; the server sees only the
  committee_median_size20 committee sums and takes their coordinate-wise median (committees of 20).
                          A compromise: robust if most committees are attacker-free, but a small
                          committee hides each update among fewer others.

Hypothesis H4 is reported, not gated: the trimmed mean limits promotion better than
the secure-sum mode at every attacker fraction, and the gap is largest at the largest
fraction (Amendment 1: "Lower at every share and the gap largest at 30%").
"""

from __future__ import annotations

import argparse
import time
from collections.abc import Sequence
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path
from typing import Any

import numpy as np
import torch

from prism.attacks.poisoning import (
    choose_malicious,
    choose_target_item,
    clean_committee_share,
    make_committee_median,
    make_promotion_hook,
    target_exposure,
)
from prism.experiments.regimes import Frozen, default_paths, load_frozen, make_run
from prism.experiments.runner import Paths, _bundle, _finished, payload_provenance, run_one
from prism.fl.aggregate import AggregatorName
from prism.io import atomic_write_json
from prism.models.hybrid import content_base, make_layout
from prism.seeding import stream

NAME: str = "poisoning"
SUM_MODE: str = "secure_sum_norm_bound"
TRIMMED_MODE: str = "plaintext_trimmed_mean"
AGGREGATORS: dict[str, AggregatorName] = {
    SUM_MODE: "sum",
    TRIMMED_MODE: "trimmed_mean",
    "plaintext_median": "median",
}
COMMITTEE_SIZES: dict[str, int] = {"committee_median_size4": 4, "committee_median_size20": 20}
COMMITTEE_LABEL: str = "committee_median"
DEFAULT_MODES: tuple[str, ...] = (SUM_MODE, TRIMMED_MODE, "plaintext_median", *COMMITTEE_SIZES)
PROMOTION_FACTOR: float = 10.0
CLEAN_EXPOSURE_LIMIT: float = 0.05
LIMITATIONS: tuple[str, ...] = (
    "One attack strategy: norm-bounded targeted promotion of a single item.",
    "Attackers do not adapt to the aggregator; an adaptive attacker could do better against "
    "the trimmed mean and the median.",
    "The robust modes run without DP noise, so no privacy guarantee applies to them.",
    "Coordinate-wise robust aggregators need the server to see each individual update, which "
    "secure aggregation prevents; the robust modes are therefore not compatible with it.",
    "A committee of 4 hides an individual update among only 3 others, so the committee modes "
    "give much weaker secure-aggregation protection than the secure-sum mode.",
    "Committees are simulated: the committee sums are computed in the clear in this simulation, "
    "no secure-aggregation protocol runs.",
    "The committee modes add no DP noise, so no privacy guarantee applies to them.",
    "Three seeds by default; min and max over seeds are reported, not confidence intervals.",
    "Run records are reused when the configuration matches; records produced on 17 November "
    "2026 predate the commit of the code that produced them.",
    "Exposure is the share of other users whose top-10 contains the target, on one target "
    "item per seed drawn from the least popular third.",
)


def exposure_ratio(exposure: float, base_exposure: float, n_users: int) -> float:
    """Exposure relative to the same mode's clean exposure, floored at one user in ``n_users``."""
    return exposure / max(base_exposure, 1.0 / n_users)


def utility_drop(ndcg: float, base_ndcg: float) -> float:
    """Relative loss of NDCG@10 against the same mode at fraction 0."""
    return (base_ndcg - ndcg) / base_ndcg if base_ndcg > 0.0 else 0.0


def h4_readout(
    exposure: dict[str, dict[float, float]], fractions: Sequence[float]
) -> dict[str, Any]:
    """Trimmed mean lower than the secure sum at every share, and the gap largest at the top share."""
    rows: list[dict[str, Any]] = []
    gaps: list[float] = []
    for fraction in (f for f in fractions if f > 0.0):
        by_mode = {
            mode: values[fraction] for mode, values in exposure.items() if fraction in values
        }
        summed, trimmed = by_mode.get(SUM_MODE), by_mode.get(TRIMMED_MODE)
        gap = summed - trimmed if summed is not None and trimmed is not None else None
        if gap is not None:
            gaps.append(gap)
        rows.append(
            {
                "fraction": fraction,
                "exposure": by_mode,
                "trimmed_mean_lower": None if gap is None else gap > 0.0,
                "gap": gap,
            }
        )
    lower_everywhere = bool(gaps) and all(gap > 0.0 for gap in gaps)
    largest_at_max = bool(gaps) and gaps[-1] >= max(gaps)
    return {
        "statement": "plaintext trimmed mean limits target promotion better than the secure-sum "
        "mode at every attacker fraction, and the gap is largest at the largest fraction",
        "per_fraction": rows,
        "lower_at_every_share": lower_everywhere,
        "gap_largest_at_max_share": largest_at_max,
        "holds": lower_everywhere and largest_at_max,
    }


def committee_tradeoff(
    results: dict[str, dict[str, Any]], modes: Sequence[str], fractions: Sequence[float]
) -> dict[str, Any]:
    """Per committee size: clean NDCG@10, and per attacker fraction exposure and clean share."""
    out: dict[str, Any] = {}
    for mode in modes:
        if mode not in COMMITTEE_SIZES or mode not in results:
            continue
        cells = results[mode]
        clean = cells.get("0.0", {}).get("ndcg", {}).get("mean")
        out[mode] = {
            "committee_size": COMMITTEE_SIZES[mode],
            "clean_ndcg_at_fraction_0": clean,
            "per_fraction": [
                {
                    "fraction": fraction,
                    "target_exposure": cells[str(fraction)]["exposure"]["mean"],
                    "clean_committee_share": cells[str(fraction)]["clean_committee_share"],
                }
                for fraction in fractions
                if str(fraction) in cells
            ],
        }
    return out


def _stale_trim(record: dict[str, Any], mode: str, trim_fraction: float) -> bool:
    """A stored trim fraction that differs from the requested one (legacy records: accepted)."""
    stored = record.get("trim_fraction")
    trimmed = mode in AGGREGATORS and AGGREGATORS[mode] != "sum"
    return trimmed and stored is not None and float(stored) != trim_fraction


def _stale_aggregator(record: dict[str, Any], mode: str) -> bool:
    """A stored aggregator or committee size that differs from the requested one."""
    label = AGGREGATORS.get(mode, COMMITTEE_LABEL)
    if record.get("aggregator") is not None and record["aggregator"] != label:
        return True
    size = COMMITTEE_SIZES.get(mode)
    stored = record.get("committee_size")
    return size is not None and stored is not None and int(stored) != size


def _aggregator_for(mode: str) -> Any:
    """The ``aggregator`` argument of ``train`` for a mode (built inside the worker)."""
    if mode in COMMITTEE_SIZES:
        return make_committee_median(committee_size=COMMITTEE_SIZES[mode])
    return AGGREGATORS[mode]


def _worker(job: dict[str, Any]) -> dict[str, Any]:
    """One (mode, fraction, seed) run; top-level so a spawned process can import it."""
    mode, seed, fraction = job["mode"], job["seed"], job["fraction"]
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
            variant=f"{mode}-f{fraction}",
            rounds=job["rounds"],
            sample_rate=job["sample_rate"],
        )
        clip_norm = config.train.clip_norm
        assert clip_norm is not None
        target = choose_target_item(bundle.popularity("final"), stream(seed, "poison-target"))
        malicious = choose_malicious(bundle.n_users, fraction, stream(seed, "poison-accounts"))
        record = _finished(config, paths)
        skipped = record is not None
        if (
            record is None
            or _stale_trim(record, mode, job["trim_fraction"])
            or _stale_aggregator(record, mode)
            or ("target_exposure" not in record and not paths.checkpoint(config).exists())
        ):
            skipped = False
            hook = make_promotion_hook(
                target,
                malicious,
                clip_norm,
                bundle,
                "final",
                make_layout(bundle.n_items, config.model.dim),
                content_base(bundle.item_content, config.model),
                config.model,
            )
            record = run_one(
                config,
                paths,
                threads=job["threads"],
                aggregator=_aggregator_for(mode),
                trim_fraction=job["trim_fraction"],
                client_hook=hook,
                extra={
                    "aggregator": AGGREGATORS.get(mode, COMMITTEE_LABEL),
                    "trim_fraction": job["trim_fraction"],
                    "committee_size": COMMITTEE_SIZES.get(mode),
                },
            )
        if record.get("status") == "ok" and "target_exposure" not in record:
            flat = np.load(paths.checkpoint(config))["flat"]
            record["target_exposure"] = target_exposure(
                flat, bundle, "final", config.model, target, exclude=malicious
            )
            record["n_malicious"] = int(malicious.size)
            atomic_write_json(paths.record(config), record)
        return {
            "mode": mode,
            "seed": seed,
            "fraction": fraction,
            "status": record["status"],
            "skipped": skipped,
            "users": int(record.get("users", bundle.n_users)),
            "exposure": record.get("target_exposure"),
            "ndcg": record.get("metrics", {}).get("ndcg@10"),
            "error": record.get("error"),
        }
    except Exception as error:  # a failed run must invalidate the experiment, not crash it
        return {
            "mode": mode,
            "seed": seed,
            "fraction": fraction,
            "status": "failed",
            "skipped": False,
            "users": 0,
            "exposure": None,
            "ndcg": None,
            "error": f"{type(error).__name__}: {error}",
        }


def _stats(values: list[float]) -> dict[str, Any]:
    return {
        "mean": float(np.mean(values)),
        "min": float(np.min(values)),
        "max": float(np.max(values)),
        "per_seed": values,
    }


def run(
    paths: Paths,
    frozen: Frozen,
    *,
    fractions: Sequence[float] = (0.0, 0.1, 0.2, 0.3),
    modes: Sequence[str] = DEFAULT_MODES,
    seeds: Sequence[int] = (0, 1, 2),
    regime: str = "small",
    sample_rate: float = 0.02,
    rounds: int = 200,
    trim_fraction: float = 0.35,
    workers: int = 4,
    threads: int = 2,
) -> dict[str, Any]:
    """Run the grid, evaluate the controls and write ``results/poisoning.json``."""
    started = time.time()
    fractions = tuple(float(f) for f in fractions)
    if 0.0 not in fractions or max(fractions) <= 0.0:
        raise ValueError("fractions must include 0.0 and at least one positive value")
    if SUM_MODE not in modes:
        raise ValueError(f"modes must include {SUM_MODE}")
    unknown = [m for m in modes if m not in AGGREGATORS and m not in COMMITTEE_SIZES]
    if unknown:
        raise ValueError(f"unknown modes {unknown}")
    jobs = [
        {
            "mode": mode,
            "seed": seed,
            "fraction": fraction,
            "paths": paths,
            "frozen": frozen,
            "regime": regime,
            "sample_rate": sample_rate,
            "rounds": rounds,
            "trim_fraction": trim_fraction,
            "threads": threads,
        }
        for mode in modes
        for fraction in fractions
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
                    f"{outcome['status']:>6} {outcome['mode']} f={outcome['fraction']} "
                    f"seed={outcome['seed']} exposure={outcome['exposure']}",
                    flush=True,
                )

    reasons: list[str] = []
    for outcome in outcomes:
        if outcome["status"] != "ok" or outcome["exposure"] is None or outcome["ndcg"] is None:
            reasons.append(
                f"run {outcome['mode']} f={outcome['fraction']} seed={outcome['seed']} "
                f"did not finish ({outcome['status']}: {outcome['error']})"
            )
    good = [o for o in outcomes if o["exposure"] is not None]
    n_users = max((int(o["users"]) for o in outcomes), default=0)

    def pick(mode: str, fraction: float, key: str) -> list[float]:
        return [
            float(o[key])
            for o in sorted(good, key=lambda o: o["seed"])
            if o["mode"] == mode and o["fraction"] == fraction and o[key] is not None
        ]

    results: dict[str, dict[str, Any]] = {}
    means: dict[str, dict[float, float]] = {}
    for mode in modes:
        results[mode] = {}
        means[mode] = {}
        base_exposure = (
            float(np.mean(pick(mode, 0.0, "exposure"))) if pick(mode, 0.0, "exposure") else 0.0
        )
        base_ndcg = float(np.mean(pick(mode, 0.0, "ndcg"))) if pick(mode, 0.0, "ndcg") else 0.0
        for fraction in fractions:
            exposures, ndcgs = pick(mode, fraction, "exposure"), pick(mode, fraction, "ndcg")
            if not exposures or not ndcgs:
                continue
            exposure_stats, ndcg_stats = _stats(exposures), _stats(ndcgs)
            means[mode][fraction] = exposure_stats["mean"]
            cell: dict[str, Any] = {
                "exposure": exposure_stats,
                "ndcg": ndcg_stats,
                "utility_drop": utility_drop(ndcg_stats["mean"], base_ndcg),
                "exposure_ratio": exposure_ratio(exposure_stats["mean"], base_exposure, n_users),
            }
            if mode in COMMITTEE_SIZES:
                cell["committee_size"] = COMMITTEE_SIZES[mode]
                cell["clean_committee_share"] = clean_committee_share(
                    fraction, COMMITTEE_SIZES[mode]
                )
            results[mode][str(fraction)] = cell

    controls: list[dict[str, Any]] = []
    largest = max(fractions)
    sum_cells = results.get(SUM_MODE, {})
    ratio = sum_cells.get(str(largest), {}).get("exposure_ratio")
    controls.append(
        {
            "name": "positive_promotion",
            "what": f"mean target exposure at fraction {largest} over the clean mean (floor "
            f"1/{n_users} users) in {SUM_MODE}",
            "measured": ratio,
            "threshold": PROMOTION_FACTOR,
            "passed": ratio is not None and ratio >= PROMOTION_FACTOR,
        }
    )
    clean = [v for mode in modes for v in pick(mode, 0.0, "exposure")]
    worst_clean = max(clean) if clean else None
    controls.append(
        {
            "name": "negative_clean",
            "what": "largest target exposure at fraction 0 over all modes and seeds",
            "measured": worst_clean,
            "threshold": CLEAN_EXPOSURE_LIMIT,
            "passed": worst_clean is not None and worst_clean < CLEAN_EXPOSURE_LIMIT,
        }
    )
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
            "modes": list(modes),
            "seeds": list(seeds),
            "regime": regime,
            "sample_rate": sample_rate,
            "rounds": rounds,
            "trim_fraction": trim_fraction,
            "phase": "final",
            "noise": "none (clip only)",
            "clip_norm": frozen.regimes[regime].clip_norm,
            "users": n_users,
            "exposure_ratio_denominator": "max(mean clean exposure of the mode, 1/users)",
            "utility_drop": "(clean mean NDCG@10 - NDCG@10) / clean mean NDCG@10, same mode",
            "skipped_runs": sum(1 for o in outcomes if o["skipped"]),
        },
        "results": results,
        "h4": h4_readout(means, fractions),
        "committee_tradeoff": committee_tradeoff(results, modes, fractions),
        "provenance": payload_provenance(__file__, extra=("attacks/poisoning.py",)),
        "limitations": list(LIMITATIONS),
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
    parser.add_argument("--trim-fraction", type=float, default=0.35)
    parser.add_argument("--fractions", type=float, nargs="+", default=[0.0, 0.1, 0.2, 0.3])
    parser.add_argument("--seeds", type=int, nargs="+", default=[0, 1, 2])
    parser.add_argument("--modes", nargs="+", default=list(DEFAULT_MODES))
    args = parser.parse_args(argv)
    root = Path(args.root)
    frozen = load_frozen(root / "experiments" / "frozen.json")
    paths = default_paths(root)
    result = run(
        paths,
        frozen,
        fractions=tuple(args.fractions),
        modes=tuple(args.modes),
        seeds=tuple(args.seeds),
        regime=args.regime,
        sample_rate=args.sample_rate,
        rounds=args.rounds,
        trim_fraction=args.trim_fraction,
        workers=args.workers,
        threads=args.threads,
    )
    print(f"poisoning: {result['status']} ({result['wall_seconds']} s)")
    print(f"{'mode':<24}{'frac':>6}{'exposure':>10}{'ndcg@10':>10}{'x clean':>9}{'util drop':>10}")
    for mode, cells in result["results"].items():
        for fraction, cell in cells.items():
            print(
                f"{mode:<24}{fraction:>6}{cell['exposure']['mean']:>10.4f}"
                f"{cell['ndcg']['mean']:>10.4f}{cell['exposure_ratio']:>9.1f}"
                f"{cell['utility_drop']:>10.3f}"
            )
    print(f"H4 holds: {result['h4']['holds']}")
    for reason in result["invalid_reasons"]:
        print(f"INVALID: {reason}")
    return 0 if result["status"] == "VALID" else 1


if __name__ == "__main__":
    raise SystemExit(cli())
