"""Frozen, validated experiment configuration and its canonical hash.

The hash of a run's configuration is written into every ledger receipt, so a
third party can check which settings a released model was trained with.
"""

from __future__ import annotations

import hashlib
from typing import Literal

import rfc8785
from pydantic import BaseModel, ConfigDict, Field, model_validator

Phase = Literal["tune", "final"]


class _Frozen(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")


class ModelConfig(_Frozen):
    """Hybrid recommender: trainable item embeddings on a fixed public content base."""

    dim: int = Field(default=16, ge=1)
    temperature: float = Field(default=20.0, gt=0.0)
    content_scale: float = Field(default=0.4, ge=0.0)
    use_content: bool = True
    use_ids: bool = True

    @model_validator(mode="after")
    def _needs_some_item_signal(self) -> ModelConfig:
        if not (self.use_content or self.use_ids):
            raise ValueError("at least one of use_content and use_ids must be true")
        return self


class TrainConfig(_Frozen):
    """One training regime: sampling, local work, clipping, noise and the server step."""

    sample_rate: float = Field(gt=0.0, le=1.0)
    rounds: int = Field(ge=1)
    server_lr: float = Field(gt=0.0)
    server_opt: Literal["sgd", "adam"] = "adam"
    momentum: float = Field(default=0.9, ge=0.0, lt=1.0)
    local_steps: int = Field(default=1, ge=1)
    local_lr: float = Field(default=1.0, gt=0.0)
    hide_fraction: float = Field(default=0.5, gt=0.0, lt=1.0)
    clip_norm: float | None = Field(default=None, gt=0.0)
    noise_multiplier: float = Field(default=0.0, ge=0.0)

    @model_validator(mode="after")
    def _noise_needs_a_clip(self) -> TrainConfig:
        if self.noise_multiplier > 0.0 and self.clip_norm is None:
            raise ValueError("differential privacy noise requires a clipping norm")
        return self


class RunConfig(_Frozen):
    """Everything that defines one run."""

    name: str
    regime: str
    phase: Phase
    seed: int = Field(ge=0)
    target_epsilon: float | None = Field(default=None, gt=0.0)
    model: ModelConfig
    train: TrainConfig
    variant: str = "main"

    @property
    def identifier(self) -> str:
        """File-system safe identifier, unique within an experiment."""
        if self.target_epsilon is None:
            privacy = "nondp" if self.train.clip_norm is None else "cliponly"
        else:
            privacy = f"eps{self.target_epsilon:g}"
        raw = f"{self.name}_{self.regime}_{privacy}_{self.variant}_{self.phase}_seed{self.seed}"
        return "".join(ch if ch.isalnum() or ch in "._-" else "-" for ch in raw)


def config_hash(config: BaseModel) -> str:
    """SHA-256 over the RFC 8785 canonical JSON of a configuration."""
    return hashlib.sha256(rfc8785.dumps(config.model_dump(mode="json"))).hexdigest()
