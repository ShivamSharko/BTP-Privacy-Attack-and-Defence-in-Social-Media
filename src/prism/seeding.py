"""Independent, named random streams derived from one run seed.

Cohort sampling, history masking, DP noise and attack randomness each get their
own stream, so changing how one is consumed never shifts another. A stream is a
function of (seed, name) only, not of which other streams were requested.
"""

from __future__ import annotations

import zlib
from collections.abc import Sequence
from typing import Final

import numpy as np
import torch

STREAM_NAMES: Final[tuple[str, ...]] = ("init", "sampling", "masking", "noise", "attack")


def stream(seed: int, name: str) -> np.random.Generator:
    """Return the generator for one named stream of a run seed."""
    if seed < 0:
        raise ValueError("seed must be non-negative")
    key = zlib.crc32(name.encode("utf-8"))
    return np.random.default_rng(np.random.SeedSequence(entropy=seed, spawn_key=(key,)))


def streams(seed: int, names: Sequence[str] = STREAM_NAMES) -> dict[str, np.random.Generator]:
    """Return one independent generator per name."""
    return {name: stream(seed, name) for name in names}


def torch_generator(rng: np.random.Generator) -> torch.Generator:
    """Seed a torch generator from a NumPy stream (consumes one draw)."""
    generator = torch.Generator()
    generator.manual_seed(int(rng.integers(0, 2**62)))
    return generator
