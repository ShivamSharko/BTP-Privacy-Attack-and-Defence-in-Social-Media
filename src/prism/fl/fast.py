"""Fast path for the clipped sum of single-step client updates.

The general path (``fl.client``) materialises every client's whole update, which
costs a (users x parameters) array per chunk. When each client takes one local
step and the server only needs the clipped sum, the same result is available
much more cheaply:

1. one batched forward pass gives every user's loss;
2. the L2 norm of each user's gradient is computed in closed form from the
   quantities of that forward pass (derivation below);
3. the clipped sum is the gradient of the weighted loss sum, with weight
   min(1, C / norm) per user: one ordinary backward pass.

Step 3 is exact autograd. Step 2 is the only hand-derived part, and a wrong norm
would be a wrong clip, so it is tested against autograd in ``tests/test_fl_fast.py``
and re-checked on a few users at the start of every training run.

Closed-form norm. For one user with visible set V, hidden targets T, item
vectors R (rows R_i, unit rows r_i), pooled history h = mean of R over V,
y = A h, unit user vector u = y / |y|, cosines c_i = r_i . u and logits
z_i = temperature * c_i + b_i over the non-visible items:

    d_i   = softmax(z)_i - T_i / |T|            (0 on visible items)
    g_u   = temperature * sum_i d_i r_i
    g_y   = (g_u - (u . g_u) u) / |y|

    |grad bias|^2   = sum_i d_i^2
    |grad R|^2      = temperature^2 * sum_i d_i^2 (|u|^2 - c_i^2) / |R_i|^2 (non-visible rows)
                      + |V| * |A^T g_y|^2 / |V|^2                            (visible rows)
    |grad A|^2      = |g_y|^2 * |h|^2

The two parts of grad R live on disjoint rows, so their squared norms add.
"""

from __future__ import annotations

from collections.abc import Mapping

import torch
from torch.nn import functional as F

from prism.config import ModelConfig
from prism.models.hybrid import MASKED_LOGIT, Layout, item_vectors, unflatten

NORMALISE_EPS: float = 1.0e-12  # the epsilon of torch.nn.functional.normalize


def _forward(
    params: Mapping[str, torch.Tensor],
    base: torch.Tensor,
    visible: torch.Tensor,
    target: torch.Tensor,
    config: ModelConfig,
) -> dict[str, torch.Tensor]:
    raw = item_vectors(params, base)
    visible_count = visible.sum(dim=1, keepdim=True)
    pooled = (visible @ raw) / visible_count.clamp(min=1.0)
    projected = pooled @ params["umap"].T
    users = F.normalize(projected, dim=-1)
    items = F.normalize(raw, dim=-1)
    cosine = users @ items.T
    logits = config.temperature * cosine + params["bias"]
    logits = torch.where(visible > 0, torch.full_like(logits, MASKED_LOGIT), logits)
    log_prob = F.log_softmax(logits, dim=-1)
    target_count = target.sum(dim=1)
    losses = -(log_prob * target).sum(dim=1) / target_count.clamp(min=1.0)
    return {
        "raw": raw,
        "pooled": pooled,
        "projected": projected,
        "users": users,
        "items": items,
        "cosine": cosine,
        "log_prob": log_prob,
        "losses": losses,
        "visible_count": visible_count.squeeze(1),
        "target_count": target_count,
    }


def batched_losses(
    params: Mapping[str, torch.Tensor],
    base: torch.Tensor,
    visible: torch.Tensor,
    target: torch.Tensor,
    config: ModelConfig,
) -> torch.Tensor:
    """Loss of every user of a chunk; equal to ``user_loss`` applied row by row."""
    return _forward(params, base, visible, target, config)["losses"]


