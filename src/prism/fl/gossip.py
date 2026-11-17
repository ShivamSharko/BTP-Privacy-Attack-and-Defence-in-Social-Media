"""Serverless gossip training over the friend network, with local differential privacy.

Every node keeps its own model. In a synchronous round each node (1) computes the
gradient direction (step size 1) of its own hidden-history loss, (2) clips it to
``clip_norm`` and adds Gaussian noise N(0, (z * clip_norm)^2) before anything leaves
the device, (3) turns that private gradient into a step with its own optimiser
(SGD or Adam) and applies it to its own model, and (4) replaces its model with the
mean of the models of itself and its ``degree`` peers. The noisy clipped gradient
is the only thing derived from a node's data that is ever sent: local differential
privacy, with no trusted server and no sampling amplification (every node releases
one update per round). Steps after the noisy gradient are post-processing.

Adam: with ``mix_moments`` (the default) the first and second moments are gossiped
together with the model, every round: each node updates its moments with its private
gradient, takes its step, and then the parameters, first moment and second moment are
each replaced by the mean over the node and its peers ("decentralised Adam with consensus
on the moments"). After a few rounds each node's moments approximate the network-wide
averages, so the step approaches the server's Adam step. Moments are functions of the
private gradient only, so the local epsilon is unchanged, but a node sends three times
the bytes. With ``mix_moments=False`` each node keeps its own moments and never sends them.

Memory: SGD holds two ``(n_nodes, P)`` float32 arrays (the population and a working
copy). Adam adds the first and second moments, four arrays in all (about 5.2 GB at
n = 3,000 and P = 107,679); the three arrays are mixed one after another through the
working copy as scratch (buffers are swapped, not copied), so the peak stays at four. Steps 1-3 run in chunks of nodes; mixing accumulates over
the peer columns chunk by chunk, so no array of that size is ever gathered at once.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Literal

import numpy as np
import numpy.typing as npt
import torch
from torch.func import grad, vmap
from torch.nn import functional as F

from prism.config import ModelConfig, Phase
from prism.data.bundle import DataBundle
from prism.eval.metrics import ranking_metrics_per_user
from prism.fl.client import split_history
from prism.fl.server import ADAM_BETA1, ADAM_BETA2, ADAM_EPS
from prism.models.hybrid import (
    Layout,
    content_base,
    flatten,
    init_flat,
    item_vectors,
    make_layout,
    unflatten,
    user_loss,
)
from prism.seeding import streams, torch_generator

FLOAT_BYTES: int = 4
EVAL_CHUNK: int = 64
NORM_FLOOR: float = 1.0e-12

NodeDeltaFn = Callable[[torch.Tensor, torch.Tensor, torch.Tensor], torch.Tensor]


@dataclass(frozen=True)
class GossipConfig:
    """One gossip run. ``clip_norm`` None sends the raw gradient (non-private)."""

    rounds: int
    degree: int = 4
    lr: float = 0.05
    optimiser: Literal["adam", "sgd"] = "adam"
    mix_moments: bool = True
    clip_norm: float | None = None
    noise_multiplier: float = 0.0
    hide_fraction: float = 0.5


@dataclass(frozen=True)
class GossipResult:
    """One model per node, plus what the run cost on the wire."""

    params: npt.NDArray[np.float32]
    rounds_completed: int
    bytes_sent_per_node_per_round: int
    friend_peer_share: float
    first_moment: npt.NDArray[np.float32] | None = None
    second_moment: npt.NDArray[np.float32] | None = None


def make_node_delta_fn(
    layout: Layout, base: torch.Tensor, config: ModelConfig, local_lr: float = 1.0
) -> NodeDeltaFn:
    """Build ``f(flats, visible, target) -> deltas``: one gradient step per node on its own model.

    Gossip uses ``local_lr = 1``, so a delta is the descent direction itself.

    Unlike ``fl.client.make_delta_fn`` the parameters are batched too (``in_dims=(0, 0, 0)``).
    """
    gradient = grad(user_loss)

    def one_node(flat: torch.Tensor, visible: torch.Tensor, target: torch.Tensor) -> torch.Tensor:
        params = unflatten(flat, layout)
        grads = gradient(params, base, visible, target, config)
        return flatten({name: -local_lr * grads[name] for name in layout.names}, layout)

    batched = vmap(one_node, in_dims=(0, 0, 0))

    def delta_fn(flats: torch.Tensor, visible: torch.Tensor, target: torch.Tensor) -> torch.Tensor:
        with torch.no_grad():
            result: torch.Tensor = batched(flats, visible, target)
        return result

    return delta_fn


def privatise_updates(
    deltas: torch.Tensor,
    clip_norm: float | None,
    noise_multiplier: float,
    rng: np.random.Generator,
) -> torch.Tensor:
    """What a node sends: its gradient clipped to ``clip_norm`` plus N(0, (z * clip_norm)^2) noise."""
    if clip_norm is None:
        if noise_multiplier > 0.0:
            raise ValueError("differential privacy noise requires a clipping norm")
        return deltas
    norms = deltas.norm(dim=1, keepdim=True)
    sent: torch.Tensor = deltas * (clip_norm / norms.clamp(min=NORM_FLOOR)).clamp(max=1.0)
    if noise_multiplier > 0.0:
        noise = rng.standard_normal(size=tuple(sent.shape), dtype=np.float32)
        sent = sent + torch.from_numpy(noise) * float(noise_multiplier * clip_norm)
    return sent


def _adam_step(
    first: torch.Tensor, second: torch.Tensor, private: torch.Tensor, lr: float, step: int
) -> torch.Tensor:
    """Update the node's moment slices in place and return its bias-corrected Adam step."""
    first.mul_(ADAM_BETA1).add_(private, alpha=1.0 - ADAM_BETA1)
    second.mul_(ADAM_BETA2).addcmul_(private, private, value=1.0 - ADAM_BETA2)
    first_hat = first / (1.0 - ADAM_BETA1**step)
    second_hat = second / (1.0 - ADAM_BETA2**step)
    direction: torch.Tensor = first_hat / (second_hat.sqrt() + ADAM_EPS)
    return lr * direction


