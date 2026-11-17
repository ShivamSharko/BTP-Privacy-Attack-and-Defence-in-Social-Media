"""Free-riding client behaviours and the detection scores the server could compute."""

from __future__ import annotations

import numpy as np
import pytest
import torch

from prism.attacks.free_riding import (
    DetectionCollector,
    choose_free_riders,
    detection_aucs,
    detection_scores,
    make_free_rider_hook,
)


def _batch(n: int = 12, p: int = 16) -> tuple[np.ndarray, torch.Tensor]:
    gen = torch.Generator().manual_seed(3)
    users = np.arange(100, 100 + n, dtype=np.int64)
    deltas = torch.randn(n, p, generator=gen) * torch.linspace(0.5, 2.0, n).unsqueeze(1)
    return users, deltas


RIDERS = np.array([101, 104, 109], dtype=np.int64)
FLAT = torch.zeros(16)


def test_zero_hook_zeroes_free_riders_only() -> None:
    users, deltas = _batch()
    before = deltas.clone()
    out = make_free_rider_hook(RIDERS, "zero", 0)(users, deltas, FLAT, 0)
    rider = np.isin(users, RIDERS)
    assert torch.equal(out[torch.from_numpy(rider)], torch.zeros(3, 16))
    assert torch.equal(out[torch.from_numpy(~rider)], before[torch.from_numpy(~rider)])
    assert torch.equal(deltas, before)


def test_noise_rows_have_the_honest_mean_norm_and_honest_rows_are_untouched() -> None:
    users, deltas = _batch()
    rider = torch.from_numpy(np.isin(users, RIDERS))
    honest_mean = float(deltas[~rider].norm(dim=1).mean())
    out = make_free_rider_hook(RIDERS, "noise", 5)(users, deltas, FLAT, 3)
    assert torch.allclose(out[rider].norm(dim=1), torch.full((3,), honest_mean), rtol=1e-5)
    assert torch.equal(out[~rider], deltas[~rider])
    assert not torch.allclose(out[rider], deltas[rider])
    assert not torch.equal(out[rider][0], out[rider][1])


def test_noise_is_reproducible_per_seed_and_round() -> None:
    users, deltas = _batch()
    a = make_free_rider_hook(RIDERS, "noise", 5)(users, deltas, FLAT, 3)
    b = make_free_rider_hook(RIDERS, "noise", 5)(users, deltas, FLAT, 3)
    assert torch.equal(a, b)
    assert not torch.equal(a, make_free_rider_hook(RIDERS, "noise", 5)(users, deltas, FLAT, 4))
    assert not torch.equal(a, make_free_rider_hook(RIDERS, "noise", 6)(users, deltas, FLAT, 3))


def test_two_chunks_of_one_round_get_different_noise() -> None:
    users, deltas = _batch()
    hook = make_free_rider_hook(RIDERS, "noise", 5)
    first = hook(users, deltas, FLAT, 3)
    second = hook(users, deltas, FLAT, 3)
    rider = torch.from_numpy(np.isin(users, RIDERS))
    assert not torch.equal(first[rider], second[rider])


def test_no_free_rider_in_the_chunk_or_empty_set_is_a_no_op() -> None:
    users, deltas = _batch()
    for riders in (np.array([5, 6], dtype=np.int64), np.zeros(0, dtype=np.int64)):
        for behaviour in ("zero", "noise"):
            out = make_free_rider_hook(riders, behaviour, 0)(users, deltas, FLAT, 0)
            assert torch.equal(out, deltas)


def test_unknown_behaviour_is_rejected() -> None:
    with pytest.raises(ValueError):
        make_free_rider_hook(RIDERS, "sleep", 0)


def test_choose_free_riders_nest_across_fractions() -> None:
    small = choose_free_riders(400, 0.1, np.random.default_rng(1))
    large = choose_free_riders(400, 0.3, np.random.default_rng(1))
    assert small.size == 40 and large.size == 120
    assert set(small.tolist()) <= set(large.tolist())


def test_detection_scores_on_a_hand_built_chunk() -> None:
    rows = torch.tensor([[3.0, 0.0], [3.0, 0.0], [0.0, 0.0], [-3.0, 0.0]])
    norms, cosines = detection_scores(rows, clip_norm=None)
    assert norms.tolist() == [3.0, 3.0, 0.0, 3.0]
    # others of row 1 average to zero (cosine undefined -> 0); row 3 faces (3,0),(3,0),(0,0)
    assert cosines[1] == pytest.approx(0.0)
    assert cosines[3] == pytest.approx(-1.0)
    assert cosines[2] == 0.0
    clipped, _ = detection_scores(rows * 4, clip_norm=5.0)
    assert clipped.tolist() == [5.0, 5.0, 0.0, 5.0]


def test_cosine_of_aligned_and_opposed_rows() -> None:
    rows = torch.tensor([[1.0, 0.0], [2.0, 0.0], [3.0, 0.0], [-1.0, 0.0]])
    _, cosines = detection_scores(rows, clip_norm=None)
    assert cosines[0] == pytest.approx(1.0)
    assert cosines[3] == pytest.approx(-1.0)


def test_detection_aucs_on_hand_built_scores() -> None:
    norms = np.array([0.0, 0.0, 1.0, 2.0, 3.0, 4.0])
    cosines = np.array([0.1, 0.2, 0.1, 0.2, 0.3, 0.4])
    rider = np.array([True, True, False, False, False, False])
    aucs = detection_aucs(norms, cosines, rider)
    assert aucs["norm_auc"] == pytest.approx(1.0)
    assert aucs["cosine_auc"] == pytest.approx(0.75)
    assert detection_aucs(norms, cosines, ~rider)["norm_auc"] == pytest.approx(0.0)
    none = detection_aucs(norms, cosines, np.zeros(6, dtype=bool))
    assert none == {"norm_auc": None, "cosine_auc": None, "n_free_rider_rows": 0, "n_rows": 6}


def test_collector_records_only_the_last_rounds_and_no_ids() -> None:
    users, deltas = _batch()
    collector = DetectionCollector(from_round=10)
    hook = make_free_rider_hook(RIDERS, "zero", 0, collector=collector, clip_norm=1.0)
    for round_index in (8, 9, 10, 11):
        hook(users, deltas, FLAT, round_index)
    norms, cosines, rider = collector.arrays()
    assert norms.shape == cosines.shape == rider.shape == (24,)
    assert int(rider.sum()) == 6
    assert norms[rider].max() == 0.0
    assert detection_aucs(norms, cosines, rider)["norm_auc"] == pytest.approx(1.0)
    assert collector.arrays()[0].dtype == np.float64
