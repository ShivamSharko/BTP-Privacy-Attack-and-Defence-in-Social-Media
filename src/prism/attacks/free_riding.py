"""Free-riding clients: take part in rounds, contribute nothing, reveal nothing.

A free-rider wants the trained recommender without paying the cost of computing a useful
update. Two simple behaviours, both applied before clipping:

  zero   sends an all-zero update.
  noise  sends Gaussian noise rescaled to the mean L2 norm of the honest updates in the same
         chunk, so that its norm does not give it away.

Detection scores are what a server that sees individual updates (no secure aggregation) could
compute for every client-round: the update norm and the cosine similarity to the mean of the
other updates in the same chunk. Scores are collected without user identifiers.
"""

from __future__ import annotations

from typing import Any

import numpy as np
import numpy.typing as npt
import torch

from prism.attacks.membership import auc_score
from prism.attacks.poisoning import choose_malicious
from prism.fl.server import ClientHook
from prism.seeding import stream

BEHAVIOURS: tuple[str, ...] = ("zero", "noise")


def choose_free_riders(
    n_users: int, fraction: float, rng: np.random.Generator
) -> npt.NDArray[np.int64]:
    """Sorted unique free-rider accounts: a prefix of one permutation, so sets nest."""
    return choose_malicious(n_users, fraction, rng)


def detection_scores(
    deltas: torch.Tensor, clip_norm: float | None
) -> tuple[npt.NDArray[np.float64], npt.NDArray[np.float64]]:
    """Per-row update norm and cosine to the mean of the other rows, as the server receives them.

    Rows are first scaled to ``clip_norm`` when they exceed it (clients clip before sending).
    A zero row, or a chunk of one row, has cosine 0.
    """
    rows = torch.nan_to_num(deltas.to(torch.float64), nan=0.0, posinf=0.0, neginf=0.0)
    norms = rows.norm(dim=1)
    if clip_norm is not None:
        scale = torch.where(
            norms > clip_norm, clip_norm / norms.clamp(min=1e-30), torch.ones_like(norms)
        )
        rows = rows * scale.unsqueeze(1)
        norms = rows.norm(dim=1)
    count = rows.shape[0]
    if count < 2:
        return norms.numpy().copy(), np.zeros(count, dtype=np.float64)
    others = (rows.sum(dim=0, keepdim=True) - rows) / (count - 1)
    denominator = norms * others.norm(dim=1)
    dots = (rows * others).sum(dim=1)
    cosines = torch.where(
        denominator > 0, dots / denominator.clamp(min=1e-300), torch.zeros_like(dots)
    )
    return norms.numpy().copy(), cosines.numpy().copy()


class DetectionCollector:
    """Accumulates detection scores and the free-rider label (never user ids) from one round on."""

    def __init__(self, from_round: int) -> None:
        self.from_round = from_round
        self._norms: list[npt.NDArray[np.float64]] = []
        self._cosines: list[npt.NDArray[np.float64]] = []
        self._riders: list[npt.NDArray[np.bool_]] = []

    def add(
        self,
        norms: npt.NDArray[np.float64],
        cosines: npt.NDArray[np.float64],
        riders: npt.NDArray[np.bool_],
    ) -> None:
        self._norms.append(norms)
        self._cosines.append(cosines)
        self._riders.append(riders)

    def arrays(
        self,
    ) -> tuple[npt.NDArray[np.float64], npt.NDArray[np.float64], npt.NDArray[np.bool_]]:
        if not self._norms:
            return (
                np.zeros(0, dtype=np.float64),
                np.zeros(0, dtype=np.float64),
                np.zeros(0, dtype=bool),
            )
        return (
            np.concatenate(self._norms),
            np.concatenate(self._cosines),
            np.concatenate(self._riders),
        )


def detection_aucs(
    norms: npt.NDArray[np.float64],
    cosines: npt.NDArray[np.float64],
    riders: npt.NDArray[np.bool_],
) -> dict[str, Any]:
    """AUC of separating free-riders from contributors; low norm and low cosine are suspicious.

    Values are None when there is nobody (or only free-riders) to compare.
    """
    positives = int(riders.sum())
    negatives = int(riders.size - positives)
    result: dict[str, Any] = {
        "norm_auc": None,
        "cosine_auc": None,
        "n_free_rider_rows": positives,
        "n_rows": int(riders.size),
    }
    if positives and negatives:
        result["norm_auc"] = auc_score(-norms[riders], -norms[~riders])
        result["cosine_auc"] = auc_score(-cosines[riders], -cosines[~riders])
    return result


def make_free_rider_hook(
    free_riders: npt.NDArray[np.int64],
    behaviour: str,
    seed: int,
    *,
    clip_norm: float | None = None,
    collector: DetectionCollector | None = None,
) -> ClientHook:
    """Hook that replaces the free-riders' rows; with a collector it also records scores.

    The noise generator is derived from (seed, round, call within the round), so a run is
    reproducible and two chunks of one round do not receive identical noise.
    """
    if behaviour not in BEHAVIOURS:
        raise ValueError(f"unknown free-riding behaviour {behaviour!r}")
    riders = np.asarray(free_riders, dtype=np.int64)
    calls: dict[int, int] = {}

    def hook(
        users: npt.NDArray[np.int64], deltas: torch.Tensor, flat: torch.Tensor, round_index: int
    ) -> torch.Tensor:
        mask = np.isin(users, riders)
        call = calls.get(round_index, 0)
        calls[round_index] = call + 1
        out = deltas
        if mask.any():
            rows = torch.from_numpy(mask)
            out = deltas.clone()
            if behaviour == "zero":
                out[rows] = 0.0
            else:
                reference = deltas[~rows] if (~mask).any() else deltas
                target = float(
                    torch.nan_to_num(reference.to(torch.float64), nan=0.0).norm(dim=1).mean()
                )
                rng = stream(seed, f"free-rider-noise-r{round_index}-c{call}")
                noise = torch.from_numpy(rng.standard_normal((int(mask.sum()), deltas.shape[1])))
                noise = noise / noise.norm(dim=1, keepdim=True).clamp(min=1e-30) * target
                out[rows] = noise.to(out.dtype)
        if collector is not None and round_index >= collector.from_round:
            norms, cosines = detection_scores(out, clip_norm)
            collector.add(norms, cosines, mask.copy())
        return out

    return hook
