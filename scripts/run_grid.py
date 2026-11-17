"""Resumable experiment grid: central and federated, with and without DP.

Each completed run writes results/runs/<id>.json immediately. Existing files are
skipped, so an interrupted overnight session keeps all finished work and can be
relaunched with the same command.

Headline metrics are taken at the FINAL round. Intermediate evaluations are
recorded only for convergence curves and must never be used to pick a checkpoint.
"""

from __future__ import annotations

import argparse
import json
import os
import time
from concurrent.futures import ProcessPoolExecutor, as_completed
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Final

import numpy as np
import numpy.typing as npt
import torch

from prism.data.dataset import load_split, user_item_lists
from prism.environment import collect_environment_report
from prism.eval.metrics import ranking_metrics
from prism.models.two_tower import (
    RoundConfig,
    TwoTower,
    aggregate_round,
    client_update,
    get_flat,
    make_score_fn,
    set_flat,
)
from prism.privacy.dp import calibrate_noise, privacy_epsilon, target_delta

os.environ.setdefault("OMP_NUM_THREADS", "2")
os.environ.setdefault("MKL_NUM_THREADS", "2")

PROCESSED: Final[Path] = Path("data/processed")
RUNS: Final[Path] = Path("results/runs")
CLIP_CACHE: Final[Path] = Path("results/clip_calibration.json")
NOISE_CACHE: Final[Path] = Path("results/noise_calibration.json")
DATASET_CARD: Final[Path] = Path("results/dataset_card.json")
EPSILONS: Final[tuple[float, ...]] = (1.0, 2.0, 4.0, 8.0, 16.0)
SEEDS: Final[tuple[int, ...]] = (0, 1, 2, 3, 4, 5, 6, 7, 8, 9)
TOPOLOGY_ROUNDS: Final[dict[str, int]] = {
    "central": 40,
    "central_matched": 400,
    "federated": 400,
}
LOCAL_LR: Final[float] = 2.0
SERVER_LR: Final[float] = 1.0
THREADS: Final[int] = 2
CLIP_PROBE_USERS: Final[int] = 256


@dataclass(frozen=True)
class Job:
    """One experiment run."""

    topology: str
    target_epsilon: float | None
    seed: int
    rounds: int
    variant: str = "semantic"

    @property
    def sample_rate(self) -> float:
        if self.topology == "central":
            return 0.20
        if self.topology == "central_matched":
            return 0.02
        return 0.01

    @property
    def local_epochs(self) -> int:
        return 2 if self.topology == "federated" else 1

    @property
    def identifier(self) -> str:
        tag = "nondp" if self.target_epsilon is None else "eps" + str(self.target_epsilon)
        return f"{self.topology}_{tag}_{self.variant}_seed{self.seed}_r{self.rounds}"


def load_arrays(
    variant: str,
) -> tuple[npt.NDArray[np.float32], npt.NDArray[np.float32], int, int]:
    """Load frozen features and dataset dimensions."""
    card = json.loads(DATASET_CARD.read_text(encoding="utf-8"))
    data = np.load(PROCESSED / f"features_{variant}.npz")
    return (
        np.asarray(data["items"], dtype=np.float32),
        np.asarray(data["users"], dtype=np.float32),
        int(card["users"]),
        int(card["items"]),
    )


def calibrate_clip(
    item_features: npt.NDArray[np.float32],
    user_features: npt.NDArray[np.float32],
    train_items: list[npt.NDArray[np.int64]],
    n_items: int,
    n_users: int,
) -> float:
    """Fix the clipping norm once from a NON-PRIVATE pilot, then cache it.

    Roadmap section 8.2 permits tuning C on non-private runs only. The value is
    chosen once, cached, and held identical across every DP run.
    """
    if CLIP_CACHE.exists():
        return float(json.loads(CLIP_CACHE.read_text(encoding="utf-8"))["clip_norm"])
    torch.manual_seed(0)
    torch.set_num_threads(THREADS)
    model = TwoTower(item_features.shape[1], n_items)
    flat = get_flat(model)
    rng = np.random.default_rng(0)
    cohort = rng.choice(n_users, size=min(CLIP_PROBE_USERS, n_users), replace=False)
    norms: list[float] = []
    for user in cohort:
        delta = client_update(
            model,
            flat,
            user_features[int(user)],
            item_features,
            train_items[int(user)],
            rng,
            n_items,
            1,
            LOCAL_LR,
            None,
        )
        norms.append(float(np.linalg.norm(delta)))
    value = round(float(np.median(norms)), 4)
    CLIP_CACHE.parent.mkdir(parents=True, exist_ok=True)
    CLIP_CACHE.write_text(
        json.dumps(
            {
                "clip_norm": value,
                "probe_users": len(norms),
                "median_of": "unclipped delta L2 norms",
                "pilot": "non-private",
                "percentiles": {str(p): float(np.percentile(norms, p)) for p in (10, 50, 90)},
            },
            indent=2,
            sort_keys=True,
        )
        + "\n",
        encoding="utf-8",
        newline="\n",
    )
    return value


