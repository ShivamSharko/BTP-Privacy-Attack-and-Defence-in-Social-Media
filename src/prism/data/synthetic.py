"""Deterministic synthetic dataset in the on-disk format of the real processed data."""

from __future__ import annotations

from pathlib import Path

import numpy as np
import numpy.typing as npt
import pandas as pd  # type: ignore[import-untyped]

from prism.data.bundle import DataBundle, load_bundle
from prism.data.social import SocialGraph, graph_from_edges, save_friend_graph
from prism.data.splits import split_counts

IN_CLUSTER_SHARE = 0.8
MIN_PER_USER = 15
MAX_PER_USER = 60
ZIPF_EXPONENT = 1.0
FRIEND_IN_CLUSTER_SHARE = 0.8
MEAN_FRIENDS_INITIATED = 3.0
ISOLATED_SHARE = 0.02


def synthetic_user_clusters(
    n_users: int = 400, n_items: int = 300, n_clusters: int = 8, seed: int = 0
) -> npt.NDArray[np.int64]:
    """Latent cluster of each user, replaying the draws made by write_synthetic_dataset."""
    rng = np.random.default_rng(seed)
    rng.shuffle(np.arange(n_items) % n_clusters)
    return rng.integers(0, n_clusters, n_users).astype(np.int64)


def _friend_graph(user_cluster: npt.NDArray[np.int64], seed: int) -> SocialGraph:
    """Homophilous friend graph: most links stay inside the latent cluster of the user."""
    rng = np.random.default_rng([seed, 1])
    n_users = int(user_cluster.size)
    pool = np.flatnonzero(rng.random(n_users) >= ISOLATED_SHARE)
    edges: list[tuple[int, int]] = []
    for user in pool:
        same_cluster = user_cluster[pool] == user_cluster[user]
        same = pool[same_cluster & (pool != user)]
        other = pool[~same_cluster]
        for _ in range(int(rng.poisson(MEAN_FRIENDS_INITIATED))):
            use_same = rng.random() < FRIEND_IN_CLUSTER_SHARE and same.size > 0
            choices = same if use_same else other
            if choices.size:
                edges.append((int(user), int(rng.choice(choices))))
    return graph_from_edges(np.array(edges, dtype=np.int64).reshape(-1, 2), n_users)


def _normalise(rows: npt.NDArray[np.float64]) -> npt.NDArray[np.float32]:
    norms = np.maximum(np.linalg.norm(rows, axis=1, keepdims=True), 1e-12)
    return (rows / norms).astype(np.float32)


def write_synthetic_dataset(
    out_dir: Path,
    n_users: int = 400,
    n_items: int = 300,
    content_dim: int = 32,
    n_clusters: int = 8,
    seed: int = 0,
) -> DataBundle:
    """Write a clustered, Zipf-skewed dataset under out_dir and return the loaded bundle."""
    rng = np.random.default_rng(seed)
    out_dir.mkdir(parents=True, exist_ok=True)

    item_cluster = np.arange(n_items) % n_clusters
    rng.shuffle(item_cluster)
    user_cluster = rng.integers(0, n_clusters, n_users)
    rank = rng.permutation(n_items) + 1
    popularity = 1.0 / rank.astype(np.float64) ** ZIPF_EXPONENT

    members = [np.flatnonzero(item_cluster == c) for c in range(n_clusters)]
    centroids = rng.normal(size=(n_clusters, content_dim))
    noise = rng.normal(size=(n_items, content_dim))
    content = _normalise(centroids[item_cluster] + 0.5 * noise)

    frames: list[pd.DataFrame] = []
    train_lists: list[npt.NDArray[np.int64]] = []
    for user in range(n_users):
        total = int(rng.integers(MIN_PER_USER, MAX_PER_USER + 1))
        own = members[int(user_cluster[user])]
        n_in = min(round(IN_CLUSTER_SHARE * total), own.size)
        inside = rng.choice(
            own, size=n_in, replace=False, p=popularity[own] / popularity[own].sum()
        )
        others = np.setdiff1d(np.arange(n_items), own)
        n_out = min(total - n_in, others.size)
        weights = popularity[others] / popularity[others].sum()
        outside = rng.choice(others, size=n_out, replace=False, p=weights)
        items = rng.permutation(np.concatenate([inside, outside])).astype(np.int64)
        n_train, n_val, _ = split_counts(items.size)
        labels = np.array(
            ["train"] * n_train + ["val"] * n_val + ["test"] * (items.size - n_train - n_val)
        )
        frames.append(
            pd.DataFrame(
                {
                    "user_idx": user,
                    "item_idx": items,
                    "rating": 5,
                    "timestamp": np.arange(items.size),
                    "split": labels,
                }
            )
        )
        train_lists.append(items[:n_train])

    frame = pd.concat(frames, ignore_index=True)
    for name in ("train", "val", "test"):
        frame[frame["split"] == name].to_csv(
            out_dir / f"dataset_{name}.csv.gz", index=False, compression="gzip"
        )
    pooled = np.stack([content[t].mean(axis=0) for t in train_lists]).astype(np.float64)
    np.savez_compressed(out_dir / "features_semantic.npz", items=content, users=_normalise(pooled))
    save_friend_graph(_friend_graph(user_cluster, seed), out_dir)
    return load_bundle(out_dir)
