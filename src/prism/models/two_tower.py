"""Two-tower recommender over frozen content features (ADR-019).

Both towers are 384 -> 128 -> 64, giving 115,072 trainable parameters. User
representations are pooled from TRAIN interactions only and never leave the
simulated device; only clipped parameter deltas cross the boundary.

One trainer serves both topologies. Central uses a large sampling rate and one
local epoch; federated uses a small sampling rate and two local epochs. The
expected number of user-updates is matched between them for a fair comparison.

Scoring is cosine similarity at a fixed temperature (SCORE_TEMPERATURE). Both
tower outputs are L2-normalised, so scores are O(1) rather than O(1e-3). Without
this, default initialisation produced gradients roughly two orders of magnitude
too small and the model never left random chance (ADR-038). Parameter count is
unchanged at 115,072.

A learnable per-item bias is added to the temperature-scaled cosine score.
Cosine similarity alone cannot represent item popularity because both tower
outputs are unit-norm, and popularity is the dominant signal in this dataset
(ADR-039). The bias adds n_items parameters, is initialised to zeros so no
private statistics are used at initialisation, belongs to the shared public
item catalogue, and is clipped and noised exactly like every other parameter.
Epsilon accounting is unaffected.

The item bias uses its own learning rate, BIAS_LR_MULTIPLIER times the tower
rate. The mean-reduced BPR loss gives each shallow scalar bias a gradient of
order 0.5/count, which the cohort average shrinks further; at the tower rate the
bias standard deviation reached only 0.007 after 40 rounds against a score scale
of order 1, leaving popularity effectively unrepresented (ADR-040). A separate
rate is standard for bias terms and does not affect clipping or epsilon.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

import numpy as np
import numpy.typing as npt
import torch
from torch import nn
from torch.nn import functional as F

from prism.privacy.dp import clip_l2

HIDDEN_DIM: int = 128
OUTPUT_DIM: int = 64
SCORE_TEMPERATURE: float = 10.0
BIAS_LR_MULTIPLIER: float = 10.0


class TwoTower(nn.Module):
    """Separate user and item towers scoring by dot product."""

    def __init__(
        self,
        dim_in: int,
        n_items: int,
        hidden: int = HIDDEN_DIM,
        dim_out: int = OUTPUT_DIM,
    ) -> None:
        super().__init__()
        self.user_tower = nn.Sequential(
            nn.Linear(dim_in, hidden), nn.ReLU(), nn.Linear(hidden, dim_out)
        )
        self.item_tower = nn.Sequential(
            nn.Linear(dim_in, hidden), nn.ReLU(), nn.Linear(hidden, dim_out)
        )
        self.item_bias = nn.Parameter(torch.zeros(n_items, dtype=torch.float32))

    def forward(
        self, user_features: torch.Tensor, item_features: torch.Tensor
    ) -> tuple[torch.Tensor, torch.Tensor]:
        user_emb = F.normalize(self.user_tower(user_features), p=2.0, dim=-1)
        item_emb = F.normalize(self.item_tower(item_features), p=2.0, dim=-1)
        return user_emb, item_emb


def get_flat(model: nn.Module) -> npt.NDArray[np.float32]:
    """Concatenate all parameters into one float32 vector."""
    with torch.no_grad():
        parts = [p.detach().reshape(-1).cpu().numpy() for p in model.parameters()]
    return np.concatenate(parts).astype(np.float32)


def set_flat(model: nn.Module, flat: npt.NDArray[np.float32]) -> None:
    """Load a flat parameter vector back into the model."""
    offset = 0
    with torch.no_grad():
        for parameter in model.parameters():
            size = parameter.numel()
            block = flat[offset : offset + size].reshape(parameter.shape)
            parameter.copy_(torch.from_numpy(np.ascontiguousarray(block)))
            offset += size
    if offset != flat.size:
        raise ValueError("flat vector size does not match model")


def sample_negatives(
    rng: np.random.Generator, n_items: int, excluded: npt.NDArray[np.bool_], count: int
) -> npt.NDArray[np.int64]:
    """Uniform negatives outside a user's training set, via rejection sampling."""
    if count <= 0:
        return np.empty(0, dtype=np.int64)
    accepted: list[npt.NDArray[np.int64]] = []
    total = 0
    while total < count:
        draws = rng.integers(0, n_items, size=2 * count + 8)
        keep = draws[~excluded[draws]]
        accepted.append(keep)
        total += int(keep.size)
    return np.concatenate(accepted)[:count]


