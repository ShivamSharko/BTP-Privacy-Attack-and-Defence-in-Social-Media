"""Availability scenarios and group statistics for the participation experiment."""

from __future__ import annotations

import itertools

import numpy as np
import pytest

from prism.fl.availability import (
    availability_vector,
    group_gap,
    group_means,
    groups_by_activity,
    groups_by_degree,
)

RNG = np.random.default_rng(0)


def _activity(n: int = 300) -> np.ndarray:
    return np.random.default_rng(1).integers(1, 60, size=n).astype(np.int64)


def _degree(n: int = 300) -> np.ndarray:
    degree = np.random.default_rng(2).integers(0, 12, size=n).astype(np.int64)
    degree[: n // 2] = 0  # heavy ties at zero friends
    return degree


def test_always_is_exactly_one() -> None:
    vector = availability_vector("always", _activity(), _degree(), RNG)
    assert vector.dtype == np.float64
    assert np.all(vector == 1.0)


def test_independent_is_constant_mean() -> None:
    vector = availability_vector("independent", _activity(), _degree(), RNG, mean=0.4)
    assert np.all(vector == 0.4)


@pytest.mark.parametrize("scenario", ["independent", "activity", "social"])
@pytest.mark.parametrize("mean", [0.3, 0.5])
def test_range_and_mean(scenario: str, mean: float) -> None:
    vector = availability_vector(scenario, _activity(), _degree(), RNG, mean=mean)  # type: ignore[arg-type]
    assert vector.min() >= 0.05 - 1e-12
    assert vector.max() <= 1.0
    assert abs(vector.mean() - mean) < 0.01


def test_activity_is_monotone_in_history_length() -> None:
    activity = _activity()
    vector = availability_vector("activity", activity, _degree(), RNG)
    order = np.argsort(activity, kind="stable")
    assert np.all(np.diff(vector[order]) >= -1e-12)
    assert vector[order[-1]] > vector[order[0]]
    # equal history lengths get equal availability
    for value in np.unique(activity)[:5]:
        assert np.ptp(vector[activity == value]) < 1e-12


def test_social_is_monotone_in_degree_with_heavy_ties() -> None:
    degree = _degree()
    vector = availability_vector("social", _activity(), degree, RNG)
    order = np.argsort(degree, kind="stable")
    assert np.all(np.diff(vector[order]) >= -1e-12)
    assert np.ptp(vector[degree == 0]) < 1e-12
    assert vector[degree == degree.max()].min() > vector[degree == 0].max()


def test_all_equal_values_give_the_mean() -> None:
    flat = np.full(50, 3, dtype=np.int64)
    vector = availability_vector("activity", flat, flat, RNG)
    assert np.allclose(vector, 0.5)


def test_unknown_scenario_and_bad_mean_rejected() -> None:
    with pytest.raises(ValueError):
        availability_vector("trace", _activity(), _degree(), RNG)  # type: ignore[arg-type]
    with pytest.raises(ValueError):
        availability_vector("activity", _activity(), _degree(), RNG, mean=0.9)


def test_groups_by_activity_are_rank_terciles() -> None:
    activity = np.arange(30, dtype=np.int64)[::-1].copy()
    groups = groups_by_activity(activity)
    assert groups.dtype == np.int64
    assert np.bincount(groups).tolist() == [10, 10, 10]
    assert set(groups[activity < 10]) == {0}
    assert set(groups[activity >= 20]) == {2}


def test_groups_by_degree_bands() -> None:
    degree = np.array([0, 1, 5, 6, 40, 0], dtype=np.int64)
    assert groups_by_degree(degree).tolist() == [0, 1, 1, 2, 2, 0]


def test_group_means_handles_nan_and_empty_groups() -> None:
    values = np.array([1.0, 3.0, np.nan, 5.0, 7.0])
    groups = np.array([0, 0, 0, 2, 2], dtype=np.int64)
    means = group_means(values, groups)
    assert means[0] == 2.0 and means[2] == 6.0
    assert np.isnan(means[1])
    all_nan = group_means(np.array([np.nan]), np.array([1], dtype=np.int64))
    assert np.isnan(all_nan).all()


def test_group_gap_sign_and_interval() -> None:
    rng = np.random.default_rng(3)
    groups = np.repeat(np.arange(3), 100).astype(np.int64)
    values = rng.normal(0.2, 0.05, size=300) + 0.1 * groups
    gap = group_gap(values, groups, seed=1)
    assert 0.15 < gap["gap"] < 0.25
    assert gap["low"] <= gap["gap"] <= gap["high"]
    reverse = group_gap(values - 0.2 * groups, groups)
    assert reverse["gap"] < 0
    assert group_gap(values, groups, seed=1) == gap


def test_group_gap_with_empty_group_is_nan() -> None:
    gap = group_gap(np.array([1.0, 2.0]), np.array([0, 0], dtype=np.int64))
    assert all(np.isnan(v) for v in gap.values())


def test_trace_static_uses_device_share_with_floor() -> None:
    from prism.fl.availability import trace_static

    shares = np.array([0.0, 0.02, 0.4, 1.0])
    devices = np.array([3, 0, 2, 1, 2], dtype=np.int64)
    out = trace_static(shares, devices)
    assert out.dtype == np.float64
    assert out.tolist() == [1.0, 0.05, 0.4, 0.05, 0.4]


def test_match_devices_by_rank_is_monotone_and_a_permutation() -> None:
    from prism.fl.availability import match_devices_by_rank

    rng = np.random.default_rng(5)
    shares = rng.random(200)
    key = rng.integers(0, 30, size=200)
    perm = match_devices_by_rank(shares, key, np.random.default_rng(6))
    assert perm.dtype == np.int64
    assert sorted(perm.tolist()) == list(range(200))  # each device exactly once
    assigned = shares[perm]
    values = np.unique(key)
    for low, high in itertools.pairwise(values):
        # a larger key never gets a smaller share than a smaller key
        assert assigned[key == high].min() >= assigned[key == low].max() - 1e-12


def test_match_devices_by_rank_breaks_ties_at_random() -> None:
    from prism.fl.availability import match_devices_by_rank

    shares = np.linspace(0.1, 0.9, 40)
    key = np.zeros(40, dtype=np.int64)
    a = match_devices_by_rank(shares, key, np.random.default_rng(1))
    b = match_devices_by_rank(shares, key, np.random.default_rng(2))
    assert not np.array_equal(a, b)
    assert np.array_equal(a, match_devices_by_rank(shares, key, np.random.default_rng(1)))
    with pytest.raises(ValueError):
        match_devices_by_rank(shares, key[:10], np.random.default_rng(1))
