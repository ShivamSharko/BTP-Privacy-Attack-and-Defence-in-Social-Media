"""Seeding, atomic I/O and configuration (plan task M1)."""

from __future__ import annotations

import json
import os
from pathlib import Path

import numpy as np
import pytest

from prism.config import ModelConfig, RunConfig, TrainConfig, config_hash
from prism.io import atomic_write_json, atomic_write_npz, read_json
from prism.seeding import stream, streams, torch_generator


def test_streams_are_reproducible_and_distinct() -> None:
    first = streams(7, ("sampling", "noise"))
    second = streams(7, ("sampling", "noise"))
    a = first["sampling"].random(5)
    assert np.array_equal(a, second["sampling"].random(5))
    assert not np.array_equal(a, first["noise"].random(5))


def test_a_stream_does_not_depend_on_which_other_streams_exist() -> None:
    alone = stream(3, "noise").random(4)
    together = streams(3, ("init", "sampling", "masking", "noise"))["noise"].random(4)
    assert np.array_equal(alone, together)


def test_different_seeds_give_different_streams() -> None:
    assert not np.array_equal(stream(1, "noise").random(4), stream(2, "noise").random(4))


def test_torch_generator_is_seeded_from_the_stream() -> None:
    import torch

    one = torch.rand(3, generator=torch_generator(stream(5, "masking")))
    two = torch.rand(3, generator=torch_generator(stream(5, "masking")))
    assert torch.equal(one, two)


def test_atomic_json_round_trip_is_sorted_and_newline_terminated(tmp_path: Path) -> None:
    target = tmp_path / "deep" / "record.json"
    atomic_write_json(target, {"b": 1, "a": [1.5, None]})
    text = target.read_text(encoding="utf-8")
    assert text.endswith("\n")
    assert text.index('"a"') < text.index('"b"')
    assert read_json(target) == {"a": [1.5, None], "b": 1}
    assert list(target.parent.iterdir()) == [target]


def test_atomic_json_rejects_nan_and_infinity(tmp_path: Path) -> None:
    with pytest.raises(ValueError):
        atomic_write_json(tmp_path / "bad.json", {"epsilon": float("inf")})
    assert not (tmp_path / "bad.json").exists()


def test_failed_replace_keeps_the_old_file_and_leaves_no_partial_target(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    target = tmp_path / "record.json"
    atomic_write_json(target, {"version": 1})

    def boom(src: object, dst: object) -> None:
        raise OSError("simulated crash")

    monkeypatch.setattr(os, "replace", boom)
    with pytest.raises(OSError):
        atomic_write_json(target, {"version": 2})
    monkeypatch.undo()
    assert json.loads(target.read_text(encoding="utf-8")) == {"version": 1}
    assert [p.name for p in tmp_path.iterdir()] == ["record.json"]


def test_atomic_npz_round_trip(tmp_path: Path) -> None:
    target = tmp_path / "model.npz"
    atomic_write_npz(target, flat=np.arange(4, dtype=np.float32))
    with np.load(target) as data:
        assert np.array_equal(data["flat"], np.arange(4, dtype=np.float32))
    assert [p.name for p in tmp_path.iterdir()] == ["model.npz"]


def _run(seed: int = 0, noise: float = 0.5) -> RunConfig:
    return RunConfig(
        name="unit",
        regime="small_cohort",
        phase="tune",
        seed=seed,
        target_epsilon=8.0,
        model=ModelConfig(),
        train=TrainConfig(
            sample_rate=0.1, rounds=5, server_lr=0.1, clip_norm=1.0, noise_multiplier=noise
        ),
    )


def test_config_is_frozen_and_validated() -> None:
    config = _run()
    with pytest.raises(Exception):  # noqa: B017 - pydantic raises its own ValidationError
        config.seed = 1  # type: ignore[misc]
    with pytest.raises(ValueError):
        TrainConfig(sample_rate=1.5, rounds=5, server_lr=0.1)
    with pytest.raises(ValueError):
        TrainConfig(sample_rate=0.1, rounds=5, server_lr=0.1, noise_multiplier=1.0)  # no clip


def test_config_hash_is_stable_and_sensitive() -> None:
    assert config_hash(_run()) == config_hash(_run())
    assert config_hash(_run()) != config_hash(_run(noise=0.6))
    assert len(config_hash(_run())) == 64


def test_run_identifier_is_filesystem_safe() -> None:
    identifier = _run(seed=3).identifier
    assert "seed3" in identifier
    assert all(ch.isalnum() or ch in "._-" for ch in identifier)