def client_update(
    model: TwoTower,
    global_flat: npt.NDArray[np.float32],
    user_vector: npt.NDArray[np.float32],
    item_features: npt.NDArray[np.float32],
    train_items: npt.NDArray[np.int64],
    rng: np.random.Generator,
    n_items: int,
    local_epochs: int,
    local_lr: float,
    clip_norm: float | None,
) -> npt.NDArray[np.float32]:
    """Run local SGD for one user and return the clipped whole-update delta."""
    set_flat(model, global_flat)
    user_tensor = torch.from_numpy(user_vector).unsqueeze(0)
    excluded = np.zeros(n_items, dtype=np.bool_)
    excluded[train_items] = True
    count = int(train_items.size)

    for _ in range(local_epochs):
        negatives = sample_negatives(rng, n_items, excluded, count)
        rows = np.concatenate([train_items, negatives])
        features = torch.from_numpy(item_features[rows])
        model.zero_grad(set_to_none=True)
        user_emb, item_emb = model(user_tensor, features)
        positive = SCORE_TEMPERATURE * (user_emb * item_emb[:count]).sum(dim=-1)
        negative = SCORE_TEMPERATURE * (user_emb * item_emb[count:]).sum(dim=-1)
        positive = positive + model.item_bias[torch.from_numpy(train_items)]
        negative = negative + model.item_bias[torch.from_numpy(negatives)]
        loss = -F.logsigmoid(positive - negative).mean()
        loss.backward()  # type: ignore[no-untyped-call]
        with torch.no_grad():
            for name, parameter in model.named_parameters():
                if parameter.grad is None:
                    continue
                rate = local_lr * BIAS_LR_MULTIPLIER if name == "item_bias" else local_lr
                parameter.sub_(rate * parameter.grad)

    delta = get_flat(model) - global_flat
    if clip_norm is not None:
        return clip_l2(delta, clip_norm)
    return delta


@dataclass(frozen=True)
class RoundConfig:
    """One training configuration."""

    sample_rate: float
    local_epochs: int
    local_lr: float
    server_lr: float
    clip_norm: float | None
    noise_multiplier: float


def aggregate_round(
    model: TwoTower,
    global_flat: npt.NDArray[np.float32],
    cohort: npt.NDArray[np.int64],
    user_features: npt.NDArray[np.float32],
    item_features: npt.NDArray[np.float32],
    train_items: list[npt.NDArray[np.int64]],
    rng: np.random.Generator,
    n_items: int,
    n_users: int,
    config: RoundConfig,
) -> tuple[npt.NDArray[np.float32], float]:
    """Sum clipped client deltas, add noise once, average, and step the model."""
    total = np.zeros_like(global_flat)
    norm_sum = 0.0
    for user in cohort:
        delta = client_update(
            model,
            global_flat,
            user_features[int(user)],
            item_features,
            train_items[int(user)],
            rng,
            n_items,
            config.local_epochs,
            config.local_lr,
            config.clip_norm,
        )
        norm_sum += float(np.linalg.norm(delta))
        total += delta

    if config.noise_multiplier > 0.0:
        if config.clip_norm is None:
            raise ValueError("DP requires a clipping norm")
        sigma = config.noise_multiplier * config.clip_norm
        total += rng.normal(0.0, sigma, size=total.shape).astype(np.float32)
        divisor = max(config.sample_rate * n_users, 1.0)
    else:
        divisor = max(float(cohort.size), 1.0)

    updated = global_flat + config.server_lr * (total / divisor)
    mean_norm = norm_sum / max(float(cohort.size), 1.0)
    return np.asarray(updated, dtype=np.float32), mean_norm


def make_score_fn(
    model: TwoTower,
    user_features: npt.NDArray[np.float32],
    item_features: npt.NDArray[np.float32],
) -> Callable[[npt.NDArray[np.int64]], npt.NDArray[np.float32]]:
    """Full-catalogue scoring: temperature-scaled cosine plus a learnable item bias."""
    with torch.no_grad():
        item_emb = (
            F.normalize(model.item_tower(torch.from_numpy(item_features)), p=2.0, dim=-1)
            .cpu()
            .numpy()
        )
        bias = model.item_bias.detach().cpu().numpy()

    def score_fn(users: npt.NDArray[np.int64]) -> npt.NDArray[np.float32]:
        with torch.no_grad():
            user_emb = (
                F.normalize(model.user_tower(torch.from_numpy(user_features[users])), p=2.0, dim=-1)
                .cpu()
                .numpy()
            )
        scores = SCORE_TEMPERATURE * (user_emb @ item_emb.T) + bias[None, :]
        return np.asarray(scores, dtype=np.float32)

    return score_fn
