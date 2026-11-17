"""Sensitivity analyses the pre-registration left open, plus a list-length readout.

Each variant dataset (k-core 10, k-core 20, positive feedback only with k-core 15) is rebuilt from
the same filtered source files as the main dataset (``prism.data.variants``), and a reduced
privacy-utility experiment is rerun on it: per regime and seed, the non-private reference and one
model per epsilon. Hyperparameters stay frozen at the values tuned on the main dataset.

Readouts per variant and regime: dataset size, MostPopular and item-item ridge NDCG@10, the
non-private NDCG@10, and for each epsilon the NDCG@10, retention, personalisation retained and the
retention computed from NDCG@20 and HR@10/HR@20 (the list-length readout). ``conclusion_stable``
says whether the verdict of H1 at epsilon 8 and the sign of personalisation retained match the
main dataset (the "k15" reference row, recomputed from the main run records when they exist).
"""

from __future__ import annotations

import argparse
import json
import time
from pathlib import Path
from typing import Any, Final

import numpy as np

from prism.data.bundle import load_bundle
from prism.data.variants import VARIANTS, build_variant, variant_dir
from prism.experiments.baselines import evaluate_baselines
from prism.experiments.privacy_utility import (
    H1_EPSILON,
    H1_THRESHOLD,
    level_key,
    summarise,
)
from prism.experiments.regimes import Frozen, load_frozen, make_run
from prism.experiments.runner import Paths, payload_provenance, run_grid
from prism.io import atomic_write_json, read_json

NAME: Final[str] = "sensitivity"
CONTROL_RATIO: Final[float] = 1.1
REFERENCE: Final[str] = "k15"
MAIN_NAME: Final[str] = "privacy_utility"
LENGTH_METRICS: Final[tuple[str, ...]] = ("ndcg@10", "ndcg@20", "hr@10", "hr@20")


def _eps_key(epsilon: float) -> str:
    return f"{epsilon:g}"


def list_length_readout(
    records: list[dict[str, Any]], regime: str, epsilon: float
) -> dict[str, float | None]:
    """Retention at each list length: mean private metric over mean non-private, same seeds.

    A metric missing from any paired record (or no paired seeds) gives None.
    """
    private: dict[int, dict[str, Any]] = {}
    reference: dict[int, dict[str, Any]] = {}
    for record in records:
        if record.get("status") != "ok" or record["config"]["regime"] != regime:
            continue
        level = level_key(record)
        seed = int(record["config"]["seed"])
        if level == "nondp":
            reference[seed] = record["metrics"]
        elif level == f"eps{_eps_key(epsilon)}":
            private[seed] = record["metrics"]
    seeds = sorted(set(private) & set(reference))
    result: dict[str, float | None] = {}
    for metric in LENGTH_METRICS:
        if not seeds or any(metric not in m for s in seeds for m in (private[s], reference[s])):
            result[metric] = None
            continue
        base = float(np.mean([reference[s][metric] for s in seeds]))
        result[metric] = (
            float(np.mean([private[s][metric] for s in seeds])) / base if base != 0.0 else None
        )
    return result


def conclusion_stable(
    block: dict[str, Any], reference: dict[str, Any] | None
) -> dict[str, bool | None]:
    """Same H1 verdict at epsilon 8 and same sign of personalisation retained as the main data."""
    unknown: dict[str, bool | None] = {
        "h1_verdict_same": None,
        "personalisation_sign_same": None,
        "stable": None,
    }
    if reference is None:
        return unknown
    key = _eps_key(H1_EPSILON)

    def sign(entry: dict[str, Any]) -> bool | None:
        value = entry.get("epsilons", {}).get(key, {}).get("personalisation_retained")
        return None if value is None else bool(value > 0)

    h1 = (
        None
        if block.get("h1_met") is None or reference.get("h1_met") is None
        else block["h1_met"] == reference["h1_met"]
    )
    own, other = sign(block), sign(reference)
    same_sign = None if own is None or other is None else own == other
    parts = (h1, same_sign)
    return {
        "h1_verdict_same": h1,
        "personalisation_sign_same": same_sign,
        "stable": None if any(p is None for p in parts) else all(parts),
    }


