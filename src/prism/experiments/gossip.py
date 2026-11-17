"""RQ2 / H2: what does removing the trusted server cost in recommendation quality?

Serverless gossip training over the friend network with local differential
privacy is compared with server-based federated training with central
(user-level) differential privacy, at the same epsilon, on the same node
population, measured on the same users, and with the same MostPopular floor.

Writes ``results/gossip.json``. The H2 readout (gap and interval at epsilon 8) is
a measurement, not a control. The one control is positive: non-private gossip must
beat MostPopular by a margin, otherwise the gap numbers are not interpretable.
"""

from __future__ import annotations

import argparse
import dataclasses
import hashlib
import json
import time
from pathlib import Path
from typing import Any, Final, Literal

import numpy as np
import numpy.typing as npt

from prism.config import ModelConfig, Phase
from prism.data.bundle import DataBundle, load_bundle
from prism.data.social import SocialGraph, graph_from_edges, load_friend_graph
from prism.eval.baselines import popularity_score_fn
from prism.eval.metrics import ranking_metrics_per_user
from prism.eval.stats import user_bootstrap_ci
from prism.experiments.calibration import noise_for
from prism.experiments.regimes import (
    CALIBRATION_FILE,
    FROZEN_PATH,
    Frozen,
    default_paths,
    load_frozen,
    make_run,
)
from prism.experiments.runner import Paths, _finished, payload_provenance, run_one
from prism.fl.gossip import GossipConfig, evaluate_nodes, gossip_train
from prism.fl.server import evaluate_per_user
from prism.io import atomic_write_json, atomic_write_npz
from prism.models.hybrid import init_flat, make_layout
from prism.privacy.accounting import delta_for, pld_epsilon
from prism.seeding import stream

NAME: Final[str] = "gossip"
NODE_SEED: Final[int] = 12345
MIN_RATIO: Final[float] = 1.1
# Chosen on the validation split, 17 Nov 2026 (1,500 nodes, 60 rounds, non-private, Adam with
# gossiped moments): NDCG@10 0.0153 at 0.05 against 0.0138 at 0.02; the federated model on the
# same nodes scored 0.0191 and MostPopular 0.0164. Per-node Adam and plain SGD did not learn.
DEFAULT_LR: Final[float] = 0.05
FLOAT_BYTES: Final[int] = 4
LIMITATIONS: Final[tuple[str, ...]] = (
    "Rounds are synchronous: every node updates and mixes at the same time, with no stragglers.",
    "Only a random sample of users is simulated, not the whole population, so each node "
    "has fewer real friends than on the full platform.",
    "Peer tables use real friends where a node has them and random users otherwise; the share "
    "of real friends is reported.",
    "The local epsilon composes one Gaussian release per round over all rounds, with no "
    "amplification by sampling; it is per node and for the node's own data.",
    "Adjacency: 'gossip_local' uses the project's add-or-remove unit (the neighbouring input is "
    "the same node with no data), so the sensitivity is the clipping norm C. "
    "'gossip_local_replace_adjacency' uses the stricter local-DP convention in which any two "
    "inputs of one device are neighbours (replace one dataset by another), so the sensitivity "
    "is 2C and the same noise gives a larger epsilon. The federated epsilon is add-or-remove.",
    "Each node is evaluated with its own model on its own history and targets, and the "
    "federated model is scored on exactly those users.",
    "The optimiser and learning rate were chosen on validation data; the clipping norm is the "
    "federated regime's, and neither choice is covered by epsilon.",
    "Adam moments are post-processing of the noisy clipped gradient, so they do not change the "
    "local epsilon.",
    "Moments are gossiped together with the model, tripling the bytes sent.",
    "Only the non-private comparison with the untrained model gates the result; the comparison "
    "with MostPopular is reported but does not gate, because it depends on population size.",
    "Few seeds: intervals over nodes describe sampling of users, not variation across runs.",
    "Run records are reused when the configuration matches; records produced on 17 November "
    "2026 predate the commit of the code that produced them.",
)