def mix_into(
    out: torch.Tensor, half: torch.Tensor, peers: npt.NDArray[np.int64], chunk: int = 128
) -> None:
    """``out[i]`` = mean of ``half`` over node i and its peers; ``out`` and ``half`` are distinct."""
    n, degree = peers.shape
    index = torch.from_numpy(np.ascontiguousarray(peers))
    for start in range(0, n, chunk):
        stop = min(start + chunk, n)
        accumulated = half[start:stop].clone()
        for column in range(degree):
            accumulated += half[index[start:stop, column]]
        accumulated /= degree + 1
        out[start:stop] = accumulated


def gossip_train(
    bundle: DataBundle,
    phase: Phase,
    model: ModelConfig,
    config: GossipConfig,
    nodes: npt.NDArray[np.int64],
    peers: npt.NDArray[np.int64],
    seed: int,
    chunk: int = 128,
    *,
    is_friend: npt.NDArray[np.bool_] | None = None,
) -> GossipResult:
    """Train one model per node. ``peers`` holds positions 0..n-1 into ``nodes``.

    ``is_friend`` (same shape as ``peers``) marks real friends among the peers; when it
    is omitted ``friend_peer_share`` is NaN because the share is unknown.
    """
    n = int(nodes.size)
    if peers.shape != (n, config.degree):
        raise ValueError("peers must have shape (n_nodes, degree)")
    if n and (peers.min() < 0 or peers.max() >= n):
        raise ValueError("peer positions must lie in 0..n_nodes-1")
    rng = streams(seed)
    layout = make_layout(bundle.n_items, model.dim)
    base = content_base(bundle.item_content, model)
    initial = init_flat(layout, model, rng["init"])
    delta_fn = make_node_delta_fn(layout, base, model, 1.0)
    mask_generator = torch_generator(rng["masking"])
    noise_rng = rng["noise"]

    params = initial.unsqueeze(0).repeat(n, 1)
    half = torch.empty_like(params)
    first = torch.zeros_like(params) if config.optimiser == "adam" else None
    second = torch.zeros_like(params) if config.optimiser == "adam" else None
    for round_index in range(1, config.rounds + 1):
        for start in range(0, n, chunk):
            stop = min(start + chunk, n)
            rows = torch.from_numpy(bundle.history_matrix(phase, nodes[start:stop]))
            visible, target = split_history(rows, 1, config.hide_fraction, mask_generator)
            gradient = delta_fn(params[start:stop], visible[:, 0], target[:, 0])
            private = privatise_updates(
                gradient, config.clip_norm, config.noise_multiplier, noise_rng
            )
            if first is None or second is None:
                step = config.lr * private
            else:
                step = _adam_step(
                    first[start:stop], second[start:stop], private, config.lr, round_index
                )
            half[start:stop] = params[start:stop] + step
        mix_into(params, half, peers, chunk)
        if first is not None and second is not None and config.mix_moments:
            mix_into(half, first, peers, chunk)
            first, half = half, first
            mix_into(half, second, peers, chunk)
            second, half = half, second

    payload = 3 if first is not None and config.mix_moments else 1
    share = float("nan") if is_friend is None else float(np.mean(is_friend))
    return GossipResult(
        params=params.numpy(),
        rounds_completed=config.rounds,
        bytes_sent_per_node_per_round=config.degree * layout.total * FLOAT_BYTES * payload,
        friend_peer_share=share,
        first_moment=None if first is None else first.numpy(),
        second_moment=None if second is None else second.numpy(),
    )


def evaluate_nodes(
    params: npt.NDArray[np.float32],
    bundle: DataBundle,
    phase: Phase,
    model: ModelConfig,
    nodes: npt.NDArray[np.int64],
) -> tuple[dict[str, float], npt.NDArray[np.float64]]:
    """Personalised evaluation: each node is scored with its own model on its own data."""
    layout = make_layout(bundle.n_items, model.dim)
    base = content_base(bundle.item_content, model)
    all_params = torch.from_numpy(np.asarray(params, dtype=np.float32))

    def one_node(flat: torch.Tensor, history: torch.Tensor) -> torch.Tensor:
        weights = unflatten(flat, layout)
        raw = item_vectors(weights, base)
        pooled = (history @ raw) / history.sum().clamp(min=1.0)
        user = F.normalize(pooled @ weights["umap"].T, dim=-1)
        return model.temperature * (F.normalize(raw, dim=-1) @ user) + weights["bias"]

    batched = vmap(one_node, in_dims=(0, 0))

    def score_fn(positions: npt.NDArray[np.int64]) -> npt.NDArray[np.float32]:
        rows = torch.from_numpy(bundle.history_matrix(phase, nodes[positions]))
        with torch.no_grad():
            scores: torch.Tensor = batched(all_params[torch.from_numpy(positions)], rows)
        return np.asarray(scores.numpy(), dtype=np.float32)

    history = bundle.history(phase)
    targets = bundle.targets(phase)
    return ranking_metrics_per_user(
        score_fn,
        [history[int(u)] for u in nodes],
        [targets[int(u)] for u in nodes],
        bundle.n_items,
        batch_users=EVAL_CHUNK,
    )
