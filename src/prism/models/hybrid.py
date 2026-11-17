"""Hybrid recommender: trainable item embeddings on a fixed public content base.

Item vector   = normalise(emb[i] + base[i]), where ``base`` is a fixed PCA
                projection of the frozen text embeddings of public business
                metadata. It is computed from item data only, never from user
                interactions, so it costs no privacy budget.
User vector   = normalise(umap @ mean of the unnormalised item vectors in the
                user's history). It is computed on the (simulated) device from
                the user's own interactions and is never shared.
Score         = temperature * cosine(user, item) + bias[i].
Training loss = hide part of the history, predict the hidden items with a
                softmax over the whole catalogue; visible items are excluded
                from the candidates.

The model is functional: all trainable parameters live in one flat float32
vector whose layout is defined by name in ``Layout``. Attack code and the
secure-sum code address blocks through that layout, never by hand-computed
offsets (the step-10 inversion bug was a hand-computed offset).

Replaces the content-only two-tower of ADR-019, which could not personalise on
this dataset (design document section 1.3 item 1).
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from functools import cached_property

import numpy as np
import numpy.typing as npt
import torch
from torch.nn import functional as F

from prism.config import ModelConfig

MASKED_LOGIT: float = -1.0e9
ID_INIT_STD: float = 0.1


@dataclass(frozen=True)
class Layout:
    """Named blocks of the flat parameter vector, in storage order."""

    names: tuple[str, ...]
    shapes: tuple[tuple[int, ...], ...]

    @cached_property
    def sizes(self) -> tuple[int, ...]:
        return tuple(int(np.prod(shape)) for shape in self.shapes)

    @cached_property
    def total(self) -> int:
        return sum(self.sizes)

    @cached_property
    def slices(self) -> dict[str, slice]:
        result: dict[str, slice] = {}
        offset = 0
        for name, size in zip(self.names, self.sizes, strict=True):
            result[name] = slice(offset, offset + size)
            offset += size
        return result

    def shape(self, name: str) -> tuple[int, ...]:
        return self.shapes[self.names.index(name)]


def make_layout(n_items: int, dim: int) -> Layout:
    """Layout for a catalogue of ``n_items`` and embedding width ``dim``."""
    if n_items < 1 or dim < 1:
        raise ValueError("n_items and dim must be positive")
    return Layout(("emb", "umap", "bias"), ((n_items, dim), (dim, dim), (n_items,)))


def unflatten(flat: torch.Tensor, layout: Layout) -> dict[str, torch.Tensor]:
    """View the flat vector as named parameter tensors."""
    if flat.shape[-1] != layout.total:
        raise ValueError("flat vector size does not match the layout")
    return {name: flat[layout.slices[name]].reshape(layout.shape(name)) for name in layout.names}


def flatten(params: Mapping[str, torch.Tensor], layout: Layout) -> torch.Tensor:
    """Concatenate named parameter tensors in layout order."""
    return torch.cat([params[name].reshape(-1) for name in layout.names])


def init_flat(layout: Layout, config: ModelConfig, rng: np.random.Generator) -> torch.Tensor:
    """Initial parameters. Data-free: zeros (or seeded noise when there is no content base)."""
    flat = torch.zeros(layout.total, dtype=torch.float32)
    params = unflatten(flat, layout)
    params["umap"].copy_(torch.eye(layout.shape("umap")[0]))
    if not config.use_content:
        noise = rng.normal(0.0, ID_INIT_STD, size=layout.shape("emb")).astype(np.float32)
        params["emb"].copy_(torch.from_numpy(noise))
    return flat


def content_base(item_content: npt.NDArray[np.float32], config: ModelConfig) -> torch.Tensor:
    """Fixed (n_items, dim) projection of item content onto its top principal directions."""
    n_items = item_content.shape[0]
    base = np.zeros((n_items, config.dim), dtype=np.float64)
    if config.use_content and config.content_scale > 0.0:
        centred = item_content.astype(np.float64) - item_content.mean(axis=0, keepdims=True)
        _, _, vt = np.linalg.svd(centred, full_matrices=False)
        keep = min(config.dim, vt.shape[0])
        components = vt[:keep]
        # Fix the sign of each direction so the projection is reproducible across BLAS builds.
        pivots = np.abs(components).argmax(axis=1)
        signs = np.sign(components[np.arange(keep), pivots])
        signs[signs == 0.0] = 1.0
        projected = centred @ (components * signs[:, None]).T
        mean_norm = float(np.linalg.norm(projected, axis=1).mean())
        if mean_norm > 0.0:
            base[:, :keep] = projected * (config.content_scale / mean_norm)
    return torch.from_numpy(base.astype(np.float32))


def item_vectors(params: Mapping[str, torch.Tensor], base: torch.Tensor) -> torch.Tensor:
    """Unnormalised item vectors."""
    return params["emb"] + base


def user_loss(
    params: Mapping[str, torch.Tensor],
    base: torch.Tensor,
    visible: torch.Tensor,
    target: torch.Tensor,
    config: ModelConfig,
) -> torch.Tensor:
    """Loss of one user: predict ``target`` items from ``visible`` items (0/1 vectors)."""
    raw = item_vectors(params, base)
    history = (visible @ raw) / visible.sum().clamp(min=1.0)
    user = F.normalize(history @ params["umap"].T, dim=-1)
    items = F.normalize(raw, dim=-1)
    logits = config.temperature * (items @ user) + params["bias"]
    logits = torch.where(visible > 0, torch.full_like(logits, MASKED_LOGIT), logits)
    log_prob = F.log_softmax(logits, dim=-1)
    return -(log_prob * target).sum() / target.sum().clamp(min=1.0)


def score_matrix(
    flat: torch.Tensor,
    layout: Layout,
    base: torch.Tensor,
    history: npt.NDArray[np.float32],
    config: ModelConfig,
) -> npt.NDArray[np.float32]:
    """Scores of every item for each row of a dense 0/1 history matrix."""
    with torch.no_grad():
        params = unflatten(flat, layout)
        raw = item_vectors(params, base)
        rows = torch.from_numpy(history)
        pooled = (rows @ raw) / rows.sum(dim=1, keepdim=True).clamp(min=1.0)
        users = F.normalize(pooled @ params["umap"].T, dim=-1)
        scores = config.temperature * (users @ F.normalize(raw, dim=-1).T) + params["bias"]
    return np.asarray(scores.numpy(), dtype=np.float32)