def sample_nodes(processed: Path, n_nodes: int) -> npt.NDArray[np.int64]:
    """Sorted, seeded random sample of users that have at least one friend."""
    degrees = load_friend_graph(processed).degrees()
    candidates = np.flatnonzero(degrees > 0).astype(np.int64)
    if candidates.size <= n_nodes:
        return candidates
    chosen = stream(NODE_SEED, "sampling").choice(candidates, size=n_nodes, replace=False)
    return np.sort(chosen).astype(np.int64)


def induced_subgraph(graph: SocialGraph, nodes: npt.NDArray[np.int64]) -> SocialGraph:
    """Friend graph among ``nodes`` only, re-indexed to positions 0..len(nodes)-1."""
    block = graph.adjacency[nodes][:, nodes].tocoo()
    upper = block.row < block.col
    edges = np.stack([block.row[upper], block.col[upper]], axis=1).astype(np.int64)
    return graph_from_edges(edges, int(nodes.size))


def _spread(values: list[float]) -> dict[str, Any]:
    return {
        "mean": float(np.mean(values)),
        "min": float(np.min(values)),
        "max": float(np.max(values)),
        "per_seed": [float(v) for v in values],
    }


def _node_mean(per_user: npt.NDArray[np.float64]) -> float:
    return float(np.nanmean(per_user))


def _most_popular(bundle: DataBundle, nodes: npt.NDArray[np.int64], phase: Phase) -> float:
    """MostPopular on the node population, popularity counted among the nodes' histories."""
    history = [bundle.history(phase)[int(u)] for u in nodes]
    targets = [bundle.targets(phase)[int(u)] for u in nodes]
    _, per_user = ranking_metrics_per_user(
        popularity_score_fn(history, bundle.n_items), history, targets, bundle.n_items
    )
    return _node_mean(per_user)


def _cache_path(
    paths: Paths,
    phase: Phase,
    optimiser: str,
    mix_moments: bool,
    lr: float,
    n: int,
    rounds: int,
    degree: int,
    epsilon: float | None,
    seed: int,
) -> Path:
    tag = "none" if epsilon is None else f"{epsilon:g}"
    name = f"gossip_{phase}_{optimiser}_mix{int(mix_moments)}_lr{lr:g}_n{n}_r{rounds}_d{degree}_eps{tag}_seed{seed}.npz"
    return paths.processed / "models" / "gossip" / name


def settings_hash(
    config: GossipConfig,
    model: ModelConfig,
    n_nodes: int,
    phase: Phase,
    epsilon: float | None,
    seed: int,
) -> str:
    """SHA-256 of a canonical JSON of everything that shapes a cached gossip run.

    Covers clip norm, hide fraction, optimiser, mix_moments, lr, rounds, degree and noise
    multiplier (all fields of ``config``), the model config, node count, phase, epsilon, seed.
    """
    payload = {
        "gossip": dataclasses.asdict(config),
        "model": model.model_dump(mode="json"),
        "nodes": n_nodes,
        "phase": phase,
        "epsilon": epsilon,
        "seed": seed,
    }
    text = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(text.encode()).hexdigest()


def _replace_adjacency_epsilon(z: float, rounds: int, delta: float) -> float | None:
    """Local epsilon when any two inputs of a device are neighbours (sensitivity 2C)."""
    try:
        return pld_epsilon(1.0, z / 2.0, rounds, delta)
    except Exception:
        return None


def build_controls(
    gossip: float, floor: float, untrained: float, federated: float
) -> tuple[dict[str, Any], list[str]]:
    """Controls from the non-private gossip NDCG@10 and its references on the same nodes.

    Only ``gossip_beats_untrained`` gates the status. The others are reported.
    """
    gain = gossip / untrained if untrained > 0 else float("inf")
    ratio = gossip / floor if floor > 0 else float("inf")
    share = gossip / federated if federated > 0 else float("inf")
    controls: dict[str, Any] = {
        "gossip_beats_untrained": {
            "measured": "non-private gossip NDCG@10 over the untrained starting model, same nodes",
            "gossip_ndcg10": gossip,
            "untrained_ndcg10": untrained,
            "ratio": gain,
            "threshold": MIN_RATIO,
            "passed": bool(gain >= MIN_RATIO),
            "gating": True,
        },
        "gossip_learns": {
            "measured": "non-private gossip NDCG@10 over MostPopular NDCG@10, same nodes",
            "gossip_ndcg10": gossip,
            "most_popular_ndcg10": floor,
            "ratio": ratio,
            "threshold": MIN_RATIO,
            "passed": bool(ratio >= MIN_RATIO),
            "gating": False,
            "reason": "on a few thousand users even the federated model can be below "
            "MostPopular, so this comparison measures population size, not whether gossip works",
        },
        "gossip_share_of_federated": {
            "measured": "non-private gossip NDCG@10 as a share of the non-private federated "
            "model, same nodes",
            "gossip_ndcg10": gossip,
            "federated_ndcg10": federated,
            "ratio": share,
            "gating": False,
            "reason": "reference only: how much of the server-based quality gossip recovers",
        },
    }
    reasons: list[str] = []
    if gain < MIN_RATIO:
        reasons.append(
            f"gossip control failed: non-private gossip is {gain:.3f} x the untrained model, "
            f"needs {MIN_RATIO}"
        )
    return controls, reasons


