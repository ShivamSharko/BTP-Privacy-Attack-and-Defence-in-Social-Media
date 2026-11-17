"""Targeted promotion by malicious accounts, and how far the target is recommended.

Threat: a fraction of accounts is controlled by one attacker who wants a single,
unpopular business to appear in everybody's top-10. Each attacker account replaces
its honest update by a crafted one that pushes the target up for its own history,
rescaled to the norm bound every update must satisfy. The attacker knows the
current global model and its own accounts' histories, nothing about other users.
"""

from __future__ import annotations

import numpy as np
import numpy.typing as npt
import torch

from prism.config import ModelConfig, Phase
from prism.data.bundle import DataBundle
from prism.fl.client import make_delta_fn
from prism.fl.server import ClientHook
from prism.models.hybrid import Layout, content_base, make_layout, score_matrix

TOP_K: int = 10
EXPOSURE_BATCH: int = 512


def choose_target_item(popularity: npt.NDArray[np.integer], rng: np.random.Generator) -> int:
    """An item drawn uniformly from the least popular third (ties broken by index)."""
    count = max(1, popularity.size // 3)
    order = np.argsort(popularity, kind="stable")
    return int(order[int(rng.integers(0, count))])


def choose_malicious(
    n_users: int, fraction: float, rng: np.random.Generator
) -> npt.NDArray[np.int64]:
    """Sorted unique attacker accounts: a prefix of a random permutation, so sets nest."""
    size = round(fraction * n_users)
    permutation = rng.permutation(n_users)
    return np.sort(permutation[:size]).astype(np.int64)


def make_promotion_hook(
    target_item: int,
    malicious: npt.NDArray[np.int64],
    clip_norm: float,
    bundle: DataBundle,
    phase: Phase,
    layout: Layout,
    base: torch.Tensor,
    model: ModelConfig,
) -> ClientHook:
    """Hook replacing attacker rows by the crafted promotion update, norm exactly ``clip_norm``.

    The crafted update is one honest-style local step (learning rate 1) on the loss
    "visible = the account's history, hidden = only the target item". The target is
    removed from the visible part: a visible item is masked out of the loss, which
    would leave nothing to push.
    """
    delta_fn = make_delta_fn(layout, base, model, 1, 1.0)
    attackers = np.asarray(malicious, dtype=np.int64)

    def hook(
        users: npt.NDArray[np.int64], deltas: torch.Tensor, flat: torch.Tensor, round_index: int
    ) -> torch.Tensor:
        rows = np.flatnonzero(np.isin(users, attackers))
        if rows.size == 0:
            return deltas
        visible = torch.from_numpy(bundle.history_matrix(phase, users[rows]))
        visible[:, target_item] = 0.0
        target = torch.zeros_like(visible)
        target[:, target_item] = 1.0
        crafted = delta_fn(flat, visible.unsqueeze(1), target.unsqueeze(1))
        crafted = torch.nan_to_num(crafted, nan=0.0, posinf=0.0, neginf=0.0)
        norms = crafted.norm(dim=1, keepdim=True)
        scale = torch.where(norms > 0, clip_norm / norms.clamp(min=1e-30), torch.zeros_like(norms))
        out = deltas.clone()
        out[torch.from_numpy(rows)] = (crafted * scale).to(out.dtype)
        return out

    return hook


def target_exposure(
    flat: npt.NDArray[np.float32],
    bundle: DataBundle,
    phase: Phase,
    model: ModelConfig,
    target_item: int,
    exclude: npt.NDArray[np.int64] | None = None,
) -> float:
    """Share of eligible users whose top-10 (history masked) contains the target.

    Eligible: not in ``exclude`` (the attacker accounts) and without the target in their
    history. With no eligible user the exposure is 0.0.
    """
    layout = make_layout(bundle.n_items, model.dim)
    base = content_base(bundle.item_content, model)
    tensor = torch.from_numpy(np.asarray(flat, dtype=np.float32))
    skip = np.zeros(bundle.n_users, dtype=bool)
    if exclude is not None and exclude.size:
        skip[exclude] = True
    eligible = 0
    exposed = 0
    for start in range(0, bundle.n_users, EXPOSURE_BATCH):
        users = np.arange(start, min(start + EXPOSURE_BATCH, bundle.n_users), dtype=np.int64)
        history = bundle.history_matrix(phase, users)
        keep = (~skip[users]) & (history[:, target_item] == 0)
        if not keep.any():
            continue
        scores = torch.from_numpy(score_matrix(tensor, layout, base, history[keep], model))
        scores = scores.masked_fill(torch.from_numpy(history[keep]) > 0, float("-inf"))
        top = torch.topk(scores, min(TOP_K, scores.shape[1]), dim=1).indices
        eligible += int(keep.sum())
        exposed += int((top == target_item).any(dim=1).sum())
    return exposed / eligible if eligible else 0.0
