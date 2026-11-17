"""Build the friend graph from the filtered users file and report its aggregate shape."""

from __future__ import annotations

import argparse
from pathlib import Path
from typing import Any

from prism.data.social import build_friend_graph, graph_summary, save_friend_graph
from prism.experiments.regimes import default_paths
from prism.experiments.runner import Paths
from prism.io import atomic_write_json

USERS_FILE: str = "philly_users.csv.gz"
INDEX_FILE: str = "user_index.json"


def run(paths: Paths) -> dict[str, Any]:
    """Write ``data/processed/friends.npz`` and ``results/social_graph.json`` (aggregates only)."""
    graph = build_friend_graph(paths.processed / USERS_FILE, paths.processed / INDEX_FILE)
    save_friend_graph(graph, paths.processed)
    summary: dict[str, Any] = {
        "experiment": "social_graph",
        "source": "friends field of the users file; an edge is kept when both users are in the dataset",
        **graph_summary(graph),
    }
    atomic_write_json(paths.results / "social_graph.json", summary)
    return summary


def cli(argv: list[str] | None = None) -> int:
    """``prism social``."""
    parser = argparse.ArgumentParser(prog="prism social", description=__doc__)
    parser.add_argument("--root", default=".")
    args = parser.parse_args(argv)
    for key, value in run(default_paths(Path(args.root))).items():
        print(f"{key}: {value}")
    return 0
