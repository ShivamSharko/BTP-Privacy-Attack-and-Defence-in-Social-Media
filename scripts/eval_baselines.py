"""Evaluate non-learned baselines on the held-out test split."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Final

from prism.data.dataset import load_split, user_item_lists
from prism.environment import collect_environment_report
from prism.eval.baselines import knn_score_fn, popularity_score_fn
from prism.eval.metrics import ranking_metrics

PROCESSED: Final[Path] = Path("data/processed")
DATASET_CARD: Final[Path] = Path("results/dataset_card.json")
OUT: Final[Path] = Path("results/baselines.json")


def main() -> int:
    """Score the full filtered catalogue for every test user."""
    card = json.loads(DATASET_CARD.read_text(encoding="utf-8"))
    n_users, n_items = int(card["users"]), int(card["items"])
    train_items = user_item_lists(load_split("train", PROCESSED), n_users)
    test_items = user_item_lists(load_split("test", PROCESSED), n_users)

    results = {}
    print("Evaluating MostPopular (also the non-profiling mode) ...", flush=True)
    results["most_popular"] = ranking_metrics(
        popularity_score_fn(train_items, n_items), train_items, test_items, n_items
    )
    print("Evaluating ItemKNN (k=100 neighbours) ...", flush=True)
    results["item_knn"] = ranking_metrics(
        knn_score_fn(train_items, n_items, 100), train_items, test_items, n_items
    )

    env = collect_environment_report()
    payload = {
        "schema_version": 1,
        "users": n_users,
        "items": n_items,
        "protocol": "full-catalogue ranking, training items masked, test split",
        "baselines": results,
        "provenance": {"git_commit": env.git_commit, "uv_lock_sha256": env.uv_lock_sha256},
    }
    OUT.write_text(
        json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8", newline="\n"
    )
    print("\nWritten to " + str(OUT))
    for name, metrics in results.items():
        print(
            name
            + " : NDCG@10="
            + format(metrics["ndcg@10"], ".4f")
            + " Recall@20="
            + format(metrics["recall@20"], ".4f")
            + " HR@10="
            + format(metrics["hr@10"], ".4f")
            + " MRR="
            + format(metrics["mrr"], ".4f")
            + " coverage="
            + format(metrics["coverage@10"], ".4f")
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
