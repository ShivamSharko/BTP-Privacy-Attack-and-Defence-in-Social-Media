"""Tests for the friendship-link inference scoring."""

from __future__ import annotations

from pathlib import Path

import numpy as np

from prism.attacks.links import link_inference, pair_cosine
from prism.data.social import graph_from_edges, load_friend_graph
from prism.data.synthetic import synthetic_user_clusters, write_synthetic_dataset


def test_pair_cosine_zero_vector() -> None:
    vectors = np.array([[1.0, 0.0], [0.0, 0.0], [1.0, 1.0]])
    out = pair_cosine(vectors, np.array([0, 0, 1]), np.array([2, 0, 2]))
    assert abs(out[0] - 1 / np.sqrt(2)) < 1e-12
    assert out[1] == 1.0
    assert out[2] == 0.0
    assert not np.isnan(out).any()


def test_link_inference_no_pairs() -> None:
    graph = graph_from_edges(np.zeros((0, 2), dtype=np.int64), 4)
    out = link_inference(np.eye(4), np.arange(4, dtype=np.int64), graph, np.random.default_rng(0))
    assert np.isnan(out["auc"]) and out["pairs"] == 0.0


def test_synthetic_graph_is_homophilous_and_attackable(tmp_path: Path) -> None:
    bundle = write_synthetic_dataset(tmp_path)
    graph = load_friend_graph(tmp_path)
    assert graph.n_users == bundle.n_users
    clusters = synthetic_user_clusters()
    coo = graph.adjacency.tocoo()
    inside = float((clusters[coo.row] == clusters[coo.col]).mean())
    assert inside > 0.6  # chance is about 1/8
    assert 4.0 < graph.degrees().mean() < 8.0 and (graph.degrees() == 0).any()

    dense = np.zeros((bundle.n_users, bundle.n_items))
    for user, items in enumerate(bundle.train):
        dense[user, items] = 1.0
    users = np.arange(bundle.n_users, dtype=np.int64)
    real = link_inference(dense, users, graph, np.random.default_rng(0))
    assert real["auc"] > 0.6
    assert real["mean_cosine_friends"] > real["mean_cosine_non_friends"]
    print("synthetic link AUC", real["auc"])
    noise = np.random.default_rng(1).normal(size=dense.shape)
    null = link_inference(noise, users, graph, np.random.default_rng(0))
    assert abs(null["auc"] - 0.5) < 0.05
