"""Client-side computation, vectorised over the users of a cohort chunk.

Each simulated client holds only its own interaction row. It hides part of that
row, runs ``local_steps`` steps of gradient descent on the loss of predicting the
hidden part, and returns the difference between its local parameters and the
global ones. Nothing else leaves the client.
"""

from __future__ import annotations

from collections.abc import Callable

import torch
from torch.func import grad, vmap

from prism.config import ModelConfig
from prism.models.hybrid import Layout, flatten, unflatten, user_loss

DeltaFn = Callable[[torch.Tensor, torch.Tensor, torch.Tensor], torch.Tensor]


def split_history(
    rows: torch.Tensor, steps: int, hide_fraction: float, generator: torch.Generator
) -> tuple[torch.Tensor, torch.Tensor]:
    """Split each user's 0/1 history row into visible and hidden parts, once per local step.

    Returns two tensors of shape (users, steps, items) that sum to the history.
    """
    expanded = rows.unsqueeze(1).expand(-1, steps, -1)
    draws = torch.rand(expanded.shape, generator=generator)
    hidden = ((draws < hide_fraction) & (expanded > 0)).to(rows.dtype)
    return expanded - hidden, hidden


def make_delta_fn(
    layout: Layout, base: torch.Tensor, config: ModelConfig, local_steps: int, local_lr: float
) -> DeltaFn:
    """Build ``f(flat, visible, target) -> deltas`` with one row of ``deltas`` per user."""
    gradient = grad(user_loss)

    def one_user(flat: torch.Tensor, visible: torch.Tensor, target: torch.Tensor) -> torch.Tensor:
        start = unflatten(flat, layout)
        params = start
        for step in range(local_steps):
            grads = gradient(params, base, visible[step], target[step], config)
            params = {name: params[name] - local_lr * grads[name] for name in layout.names}
        return flatten({name: params[name] - start[name] for name in layout.names}, layout)

    batched = vmap(one_user, in_dims=(None, 0, 0))

    def delta_fn(flat: torch.Tensor, visible: torch.Tensor, target: torch.Tensor) -> torch.Tensor:
        with torch.no_grad():
            result: torch.Tensor = batched(flat, visible, target)
        return result

    return delta_fn
