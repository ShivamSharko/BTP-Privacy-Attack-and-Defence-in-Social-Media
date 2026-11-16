"""Tests for geographic filtering and bipartite k-core measurement."""

from __future__ import annotations

import numpy as np
from hypothesis import given
from hypothesis import strategies as st

from prism.data.filtering import (
    PHILADELPHIA_BOUNDS,
    in_bounds,
    interaction_histogram,
    iterative_kcore,
    surviving_edge_count,
)


def test_in_bounds_philadelphia() -> None:
    assert in_bounds(39.95, -75.16, PHILADELPHIA_BOUNDS) is True
    assert in_bounds(40.7, -74.0, PHILADELPHIA_BOUNDS) is False
    assert in_bounds(27.9, -82.4, PHILADELPHIA_BOUNDS) is False


def test_histogram_buckets() -> None:
    counts = np.array([1, 1, 2, 5, 12, 150, 0], dtype=np.int64)
    hist = interaction_histogram(counts)
    assert hist["1"] == 2
    assert hist["2"] == 1
    assert hist["5-9"] == 1
    assert hist["10-19"] == 1
    assert hist["100+"] == 1
    assert sum(hist.values()) == 6  # the zero is excluded


def test_kcore_known_small_graph() -> None:
    # users u0,u1 have 2 edges each; u2,u3 have 1. item i2 has 1 edge.
    users = np.array([0, 0, 1, 1, 2, 3], dtype=np.int64)
    items = np.array([0, 1, 0, 1, 0, 2], dtype=np.int64)
    active_u, active_i = iterative_kcore(users, items, 4, 3, 2)
    assert active_u.tolist() == [True, True, False, False]
    assert active_i.tolist() == [True, True, False]
    assert surviving_edge_count(users, items, active_u, active_i) == 4


def test_kcore_k1_keeps_everything() -> None:
    users = np.array([0, 1], dtype=np.int64)
    items = np.array([0, 1], dtype=np.int64)
    active_u, active_i = iterative_kcore(users, items, 2, 2, 1)
    assert active_u.all()
    assert active_i.all()


@st.composite
def bipartite_edges(draw: st.DrawFn) -> tuple[np.ndarray, np.ndarray]:
    pairs = draw(st.lists(st.tuples(st.integers(0, 5), st.integers(0, 5)), min_size=1, max_size=30))
    users = np.array([pair[0] for pair in pairs], dtype=np.int64)
    items = np.array([pair[1] for pair in pairs], dtype=np.int64)
    return users, items


@given(bipartite_edges())
def test_kcore_survivors_meet_threshold(edges: tuple[np.ndarray, np.ndarray]) -> None:
    users, items = edges
    active_u, active_i = iterative_kcore(users, items, 6, 6, 2)
    mask = active_u[users] & active_i[items]
    if mask.any():
        user_counts = np.bincount(users[mask], minlength=6)
        item_counts = np.bincount(items[mask], minlength=6)
        assert user_counts[active_u].min() >= 2
        assert item_counts[active_i].min() >= 2


@given(bipartite_edges())
def test_kcore_is_monotone_in_k(edges: tuple[np.ndarray, np.ndarray]) -> None:
    users, items = edges
    low_u, low_i = iterative_kcore(users, items, 6, 6, 2)
    high_u, high_i = iterative_kcore(users, items, 6, 6, 3)
    assert not (high_u & ~low_u).any()
    assert not (high_i & ~low_i).any()


def test_kcore_can_empty_out() -> None:
    users = np.array([0, 1], dtype=np.int64)
    items = np.array([0, 1], dtype=np.int64)
    active_u, active_i = iterative_kcore(users, items, 2, 2, 5)
    assert not active_u.any()
    assert not active_i.any()
    assert surviving_edge_count(users, items, active_u, active_i) == 0
