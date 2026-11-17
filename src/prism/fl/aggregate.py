"""Server-side aggregation: per-user clipping, robust totals, and the Gaussian mechanism.

User-level differential privacy rests on three lines of this file:

1. ``clip_rows`` bounds every client's whole update to L2 norm C, so adding or
   removing one user changes the sum by at most C.
2. ``noisy_mean`` adds Gaussian noise of standard deviation z * C to the sum,
   exactly once per round.
3. ``noisy_mean`` divides by the expected cohort size, a public constant, never
   by the realised size, which would leak who took part.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

import numpy as np
import torch

AggregatorName = Literal["sum", "trimmed_mean", "median"]


@dataclass(frozen=True)
class ClipResult:
    """Clipped updates, their norms before clipping, and how many rows were not finite."""

    clipped: torch.Tensor
    norms: torch.Tensor
    nonfinite: int


def clip_rows(deltas: torch.Tensor, clip_norm: float | None) -> ClipResult:
    """Clip each row to ``clip_norm``. Rows containing NaN or infinity are replaced by zeros."""
    finite = torch.isfinite(deltas).all(dim=1)
    safe = torch.where(finite.unsqueeze(1), deltas, torch.zeros_like(deltas))
    norms = safe.norm(dim=1)
    if clip_norm is None:
        clipped = safe
    else:
        scale = torch.clamp(clip_norm / norms.clamp(min=1e-12), max=1.0)
        clipped = safe * scale.unsqueeze(1)
    return ClipResult(clipped, norms, int((~finite).sum()))


def robust_total(deltas: torch.Tensor, kind: AggregatorName, trim_fraction: float) -> torch.Tensor:
    """Sum-equivalent aggregate of a whole cohort: K times the (robust) per-coordinate mean."""
    count = deltas.shape[0]
    if kind == "sum":
        return deltas.sum(dim=0).to(torch.float64)
    if kind == "median":
        return (deltas.median(dim=0).values * count).to(torch.float64)
    if kind == "trimmed_mean":
        if not 0.0 <= trim_fraction < 0.5:
            raise ValueError("trim_fraction must be in [0, 0.5)")
        cut = int(np.floor(trim_fraction * count))
        ordered = deltas.sort(dim=0).values
        kept = ordered[cut : count - cut] if cut > 0 else ordered
        return (kept.mean(dim=0) * count).to(torch.float64)
    raise ValueError(f"unknown aggregator: {kind}")


def noisy_mean(
    total: torch.Tensor,
    expected: float,
    noise_multiplier: float,
    clip_norm: float | None,
    rng: np.random.Generator,
) -> torch.Tensor:
    """Add N(0, (z*C)^2) noise once to the summed updates and divide by the expected cohort."""
    if noise_multiplier > 0.0:
        if clip_norm is None:
            raise ValueError("differential privacy noise requires a clipping norm")
        noise = rng.normal(0.0, noise_multiplier * clip_norm, size=total.shape[0])
        total = total + torch.from_numpy(noise)
    return total / max(expected, 1.0)
