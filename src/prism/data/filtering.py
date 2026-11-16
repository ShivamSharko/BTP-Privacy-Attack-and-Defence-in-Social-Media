"""Geographic filtering and bipartite k-core measurement (ADR-031, roadmap section 10).

Pure functions only. No file IO here, so everything is unit-testable.
"""

from __future__ import annotations

from typing import Final

import numpy as np
import numpy.typing as npt

PHILADELPHIA_BOUNDS: Final[dict[str, float]] = {
    "lat_min": 39.8,
    "lat_max": 40.2,
    "lon_min": -75.3,
    "lon_max": -74.9,
}

K_VALUES: Final[tuple[int, ...]] = (5, 10, 15, 20)

HISTOGRAM_BUCKETS: Final[tuple[tuple[str, int, int | None], ...]] = (
    ("1", 1, 1),
    ("2", 2, 2),
    ("3", 3, 3),
    ("4", 4, 4),
    ("5-9", 5, 9),
    ("10-19", 10, 19),
    ("20-49", 20, 49),
    ("50-99", 50, 99),
    ("100+", 100, None),
)


def in_bounds(lat: float, lon: float, bounds: dict[str, float]) -> bool:
    """True if a coordinate falls inside the closed bounding box."""
    return (
        bounds["lat_min"] <= lat <= bounds["lat_max"]
        and bounds["lon_min"] <= lon <= bounds["lon_max"]
    )


def interaction_histogram(counts: npt.NDArray[np.int64]) -> dict[str, int]:
    """Bucket positive interaction counts into readable ranges."""
    result: dict[str, int] = {}
    positive = counts[counts > 0]
    for label, low, high in HISTOGRAM_BUCKETS:
        mask = positive >= low if high is None else (positive >= low) & (positive <= high)
        result[label] = int(mask.sum())
    return result


def iterative_kcore(
    user_codes: npt.NDArray[np.int64],
    item_codes: npt.NDArray[np.int64],
    n_users: int,
    n_items: int,
    k: int,
) -> tuple[npt.NDArray[np.bool_], npt.NDArray[np.bool_]]:
    """Iteratively prune users and items with fewer than k surviving interactions.

    Returns boolean survival masks over the original user and item index spaces.
    Pruning is repeated until stable, because removing items can push users below
    the threshold and vice versa.
    """
    active_users = np.ones(n_users, dtype=bool)
    active_items = np.ones(n_items, dtype=bool)
    if k <= 1:
        return active_users, active_items

    while True:
        edges = active_users[user_codes] & active_items[item_codes]
        user_counts = np.bincount(user_codes[edges], minlength=n_users)
        item_counts = np.bincount(item_codes[edges], minlength=n_items)
        new_users = active_users & (user_counts >= k)
        new_items = active_items & (item_counts >= k)
        if np.array_equal(new_users, active_users) and np.array_equal(new_items, active_items):
            return active_users, active_items
        active_users, active_items = new_users, new_items


def surviving_edge_count(
    user_codes: npt.NDArray[np.int64],
    item_codes: npt.NDArray[np.int64],
    active_users: npt.NDArray[np.bool_],
    active_items: npt.NDArray[np.bool_],
) -> int:
    """Number of interactions whose both endpoints survived."""
    return int((active_users[user_codes] & active_items[item_codes]).sum())
