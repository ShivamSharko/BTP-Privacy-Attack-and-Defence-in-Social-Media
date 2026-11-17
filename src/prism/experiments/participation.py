"""RQ5 / H5: does uneven participation make the recommender serve some users worse?

Only devices that are charging, idle and online take part in a training round, and
that is not random: heavy users and well-connected users are online more. Here each
user joins a round with probability ``sample_rate * availability``. Four synthetic
availability scenarios are compared (always, independent, correlated with activity,
correlated with friend count). For each trained model the per-user NDCG@10 is
grouped by activity tercile and by friend-count band, and the top-minus-bottom gap
is compared with the gap under independent availability, seed by seed.

Three further scenarios use a real device trace (FedScale ``client_behave_trace``), run only
when the trace file exists: "trace" (devices assigned to users at random, static probability
= the device active share), "trace_activity" (the same devices, rank-matched so the most
active users get the most available devices) and "trace_replay" (availability replayed round
by round from the trace, one round = 30 minutes, an assumption).

Privacy note. Noise is calibrated at the maximum sampling rate, so the epsilon shown
for the "activity", "social" and "trace_activity" scenarios is NOMINAL: it assumes availability
is independent of the user's data, which these scenarios deliberately violate. For "trace" and
"trace_replay" it is EXACT: the device assignment and the schedule do not depend on user data.
"""

from __future__ import annotations

import argparse
import hashlib
import sys
import time
import traceback
from collections.abc import Callable
from concurrent.futures import ProcessPoolExecutor, as_completed
from functools import lru_cache
from pathlib import Path
from typing import Any

import numpy as np
import numpy.typing as npt
import torch

from prism.config import RunConfig, config_hash
from prism.data.bundle import DataBundle, load_bundle
from prism.data.social import FRIENDS_FILE, load_friend_graph
from prism.data.traces import (
    DeviceTrace,
    active_share,
    assign_devices,
    availability_schedule,
    load_device_traces,
    trace_summary,
)
from prism.eval.baselines import popularity_score_fn
from prism.eval.metrics import ranking_metrics
from prism.eval.stats import paired_tests
from prism.experiments.regimes import FROZEN_PATH, Frozen, default_paths, load_frozen, make_run
from prism.experiments.runner import KEY_FILE, Paths, _clean, _finished, payload_provenance, run_one
from prism.fl.availability import (
    SCENARIOS,
    availability_vector,
    group_gap,
    group_means,
    groups_by_activity,
    groups_by_degree,
    match_devices_by_rank,
    trace_static,
)
from prism.fl.server import evaluate_per_user
from prism.io import atomic_write_json
from prism.ledger.receipts import load_or_create_key
from prism.seeding import stream

NAME = "participation"
TRACE_SCENARIOS: tuple[str, ...] = ("trace", "trace_activity", "trace_replay")
ALL_SCENARIOS: tuple[str, ...] = (*SCENARIOS, *TRACE_SCENARIOS)
SECONDS_PER_ROUND = 1800
TRACE_SOURCE = (
    "https://raw.githubusercontent.com/SymbioticLab/FedScale/master/benchmark/dataset/data/"
    "device_info/client_behave_trace"
)
COHORT_TOLERANCE = 0.15
BASELINE_FACTOR = 1.2
ALPHA = 0.05

