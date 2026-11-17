"""Update leakage: what a curious server learns from the model updates users send.

Two attacks on the same single-step client updates:

1. history inversion: score every item from one update and check how well the scores
   separate the user's real history from the other items (``prism.attacks.inversion``);
2. friendship-link inference: cosine similarity of two users' vectors, scored as an AUC
   over friend and non-friend pairs (``prism.attacks.links``).

Settings, from weakest to strongest protection: ``raw`` (the server sees each clipped
update), ``local_noise_z*`` (Gaussian noise added by the client), ``masked`` (one masked
payload under secure aggregation), ``sum_k`` (the secure sum of k users, scored against each
member), ``sum_k_dp`` (that sum with central Gaussian noise) and ``reference_histories`` (the
link ceiling set by how alike friends' tastes are; not an attack on updates).

Controls: ``raw`` must recover histories (the attack works when nothing protects the update)
and ``masked`` must sit at chance (the harness does not leak by accident). A failed control
marks the run INVALID.
"""

from __future__ import annotations

import argparse
import math
import time
from pathlib import Path
from typing import Any

import numpy as np
import torch
from numpy.typing import NDArray

from prism.attacks.inversion import history_scores, recovery_metrics
from prism.attacks.links import link_inference
from prism.config import Phase
from prism.data.bundle import DataBundle, load_bundle
from prism.data.social import FRIENDS_FILE, SocialGraph, load_friend_graph
from prism.eval.stats import user_bootstrap_ci
from prism.experiments.regimes import Frozen, default_paths, load_frozen, make_run
from prism.experiments.runner import Paths
from prism.fl.aggregate import clip_rows
from prism.fl.client import make_delta_fn, split_history
from prism.fl.secagg import FixedPoint, SecAggClient, secure_sum
from prism.io import atomic_write_json
from prism.models.hybrid import Layout, content_base, init_flat, make_layout
from prism.privacy.accounting import delta_for, pld_epsilon
from prism.seeding import stream, torch_generator

NAME = "update_leakage"
PHASE: Phase = "final"
CHUNK = 50
MASK_COHORT = 3
RAW_MIN_AUC = 0.80
RAW_MIN_PRECISION_RATIO = 5.0
MASKED_AUC_TOLERANCE = 0.05
METRICS = ("auc", "precision_at_10", "prior_auc", "prior_precision_at_10")
NO_GRAPH = "no_friend_graph"
NOT_APPLICABLE = "not_applicable"

LIMITATIONS = (
    "Updates are single local steps taken at one model state, not a whole training run.",
    "The server is honest-but-curious: it follows the protocol and only inspects what it receives.",
    "The secure sum is a simulation of the arithmetic, not a deployable protocol.",
    "The local-noise epsilon is for one release of one update, not for a whole training run.",
    "Adjacency: 'single_release_epsilon' uses the project's add-or-remove unit (the neighbouring "
    "input is the same user with no data), so the sensitivity is the clipping norm C. "
    "'single_release_epsilon_replace_adjacency' uses the stricter local-DP convention in which "
    "any two inputs of one device are neighbours (replace one update by another), so the "
    "sensitivity is 2C and the same noise gives a larger epsilon.",
    "Targets are users with at least two history items; link results use pairs among targets only.",
)

Arrays = NDArray[np.float32]
Scorer = list[dict[str, float]]


def _updates(
    bundle: DataBundle,
    users: NDArray[np.int64],
    flat: torch.Tensor,
    layout: Layout,
    run: Any,
    rng: np.random.Generator,
    model: Any,
) -> Arrays:
    """Clipped single-step updates of the target users, one row each."""
    base = content_base(bundle.item_content, model)
    delta_fn = make_delta_fn(layout, base, model, 1, run.train.local_lr)
    generator = torch_generator(rng)
    out = np.empty((users.size, layout.total), dtype=np.float32)
    for start in range(0, users.size, CHUNK):
        part = users[start : start + CHUNK]
        rows = torch.from_numpy(bundle.history_matrix(PHASE, part))
        visible, target = split_history(rows, 1, run.train.hide_fraction, generator)
        deltas = delta_fn(flat, visible, target)
        clipped = clip_rows(deltas, run.train.clip_norm).clipped
        out[start : start + part.size] = clipped.numpy()
    return out


