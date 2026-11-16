"""Fast non-private learning-rate probe on a small cohort.

Trains without clipping or noise at a reduced sampling rate and reports NDCG@10
trajectories plus the actual server step norm, so the learning rate is chosen
from measurement. Writes results/learning_tuning.json.
"""

from __future__ import annotations

import argparse
import json
import os
import time
from pathlib import Path
from typing import Any, Final

import numpy as np
import torch

from prism.data.dataset import load_split, user_item_lists
from prism.eval.metrics import ranking_metrics
from prism.models.two_tower import (
    RoundConfig,
    TwoTower,
    aggregate_round,
    get_flat,
    make_score_fn,
    set_flat,
)

os.environ.setdefault("OMP_NUM_THREADS", "2")
os.environ.setdefault("MKL_NUM_THREADS", "2")

PROCESSED: Final[Path] = Path("data/processed")
DATASET_CARD: Final[Path] = Path("results/dataset_card.json")
OUT: Final[Path] = Path("results/learning_tuning.json")
PROBE_RATE: float = 0.05
PROBE_ROUNDS: int = 20
CHECKPOINTS: tuple[int, ...] = (5, 10, 20)
CANDIDATES: tuple[float, ...] = (2.0,)


def main(argv: list[str] | None = None) -> int:
    """Probe each candidate learning rate and report its trajectory."""
    parser = argparse.ArgumentParser(description="Non-private learning-rate probe.")
    parser.add_argument("--rounds", type=int, default=PROBE_ROUNDS)
    parser.add_argument("--rates", default=None)
    args = parser.parse_args(argv)
    rates = (
        CANDIDATES if args.rates is None else tuple(float(x) for x in str(args.rates).split(","))
    )
    rounds = int(args.rounds)

    torch.set_num_threads(2)
    card = json.loads(DATASET_CARD.read_text(encoding="utf-8"))
    n_users, n_items = int(card["users"]), int(card["items"])
    data = np.load(PROCESSED / "features_semantic.npz")
    item_features, user_features = data["items"], data["users"]
    train_items = user_item_lists(load_split("train", PROCESSED), n_users)
    test_items = user_item_lists(load_split("test", PROCESSED), n_users)

    results: dict[str, Any] = {}
    for rate in rates:
        torch.manual_seed(0)
        model = TwoTower(item_features.shape[1], n_items)
        flat = get_flat(model)
        rng = np.random.default_rng(0)
        config = RoundConfig(PROBE_RATE, 1, rate, 1.0, None, 0.0)
        started = time.time()
        trajectory: list[dict[str, Any]] = []
        print(f"\n--- local_lr = {rate} ---", flush=True)
        for round_index in range(1, rounds + 1):
            cohort = np.flatnonzero(rng.random(n_users) < PROBE_RATE)
            if cohort.size == 0:
                continue
            previous = flat
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
            step_norm = float(np.linalg.norm(flat - previous))
            if round_index in CHECKPOINTS or round_index == rounds:
                set_flat(model, flat)
                metrics = ranking_metrics(
                    make_score_fn(model, user_features, item_features),
                    train_items,
                    test_items,
                    n_items,
                )
                bias = model.item_bias.detach().cpu().numpy()
                trajectory.append(
                    {
                        "round": round_index,
                        "mean_delta_norm": mean_norm,
                        "server_step_norm": step_norm,
                        "bias_std": float(bias.std()),
                        "ndcg@10": metrics["ndcg@10"],
                        "hr@10": metrics["hr@10"],
                    }
                )
                print(
                    f"  round {round_index}: NDCG@10={metrics['ndcg@10']:.4f} "
                    f"HR@10={metrics['hr@10']:.4f} delta={mean_norm:.4f} "
                    f"step={step_norm:.4f} bias_std={bias.std():.4f}",
                    flush=True,
                )
        results[str(rate)] = {
            "trajectory": trajectory,
            "wall_seconds": round(time.time() - started, 2),
        }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        json.dumps(
            {
                "probe_rate": PROBE_RATE,
                "rounds": rounds,
                "reference_baselines": {"most_popular": 0.0250, "item_knn": 0.0347},
                "random_chance_ndcg@10": 0.0015,
                "results": results,
            },
            indent=2,
            sort_keys=True,
        )
        + "\n",
        encoding="utf-8",
        newline="\n",
    )
    print("\nWritten to " + str(OUT))
    print("Reference: MostPopular 0.0250, ItemKNN 0.0347, random chance 0.0015")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