def _number(value: Any) -> float | None:
    if value is None:
        return None
    number = float(value)
    return number if np.isfinite(number) else None


def _row(
    records: list[dict[str, Any]],
    summary: dict[str, Any],
    regime: str,
    epsilons: tuple[float, ...],
    size: dict[str, int | None],
    baselines: dict[str, Any],
) -> dict[str, Any]:
    """One variant-regime row from run records and the privacy-utility summary of that regime."""
    levels = summary[regime]["levels"]
    nondp = levels.get("nondp", {})
    row: dict[str, Any] = {
        **size,
        "seeds": sorted(
            {int(r["config"]["seed"]) for r in records if r["config"]["regime"] == regime}
        ),
        "most_popular_ndcg@10": baselines["most_popular"]["ndcg@10"],
        "item_ridge_ndcg@10": baselines.get("item_ridge", {}).get("ndcg@10"),
        "nondp_ndcg@10": _number(nondp.get("ndcg@10_mean")),
        "h1_met": summary[regime]["h1"]["met"],
        "epsilons": {},
    }
    for epsilon in epsilons:
        entry = levels.get(f"eps{_eps_key(epsilon)}", {})
        readout = list_length_readout(records, regime, epsilon)
        row["epsilons"][_eps_key(epsilon)] = {
            "ndcg@10": _number(entry.get("ndcg@10_mean")),
            "retention": _number(entry.get("retention")),
            "personalisation_retained": _number(entry.get("personalisation_retained")),
            "retention_ndcg@20": readout["ndcg@20"],
            "retention_hr@10": readout["hr@10"],
            "retention_hr@20": readout["hr@20"],
        }
    return row


def _main_records(
    root: Path, regimes: tuple[str, ...], seeds: tuple[int, ...], epsilons: tuple[float, ...]
) -> tuple[list[dict[str, Any]], str]:
    """Final-phase run records of the main privacy-utility grid and which seeds they cover."""
    folder = root / "results" / "runs" / MAIN_NAME
    wanted = {"nondp", *(f"eps{_eps_key(e)}" for e in epsilons)}
    found: list[dict[str, Any]] = []
    for path in sorted(folder.glob("*.json")) if folder.is_dir() else []:
        try:
            record = read_json(path)
        except ValueError:
            continue
        config = record.get("config", {})
        if (
            record.get("status") == "ok"
            and config.get("name") == MAIN_NAME
            and config.get("phase") == "final"
            and config.get("variant") == "main"
            and config.get("regime") in regimes
            and level_key(record) in wanted
        ):
            found.append(record)
    complete = bool(found) and all(
        {
            (level_key(r))
            for r in found
            if int(r["config"]["seed"]) == s and r["config"]["regime"] == g
        }
        >= wanted
        for s in seeds
        for g in regimes
    )
    if complete:
        return [r for r in found if int(r["config"]["seed"]) in seeds], "requested seeds"
    return found, "all available seeds"


