"""Reference recommenders that need no training rounds.

MostPopular is the floor every model must beat (it is also the non-profiling
mode: the same list for everyone). ItemKNN and the closed-form item-item ridge
model are collaborative ceilings. The friends baseline recommends what a user's
friends interacted with, and shows how much signal the social graph carries.
"""

from __future__ import annotations

import argparse
import time
from collections.abc import Callable
from pathlib import Path
from typing import Any

import numpy as np
import numpy.typing as npt

from prism.config import Phase
from prism.data.bundle import DataBundle, load_bundle
from prism.data.social import FRIENDS_FILE, load_friend_graph
from prism.eval.baselines import ease_score_fn, friend_score_fn, knn_score_fn, popularity_score_fn
from prism.eval.metrics import ranking_metrics_per_user
from prism.eval.stats import user_bootstrap_ci
from prism.experiments.regimes import default_paths
from prism.experiments.runner import Paths, payload_provenance
from prism.io import atomic_write_json

ScoreFn = Callable[[npt.NDArray[np.int64]], npt.NDArray[np.float32]]
EASE_L2: float = 500.0  # chosen on the validation split among {100, 500, 2000}


def baseline_score_fns(bundle: DataBundle, phase: Phase, processed: Path) -> dict[str, ScoreFn]:
    """Score functions of every baseline for one phase."""
    history = bundle.history(phase)
    functions: dict[str, ScoreFn] = {
        "most_popular": popularity_score_fn(history, bundle.n_items),
        "item_knn": knn_score_fn(history, bundle.n_items),
        "item_ridge": ease_score_fn(history, bundle.n_items, EASE_L2),
    }
    if (processed / FRIENDS_FILE).exists():
        graph = load_friend_graph(processed)
        functions["friends"] = friend_score_fn(graph, history, bundle.n_items)
    return functions


def evaluate_baselines(bundle: DataBundle, phase: Phase, processed: Path) -> dict[str, Any]:
    """Metrics and a per-user bootstrap interval for every baseline."""
    results: dict[str, Any] = {}
    for name, score_fn in baseline_score_fns(bundle, phase, processed).items():
        metrics, per_user = ranking_metrics_per_user(
            score_fn, bundle.history(phase), bundle.targets(phase), bundle.n_items
        )
        low, high = user_bootstrap_ci(per_user)
        results[name] = {**metrics, "ndcg_ci95": [low, high]}
    return results


def run(paths: Paths, phases: tuple[Phase, ...] = ("tune", "final")) -> dict[str, Any]:
    """Evaluate all baselines and write ``results/baselines.json``."""
    started = time.time()
    bundle = load_bundle(paths.processed)
    payload: dict[str, Any] = {
        "experiment": "baselines",
        "users": bundle.n_users,
        "items": bundle.n_items,
        "protocol": "full-catalogue ranking; history items masked; "
        "tune = train history, validation targets; final = train+validation history, test targets",
        "item_ridge_l2": EASE_L2,
        "phases": {
            ("validation" if phase == "tune" else "test"): evaluate_baselines(
                bundle, phase, paths.processed
            )
            for phase in phases
        },
        "provenance": payload_provenance(__file__, extra=("eval/baselines.py",)),
        "wall_seconds": 0.0,
    }
    payload["wall_seconds"] = round(time.time() - started, 2)
    atomic_write_json(paths.results / "baselines.json", payload)
    return payload


def cli(argv: list[str] | None = None) -> int:
    """``prism baselines``."""
    parser = argparse.ArgumentParser(prog="prism baselines", description=__doc__)
    parser.add_argument("--root", default=".")
    args = parser.parse_args(argv)
    payload = run(default_paths(Path(args.root)))
    for split, table in payload["phases"].items():
        print(f"[{split}]")
        for name, metrics in table.items():
            print(
                f"  {name:<13} ndcg@10={metrics['ndcg@10']:.4f} hr@10={metrics['hr@10']:.4f} "
                f"distinct@10={metrics['distinct@10']:.0f}"
            )
    return 0
