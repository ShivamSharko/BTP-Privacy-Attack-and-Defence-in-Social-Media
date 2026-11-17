"""Cached noise calibration.

Calibrating a noise multiplier takes tens of seconds, so results are cached in a
JSON file. The cache is filled by the parent process before any worker starts,
which avoids several workers writing it at once.
"""

from __future__ import annotations

from pathlib import Path

from prism.io import atomic_write_json, read_json
from prism.privacy.accounting import calibrate_noise

CACHE_VERSION: str = "v1-max-prv-pld"


def _key(sample_rate: float, rounds: int, n_users: int, target_epsilon: float) -> str:
    return f"{CACHE_VERSION}|q={sample_rate!r}|T={rounds}|n={n_users}|eps={target_epsilon!r}"


def noise_for(
    sample_rate: float, rounds: int, n_users: int, target_epsilon: float, cache: Path
) -> float:
    """Noise multiplier for a target epsilon, computed once and cached."""
    key = _key(sample_rate, rounds, n_users, target_epsilon)
    stored: dict[str, float] = read_json(cache) if cache.exists() else {}
    if key not in stored:
        stored[key] = calibrate_noise(sample_rate, rounds, n_users, target_epsilon)
        atomic_write_json(cache, stored)
    return float(stored[key])
