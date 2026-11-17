"""End-to-end demonstration on a synthetic dataset.

Needs no Yelp data. It generates a small synthetic social dataset, evaluates the
baselines, trains non-private and private models, checks the privacy accounting,
writes and verifies the ledger, and shows the release gate blocking an
over-budget run. It is what CI runs, and what a reader without the dataset can run.
"""

from __future__ import annotations

import argparse
import tempfile
import time
from pathlib import Path
from typing import Any

from prism.config import ModelConfig
from prism.data.synthetic import write_synthetic_dataset
from prism.experiments import baselines, ledger_audit, privacy_utility
from prism.experiments.regimes import Frozen, RegimeSpec
from prism.experiments.runner import Paths

DEMO_FROZEN: Frozen = Frozen(
    version=1,
    tuned_on="fixed demonstration settings for the synthetic dataset",
    model=ModelConfig(dim=8),
    regimes={
        "small": RegimeSpec(
            sample_rate=0.3, rounds=40, server_opt="adam", server_lr=0.05, clip_norm=0.5
        )
    },
    epsilons=(8.0,),
    seeds=(0, 1),
)


def run(root: Path) -> dict[str, Any]:
    """Run the whole pipeline under ``root`` and return a compact summary."""
    started = time.time()
    paths = Paths(processed=root / "processed", results=root / "results", keys=root / "keys")
    bundle = write_synthetic_dataset(paths.processed)
    table = baselines.run(paths)
    grid = privacy_utility.run(paths, DEMO_FROZEN, phase="final", whatif=(), workers=1, threads=2)
    audit = ledger_audit.run(paths, flips=60)
    levels = grid["summary"]["small"]["levels"]
    return {
        "users": bundle.n_users,
        "items": bundle.n_items,
        "most_popular_ndcg@10": table["phases"]["test"]["most_popular"]["ndcg@10"],
        "friends_ndcg@10": table["phases"]["test"].get("friends", {}).get("ndcg@10"),
        "non_private_ndcg@10": levels["nondp"]["ndcg@10_mean"],
        "epsilon8_ndcg@10": levels["eps8"]["ndcg@10_mean"],
        "epsilon_of_record": levels["eps8"]["epsilon_of_record"],
        "grid_status": grid["status"],
        "ledger_status": audit["status"],
        "ledgers_verified": audit["results"]["verification"]["verified"],
        "over_budget_run_blocked": audit["results"]["blocked_release_demo"]["blocked"],
        "seconds": round(time.time() - started, 1),
    }


def cli(argv: list[str] | None = None) -> int:
    """``prism demo-small``."""
    parser = argparse.ArgumentParser(prog="prism demo-small", description=__doc__)
    parser.add_argument(
        "--out", default=None, help="folder to keep the outputs in (default: temporary)"
    )
    args = parser.parse_args(argv)
    if args.out:
        summary = run(Path(args.out))
    else:
        with tempfile.TemporaryDirectory() as folder:
            summary = run(Path(folder))
    for key, value in summary.items():
        print(f"{key}: {value}")
    ok = (
        summary["grid_status"] == "VALID"
        and summary["ledger_status"] == "VALID"
        and summary["over_budget_run_blocked"]
        and summary["non_private_ndcg@10"] > summary["most_popular_ndcg@10"]
    )
    print("DEMO OK" if ok else "DEMO FAILED")
    return 0 if ok else 1
