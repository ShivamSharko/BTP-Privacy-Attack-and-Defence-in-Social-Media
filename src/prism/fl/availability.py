"""Who is online to train: availability scenarios and per-group summaries.

On a phone, a training round can only include devices that are charging, idle and
online. This module builds one availability probability per user: a user joins a
round with probability ``sample_rate * availability``. The scenarios are synthetic;
they are not device traces.

Privacy caveat. In the "activity" and "social" scenarios a user's availability is a RANK over
all users. Adding or removing one user therefore shifts the ranks, and so the inclusion
probabilities, of other users as well, which the add-or-remove analysis behind a reported
epsilon does not allow for. The epsilon of a run with these scenarios is nominal for everyone.
"""

from __future__ import annotations

from typing import Literal, get_args

import numpy as np
import numpy.typing as npt
from scipy import stats

Scenario = Literal["always", "independent", "activity", "social"]
SCENARIOS: tuple[str, ...] = get_args(Scenario)
LOW_DEGREE_MAX = 5


def _rank_fraction(values: npt.NDArray[np.integer]) -> npt.NDArray[np.float64]:
    """Rank (ties averaged) mapped linearly onto [0, 1]; the mean is exactly 0.5."""
    n = values.size
    if n <= 1:
        return np.full(n, 0.5)
    ranks = np.asarray(stats.rankdata(values, method="average"), dtype=np.float64)
    return (ranks - 1.0) / (n - 1.0)


def availability_vector(
    scenario: Scenario,
    activity: npt.NDArray[np.integer],
    degree: npt.NDArray[np.integer],
    rng: np.random.Generator,
    mean: float = 0.5,
    floor: float = 0.05,
) -> npt.NDArray[np.float64]:
    """One availability probability per user, in [floor, 1] (exactly 1 for "always").

    The two correlated scenarios map the user's rank (ties averaged) linearly onto
    ``[floor, 2 * mean - floor]``, so the population mean is ``mean`` and the vector
    never exceeds 1. ``rng`` is reserved for future trace-based scenarios.
    """
    del rng
    n = activity.size
    if degree.size != n:
        raise ValueError("activity and degree must have one entry per user")
    if scenario == "always":
        return np.ones(n, dtype=np.float64)
    if scenario not in SCENARIOS:
        raise ValueError(f"unknown scenario: {scenario}")
    if not floor <= mean <= 1.0:
        raise ValueError("mean must lie in [floor, 1]")
    if scenario == "independent":
        return np.full(n, mean, dtype=np.float64)
    high = 2.0 * mean - floor
    if high > 1.0:
        raise ValueError("2 * mean - floor must not exceed 1")
    driver = activity if scenario == "activity" else degree
    return np.asarray(floor + (high - floor) * _rank_fraction(driver), dtype=np.float64)


def groups_by_activity(activity: npt.NDArray[np.integer]) -> npt.NDArray[np.int64]:
    """0 = least active third, 2 = most active third (by rank; ties split by position)."""
    n = activity.size
    order = np.argsort(activity, kind="stable")
    groups = np.empty(n, dtype=np.int64)
    groups[order] = (3 * np.arange(n)) // max(n, 1)
    return groups


def groups_by_degree(degree: npt.NDArray[np.integer]) -> npt.NDArray[np.int64]:
    """0 = no friends, 1 = one to five friends, 2 = more than five."""
    return np.where(degree == 0, 0, np.where(degree <= LOW_DEGREE_MAX, 1, 2)).astype(np.int64)


def group_means(
    per_user: npt.NDArray[np.float64], groups: npt.NDArray[np.int64], n_groups: int = 3
) -> list[float]:
    """Mean per group, ignoring NaN; a group with no finite value gives NaN."""
    means: list[float] = []
    for group in range(n_groups):
        values = per_user[(groups == group) & ~np.isnan(per_user)]
        means.append(float(values.mean()) if values.size else float("nan"))
    return means


def group_gap(
    per_user: npt.NDArray[np.float64],
    groups: npt.NDArray[np.int64],
    seed: int = 0,
    draws: int = 1000,
) -> dict[str, float]:
    """Mean of group 2 minus mean of group 0, with a percentile bootstrap over users."""
    top = per_user[(groups == 2) & ~np.isnan(per_user)]
    bottom = per_user[(groups == 0) & ~np.isnan(per_user)]
    nan = float("nan")
    if top.size == 0 or bottom.size == 0:
        return {"gap": nan, "low": nan, "high": nan}
    rng = np.random.default_rng(seed)
    top_means = top[rng.integers(0, top.size, size=(draws, top.size))].mean(axis=1)
    bottom_means = bottom[rng.integers(0, bottom.size, size=(draws, bottom.size))].mean(axis=1)
    gaps = top_means - bottom_means
    return {
        "gap": float(top.mean() - bottom.mean()),
        "low": float(np.percentile(gaps, 2.5)),
        "high": float(np.percentile(gaps, 97.5)),
    }


TRACE_FLOOR = 0.05


def trace_static(
    shares: npt.NDArray[np.float64],
    devices: npt.NDArray[np.int64],
    floor: float = TRACE_FLOOR,
) -> npt.NDArray[np.float64]:
    """Per-user availability probability: the user's device active share, floored."""
    return np.maximum(np.asarray(shares, dtype=np.float64)[devices], floor)


def match_devices_by_rank(
    shares: npt.NDArray[np.float64],
    key: npt.NDArray[np.integer],
    rng: np.random.Generator,
) -> npt.NDArray[np.int64]:
    """Index into ``shares`` for each user so that larger ``key`` gets a larger share.

    ``shares`` holds one active share per sampled device and ``key`` one value per user (same
    length); the result is a permutation, so each device is used once. Ties in ``key`` (and in
    ``shares``) are broken at random. Like the rank-based scenarios this is a rank over all
    users, so epsilon is nominal.
    """
    n = shares.size
    if key.size != n:
        raise ValueError("shares and key must have one entry per user")
    user_order = np.lexsort((rng.random(n), key))
    device_order = np.lexsort((rng.random(n), shares))
    assignment = np.empty(n, dtype=np.int64)
    assignment[user_order] = device_order
    return assignment