RESUME_LIMITATION = (
    "Run records are reused when the configuration matches; records produced on 17 November 2026 "
    "predate the commit of the code that produced them."
)
LIMITATIONS: tuple[str, ...] = (
    "The epsilon shown for the 'activity' and 'social' scenarios is NOMINAL and the add-or-remove "
    "analysis does not hold for anyone in them. Availability there is a RANK over all users, so "
    "adding or removing one user shifts the ranks, and therefore the inclusion probabilities, of "
    "other users too; the noise was calibrated as if every inclusion probability were fixed.",
    "The per-run records and the signed ledger releases of these runs carry the epsilon without a "
    "'nominal' marker; only this file marks it (records written after this change also carry "
    "privacy_note and availability_scenario).",
    "Availability in the 'always', 'independent', 'activity' and 'social' scenarios is synthetic "
    "(rank-based, deterministic), not measured from device traces.",
    "The 'trace_activity' epsilon is NOMINAL for the same reason as 'activity': devices are "
    "matched to users by a rank over all users' history lengths. The 'trace' and 'trace_replay' "
    "epsilons are exact: the assignment, the offsets and the schedule do not depend on user data, "
    "selection is still Poisson at the nominal rate, and a zero update is within the clipping "
    "norm.",
    "The device trace comes from a different population of devices: devices are assigned to "
    "Yelp users at random (or by rank), and there is no real link between a user and a device.",
    "One training round = 30 minutes (1800 s) in the 'trace_replay' scenario, so 400 rounds span "
    "about 8.3 days; this mapping is a modelling choice, not measured, and traces are read "
    "cyclically (time modulo the trace length).",
    "Devices are sampled from the 107,749 devices of the trace without regard to device model, "
    "region or trace length.",
    "In 'trace_replay' the server still divides by the full expected cohort. For runs whose "
    "server optimiser is SGD the rate is multiplied by 1 / (mean availability over the schedule), "
    "which exactly restores the step size; for Adam runs the rate is left alone because Adam "
    "rescales the average itself (its epsilon constant is then relatively larger). The factor "
    "used is stored in each run record as server_lr_factor.",
    "The trace is for research use only (the FedScale repository dataset notes; the "
    "repository licence is Apache-2.0); the file is under data/, is git-ignored and is never "
    "redistributed.",
    "Groups are terciles of history length or fixed friend-count bands (0, 1 to 5, more than 5).",
    "Five seeds: a two-sided Wilcoxon test over five seeds cannot go below p = 0.0625, so the "
    "decision rests on the sign pattern.",
    RESUME_LIMITATION,
)

H5_RULE = (
    "Preregistration Amendment 1: 'Paired across seeds. With 5 seeds the two-sided Wilcoxon p "
    "cannot go below 0.0625, so the sign pattern (5 of 5) is reported as the evidence and the "
    "test is reported as underpowered.' Implemented as: H5 holds if, for at least one correlated "
    "scenario (activity with activity groups, social with friend-count groups) at either epsilon "
    "level, every seed's top-minus-bottom gap is larger than under independent availability."
)

Key = tuple[str, float | None, int]


def epsilon_key(epsilon: float | None) -> str:
    return "nondp" if epsilon is None else f"{epsilon:g}"


NOMINAL_NOTE = (
    "epsilon {epsilon:g} is NOMINAL: availability here is a rank over all users, so adding or "
    "removing one user shifts other users' inclusion probabilities and the add-or-remove "
    "analysis does not hold for anyone"
)


def epsilon_note(scenario: str, epsilon: float | None) -> str:
    if epsilon is None:
        return "non-private run"
    if scenario in ("always", "independent"):
        return f"epsilon {epsilon:g} holds: availability is independent of user data"
    if scenario == "trace":
        return (
            f"epsilon {epsilon:g} is EXACT: devices are assigned to users at random, "
            "independently of their data"
        )
    if scenario == "trace_replay":
        return (
            f"epsilon {epsilon:g} is EXACT: devices, offsets and schedule do not depend on user "
            "data, selection is Poisson at the nominal rate and a zero update is within the "
            "clipping norm"
        )
    return NOMINAL_NOTE.format(epsilon=epsilon)


def privacy_marker(scenario: str, epsilon: float | None) -> str:
    """Text stored in run records: the nominal note, or "exact" when epsilon is not nominal."""
    if epsilon is None or scenario in ("always", "independent", "trace", "trace_replay"):
        return "exact"
    return NOMINAL_NOTE.format(epsilon=epsilon)


def cohort_check(
    mean_cohort: float,
    sample_rate: float,
    availability_sum: float,
    tolerance: float = COHORT_TOLERANCE,
) -> tuple[float, bool]:
    """Realised mean cohort over its expectation, and whether it is within tolerance."""
    expected = sample_rate * availability_sum
    if expected <= 0.0:
        return float("nan"), False
    ratio = mean_cohort / expected
    return ratio, abs(ratio - 1.0) <= tolerance


@lru_cache(maxsize=2)
def _bundle(processed: str) -> DataBundle:
    return load_bundle(Path(processed))


def _inputs(processed: Path) -> tuple[npt.NDArray[np.int64], npt.NDArray[np.int64] | None]:
    """History length per user, and friend degree per user (None without a friend graph)."""
    bundle = _bundle(str(processed))
    activity = np.array([h.size for h in bundle.history("final")], dtype=np.int64)
    degree = None
    if (processed / FRIENDS_FILE).exists():
        degree = load_friend_graph(processed).degrees()
    return activity, degree