def _reference(
    root: Path, regimes: tuple[str, ...], seeds: tuple[int, ...], epsilons: tuple[float, ...]
) -> tuple[dict[str, Any] | None, str | None]:
    """The main dataset as row "k15", per regime, or None when the main grid is absent."""
    main_file = root / "results" / f"{MAIN_NAME}.json"
    if not main_file.is_file():
        return None, None
    main = read_json(main_file)
    baselines = main["baselines"]
    card_file = root / "results" / "dataset_card.json"
    card = read_json(card_file) if card_file.is_file() else {}
    size = {
        "users": card.get("users"),
        "items": card.get("items"),
        "interactions": card.get("interactions"),
    }
    records, used = _main_records(root, regimes, seeds, epsilons)
    rows: dict[str, Any] = {}
    if records:
        summary = summarise(records, float(baselines["most_popular"]["ndcg@10"]))
        for regime in summary:
            rows[regime] = _row(records, summary, regime, epsilons, size, baselines)
        return rows, f"{used} of the main run records (final phase)"
    for regime, block in main.get("summary", {}).items():
        if regime not in regimes:
            continue
        levels = block["levels"]
        rows[regime] = {
            **size,
            "seeds": None,
            "most_popular_ndcg@10": baselines["most_popular"]["ndcg@10"],
            "item_ridge_ndcg@10": baselines.get("item_ridge", {}).get("ndcg@10"),
            "nondp_ndcg@10": _number(levels.get("nondp", {}).get("ndcg@10_mean")),
            "h1_met": block["h1"]["met"],
            "epsilons": {
                _eps_key(e): {
                    "ndcg@10": _number(levels.get(f"eps{_eps_key(e)}", {}).get("ndcg@10_mean")),
                    "retention": _number(levels.get(f"eps{_eps_key(e)}", {}).get("retention")),
                    "personalisation_retained": _number(
                        levels.get(f"eps{_eps_key(e)}", {}).get("personalisation_retained")
                    ),
                    "retention_ndcg@20": None,
                    "retention_hr@10": None,
                    "retention_hr@20": None,
                }
                for e in epsilons
            },
        }
    return rows, "summary of results/privacy_utility.json (all its seeds; run records absent)"


def _size(bundle: Any) -> dict[str, int | None]:
    interactions = sum(
        int(a.size) for part in (bundle.train, bundle.val, bundle.test) for a in part
    )
    return {"users": bundle.n_users, "items": bundle.n_items, "interactions": interactions}


def run(
    root: Path,
    frozen: Frozen,
    *,
    variants: tuple[str, ...] = ("k10", "k20", "stars4"),
    seeds: tuple[int, ...] = (0, 1, 2),
    epsilons: tuple[float, ...] = (8.0, 1.0),
    regimes: tuple[str, ...] | None = None,
    workers: int = 4,
    threads: int = 3,
) -> dict[str, Any]:
    """Build (if needed) and run every variant; write ``results/sensitivity.json``."""
    started = time.time()
    chosen_regimes = regimes or tuple(frozen.regimes)
    reference, reference_source = _reference(root, chosen_regimes, seeds, epsilons)
    results: dict[str, Any] = {}
    controls: list[dict[str, Any]] = []
    reasons: list[str] = []
    for name in variants:
        variant = VARIANTS[name]
        build_variant(root, variant)
        paths = Paths(
            processed=variant_dir(root, variant),
            results=root / "results" / NAME / variant.name,
            keys=root / "keys",
        )
        bundle = load_bundle(paths.processed)
        configs = [
            make_run(
                frozen,
                name=NAME,
                regime=regime,
                phase="final",
                seed=seed,
                epsilon=epsilon,
                n_users=bundle.n_users,
                paths=paths,
            )
            for regime in chosen_regimes
            for seed in seeds
            for epsilon in (None, *epsilons)
        ]
        records = run_grid(configs, paths, workers=workers, threads=threads)
        reasons += [f"{name}: run not ok: {r['id']}" for r in records if r.get("status") != "ok"]
        baselines = evaluate_baselines(bundle, "final", paths.processed)
        summary = summarise(records, float(baselines["most_popular"]["ndcg@10"]))
        size = _size(bundle)
        results[name] = {}
        for regime in chosen_regimes:
            if regime not in summary:
                reasons.append(f"{name}: no usable runs for regime {regime}")
                continue
            row = _row(records, summary, regime, epsilons, size, baselines)
            row["conclusion_stable"] = conclusion_stable(
                row, None if reference is None else reference.get(regime)
            )
            results[name][regime] = row
            ratio = None
            if row["nondp_ndcg@10"] is not None and row["most_popular_ndcg@10"]:
                ratio = row["nondp_ndcg@10"] / row["most_popular_ndcg@10"]
            passed = ratio is not None and ratio >= CONTROL_RATIO
            controls.append(
                {
                    "variant": name,
                    "regime": regime,
                    "measured": "non-private NDCG@10 divided by MostPopular NDCG@10",
                    "value": ratio,
                    "threshold": CONTROL_RATIO,
                    "passed": bool(passed),
                }
            )
            if not passed:
                reasons.append(
                    f"{name}/{regime}: non-private NDCG@10 is below {CONTROL_RATIO} x MostPopular, "
                    "so its retention numbers are not interpretable"
                )
    if reference is not None:
        results[REFERENCE] = reference
    payload: dict[str, Any] = {
        "experiment": NAME,
        "status": "VALID" if not reasons else "INVALID",
        "invalid_reasons": reasons,
        "controls": controls,
        "settings": {
            "variants": {n: VARIANTS[n].__dict__ for n in variants},
            "seeds": list(seeds),
            "epsilons": list(epsilons),
            "regimes": list(chosen_regimes),
            "phase": "final",
            "evaluated_on": "test",
            "h1": {"epsilon": H1_EPSILON, "threshold": H1_THRESHOLD},
            "reference_row": {"name": REFERENCE, "source": reference_source},
            "frozen": frozen.model_dump(mode="json"),
        },
        "results": results,
        "limitations": [
            "Hyperparameters (rounds, sample rate, learning rates, clip norm) stay frozen at the "
            "values tuned on the main dataset; no re-tuning was done on any variant, so a "
            "variant with different size or sparsity may be favoured or hurt by them.",
            "The reduced experiment uses fewer seeds and privacy levels than the main grid, "
            "and no clip-only or what-if runs.",
            "Noise is recalibrated for each variant's user count, so epsilon means the same on "
            "every dataset but the noise per user differs.",
            "The k-core and positive-feedback variants are subsets (or supersets) of the same "
            "Philadelphia Yelp sample; they test sensitivity to preprocessing, not to the city "
            "or the platform.",
            "The reference row k15 is the main dataset, taken from the main run records "
            "restricted to the seeds of this run when they exist, and may carry no NDCG@20.",
        ],
        "provenance": payload_provenance(__file__, extra=("data/variants.py",)),
        "wall_seconds": round(time.time() - started, 2),
    }
    atomic_write_json(root / "results" / f"{NAME}.json", payload)
    return payload


