"""Tests for the pairwise-mask secure sum simulation."""

from __future__ import annotations

import inspect

import numpy as np
import pytest
from hypothesis import given, settings
from hypothesis import strategies as st
from numpy.typing import NDArray
from scipy import stats

from prism.fl.secagg import (
    FixedPoint,
    SecAggClient,
    SecAggServer,
    secure_sum,
)

CLIP = 1.0


def _random_updates(rng: np.random.Generator, n: int, d: int) -> NDArray[np.float64]:
    return rng.uniform(-CLIP, CLIP, size=(n, d)) / np.sqrt(d)


@st.composite
def _scenario(draw: st.DrawFn) -> tuple[int, int, list[int], int]:
    n = draw(st.integers(2, 8))
    d = draw(st.integers(1, 64))
    dropped = draw(st.lists(st.integers(0, n - 1), unique=True, max_size=n - 2))
    seed = draw(st.integers(0, 2**32 - 1))
    return n, d, dropped, seed


@settings(max_examples=40, deadline=None)
@given(_scenario())
def test_secure_sum_matches_plaintext_sum_of_survivors(
    scenario: tuple[int, int, list[int], int],
) -> None:
    n, d, dropped, seed = scenario
    rng = np.random.default_rng(seed)
    updates = _random_updates(rng, n, d)
    result = secure_sum(updates, CLIP, round_id=seed % 1000, dropped=dropped)
    keep = [i for i in range(n) if i not in dropped]
    expected = updates[keep].sum(axis=0)
    assert result.survivors == len(keep)
    assert np.max(np.abs(result.total - expected)) <= len(keep) * CLIP * 2.0**-32


def test_single_masked_payload_looks_uniform_and_uncorrelated() -> None:
    rng = np.random.default_rng(0)
    d = 20_000
    codec = FixedPoint(CLIP)
    clients = [SecAggClient(i) for i in range(3)]
    peers = {c_.client_id: c_.public_bytes for c_ in clients}
    update = rng.uniform(-CLIP, CLIP, size=d) / np.sqrt(d)
    masked = clients[0].masked_update(update, peers, round_id=7, codec=codec)
    unit = masked.payload.astype(np.float64) / 2.0**64
    assert stats.kstest(unit, "uniform").pvalue > 0.001
    corr = abs(np.corrcoef(masked.payload.astype(np.float64), update)[0, 1])
    assert corr < 0.05


def test_dropout_without_unmask_gives_wrong_sum_and_server_takes_no_plaintext() -> None:
    rng = np.random.default_rng(1)
    n, d, round_id = 4, 16, 3
    codec = FixedPoint(CLIP)
    clients = [SecAggClient(i) for i in range(n)]
    peers = {c_.client_id: c_.public_bytes for c_ in clients}
    updates = _random_updates(rng, n, d)
    dropped = 3
    server = SecAggServer(codec, round_id, d)
    for i in range(n - 1):
        server.receive(clients[i].masked_update(updates[i], peers, round_id, codec))
    wrong = server.unmask({})
    truth = updates[: n - 1].sum(axis=0)
    assert np.max(np.abs(wrong - truth)) > 1e-3
    revealed = {
        (i, dropped): clients[i].reveal_seed(dropped, peers[dropped], round_id)
        for i in range(n - 1)
    }
    right = server.unmask(revealed)
    assert np.max(np.abs(right - truth)) <= (n - 1) * CLIP * 2.0**-32
    public = [name for name, _ in inspect.getmembers(SecAggServer) if not name.startswith("_")]
    assert sorted(public) == ["receive", "unmask"]
    params = list(inspect.signature(SecAggServer.receive).parameters)
    assert params == ["self", "masked"]


def test_reveal_seed_is_symmetric() -> None:
    a, b = SecAggClient(1), SecAggClient(2)
    assert a.reveal_seed(2, b.public_bytes, 5) == b.reveal_seed(1, a.public_bytes, 5)
    assert a.reveal_seed(2, b.public_bytes, 5) != a.reveal_seed(2, b.public_bytes, 6)


def test_encode_guard_rejects_out_of_range_and_non_finite() -> None:
    codec = FixedPoint(1.0)
    with pytest.raises(ValueError):
        codec.encode(np.array([0.5, 1.01]))
    with pytest.raises(ValueError):
        codec.encode(np.array([np.nan]))
    with pytest.raises(ValueError):
        codec.encode(np.array([np.inf]))
    codec.encode(np.array([1.0 + 5e-7, -1.0]))  # within tolerance


def test_fixed_point_roundtrip_negative_values() -> None:
    codec = FixedPoint(2.0)
    v = np.array([-1.5, 0.0, 0.25, 2.0])
    out = codec.decode_sum(codec.encode(v))
    assert np.allclose(out, v, atol=2.0 * 2.0**-32)


def test_client_count_guard() -> None:
    too_many = np.zeros((2**20 + 1, 1))
    with pytest.raises(ValueError):
        secure_sum(too_many, CLIP, round_id=0)


def test_bad_dropped_ids_raise() -> None:
    updates = np.zeros((3, 2))
    with pytest.raises(ValueError):
        secure_sum(updates, CLIP, 0, dropped=[5])
    with pytest.raises(ValueError):
        secure_sum(updates, CLIP, 0, dropped=[0, 1, 2])


def test_server_rejects_wrong_length_and_duplicates() -> None:
    codec = FixedPoint(CLIP)
    clients = [SecAggClient(i) for i in range(2)]
    peers = {c_.client_id: c_.public_bytes for c_ in clients}
    server = SecAggServer(codec, 0, 4)
    m = clients[0].masked_update(np.zeros(4), peers, 0, codec)
    server.receive(m)
    with pytest.raises(ValueError):
        server.receive(m)
    short = clients[1].masked_update(np.zeros(3), peers, 0, codec)
    with pytest.raises(ValueError):
        server.receive(short)


def test_result_reports_bytes_and_seconds() -> None:
    result = secure_sum(np.zeros((3, 10)), CLIP, 0)
    assert result.bytes_per_client >= 10 * 8
    assert result.seconds >= 0.0