@lru_cache(maxsize=2)
def _traces(path: str) -> list[DeviceTrace]:
    return load_device_traces(Path(path))


@lru_cache(maxsize=2)
def _shares(path: str) -> npt.NDArray[np.float64]:
    return np.array([active_share(t) for t in _traces(path)], dtype=np.float64)


def _trace_devices(
    scenario: str, seed: int, activity: npt.NDArray[np.int64], trace_path: Path
) -> npt.NDArray[np.int64]:
    """Device index per user: random, and for "trace_activity" rank-matched to history length."""
    devices = assign_devices(activity.size, len(_traces(str(trace_path))), stream(seed, "trace"))
    if scenario == "trace_activity":
        shares = _shares(str(trace_path))[devices]
        devices = devices[match_devices_by_rank(shares, activity, stream(seed, "trace_match"))]
    return devices


def trace_schedule(seed: int, n_users: int, rounds: int, trace_path: Path) -> npt.NDArray[np.bool_]:
    """Round-by-round availability of "trace_replay": random devices, random time offsets."""
    traces = _traces(str(trace_path))
    devices = assign_devices(n_users, len(traces), stream(seed, "trace"))
    finish = np.array([t.finish_time for t in traces], dtype=np.int64)
    offsets = stream(seed, "trace_offsets").integers(0, finish[devices])
    return availability_schedule(
        traces, devices, offsets.astype(np.int64), rounds, SECONDS_PER_ROUND
    )


def server_lr_factor(schedule: npt.NDArray[np.bool_]) -> float:
    """1 / (mean availability over the whole schedule): a constant independent of user data."""
    mean = float(schedule.mean())
    if mean <= 0.0:
        raise ValueError("the schedule has no available client at all")
    return 1.0 / mean


def replay_hook(
    schedule: npt.NDArray[np.bool_],
) -> Callable[[npt.NDArray[np.int64], torch.Tensor, torch.Tensor, int], torch.Tensor]:
    """Client hook that zeroes the update of every client unavailable in this round.

    Training rounds are 1-based, so round ``r`` reads schedule row ``r - 1``. The input is not
    modified; a non-finite update of an unavailable client also becomes zeros.
    """

    def hook(
        users: npt.NDArray[np.int64], deltas: torch.Tensor, flat: torch.Tensor, round_index: int
    ) -> torch.Tensor:
        del flat
        available = torch.from_numpy(schedule[round_index - 1, users])
        return torch.where(available[:, None], deltas, torch.zeros_like(deltas))

    return hook


def _vector(
    scenario: str, processed: Path, seed: int = 0, trace_path: Path | None = None
) -> npt.NDArray[np.float64]:
    activity, degree = _inputs(processed)
    if scenario in ("trace", "trace_activity"):
        if trace_path is None:
            raise ValueError("a trace path is required for the trace scenarios")
        devices = _trace_devices(scenario, seed, activity, trace_path)
        return trace_static(_shares(str(trace_path)), devices)
    return availability_vector(
        scenario,  # type: ignore[arg-type]
        activity,
        np.zeros_like(activity) if degree is None else degree,
        stream(0, "availability"),
    )


def _worker(
    config: RunConfig,
    paths: Paths,
    scenario: str,
    threads: int,
    privacy_note: str = "exact",
    trace_path: Path | None = None,
    lr_factor: float | None = None,
) -> dict[str, Any]:
    """Top-level (picklable) worker: rebuild the availability, train, record.

    ``config`` already carries the scaled ``server_lr`` of "trace_replay"; ``lr_factor`` is only
    stored in the record.
    """
    try:
        extra: dict[str, Any] = {"privacy_note": privacy_note, "availability_scenario": scenario}
        if scenario == "trace_replay":
            if trace_path is None:
                raise ValueError("a trace path is required for the trace scenarios")
            n_users = _bundle(str(paths.processed)).n_users
            schedule = trace_schedule(config.seed, n_users, config.train.rounds, trace_path)
            extra["server_lr_factor"] = lr_factor
            return run_one(
                config,
                paths,
                threads=threads,
                client_hook=replay_hook(schedule),
                extra=extra,
            )
        vector = _vector(scenario, paths.processed, config.seed, trace_path)
        return run_one(config, paths, threads=threads, availability=vector, extra=extra)
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