def _norms_from_forward(
    cache: Mapping[str, torch.Tensor],
    params: Mapping[str, torch.Tensor],
    visible: torch.Tensor,
    target: torch.Tensor,
    config: ModelConfig,
    local_lr: float,
) -> torch.Tensor:
    temperature = config.temperature
    has_target = (cache["target_count"] > 0).to(visible.dtype).unsqueeze(1)
    target_share = target / cache["target_count"].clamp(min=1.0).unsqueeze(1)
    d = (cache["log_prob"].exp() * has_target - target_share) * (visible <= 0)
    bias_sq = (d**2).sum(dim=1)

    row_norm = cache["raw"].norm(dim=1).clamp(min=NORMALISE_EPS)
    users = cache["users"]
    # |u|^2 is 1 for a normal user and 0 for a user with nothing visible (normalize(0) = 0).
    user_sq = (users**2).sum(dim=1, keepdim=True)
    off_axis = (user_sq - cache["cosine"] ** 2).clamp(min=0.0)
    item_sq = temperature**2 * ((d**2) * off_axis / row_norm**2).sum(dim=1)

    g_user = temperature * (d @ cache["items"])
    projected_norm = cache["projected"].norm(dim=1).clamp(min=NORMALISE_EPS).unsqueeze(1)
    g_projected = (g_user - (users * g_user).sum(dim=1, keepdim=True) * users) / projected_norm
    visible_count = cache["visible_count"]
    back = g_projected @ params["umap"]
    history_sq = visible_count * (back**2).sum(dim=1) / visible_count.clamp(min=1.0) ** 2
    map_sq = (g_projected**2).sum(dim=1) * (cache["pooled"] ** 2).sum(dim=1)

    return local_lr * torch.sqrt(bias_sq + item_sq + history_sq + map_sq)


def update_norms(
    params: Mapping[str, torch.Tensor],
    base: torch.Tensor,
    visible: torch.Tensor,
    target: torch.Tensor,
    config: ModelConfig,
    local_lr: float,
) -> torch.Tensor:
    """L2 norm of each user's single-step update, in closed form."""
    with torch.no_grad():
        cache = _forward(params, base, visible, target, config)
        return _norms_from_forward(cache, params, visible, target, config, local_lr)


def clipped_sum_fast(
    flat: torch.Tensor,
    layout: Layout,
    base: torch.Tensor,
    config: ModelConfig,
    visible: torch.Tensor,
    target: torch.Tensor,
    clip_norm: float | None,
    local_lr: float,
) -> tuple[torch.Tensor, torch.Tensor, int]:
    """Sum over users of their clipped single-step updates, the norms, and a non-finite count.

    A user whose update is not finite contributes nothing, exactly as in ``clip_rows``; if
    the fast backward pass cannot isolate such a user, the chunk is recomputed per user.
    """
    leaf = flat.detach().clone().requires_grad_(True)
    params = unflatten(leaf, layout)
    cache = _forward(params, base, visible, target, config)
    with torch.no_grad():
        detached = {name: value.detach() for name, value in cache.items()}
        plain = {name: value.detach() for name, value in params.items()}
        norms = _norms_from_forward(detached, plain, visible, target, config, local_lr)
        finite = torch.isfinite(norms) & torch.isfinite(detached["losses"])
        if clip_norm is None:
            weights = torch.ones_like(norms)
        else:
            weights = torch.clamp(clip_norm / norms.clamp(min=1e-12), max=1.0)
        weights = torch.where(finite, weights, torch.zeros_like(weights))
        safe_norms = torch.where(finite, norms, torch.zeros_like(norms))
    losses = torch.where(finite, cache["losses"], torch.zeros_like(cache["losses"]))
    (gradient,) = torch.autograd.grad((losses * weights).sum(), leaf)
    total = (-local_lr * gradient).to(torch.float64)
    if not bool(torch.isfinite(total).all()):
        # A non-finite value can leak through the backward pass even with weight zero
        # (0 x NaN = NaN). Dropping the whole chunk would let one user remove up to
        # chunk - 1 others, so redo this chunk on the per-user path, which zeroes only the
        # offending rows.
        from prism.fl.aggregate import clip_rows
        from prism.fl.client import make_delta_fn

        deltas = make_delta_fn(layout, base, config, 1, local_lr)(
            flat.detach(), visible.unsqueeze(1), target.unsqueeze(1)
        )
        result = clip_rows(deltas, clip_norm)
        return result.clipped.sum(dim=0).to(torch.float64), result.norms, result.nonfinite
    return total, safe_norms, int((~finite).sum())