def run(
    paths: Paths,
    frozen: Frozen,
    *,
    n_nodes: int = 3000,
    rounds: int = 100,
    degree: int = 4,
    epsilons: tuple[float | None, ...] = (None, 8.0),
    seeds: tuple[int, ...] = (0, 1, 2),
    lr: float = DEFAULT_LR,
    optimiser: Literal["adam", "sgd"] = "adam",
    mix_moments: bool = True,
    regime: str = "small",
    phase: Phase = "final",
    threads: int | None = None,
) -> dict[str, Any]:
    """Run the comparison and write ``results/gossip.json``."""
    started = time.time()
    if threads is not None:
        import torch

        torch.set_num_threads(threads)
    spec = frozen.regimes[regime]
    bundle = load_bundle(paths.processed)
    graph = load_friend_graph(paths.processed)
    nodes = sample_nodes(paths.processed, n_nodes)
    subgraph = induced_subgraph(graph, nodes)
    n = int(nodes.size)
    parameters = make_layout(bundle.n_items, frozen.model.dim).total
    floor = _most_popular(bundle, nodes, phase)
    delta = delta_for(n)
    untrained_flat = init_flat(
        make_layout(bundle.n_items, frozen.model.dim), frozen.model, stream(0, "init")
    )
    _, untrained_users = evaluate_per_user(untrained_flat, bundle, phase, frozen.model)
    untrained = _node_mean(untrained_users[nodes])
    order = [None, *[e for e in epsilons if e is not None]]

    invalid: list[str] = []
    shares: list[float] = []
    by_epsilon: dict[str, Any] = {}
    for epsilon in order:
        key = "nonprivate" if epsilon is None else str(float(epsilon))
        z = 0.0
        if epsilon is not None:
            z = noise_for(1.0, rounds, n, epsilon, paths.results / CALIBRATION_FILE)
        config = GossipConfig(
            rounds=rounds,
            degree=degree,
            lr=lr,
            optimiser=optimiser,
            mix_moments=mix_moments,
            clip_norm=None if epsilon is None else spec.clip_norm,
            noise_multiplier=z,
        )
        gossip_users: list[npt.NDArray[np.float64]] = []
        federated_users: list[npt.NDArray[np.float64]] = []
        federated_rounds: list[int] = []
        federated_eps: list[float | None] = []
        per_node_round = 0
        for seed in seeds:
            cache = _cache_path(
                paths, phase, optimiser, mix_moments, lr, n, rounds, degree, epsilon, seed
            )
            digest = settings_hash(config, frozen.model, n, phase, epsilon, seed)
            reused = False
            if cache.exists():
                with np.load(cache) as stored:
                    # a cache without the field predates it and is accepted
                    if (
                        "settings_hash" not in stored.files
                        or str(stored["settings_hash"]) == digest
                    ):
                        per_node = np.asarray(stored["per_node"], dtype=np.float64)
                        shares.append(float(stored["friend_peer_share"]))
                        per_node_round = int(stored["bytes_per_node_per_round"])
                        reused = True
            if not reused:
                peers, is_friend = subgraph.peer_table(degree, stream(seed, "sampling"))
                shares.append(float(is_friend.mean()))
                trained = gossip_train(
                    bundle, phase, frozen.model, config, nodes, peers, seed, is_friend=is_friend
                )
                per_node_round = trained.bytes_sent_per_node_per_round
                _, per_node = evaluate_nodes(trained.params, bundle, phase, frozen.model, nodes)
                del trained
                atomic_write_npz(
                    cache,
                    per_node=per_node,
                    friend_peer_share=np.asarray(shares[-1]),
                    bytes_per_node_per_round=np.asarray(per_node_round),
                    settings_hash=np.asarray(digest),
                )
            gossip_users.append(per_node)

            run_config = make_run(
                frozen,
                name=NAME,
                regime=regime,
                phase=phase,
                seed=seed,
                epsilon=epsilon,
                n_users=n,
                paths=paths,
                variant=f"federated-{phase}-n{n}",
            )
            record = _finished(run_config, paths)
            if record is None or not paths.checkpoint(run_config).exists():
                record = run_one(run_config, paths, eligible=nodes)
            if record["status"] != "ok":
                invalid.append(f"federated run {record['id']} ended with status {record['status']}")
            flat = np.load(paths.checkpoint(run_config))["flat"]
            _, per_user = evaluate_per_user(flat, bundle, phase, frozen.model)
            federated_users.append(per_user[nodes])
            federated_rounds.append(int(record["rounds_completed"]))
            privacy = record.get("privacy")
            federated_eps.append(None if privacy is None else float(privacy["of_record"]))

        gossip_means = [_node_mean(v) for v in gossip_users]
        federated_means = [_node_mean(v) for v in federated_users]
        difference = federated_users[0] - gossip_users[0]
        low, high = user_bootstrap_ci(difference, seed=0)
        gossip_total = rounds * per_node_round
        uploads = float(np.mean(federated_rounds)) * spec.sample_rate
        by_epsilon[key] = {
            "gossip_ndcg10": _spread(gossip_means),
            "federated_ndcg10": _spread(federated_means),
            "most_popular_ndcg10": floor,
            "gap": {
                "definition": "federated minus gossip, mean NDCG@10 over the same nodes",
                "mean": _node_mean(difference),
                "ci95": [low, high],
                "interval_over": "nodes, seed 0 only",
                "mean_over_seeds": float(np.mean(federated_means) - np.mean(gossip_means)),
            },
            "bytes": {
                "parameters": parameters,
                "gossip_per_node_per_round": per_node_round,
                "gossip_total_per_node": gossip_total,
                "federated_upload_per_participation": parameters * FLOAT_BYTES,
                "federated_per_node_per_round_expected": spec.sample_rate
                * parameters
                * FLOAT_BYTES,
                "federated_total_per_node_expected": uploads * parameters * FLOAT_BYTES,
                "gossip_over_federated_total": (
                    gossip_total / (uploads * parameters * FLOAT_BYTES) if uploads > 0 else None
                ),
            },
            "epsilon_claimed": {
                "target": epsilon,
                "delta": delta,
                "gossip_local": (None if epsilon is None else pld_epsilon(1.0, z, rounds, delta)),
                "gossip_local_replace_adjacency": (
                    None if epsilon is None else _replace_adjacency_epsilon(z, rounds, delta)
                ),
                "federated": federated_eps[0],
            },
            "local_noise_multiplier": z,
            "federated_rounds": federated_rounds,
        }

    controls, control_reasons = build_controls(
        by_epsilon["nonprivate"]["gossip_ndcg10"]["mean"],
        floor,
        untrained,
        by_epsilon["nonprivate"]["federated_ndcg10"]["mean"],
    )
    invalid.extend(control_reasons)

    h2: dict[str, Any] | None = None
    if "8.0" in by_epsilon:
        entry = by_epsilon["8.0"]
        federated_mean = entry["federated_ndcg10"]["mean"]
        h2 = {
            "claim": "gossip with local DP shows a substantial utility gap versus federated "
            "central DP at equal epsilon",
            "epsilon": 8.0,
            "gap_mean": entry["gap"]["mean"],
            "gap_ci95": entry["gap"]["ci95"],
            "relative_gap": entry["gap"]["mean_over_seeds"] / federated_mean
            if federated_mean > 0
            else None,
            "gossip_ndcg10": entry["gossip_ndcg10"]["mean"],
            "federated_ndcg10": federated_mean,
            "most_popular_ndcg10": floor,
            "note": "a measurement, not a control; reading it is left to the analysis",
        }

    output: dict[str, Any] = {
        "experiment": NAME,
        "status": "INVALID" if invalid else "VALID",
        "invalid_reasons": invalid,
        "controls": controls,
        "settings": {
            "n_nodes": n,
            "rounds": rounds,
            "degree": degree,
            "epsilons": list(order),
            "seeds": list(seeds),
            "lr": lr,
            "optimiser": optimiser,
            "mix_moments": mix_moments,
            "regime": regime,
            "clip_norm": spec.clip_norm,
            "hide_fraction": GossipConfig(rounds=1).hide_fraction,
            "federated_sample_rate": spec.sample_rate,
            "federated_rounds": spec.rounds,
            "phase": phase,
            "most_popular_counted_on": "histories of the node population",
        },
        "results": {
            "nodes": n,
            "friend_peer_share": float(np.mean(shares)),
            "mean_degree": float(subgraph.degrees().mean()),
            "by_epsilon": by_epsilon,
            "h2": h2,
        },
        "limitations": list(LIMITATIONS),
        "provenance": payload_provenance(__file__, extra=("fl/gossip.py",)),
        "wall_seconds": round(time.time() - started, 2),
    }
    atomic_write_json(paths.results / f"{NAME}.json", output)
    return output


