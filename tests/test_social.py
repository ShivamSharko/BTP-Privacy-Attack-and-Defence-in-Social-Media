"""Tests for the social graph object."""

from __future__ import annotations

import gzip
import json
from pathlib import Path

import numpy as np
import pytest
from scipy import sparse

from prism.data.social import (
    FRIENDS_FILE,
    SocialGraph,
    build_friend_graph,
    graph_from_edges,
    graph_summary,
    load_friend_graph,
    save_friend_graph,
)


def _graph() -> SocialGraph:
    edges = np.array([[0, 1], [1, 2], [2, 0], [3, 4]], dtype=np.int64)
    return graph_from_edges(edges, 6)


def test_graph_from_edges_symmetrises_and_cleans() -> None:
    edges = np.array([[0, 1], [1, 0], [0, 1], [2, 2], [2, 3]], dtype=np.int64)
    graph = graph_from_edges(edges, 5)
    dense = graph.adjacency.toarray()
    assert np.array_equal(dense, dense.T)
    assert np.all(np.diag(dense) == 0)
    assert graph.n_edges == 2 and graph.n_users == 5
    assert graph.adjacency.dtype == np.float32
    assert graph.adjacency.has_sorted_indices
    assert set(np.unique(dense)) <= {0.0, 1.0}


def test_graph_from_edges_validates() -> None:
    with pytest.raises(ValueError):
        graph_from_edges(np.array([[0, 5]], dtype=np.int64), 5)
    with pytest.raises(ValueError):
        graph_from_edges(np.array([[-1, 2]], dtype=np.int64), 5)
    assert graph_from_edges(np.zeros((0, 2), dtype=np.int64), 3).n_edges == 0


def test_degrees_and_neighbours() -> None:
    graph = _graph()
    assert graph.degrees().tolist() == [2, 2, 2, 1, 1, 0]
    assert graph.neighbours(0).tolist() == [1, 2]
    assert graph.neighbours(5).size == 0


def test_build_friend_graph(tmp_path: Path) -> None:
    csv = tmp_path / "users.csv.gz"
    lines = [
        "user_id,friends,review_count",
        'u1,"u2, u3, zz",5',
        "u2,u1,3",
        "u3,None,2",
        "u4,,1",
        'u5,"u1,u1,u5",4',
        "u6,u4,2",
    ]
    with gzip.open(csv, "wt", encoding="utf-8") as handle:
        handle.write("\n".join(lines) + "\n")
    index = tmp_path / "index.json"
    index.write_text(json.dumps({"u1": 0, "u2": 1, "u3": 2, "u4": 3, "u5": 4}))
    graph = build_friend_graph(csv, index)
    assert graph.n_users == 5
    # u1-u2 (both directions), u1-u3 (one direction), u1-u5 (one direction); u6 is unknown
    assert graph.n_edges == 3
    assert graph.neighbours(0).tolist() == [1, 2, 4]
    assert graph.neighbours(3).size == 0


def test_save_load_round_trip(tmp_path: Path) -> None:
    graph = _graph()
    path = save_friend_graph(graph, tmp_path)
    assert path == tmp_path / FRIENDS_FILE and path.exists()
    loaded = load_friend_graph(tmp_path)
    assert (loaded.adjacency != graph.adjacency).nnz == 0


def test_load_validation(tmp_path: Path) -> None:
    with pytest.raises(FileNotFoundError):
        load_friend_graph(tmp_path)
    asym = sparse.csr_matrix(np.array([[0, 1], [0, 0]], dtype=np.float32))
    sparse.save_npz(tmp_path / FRIENDS_FILE, asym)
    with pytest.raises(ValueError):
        load_friend_graph(tmp_path)
    diag = sparse.csr_matrix(np.array([[1, 0], [0, 0]], dtype=np.float32))
    sparse.save_npz(tmp_path / FRIENDS_FILE, diag)
    with pytest.raises(ValueError):
        load_friend_graph(tmp_path)


def test_graph_summary() -> None:
    summary = graph_summary(_graph())
    assert summary["users"] == 6 and summary["edges"] == 4
    assert summary["users_with_friends"] == 5
    assert summary["isolated_share"] == pytest.approx(1 / 6)
    assert summary["mean_degree"] == pytest.approx(8 / 6)
    assert summary["max_degree"] == 2
    assert summary["median_degree"] == 1.5


def _ring(n: int, extra: int) -> SocialGraph:
    pairs = [(i, (i + 1) % n) for i in range(n)]
    pairs += [(0, 2 + j) for j in range(extra)]
    return graph_from_edges(np.array(pairs, dtype=np.int64), n)


def test_peer_table_properties() -> None:
    graph = _ring(30, 6)  # user 0 has 8 friends, the others 2 or 3
    peers, is_friend = graph.peer_table(4, np.random.default_rng(0))
    assert peers.shape == (30, 4) and is_friend.shape == (30, 4)
    for user in range(30):
        row = peers[user]
        assert user not in row.tolist()
        assert len(set(row.tolist())) == 4
        friends = set(graph.neighbours(user).tolist())
        assert [int(p) in friends for p in row] == is_friend[user].tolist()
        assert is_friend[user].sum() == min(4, len(friends))
    assert is_friend[0].all()  # more friends than slots


def test_peer_table_deterministic_and_errors() -> None:
    graph = _ring(30, 0)
    a = graph.peer_table(5, np.random.default_rng(3))
    b = graph.peer_table(5, np.random.default_rng(3))
    assert np.array_equal(a[0], b[0]) and np.array_equal(a[1], b[1])
    with pytest.raises(ValueError):
        graph.peer_table(30, np.random.default_rng(0))


def test_sample_pairs_properties() -> None:
    n = 60
    edges = np.random.default_rng(1).integers(0, n, size=(150, 2)).astype(np.int64)
    graph = graph_from_edges(edges, n)
    users = np.arange(0, n, 2, dtype=np.int64)
    pos, neg = graph.sample_pairs(users, np.random.default_rng(5))
    assert pos.shape == neg.shape and pos.shape[1] == 2 and pos.shape[0] > 0
    dense = graph.adjacency.toarray()
    allowed = set(users.tolist())
    for u, v in pos:
        assert u < v and dense[u, v] == 1 and u in allowed and v in allowed
    for u, v in neg:
        assert u < v and dense[u, v] == 0 and u in allowed and v in allowed
    assert len({tuple(p) for p in pos.tolist()}) == pos.shape[0]
    assert len({tuple(p) for p in neg.tolist()}) == neg.shape[0]
    again = graph.sample_pairs(users, np.random.default_rng(5))
    assert np.array_equal(pos, again[0]) and np.array_equal(neg, again[1])
    capped_pos, capped_neg = graph.sample_pairs(users, np.random.default_rng(5), max_pairs=3)
    assert capped_pos.shape[0] == 3 and capped_neg.shape[0] == 3


def test_sample_pairs_empty() -> None:
    graph = graph_from_edges(np.array([[0, 1]], dtype=np.int64), 5)
    pos, neg = graph.sample_pairs(np.array([2, 3, 4], dtype=np.int64), np.random.default_rng(0))
    assert pos.shape == (0, 2) and neg.shape == (0, 2)
