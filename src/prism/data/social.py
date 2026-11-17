"""The friend network as a first-class object: graph, peer sampling and pair sampling."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import numpy.typing as npt
import pandas as pd  # type: ignore[import-untyped]
from scipy import sparse

FRIENDS_FILE = "friends.npz"


def _clean(matrix: sparse.csr_matrix) -> sparse.csr_matrix:
    matrix = matrix.astype(np.float32).tocsr()
    matrix.sum_duplicates()
    matrix.sort_indices()
    return matrix


@dataclass(frozen=True, eq=False)
class SocialGraph:
    """Undirected friend graph as a symmetric 0/1 CSR matrix with a zero diagonal."""

    adjacency: sparse.csr_matrix

    @property
    def n_users(self) -> int:
        """Number of users (rows of the adjacency matrix)."""
        return int(self.adjacency.shape[0])

    @property
    def n_edges(self) -> int:
        """Number of undirected edges."""
        return int(self.adjacency.nnz // 2)

    def degrees(self) -> npt.NDArray[np.int64]:
        """Friend count per user."""
        return np.asarray(np.diff(self.adjacency.indptr), dtype=np.int64)

    def neighbours(self, user: int) -> npt.NDArray[np.int64]:
        """Sorted friend ids of one user."""
        start, stop = self.adjacency.indptr[user], self.adjacency.indptr[user + 1]
        return np.asarray(self.adjacency.indices[start:stop], dtype=np.int64)

    def peer_table(
        self, degree: int, rng: np.random.Generator
    ) -> tuple[npt.NDArray[np.int64], npt.NDArray[np.bool_]]:
        """Per-user peers for decentralised training plus a mask marking real friends."""
        n = self.n_users
        if n <= degree:
            raise ValueError("peer_table needs n_users > degree")
        peers = np.zeros((n, degree), dtype=np.int64)
        is_friend = np.zeros((n, degree), dtype=np.bool_)
        everyone = np.arange(n, dtype=np.int64)
        for user in range(n):
            friends = self.neighbours(user)
            if friends.size >= degree:
                peers[user] = rng.choice(friends, size=degree, replace=False)
                is_friend[user] = True
                continue
            keep = np.ones(n, dtype=np.bool_)
            keep[user] = False
            keep[friends] = False
            fill = rng.choice(everyone[keep], size=degree - friends.size, replace=False)
            peers[user] = np.concatenate([friends, fill])
            is_friend[user, : friends.size] = True
        return peers, is_friend

    def sample_pairs(
        self,
        users: npt.NDArray[np.int64],
        rng: np.random.Generator,
        max_pairs: int = 100_000,
    ) -> tuple[npt.NDArray[np.int64], npt.NDArray[np.int64]]:
        """Balanced friend and non-friend pairs (u < v) drawn only among `users`."""
        ids = np.unique(users).astype(np.int64)
        k = int(ids.size)
        adjacency = self.adjacency[ids][:, ids].tocsr()
        upper = sparse.triu(adjacency, k=1).tocoo()
        n_pos = int(upper.nnz)
        m = min(max_pairs, n_pos, k * (k - 1) // 2 - n_pos)
        if m <= 0:
            empty = np.zeros((0, 2), dtype=np.int64)
            return empty, empty.copy()
        order = np.lexsort((upper.col, upper.row))
        local = np.stack([upper.row[order], upper.col[order]], axis=1).astype(np.int64)
        pos = local[rng.choice(n_pos, size=m, replace=False)]
        taken: set[int] = set()
        found: list[tuple[int, int]] = []
        while len(found) < m:
            draw = rng.integers(0, k, size=(2 * (m - len(found)) + 16, 2))
            lo = draw.min(axis=1)
            hi = draw.max(axis=1)
            distinct = lo != hi
            lo, hi = lo[distinct], hi[distinct]
            free = np.asarray(adjacency[lo, hi]).ravel() == 0
            for a, b in zip(lo[free], hi[free], strict=True):
                key = int(a) * k + int(b)
                if key not in taken and len(found) < m:
                    taken.add(key)
                    found.append((int(a), int(b)))
        neg = np.array(found, dtype=np.int64)
        return ids[pos], ids[neg]


def graph_from_edges(edges: npt.NDArray[np.int64], n_users: int) -> SocialGraph:
    """Build a symmetric simple graph from (k, 2) pairs; out-of-range ids raise ValueError."""
    edges = np.asarray(edges, dtype=np.int64).reshape(-1, 2)
    if edges.size and (edges.min() < 0 or edges.max() >= n_users):
        raise ValueError("edge endpoint out of range")
    edges = edges[edges[:, 0] != edges[:, 1]]
    rows = np.concatenate([edges[:, 0], edges[:, 1]])
    cols = np.concatenate([edges[:, 1], edges[:, 0]])
    matrix = sparse.csr_matrix(
        (np.ones(rows.size, dtype=np.float32), (rows, cols)), shape=(n_users, n_users)
    )
    matrix.data[:] = 1.0
    return SocialGraph(_clean(matrix))


def build_friend_graph(users_csv: Path, user_index_json: Path) -> SocialGraph:
    """Friend graph over indexed users; edges with an unknown endpoint are dropped."""
    index: dict[str, int] = json.loads(Path(user_index_json).read_text(encoding="utf-8"))
    frame = pd.read_csv(users_csv, usecols=["user_id", "friends"], dtype=str, keep_default_na=False)
    pairs: list[tuple[int, int]] = []
    for user_id, raw in zip(frame["user_id"], frame["friends"], strict=True):
        source = index.get(user_id)
        if source is None:
            continue
        for token in raw.split(","):
            name = token.strip()
            if not name or name.lower() == "none":
                continue
            target = index.get(name)
            if target is not None:
                pairs.append((int(source), int(target)))
    edges = np.array(pairs, dtype=np.int64).reshape(-1, 2)
    return graph_from_edges(edges, max(index.values()) + 1 if index else 0)


def save_friend_graph(graph: SocialGraph, processed: Path) -> Path:
    """Write the adjacency matrix to processed/friends.npz."""
    processed.mkdir(parents=True, exist_ok=True)
    path = processed / FRIENDS_FILE
    sparse.save_npz(path, graph.adjacency)
    return path


def load_friend_graph(processed: Path) -> SocialGraph:
    """Read and validate the saved friend graph."""
    path = processed / FRIENDS_FILE
    if not path.exists():
        raise FileNotFoundError(path)
    matrix = _clean(sparse.load_npz(path).tocsr())
    if matrix.shape[0] != matrix.shape[1]:
        raise ValueError("friend matrix is not square")
    if (matrix != matrix.T).nnz:
        raise ValueError("friend matrix is not symmetric")
    if np.any(matrix.diagonal() != 0):
        raise ValueError("friend matrix has self-loops")
    return SocialGraph(matrix)


def graph_summary(graph: SocialGraph) -> dict[str, float]:
    """Aggregate statistics only."""
    degree = graph.degrees()
    n = max(graph.n_users, 1)
    return {
        "users": float(graph.n_users),
        "edges": float(graph.n_edges),
        "users_with_friends": float((degree > 0).sum()),
        "isolated_share": float((degree == 0).sum() / n),
        "mean_degree": float(degree.mean()) if degree.size else 0.0,
        "median_degree": float(np.median(degree)) if degree.size else 0.0,
        "max_degree": float(degree.max()) if degree.size else 0.0,
    }