def _summary(per_target: Scorer) -> dict[str, Any]:
    """Mean and 95% bootstrap interval of each recovery metric over targets."""
    result: dict[str, Any] = {}
    for key in METRICS:
        values = np.array([m[key] for m in per_target], dtype=np.float64)
        finite = values[np.isfinite(values)]
        low, high = user_bootstrap_ci(values)
        result[key] = {
            "mean": float(finite.mean()) if finite.size else float("nan"),
            "ci95": [low, high],
        }
    return result


def _recover(
    vectors: NDArray[Any],
    histories: tuple[NDArray[np.int64], ...],
    popularity: NDArray[np.int64],
    layout: Layout,
) -> Scorer:
    return [
        recovery_metrics(history_scores(vectors[i], layout), histories[i], popularity)
        for i in range(vectors.shape[0])
    ]


def _entry(
    vectors: Arrays,
    users: NDArray[np.int64],
    histories: tuple[NDArray[np.int64], ...],
    popularity: NDArray[np.int64],
    layout: Layout,
    graph: SocialGraph | None,
    seed: int,
) -> dict[str, Any]:
    return {
        "recovery": _summary(_recover(vectors, histories, popularity, layout)),
        "link": _link(vectors, users, graph, seed),
    }


def _link(
    vectors: NDArray[Any], users: NDArray[np.int64], graph: SocialGraph | None, seed: int
) -> dict[str, float] | str:
    if graph is None:
        return NO_GRAPH
    # A fresh stream per call: every setting is scored on the same sampled pairs.
    return link_inference(vectors, users, graph, stream(seed, "attack-links"))


def _masked(updates: Arrays, clip_norm: float) -> Arrays:
    """The individual payload a server receives under secure aggregation (cohort of 3)."""
    codec = FixedPoint(clip_norm)
    out = np.empty(updates.shape, dtype=np.float32)
    for i in range(updates.shape[0]):
        clients = [SecAggClient(c) for c in range(MASK_COHORT)]
        peers = {c.client_id: c.public_bytes for c in clients}
        payload = clients[0].masked_update(updates[i], peers, 0, codec).payload
        out[i] = codec.decode_sum(payload)
    return out