def summary_lines(output: dict[str, Any]) -> list[str]:
    """A short table of the result."""
    results = output["results"]
    lines = [
        f"gossip vs federated: {output['status']}  nodes={results['nodes']}  "
        f"friend-peer share={results['friend_peer_share']:.2f}",
        f"{'epsilon':>10} {'gossip':>8} {'federated':>10} {'popular':>8} {'gap':>8}  gap 95% CI",
    ]
    for key, entry in results["by_epsilon"].items():
        low, high = entry["gap"]["ci95"]
        lines.append(
            f"{key:>10} {entry['gossip_ndcg10']['mean']:8.4f} "
            f"{entry['federated_ndcg10']['mean']:10.4f} {entry['most_popular_ndcg10']:8.4f} "
            f"{entry['gap']['mean']:8.4f}  [{low:.4f}, {high:.4f}]"
        )
    lines.extend(f"INVALID: {reason}" for reason in output["invalid_reasons"])
    return lines


def _epsilon(token: str) -> float | None:
    return None if token.lower() == "none" else float(token)


def cli(argv: list[str] | None = None) -> int:
    """Command line entry point."""
    parser = argparse.ArgumentParser(
        description="Gossip with local DP versus federated central DP."
    )
    parser.add_argument("--root", type=Path, default=Path("."))
    parser.add_argument("--workers", type=int, default=1, help="unused: runs are sequential")
    parser.add_argument("--threads", type=int, default=None)
    parser.add_argument("--n-nodes", "--nodes", dest="n_nodes", type=int, default=3000)
    parser.add_argument("--rounds", type=int, default=100)
    parser.add_argument("--degree", type=int, default=4)
    parser.add_argument("--epsilons", nargs="+", type=_epsilon, default=[None, 8.0])
    parser.add_argument("--seeds", nargs="+", type=int, default=[0, 1, 2])
    parser.add_argument("--lr", "--local-lr", dest="lr", type=float, default=DEFAULT_LR)
    parser.add_argument("--optimiser", choices=["adam", "sgd"], default="adam")
    parser.add_argument("--mix-moments", action=argparse.BooleanOptionalAction, default=True)
    parser.add_argument("--phase", choices=["tune", "final"], default="final")
    parser.add_argument("--regime", default="small")
    args = parser.parse_args(argv)
    frozen = load_frozen(args.root / FROZEN_PATH)
    output = run(
        default_paths(args.root),
        frozen,
        n_nodes=args.n_nodes,
        rounds=args.rounds,
        degree=args.degree,
        epsilons=tuple(args.epsilons),
        seeds=tuple(args.seeds),
        lr=args.lr,
        optimiser=args.optimiser,
        mix_moments=args.mix_moments,
        phase=args.phase,
        regime=args.regime,
        threads=args.threads,
    )
    print("\n".join(summary_lines(output)))
    return 0