def noise_for(job: Job, delta: float) -> float:
    """Calibrate and cache the noise multiplier for a target epsilon."""
    if job.target_epsilon is None:
        return 0.0
    key = f"{job.sample_rate}_{job.rounds}_{delta}_{job.target_epsilon}"
    cache: dict[str, Any] = {}
    if NOISE_CACHE.exists():
        cache = json.loads(NOISE_CACHE.read_text(encoding="utf-8"))
    if key not in cache:
        cache[key] = calibrate_noise(job.sample_rate, job.rounds, delta, job.target_epsilon)
        NOISE_CACHE.parent.mkdir(parents=True, exist_ok=True)
        NOISE_CACHE.write_text(
            json.dumps(cache, indent=2, sort_keys=True) + "\n", encoding="utf-8", newline="\n"
        )
    return float(cache[key])


def eval_points(rounds: int) -> list[int]:
    """Four evaluation checkpoints, always including the final round."""
    points = {max(1, rounds // 8), max(1, rounds // 4), max(1, rounds // 2), rounds}
    return sorted(points)


def run_job(job: Job) -> dict[str, Any]:
    """Train one configuration and return its record."""
    torch.set_num_threads(THREADS)
    torch.manual_seed(job.seed)
    item_features, user_features, n_users, n_items = load_arrays(job.variant)
    train_items = user_item_lists(load_split("train", PROCESSED), n_users)
    test_items = user_item_lists(load_split("test", PROCESSED), n_users)
    delta_value = target_delta(n_users)
    clip_norm = calibrate_clip(item_features, user_features, train_items, n_items, n_users)
    noise = noise_for(job, delta_value)

    config = RoundConfig(
        sample_rate=job.sample_rate,
        local_epochs=job.local_epochs,
        local_lr=LOCAL_LR,
        server_lr=SERVER_LR,
        clip_norm=clip_norm if job.target_epsilon is not None else None,
        noise_multiplier=noise,
    )
    model = TwoTower(item_features.shape[1], n_items)
    flat = get_flat(model)
    rng = np.random.default_rng(job.seed)
    points = eval_points(job.rounds)
    history: list[dict[str, Any]] = []
    started = time.time()

    for round_index in range(1, job.rounds + 1):
        cohort = np.flatnonzero(rng.random(n_users) < job.sample_rate)
        if cohort.size == 0:
            continue
        flat, mean_norm = aggregate_round(
            model,
            flat,
            cohort,
            user_features,
            item_features,
            train_items,
            rng,
            n_items,
            n_users,
            config,
        )
        if round_index in points:
            set_flat(model, flat)
            metrics = ranking_metrics(
                make_score_fn(model, user_features, item_features),
                train_items,
                test_items,
                n_items,
            )
            history.append(
                {
                    "round": round_index,
                    "cohort": int(cohort.size),
                    "mean_delta_norm": mean_norm,
                    "metrics": metrics,
                }
            )
            print(
                f"  {job.identifier} round {round_index} NDCG@10={metrics['ndcg@10']:.4f}",
                flush=True,
            )

    set_flat(model, flat)
    checkpoint = PROCESSED / f"model_{job.identifier}.npz"
    np.savez_compressed(checkpoint, flat=flat)

    epsilon_prv = privacy_epsilon(job.sample_rate, noise, job.rounds, delta_value, "prv")
    epsilon_rdp = privacy_epsilon(job.sample_rate, noise, job.rounds, delta_value, "rdp")
    env = collect_environment_report()
    record = {
        "id": job.identifier,
        "topology": job.topology,
        "variant": job.variant,
        "seed": job.seed,
        "rounds": job.rounds,
        "sample_rate": job.sample_rate,
        "local_epochs": job.local_epochs,
        "local_lr": LOCAL_LR,
        "server_lr": SERVER_LR,
        "clip_norm": config.clip_norm,
        "noise_multiplier": noise,
        "target_epsilon": job.target_epsilon,
        "delta": delta_value,
        "epsilon_prv": epsilon_prv,
        "epsilon_rdp": epsilon_rdp,
        "accountant_of_record": "opacus_prv",
        "rdp_upper_bound_holds": bool(epsilon_rdp >= epsilon_prv - 1e-6),
        "expected_user_updates": job.sample_rate * n_users * job.rounds * job.local_epochs,
        "users": n_users,
        "items": n_items,
        "final_metrics": history[-1]["metrics"] if history else {},
        "history": history,
        "wall_seconds": round(time.time() - started, 2),
        "threads": THREADS,
        "torch_version": torch.__version__,
        "checkpoint": checkpoint.name,
        "provenance": {"git_commit": env.git_commit, "uv_lock_sha256": env.uv_lock_sha256},
        "limitations": [
            "Float Gaussian noise from a seeded PCG64 PRNG; epsilon is accountant-derived under an ideal mechanism (ADR-037).",
            "Single-process simulation; no real network or device trust boundary.",
            "Clipping norm fixed once from a non-private pilot.",
        ],
    }
    RUNS.mkdir(parents=True, exist_ok=True)
    (RUNS / f"{job.identifier}.json").write_text(
        json.dumps(record, indent=2, sort_keys=True) + "\n", encoding="utf-8", newline="\n"
    )
    return record


def build_jobs(
    smoke: bool,
    variant: str,
    seeds: tuple[int, ...] = SEEDS,
    topologies: tuple[str, ...] = tuple(TOPOLOGY_ROUNDS),
    epsilons: tuple[float, ...] = EPSILONS,
) -> list[Job]:
    """Enumerate the grid, optionally restricted to a subset."""
    if smoke:
        return [
            Job("central", None, 0, 4, variant),
            Job("central", 8.0, 0, 4, variant),
            Job("federated", None, 0, 8, variant),
            Job("federated", 8.0, 0, 8, variant),
        ]
    jobs: list[Job] = []
    for topology, rounds in TOPOLOGY_ROUNDS.items():
        if topology not in topologies:
            continue
        for seed in seeds:
            jobs.append(Job(topology, None, seed, rounds, variant))
            for epsilon in epsilons:
                jobs.append(Job(topology, epsilon, seed, rounds, variant))
    return jobs


def main(argv: list[str] | None = None) -> int:
    """Run the grid, skipping runs already written to disk."""
    parser = argparse.ArgumentParser(description="Resumable central/federated DP grid.")
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--smoke", action="store_true")
    parser.add_argument("--variant", default="semantic", choices=["semantic", "tfidf"])
    parser.add_argument("--only", default=None, help="substring filter on run id")
    parser.add_argument("--seeds", default=None, help="comma-separated seed list")
    parser.add_argument("--topologies", default=None, help="comma-separated topology list")
    parser.add_argument("--epsilons", default=None, help="comma-separated epsilon list")
    args = parser.parse_args(argv)

    seeds = SEEDS if args.seeds is None else tuple(int(x) for x in str(args.seeds).split(","))
    topologies = (
        tuple(TOPOLOGY_ROUNDS)
        if args.topologies is None
        else tuple(str(x) for x in str(args.topologies).split(","))
    )
    epsilons = (
        EPSILONS
        if args.epsilons is None
        else tuple(float(x) for x in str(args.epsilons).split(","))
    )
    jobs = build_jobs(bool(args.smoke), str(args.variant), seeds, topologies, epsilons)
    if args.only:
        jobs = [job for job in jobs if str(args.only) in job.identifier]
    RUNS.mkdir(parents=True, exist_ok=True)
    pending = [job for job in jobs if not (RUNS / f"{job.identifier}.json").exists()]
    print(f"{len(jobs)} jobs total, {len(pending)} pending, {args.workers} workers", flush=True)
    done = [json.loads(p.read_text(encoding="utf-8")) for p in RUNS.glob("*.json")]
    if done:
        mean_wall = sum(float(r.get("wall_seconds", 0.0)) for r in done) / len(done)
        estimate = mean_wall * len(pending) / max(int(args.workers), 1) / 60.0
        print(
            f"mean completed run {mean_wall:.1f}s; rough estimate {estimate:.0f} min "
            f"at {args.workers} workers (hybrid CPU gives less than linear speedup)",
            flush=True,
        )
    if not pending:
        print("Nothing to do.")
        return 0

    if args.smoke or args.workers == 1:
        for job in pending:
            record = run_job(job)
            print("done " + record["id"] + " eps_prv=" + str(record["epsilon_prv"]), flush=True)
        return 0

    with ProcessPoolExecutor(max_workers=int(args.workers)) as pool:
        futures = {pool.submit(run_job, job): job for job in pending}
        for future in as_completed(futures):
            job = futures[future]
            try:
                record = future.result()
                print("done " + record["id"] + " eps_prv=" + str(record["epsilon_prv"]), flush=True)
            except Exception as error:
                print("FAILED " + job.identifier + ": " + repr(error), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
