"""Membership inference: metrics and the user-level attack (RQ3).

Metrics: AUC and TPR at a fixed low FPR are reported, never accuracy alone,
because what matters is confident identification of a few members.

User-level attack: a user is scored by the released model's loss on a fixed
hidden half of that user's own history, calibrated by the mean loss of reference
models that were not trained on the user. Members and non-members are random
halves of the same user population. See ``prism.experiments.membership`` for the
protocol and its positive and negative controls.
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

import numpy as np
import numpy.typing as npt
import torch
from scipy.stats import rankdata

from prism.config import ModelConfig
from prism.data.bundle import DataBundle
from prism.eval.stats import epsilon_lower_bound
from prism.fl.fast import batched_losses
from prism.models.hybrid import content_base, make_layout, unflatten


def auc_score(
    member_scores: npt.NDArray[np.float64], nonmember_scores: npt.NDArray[np.float64]
) -> float:
    """Rank-based AUC with tie correction. 0.5 means the attack fails."""
    n_pos = int(member_scores.size)
    n_neg = int(nonmember_scores.size)
    if n_pos == 0 or n_neg == 0:
        return float("nan")
    combined = np.concatenate([member_scores, nonmember_scores])
    ranks = rankdata(combined)
    rank_sum = float(ranks[:n_pos].sum())
    return (rank_sum - n_pos * (n_pos + 1) / 2.0) / (n_pos * n_neg)


def tpr_at_fpr(
    member_scores: npt.NDArray[np.float64],
    nonmember_scores: npt.NDArray[np.float64],
    max_fpr: float = 0.01,
) -> float:
    """True-positive rate at a threshold giving at most max_fpr false positives."""
    if member_scores.size == 0 or nonmember_scores.size == 0:
        return float("nan")
    threshold = float(np.quantile(nonmember_scores, 1.0 - max_fpr, method="higher"))
    return float((member_scores > threshold).mean())


def attack_summary(
    member_scores: npt.NDArray[np.float64], nonmember_scores: npt.NDArray[np.float64]
) -> dict[str, float]:
    """Standard reporting triple for a membership attack."""
    return {
        "n_member": float(member_scores.size),
        "n_nonmember": float(nonmember_scores.size),
        "auc": auc_score(member_scores, nonmember_scores),
        "tpr_at_1pct_fpr": tpr_at_fpr(member_scores, nonmember_scores, 0.01),
        "member_mean": float(member_scores.mean()) if member_scores.size else float("nan"),
        "nonmember_mean": float(nonmember_scores.mean()) if nonmember_scores.size else float("nan"),
    }


# ---------------------------------------------------------------------------
# User-level membership inference with reference-model calibration.
# ---------------------------------------------------------------------------

LOW_RESOLUTION_BELOW: int = 20_000  # non-members needed to resolve a 0.1% FPR


def fixed_hidden(
    rows: npt.NDArray[np.float32], users: npt.NDArray[np.int64], attack_seed: int
) -> npt.NDArray[np.float32]:
    """Fixed 0/1 matrix of the history items hidden from the model when scoring a user.

    Row i depends only on (attack_seed, users[i]) and the user's own history, never on a
    model or on training randomness. A user with two or more items always has at least one
    visible and one hidden item.
    """
    hidden = np.zeros_like(rows)
    for i, user in enumerate(users):
        rng = np.random.default_rng([attack_seed, int(user)])
        draw = np.asarray(rng.random(rows.shape[1]) < 0.5, dtype=np.bool_)
        items = np.flatnonzero(rows[i] > 0)
        chosen = draw[items]
        if items.size >= 2 and (chosen.all() or not chosen.any()):
            flip = int(rng.integers(0, items.size))
            chosen = chosen.copy()
            chosen[flip] = not chosen[flip]
        hidden[i, items[chosen]] = 1.0
    return hidden


def losses_for_models(
    flats: Mapping[str, torch.Tensor],
    bundle: DataBundle,
    model: ModelConfig,
    users: npt.NDArray[np.int64],
    attack_seed: int,
    chunk: int = 512,
) -> dict[str, npt.NDArray[np.float64]]:
    """Per-user loss on the fixed visible/hidden split of the "final" history, per model."""
    layout = make_layout(bundle.n_items, model.dim)
    base = content_base(bundle.item_content, model)
    params = {name: unflatten(flat.detach().float(), layout) for name, flat in flats.items()}
    out = {name: np.empty(users.size, dtype=np.float64) for name in flats}
    with torch.no_grad():
        for start in range(0, users.size, chunk):
            ids = users[start : start + chunk]
            rows = bundle.history_matrix("final", ids)
            hidden = fixed_hidden(rows, ids, attack_seed)
            visible_t = torch.from_numpy(rows - hidden)
            target_t = torch.from_numpy(hidden)
            for name, p in params.items():
                losses = batched_losses(p, base, visible_t, target_t, model)
                out[name][start : start + ids.size] = losses.double().numpy()
    return out


def user_losses(
    flat: torch.Tensor,
    bundle: DataBundle,
    model: ModelConfig,
    users: npt.NDArray[np.int64],
    attack_seed: int,
    chunk: int = 512,
) -> npt.NDArray[np.float64]:
    """Per-user loss of one model (see ``losses_for_models``)."""
    return losses_for_models({"m": flat}, bundle, model, users, attack_seed, chunk)["m"]


def calibrate_scores(
    target_loss: npt.NDArray[np.float64],
    reference_loss: npt.NDArray[np.float64],
    in_reference: npt.NDArray[np.bool_],
) -> npt.NDArray[np.float64]:
    """Reference mean loss minus target loss; higher means more likely a member.

    ``reference_loss`` and ``in_reference`` are (models, users). The reference mean uses only
    models that did not train on the user; a user in every reference half uses all of them.
    """
    out_mask = ~in_reference
    count = out_mask.sum(axis=0)
    masked_sum = np.where(out_mask, reference_loss, 0.0).sum(axis=0)
    all_mean = reference_loss.mean(axis=0)
    reference_mean = np.where(count > 0, masked_sum / np.maximum(count, 1), all_mean)
    return np.asarray(reference_mean - target_loss, dtype=np.float64)


def _counts_at_fpr(
    members: npt.NDArray[np.float64], nonmembers: npt.NDArray[np.float64], fpr: float
) -> tuple[int, int]:
    threshold = float(np.quantile(nonmembers, 1.0 - fpr, method="higher"))
    return int((members > threshold).sum()), int((nonmembers > threshold).sum())


def summarise_scores(
    scores: npt.NDArray[np.float64],
    is_member: npt.NDArray[np.bool_],
    delta: float,
) -> dict[str, Any]:
    """AUC, TPR at 1% and 0.1% FPR, and the empirical epsilon lower bound at 1% FPR."""
    members = scores[is_member]
    nonmembers = scores[~is_member]
    tp, fp = _counts_at_fpr(members, nonmembers, 0.01)
    tp_low, _ = _counts_at_fpr(members, nonmembers, 0.001)
    return {
        "n_members": int(members.size),
        "n_nonmembers": int(nonmembers.size),
        "auc": auc_score(members, nonmembers),
        "tpr_at_1pct_fpr": tp / members.size,
        "tpr_at_0.1pct_fpr": tp_low / members.size,
        "low_resolution": bool(nonmembers.size < LOW_RESOLUTION_BELOW),
        "epsilon_lower_bound": epsilon_lower_bound(
            tp, int(members.size), fp, int(nonmembers.size), delta
        ),
    }