def _stat(values: list[float]) -> dict[str, float]:
    array = np.asarray(values, dtype=np.float64)
    return {"mean": float(array.mean()), "min": float(array.min()), "max": float(array.max())}


def _mean_groups(rows: list[list[float]]) -> list[float]:
    return [float(np.nanmean([row[g] for row in rows])) for g in range(3)]


def _gap_summary(gaps: dict[int, dict[str, float]]) -> dict[str, Any]:
    seeds = sorted(gaps)
    return {
        "mean": float(np.mean([gaps[s]["gap"] for s in seeds])),
        "seed0": gaps.get(0, gaps[seeds[0]]),
        "per_seed": {str(s): gaps[s]["gap"] for s in seeds},
    }


def _change(
    treated: dict[int, dict[str, float]], control: dict[int, dict[str, float]]
) -> dict[str, Any] | None:
    seeds = sorted(set(treated) & set(control))
    if not seeds:
        return None
    a = np.array([treated[s]["gap"] for s in seeds], dtype=np.float64)
    b = np.array([control[s]["gap"] for s in seeds], dtype=np.float64)
    if np.isnan(a).any() or np.isnan(b).any():
        return None
    return {**paired_tests(a, b), "seeds": len(seeds)}


def _h5_entry(change: dict[str, Any] | None) -> dict[str, Any] | None:
    if change is None:
        return None
    seeds = int(change["seeds"])
    return {
        **change,
        "all_seeds_improved": seeds > 0 and int(change["seeds_improved"]) == seeds,
        "wilcoxon_note": "underpowered: the minimum possible two-sided p is "
        f"{change['min_possible_two_sided_p']:.4f} with {seeds} seeds",
    }


def _h5_part(
    changes: dict[str, dict[str, Any] | None] | None,
) -> tuple[dict[str, Any] | None, bool]:
    if changes is None:
        return None, False
    entries = {key: _h5_entry(change) for key, change in changes.items()}
    holds = any(e is not None and e["all_seeds_improved"] for e in entries.values())
    return entries, holds


def h5_readout(
    activity: dict[str, dict[str, Any] | None] | None,
    social: dict[str, dict[str, Any] | None] | None,
) -> dict[str, Any]:
    """H5 from the per-epsilon paired gap changes of the two correlated scenarios.

    ``activity`` and ``social`` map an epsilon key to the ``_change`` result (or None) of that
    scenario's gap versus independent availability, with the grouping that scenario correlates
    with. Holds when every seed widens the gap, for at least one scenario at one epsilon level.
    """
    activity_entries, holds_activity = _h5_part(activity)
    social_entries, holds_social = _h5_part(social)
    return {
        "claim": "availability correlated with user activity (or friend count) produces a larger "
        "NDCG@10 gap between top and bottom groups than independent availability",
        "rule": H5_RULE,
        "holds": holds_activity or holds_social,
        "holds_activity": holds_activity,
        "holds_social": holds_social,
        "activity": activity_entries,
        "social": social_entries,
    }


def trace_readout(
    cells: dict[str, dict[str, Any]], epsilons: tuple[float | None, ...]
) -> dict[str, Any] | None:
    """Overall NDCG@10 of the trace scenarios against "independent" and "always", and whether
    rank-matching real availability to activity widens the activity gap in every seed.

    None when no trace scenario ran. Not a control and not part of the H5 verdict.
    """
    if not any(s in cells for s in TRACE_SCENARIOS):
        return None
    names = ("trace", "trace_replay", "independent", "always")
    overall: dict[str, Any] = {}
    widen: dict[str, Any] = {}
    for eps in epsilons:
        key = epsilon_key(eps)
        means: dict[str, float | None] = {
            name: cells[name][key]["overall_ndcg10"]["mean"] if key in cells.get(name, {}) else None
            for name in names
        }
        row: dict[str, Any] = dict(means)
        for scenario in ("trace", "trace_replay"):
            for other in ("independent", "always"):
                a, b = means[scenario], means[other]
                row[f"{scenario}_minus_{other}"] = None if a is None or b is None else a - b
        overall[key] = row
        cell = cells.get("trace_activity", {}).get(key)
        change = None if cell is None else (cell["gap_change_vs_trace"] or {}).get("activity")
        entry = _h5_entry(change)
        widen[key] = (
            None
            if entry is None
            else {
                "all_seeds_widened": entry["all_seeds_improved"],
                "seeds": entry["seeds"],
                "seeds_improved": entry["seeds_improved"],
                "mean_difference": entry["mean_difference"],
                "sign_test_p_all_improved": entry["sign_test_p_all_improved"],
            }
        )
    return {
        "overall_ndcg10": overall,
        "rank_matching_widens_activity_gap": widen,
        "rule": "trace_activity activity gap larger than the trace activity gap in every seed "
        "(paired across seeds); not part of the H5 verdict",
    }