def print_summary(payload: dict[str, Any]) -> None:
    """Short table of the results."""
    print(f"status={payload['status']} {payload['invalid_reasons']}")
    for name, regimes in payload["results"].items():
        for regime, row in regimes.items():
            line = (
                f"[{name}/{regime}] users={row['users']} items={row['items']} "
                f"nondp={row['nondp_ndcg@10']} MP={row['most_popular_ndcg@10']:.4f}"
            )
            print(line)
            for eps, entry in row["epsilons"].items():
                print(
                    f"    eps{eps}: retention={entry['retention']} "
                    f"@20={entry['retention_ndcg@20']} "
                    f"personalisation={entry['personalisation_retained']}"
                )
            if "conclusion_stable" in row:
                print(f"    stable: {row['conclusion_stable']}")


def cli(argv: list[str] | None = None) -> int:
    """``prism sensitivity``."""
    parser = argparse.ArgumentParser(prog="prism sensitivity", description=__doc__)
    parser.add_argument("--root", default=".")
    parser.add_argument("--variants", default="k10,k20,stars4")
    parser.add_argument("--seeds", default="0,1,2")
    parser.add_argument("--epsilons", default="8,1")
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--threads", type=int, default=3)
    parser.add_argument(
        "--build-only", action="store_true", help="build the variant datasets, no training"
    )
    args = parser.parse_args(argv)
    root = Path(args.root)
    names = tuple(v for v in args.variants.split(",") if v)
    unknown = [n for n in names if n not in VARIANTS]
    if unknown:
        parser.error(f"unknown variants: {unknown}")
    if args.build_only:
        for name in names:
            print(json.dumps(build_variant(root, VARIANTS[name]), indent=2, sort_keys=True))
        return 0
    payload = run(
        root,
        load_frozen(root / "experiments" / "frozen.json"),
        variants=names,
        seeds=tuple(int(s) for s in args.seeds.split(",")),
        epsilons=tuple(float(e) for e in args.epsilons.split(",")),
        workers=args.workers,
        threads=args.threads,
    )
    print_summary(payload)
    return 0 if payload["status"] == "VALID" else 1