def _group_sums(updates: Arrays, k: int, clip_norm: float) -> list[tuple[slice, NDArray[Any]]]:
    """Secure sums of disjoint full groups of k target users (a short remainder is unused)."""
    sums = []
    for index in range(updates.shape[0] // k):
        members = slice(index * k, (index + 1) * k)
        sums.append((members, secure_sum(updates[members], clip_norm, index).total))
    return sums


def _score_sums(
    sums: list[tuple[slice, NDArray[Any]]],
    histories: tuple[NDArray[np.int64], ...],
    popularity: NDArray[np.int64],
    layout: Layout,
) -> dict[str, Any]:
    """The attacker scores the SUM once and is judged against each member's own history."""
    per_member: Scorer = []
    for members, total in sums:
        scores = history_scores(total, layout)
        for i in range(members.start, members.stop):
            per_member.append(recovery_metrics(scores, histories[i], popularity))
    if not per_member:
        return {"recovery": "not_enough_targets", "link": NOT_APPLICABLE}
    return {"recovery": _summary(per_member), "link": NOT_APPLICABLE}


def _controls(raw: dict[str, Any], masked: dict[str, Any]) -> tuple[dict[str, Any], list[str]]:
    auc = raw["auc"]["mean"]
    precision = raw["precision_at_10"]["mean"]
    prior = raw["prior_precision_at_10"]["mean"]
    masked_auc = masked["auc"]["mean"]
    raw_ok = bool(
        math.isfinite(auc)
        and math.isfinite(precision)
        and math.isfinite(prior)
        and auc >= RAW_MIN_AUC
        and precision >= RAW_MIN_PRECISION_RATIO * prior
    )
    masked_ok = bool(math.isfinite(masked_auc) and abs(masked_auc - 0.5) <= MASKED_AUC_TOLERANCE)
    controls = {
        "raw_recovers_history": {
            "what": "mean history AUC and precision@10 when the server sees the raw clipped update",
            "measured": {"auc": auc, "precision_at_10": precision, "prior_precision_at_10": prior},
            "threshold": {
                "min_auc": RAW_MIN_AUC,
                "min_precision_at_10_over_prior": RAW_MIN_PRECISION_RATIO,
            },
            "passed": raw_ok,
        },
        "masked_is_chance": {
            "what": "mean history AUC from one masked secure-aggregation payload",
            "measured": {"auc": masked_auc},
            "threshold": {"auc_within": [0.5 - MASKED_AUC_TOLERANCE, 0.5 + MASKED_AUC_TOLERANCE]},
            "passed": masked_ok,
        },
    }
    reasons = []
    if not raw_ok:
        reasons.append(
            f"raw control failed: auc {auc:.3f} (need >= {RAW_MIN_AUC}), precision@10 "
            f"{precision:.3f} vs prior {prior:.3f} (need >= {RAW_MIN_PRECISION_RATIO}x)"
        )
    if not masked_ok:
        reasons.append(f"masked control failed: auc {masked_auc:.3f} is not within 0.5 +/- 0.05")
    return controls, reasons


def _clean(node: Any) -> Any:
    """Replace NaN and infinity with None so the result can be written as JSON."""
    if isinstance(node, dict):
        return {key: _clean(value) for key, value in node.items()}
    if isinstance(node, (list, tuple)):
        return [_clean(value) for value in node]
    if isinstance(node, float) and not math.isfinite(node):
        return None
    return node


def _replace_epsilon(z: float, delta: float) -> float | None:
    """One release when any two inputs of a device are neighbours (sensitivity 2C)."""
    try:
        return pld_epsilon(1.0, z / 2.0, 1, delta)
    except Exception:
        return None


def run(
    paths: Paths,
    frozen: Frozen,
    *,
    n_targets: int = 300,
    cohort_sizes: tuple[int, ...] = (10, 100),
    local_noise: tuple[float, ...] = (0.5, 1.0, 2.0, 5.0),
    regime: str = "small",
    seed: int = 0,
    checkpoint: Path | None = None,
) -> dict[str, Any]:
    """Run every setting, write ``results/update_leakage.json`` and return it."""
    started = time.perf_counter()
    bundle = load_bundle(paths.processed)
    model = frozen.model
    layout = make_layout(bundle.n_items, model.dim)
    config = make_run(
        frozen,
        name=NAME,
        regime=regime,
        phase=PHASE,
        seed=seed,
        epsilon=8.0,
        n_users=bundle.n_users,
        paths=paths,
    )
    clip_norm = frozen.regimes[regime].clip_norm
    if checkpoint is not None:
        flat = torch.from_numpy(np.asarray(np.load(checkpoint)["flat"], dtype=np.float32))
        if flat.numel() != layout.total:
            raise ValueError("checkpoint size does not match the layout")
        model_state: dict[str, str | None] = {"source": "checkpoint", "file": checkpoint.name}
    else:
        flat = init_flat(layout, model, stream(seed, "init"))
        model_state = {"source": "init_flat", "file": None}
    graph = (
        load_friend_graph(paths.processed) if (paths.processed / FRIENDS_FILE).exists() else None
    )

    history = bundle.history(PHASE)
    popularity = bundle.popularity(PHASE)
    rng = stream(seed, "attack")
    eligible = np.flatnonzero([items.size >= 2 for items in history]).astype(np.int64)
    users = np.sort(rng.choice(eligible, size=min(n_targets, eligible.size), replace=False))
    histories = tuple(history[int(u)] for u in users)
    updates = _updates(bundle, users, flat, layout, config, rng, model)

    results: dict[str, Any] = {}
    results["raw"] = _entry(updates, users, histories, popularity, layout, graph, seed)

    noise_rng = stream(seed, "noise")
    for z in local_noise:
        noisy = updates + noise_rng.normal(0.0, z * clip_norm, size=updates.shape).astype(
            np.float32
        )
        entry = _entry(noisy, users, histories, popularity, layout, graph, seed)
        delta = delta_for(bundle.n_users)
        entry["single_release_epsilon"] = pld_epsilon(1.0, z, 1, delta)
        entry["single_release_epsilon_replace_adjacency"] = _replace_epsilon(z, delta)
        results[f"local_noise_z{z:g}"] = entry
        del noisy

    masked = _masked(updates, clip_norm)
    results["masked"] = _entry(masked, users, histories, popularity, layout, graph, seed)
    del masked

    largest = max(cohort_sizes)
    big_sums: list[tuple[slice, NDArray[Any]]] = []
    for k in cohort_sizes:
        sums = _group_sums(updates, k, clip_norm)
        results[f"sum_{k}"] = _score_sums(sums, histories, popularity, layout)
        if k == largest:
            big_sums = sums

    z_dp = float(config.train.noise_multiplier)
    noised = [
        (members, total + noise_rng.normal(0.0, z_dp * clip_norm, size=total.shape))
        for members, total in big_sums
    ]
    results[f"sum_{largest}_dp"] = _score_sums(noised, histories, popularity, layout)
    results[f"sum_{largest}_dp"]["noise_multiplier"] = z_dp
    results[f"sum_{largest}_dp"]["target_epsilon"] = 8.0

    reference = bundle.history_matrix(PHASE, users)
    results["reference_histories"] = {"link": _link(reference, users, graph, seed)}

    controls, reasons = _controls(results["raw"]["recovery"], results["masked"]["recovery"])
    output = {
        "experiment": NAME,
        "status": "INVALID" if reasons else "VALID",
        "invalid_reasons": reasons,
        "controls": controls,
        "model_state": model_state,
        "settings": {
            "n_targets": int(users.size),
            "cohort_sizes": list(cohort_sizes),
            "local_noise": list(local_noise),
            "regime": regime,
            "seed": seed,
            "phase": PHASE,
            "clip_norm": clip_norm,
            "local_steps": 1,
            "local_lr": config.train.local_lr,
            "hide_fraction": config.train.hide_fraction,
            "n_users": bundle.n_users,
            "n_items": bundle.n_items,
            "mask_cohort": MASK_COHORT,
            "friend_graph": graph is not None,
            "list": list(results),
        },
        "results": results,
        "limitations": list(LIMITATIONS),
        "wall_seconds": time.perf_counter() - started,
    }
    output = _clean(output)
    atomic_write_json(paths.results / f"{NAME}.json", output)
    return output  # type: ignore[no-any-return]


def _cell(value: Any) -> str:
    return "  -  " if value is None else f"{value:.3f}"


def cli(argv: list[str] | None = None) -> int:
    """Command line wrapper around ``run``."""
    parser = argparse.ArgumentParser(description="Update leakage: history inversion and links.")
    parser.add_argument("--root", type=Path, default=Path("."))
    parser.add_argument("--workers", type=int, default=1, help="accepted for symmetry; unused")
    parser.add_argument("--threads", type=int, default=0, help="torch threads (0 = default)")
    parser.add_argument("--targets", type=int, default=300)
    parser.add_argument("--cohort-sizes", type=int, nargs="+", default=[10, 100])
    parser.add_argument("--local-noise", type=float, nargs="+", default=[0.5, 1.0, 2.0, 5.0])
    parser.add_argument("--regime", default="small")
    parser.add_argument("--seed", type=int, default=0)
    parser.add_argument("--checkpoint", type=Path, default=None)
    args = parser.parse_args(argv)
    if args.threads > 0:
        torch.set_num_threads(args.threads)
    paths = default_paths(args.root)
    out = run(
        paths,
        load_frozen(args.root / "experiments" / "frozen.json"),
        n_targets=args.targets,
        cohort_sizes=tuple(args.cohort_sizes),
        local_noise=tuple(args.local_noise),
        regime=args.regime,
        seed=args.seed,
        checkpoint=args.checkpoint,
    )
    print(f"{NAME}: {out['status']} ({out['wall_seconds']:.0f} s)")
    for reason in out["invalid_reasons"]:
        print(f"  INVALID: {reason}")
    print(f"{'setting':<22}{'hist AUC':>9}{'P@10':>8}{'prior P@10':>11}{'link AUC':>10}")
    for name, entry in out["results"].items():
        recovery = entry.get("recovery")
        link = entry["link"]
        link_auc = link.get("auc") if isinstance(link, dict) else link
        if isinstance(recovery, dict):
            cells = (
                _cell(recovery["auc"]["mean"]),
                _cell(recovery["precision_at_10"]["mean"]),
                _cell(recovery["prior_precision_at_10"]["mean"]),
            )
        else:
            cells = ("  -  ", "  -  ", "  -  ")
        link_text = link_auc if isinstance(link_auc, str) else _cell(link_auc)
        print(f"{name:<22}{cells[0]:>9}{cells[1]:>8}{cells[2]:>11}{link_text:>10}")
    return 0 if out["status"] == "VALID" else 1


if __name__ == "__main__":
    raise SystemExit(cli())