def _train_all(
    configs: dict[Key, RunConfig],
    paths: Paths,
    workers: int,
    threads: int,
    trace_path: Path | None = None,
    lr_factors: dict[Key, float] | None = None,
) -> dict[Key, dict[str, Any]]:
    """Run every configuration not already finished (resumable)."""
    records: dict[Key, dict[str, Any]] = {}
    pending: list[Key] = []
    factors = lr_factors or {}
    for key, config in configs.items():
        done = _finished(config, paths)
        if done is None or not paths.checkpoint(config).exists():
            pending.append(key)
        else:
            records[key] = done
    if not pending:
        return records
    load_or_create_key(paths.keys / KEY_FILE)  # once, here, so workers never race to create it
    if workers <= 1:
        for key in pending:
            records[key] = _worker(
                configs[key],
                paths,
                key[0],
                threads,
                privacy_marker(key[0], key[1]),
                trace_path,
                factors.get(key),
            )
        return records
    with ProcessPoolExecutor(max_workers=workers) as pool:
        futures = {
            pool.submit(
                _worker,
                configs[key],
                paths,
                key[0],
                threads,
                privacy_marker(key[0], key[1]),
                trace_path,
                factors.get(key),
            ): key
            for key in pending
        }
        for future in as_completed(futures):
            key = futures[future]
            records[key] = future.result()
            print(f"{records[key]['status']:>6} {configs[key].identifier}", flush=True)
    return records


def run(
    paths: Paths,
    frozen: Frozen,
    *,
    scenarios: tuple[str, ...] = ALL_SCENARIOS,
    epsilons: tuple[float | None, ...] = (None, 8.0),
    seeds: tuple[int, ...] = (0, 1, 2, 3, 4),
    regime: str = "small",
    workers: int = 4,
    threads: int = 2,
    trace_path: Path | None = None,
) -> dict[str, Any]:
    """Run every scenario at every epsilon and seed, then summarise group gaps.

    ``trace_path`` defaults to the repository location of the FedScale trace; the three trace
    scenarios are skipped, with a note, when that file does not exist.
    """
    started = time.time()
    unknown = [s for s in scenarios if s not in ALL_SCENARIOS]
    if unknown:
        raise ValueError(f"unknown scenarios: {unknown}")
    bundle = _bundle(str(paths.processed))
    activity, degree = _inputs(paths.processed)
    notes: list[str] = []
    active = list(scenarios)
    if degree is None:
        notes.append("no friend graph found: the 'social' scenario and degree groups are skipped")
        active = [s for s in active if s != "social"]
    trace_file = (
        paths.processed.parent / "external" / "fedscale" / "client_behave_trace"
        if trace_path is None
        else trace_path
    )
    trace_info: dict[str, Any] | None = None
    if any(s in TRACE_SCENARIOS for s in active):
        if trace_file.is_file():
            trace_info = {
                "file": trace_file.name,
                "source": TRACE_SOURCE,
                "sha256": hashlib.sha256(trace_file.read_bytes()).hexdigest(),
                "seconds_per_round": SECONDS_PER_ROUND,
                "round_mapping": "one round = 30 minutes (an assumption); times wrap modulo each "
                "device trace length",
                "summary": trace_summary(_traces(str(trace_file))),
            }
        else:
            skipped = ", ".join(s for s in active if s in TRACE_SCENARIOS)
            notes.append(
                f"no device trace found at {trace_file.name}: the trace scenarios ({skipped}) "
                "are skipped"
            )
            active = [s for s in active if s not in TRACE_SCENARIOS]
    act_groups = groups_by_activity(activity)
    deg_groups = None if degree is None else groups_by_degree(degree)
    n_rounds = frozen.regimes[regime].rounds
    vectors: dict[str, npt.NDArray[np.float64]] = {}
    cohort_vectors: dict[str, npt.NDArray[np.float64]] = {}
    for s in active:
        if s == "trace_replay":
            replay = trace_schedule(0, bundle.n_users, n_rounds, trace_file)
            vectors[s] = replay.mean(axis=0)
            cohort_vectors[s] = np.ones(bundle.n_users)  # selection is at the nominal rate
        else:
            vectors[s] = _vector(s, paths.processed, 0, trace_file)
            cohort_vectors[s] = vectors[s]

    # Building configs in the parent calibrates noise (cached) before any worker starts.
    configs: dict[Key, RunConfig] = {}
    lr_factors: dict[Key, float] = {}
    replay_factor: dict[int, float] = {}
    for scenario in active:
        for eps in epsilons:
            for seed in seeds:
                configs[(scenario, eps, seed)] = make_run(
                    frozen,
                    name=NAME,
                    regime=regime,
                    phase="final",
                    seed=seed,
                    epsilon=eps,
                    n_users=bundle.n_users,
                    paths=paths,
                    variant=scenario,
                )
                if scenario == "trace_replay":
                    if seed not in replay_factor:
                        schedule = trace_schedule(seed, bundle.n_users, n_rounds, trace_file)
                        replay_factor[seed] = server_lr_factor(schedule)
                    config = configs[(scenario, eps, seed)]
                    # SGD is linear in the averaged update, so scaling its rate exactly undoes
                    # the smaller average. Adam normalises the average by its running scale, so
                    # its rate must NOT be scaled; the only effect there is a relatively larger
                    # Adam epsilon.
                    factor = replay_factor[seed] if config.train.server_opt == "sgd" else 1.0
                    scaled = config.train.server_lr * factor
                    configs[(scenario, eps, seed)] = config.model_copy(
                        update={"train": config.train.model_copy(update={"server_lr": scaled})}
                    )
                    lr_factors[(scenario, eps, seed)] = factor
    records = _train_all(configs, paths, workers, threads, trace_file, lr_factors)

    invalid: list[str] = []
    failed = sorted(
        f"{k[0]}/{epsilon_key(k[1])}/seed{k[2]}"
        for k, r in records.items()
        if r.get("status") != "ok"
    )
    if failed:
        invalid.append(f"runs did not finish with status ok: {', '.join(failed)}")

    # Per-user evaluation of every finished run.
    measured: dict[Key, dict[str, Any]] = {}
    for key, record in records.items():
        if record.get("status") != "ok":
            continue
        flat = np.load(paths.checkpoint(configs[key]))["flat"]
        _, per_user = evaluate_per_user(flat, bundle, "final", frozen.model)
        entry: dict[str, Any] = {
            "overall": float(record["metrics"]["ndcg@10"]),
            "act_means": group_means(per_user, act_groups),
            "act_gap": group_gap(per_user, act_groups, seed=key[2]),
            "deg_means": None,
            "deg_gap": None,
            "of_record": (record.get("privacy") or {}).get("of_record"),
        }
        if deg_groups is not None:
            entry["deg_means"] = group_means(per_user, deg_groups)
            entry["deg_gap"] = group_gap(per_user, deg_groups, seed=key[2])
        measured[key] = entry

    def seeds_of(scenario: str, eps: float | None) -> list[int]:
        return sorted(k[2] for k in measured if k[0] == scenario and k[1] == eps)

    def gaps_of(scenario: str, eps: float | None, field: str) -> dict[int, dict[str, float]]:
        return {s: measured[(scenario, eps, s)][field] for s in seeds_of(scenario, eps)}

    cells: dict[str, dict[str, Any]] = {}
    for scenario in active:
        cells[scenario] = {}
        for eps in epsilons:
            done_seeds = seeds_of(scenario, eps)
            if not done_seeds:
                continue
            rows = [measured[(scenario, eps, s)] for s in done_seeds]
            act_gaps = gaps_of(scenario, eps, "act_gap")
            deg_gaps = gaps_of(scenario, eps, "deg_gap") if deg_groups is not None else None
            of_record = [r["of_record"] for r in rows if r["of_record"] is not None]
            cell: dict[str, Any] = {
                "epsilon_target": eps,
                "epsilon_of_record": float(np.mean(of_record)) if of_record else None,
                "epsilon_note": epsilon_note(scenario, eps),
                "seeds": done_seeds,
                "overall_ndcg10": _stat([r["overall"] for r in rows]),
                "activity_groups_ndcg10": _mean_groups([r["act_means"] for r in rows]),
                "degree_groups_ndcg10": (
                    _mean_groups([r["deg_means"] for r in rows]) if deg_groups is not None else None
                ),
                "activity_gap": _gap_summary(act_gaps),
                "degree_gap": _gap_summary(deg_gaps) if deg_gaps is not None else None,
                "gap_change_vs_independent": None,
                "gap_change_vs_trace": None,
            }
            if scenario != "independent" and seeds_of("independent", eps):
                change: dict[str, Any] = {
                    "activity": _change(act_gaps, gaps_of("independent", eps, "act_gap")),
                    "degree": None,
                }
                if deg_gaps is not None:
                    change["degree"] = _change(deg_gaps, gaps_of("independent", eps, "deg_gap"))
                cell["gap_change_vs_independent"] = change
            if scenario == "trace_activity" and seeds_of("trace", eps):
                versus: dict[str, Any] = {
                    "activity": _change(act_gaps, gaps_of("trace", eps, "act_gap")),
                    "degree": None,
                }
                if deg_gaps is not None:
                    versus["degree"] = _change(deg_gaps, gaps_of("trace", eps, "deg_gap"))
                cell["gap_change_vs_trace"] = versus
            cells[scenario][epsilon_key(eps)] = cell

    availability: dict[str, Any] = {
        scenario: {
            "mean": float(vector.mean()),
            "activity_groups": group_means(vector, act_groups),
            "degree_groups": group_means(vector, deg_groups) if deg_groups is not None else None,
        }
        for scenario, vector in vectors.items()
    }

    # Control 1: realised cohort against sample_rate x sum(availability), seed 0.
    rate = frozen.regimes[regime].sample_rate
    sampling_rows: list[dict[str, Any]] = []
    for (scenario, eps, seed), record in records.items():
        if seed != 0 or record.get("status") != "ok":
            continue
        mean_cohort = float(record["diagnostics"]["mean_cohort"])
        expected = rate * float(cohort_vectors[scenario].sum())
        ratio, ok = cohort_check(mean_cohort, rate, float(cohort_vectors[scenario].sum()))
        sampling_rows.append(
            {
                "scenario": scenario,
                "epsilon": eps,
                "mean_cohort": mean_cohort,
                "expected": expected,
                "ratio": ratio,
                "passed": ok,
            }
        )
    sampling_ok = bool(sampling_rows) and all(r["passed"] for r in sampling_rows)
    controls: dict[str, Any] = {
        "sampling": {
            "what": "realised mean cohort / (sample_rate x sum of availability), seed 0",
            "threshold": f"within {COHORT_TOLERANCE:.0%} of 1",
            "measured": sampling_rows,
            "passed": sampling_ok,
        }
    }
    if not sampling_ok:
        invalid.append("sampling control failed: realised cohort size is off its expectation")

    # Control 2: the non-private 'always' model must beat MostPopular on the test split.
    baseline: dict[str, Any] = {
        "what": "non-private 'always' NDCG@10 over MostPopular NDCG@10, test split",
        "threshold": f"at least {BASELINE_FACTOR}x",
        "measured": None,
        "passed": True,
        "skipped": True,
    }
    base_seeds = seeds_of("always", None) if "always" in active else []
    if base_seeds:
        popularity = popularity_score_fn(bundle.history("final"), bundle.n_items)
        pop_metrics = ranking_metrics(
            popularity, bundle.history("final"), bundle.targets("final"), bundle.n_items
        )
        pop_ndcg = float(pop_metrics["ndcg@10"])
        model_ndcg = float(np.mean([measured[("always", None, s)]["overall"] for s in base_seeds]))
        ratio_b = model_ndcg / pop_ndcg if pop_ndcg > 0 else float("inf")
        baseline.update(
            measured={"model": model_ndcg, "most_popular": pop_ndcg, "ratio": ratio_b},
            passed=bool(model_ndcg >= BASELINE_FACTOR * pop_ndcg),
            skipped=False,
        )
        if not baseline["passed"]:
            invalid.append(
                f"baseline control failed: model NDCG@10 {model_ndcg:.4f} is below "
                f"{BASELINE_FACTOR}x MostPopular {pop_ndcg:.4f}"
            )
    controls["baseline"] = baseline

    # H5 readout (not a control).
    def changes_for(scenario: str, grouping: str) -> dict[str, dict[str, Any] | None] | None:
        if scenario not in cells:
            return None
        out: dict[str, dict[str, Any] | None] = {}
        for key, cell in cells[scenario].items():
            change = cell["gap_change_vs_independent"]
            out[key] = None if change is None else change[grouping]
        return out

    h5 = h5_readout(changes_for("activity", "activity"), changes_for("social", "degree"))
    trace_out = trace_readout(cells, epsilons)

    result: dict[str, Any] = {
        "experiment": NAME,
        "status": "INVALID" if invalid else "VALID",
        "invalid_reasons": invalid,
        "controls": controls,
        "settings": {
            "scenarios": active,
            "epsilons": list(epsilons),
            "seeds": list(seeds),
            "regime": regime,
            "sample_rate": rate,
            "rounds": frozen.regimes[regime].rounds,
            "users": bundle.n_users,
            "availability_mean": 0.5,
            "availability_floor": 0.05,
            "trace": trace_info,
        },
        "results": {
            "cells": cells,
            "availability": availability,
            "h5": h5,
            "trace_readout": trace_out,
            "notes": notes,
            "group_sizes": {
                "activity": np.bincount(act_groups, minlength=3).tolist(),
                "degree": (
                    None if deg_groups is None else np.bincount(deg_groups, minlength=3).tolist()
                ),
            },
        },
        "limitations": list(LIMITATIONS),
        "provenance": payload_provenance(__file__, extra=("fl/availability.py", "data/traces.py")),
        "wall_seconds": round(time.time() - started, 1),
    }
    result = _clean(result)
    atomic_write_json(paths.results / f"{NAME}.json", result)
    return result


def _summary(result: dict[str, Any]) -> str:
    lines = [f"participation: {result['status']}"]
    lines += [f"  invalid: {reason}" for reason in result["invalid_reasons"]]
    lines.append(f"{'scenario':<12}{'eps':>7}{'ndcg@10':>9}{'act gap':>9}{'deg gap':>9}  note")
    for scenario, by_eps in result["results"]["cells"].items():
        for key, cell in by_eps.items():
            deg = cell["degree_gap"]
            deg_text = "n/a" if deg is None or deg["mean"] is None else f"{deg['mean']:.4f}"
            flag = "NOMINAL eps" if "NOMINAL" in cell["epsilon_note"] else ""
            lines.append(
                f"{scenario:<12}{key:>7}{cell['overall_ndcg10']['mean']:>9.4f}"
                f"{cell['activity_gap']['mean']:>9.4f}{deg_text:>9}  {flag}"
            )
    lines.append(f"H5 holds: {result['results']['h5']['holds']}")
    lines += [f"note: {n}" for n in result["results"]["notes"]]
    return "\n".join(lines)


def cli(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="RQ5 participation bias experiment")
    parser.add_argument("--root", type=Path, default=Path("."))
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--threads", type=int, default=2)
    parser.add_argument("--regime", default="small")
    parser.add_argument("--seeds", type=int, nargs="+", default=[0, 1, 2, 3, 4])
    parser.add_argument("--scenarios", nargs="+", default=list(ALL_SCENARIOS))
    parser.add_argument("--trace-path", type=Path, default=None)
    parser.add_argument(
        "--epsilons", nargs="+", default=["none", "8"], help="numbers, or 'none' for non-private"
    )
    args = parser.parse_args(argv)
    epsilons = tuple(None if e.lower() == "none" else float(e) for e in args.epsilons)
    paths = default_paths(args.root)
    frozen = load_frozen(args.root / FROZEN_PATH)
    result = run(
        paths,
        frozen,
        scenarios=tuple(args.scenarios),
        epsilons=epsilons,
        seeds=tuple(args.seeds),
        regime=args.regime,
        workers=args.workers,
        threads=args.threads,
        trace_path=args.trace_path,
    )
    print(_summary(result))
    return 0 if result["status"] == "VALID" else 1


if __name__ == "__main__":
    sys.exit(cli())
