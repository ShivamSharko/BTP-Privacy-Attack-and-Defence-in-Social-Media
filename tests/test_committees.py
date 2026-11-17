"""Committee-median aggregation: the third mode between secure sum and plaintext robust rules."""

from __future__ import annotations

import numpy as np
import pytest
import torch

from prism.attacks.poisoning import clean_committee_share, make_committee_median


def _rows(n: int, p: int = 6) -> torch.Tensor:
    gen = torch.Generator().manual_seed(0)
    return torch.randn(n, p, generator=gen)


def test_exactly_one_of_the_two_sizes_is_required() -> None:
    with pytest.raises(ValueError):
        make_committee_median()
    with pytest.raises(ValueError):
        make_committee_median(n_committees=3, committee_size=4)
    with pytest.raises(ValueError):
        make_committee_median(n_committees=0)


def test_identical_committee_sums_give_the_plain_sum() -> None:
    row = torch.arange(6, dtype=torch.float32)
    deltas = row.repeat(12, 1)
    out = make_committee_median(n_committees=4)(deltas, np.random.default_rng(0))
    assert torch.allclose(out, deltas.sum(dim=0).to(torch.float64))
    out = make_committee_median(committee_size=3)(deltas, np.random.default_rng(0))
    assert torch.allclose(out, deltas.sum(dim=0).to(torch.float64))


def test_minority_of_poisoned_committees_is_ignored() -> None:
    honest = torch.ones(36, 4)
    deltas = torch.cat([honest, torch.full((4, 4), 1000.0)])
    # 10 committees of 4; poison sits in at most 4 of them, so the median is honest-like
    out = make_committee_median(committee_size=4)(deltas, np.random.default_rng(1))
    assert out.max() < 100.0 * 40


def test_poison_in_a_majority_of_committees_wins() -> None:
    deltas = torch.cat([torch.ones(4, 3), torch.full((36, 3), 1000.0)])
    out = make_committee_median(committee_size=4)(deltas, np.random.default_rng(1))
    assert float(out.min()) > 1000.0


def test_deterministic_for_an_rng_state_and_dtype_shape() -> None:
    deltas = _rows(30)
    aggregator = make_committee_median(n_committees=5)
    a = aggregator(deltas, np.random.default_rng(7))
    b = aggregator(deltas, np.random.default_rng(7))
    assert torch.equal(a, b)
    assert a.dtype == torch.float64 and a.shape == (6,)
    other = aggregator(deltas, np.random.default_rng(8))
    assert not torch.equal(a, other)


def test_unequal_committees_and_even_count_use_all_clients() -> None:
    deltas = _rows(23)
    out = make_committee_median(n_committees=4)(deltas, np.random.default_rng(0))
    assert out.shape == (6,) and torch.isfinite(out).all()


def test_tiny_cohort_falls_back_to_the_plain_sum() -> None:
    deltas = _rows(5)
    expected = deltas.sum(dim=0).to(torch.float64)
    for aggregator in (
        make_committee_median(committee_size=20),
        make_committee_median(n_committees=1),
    ):
        out = aggregator(deltas, np.random.default_rng(0))
        assert out.dtype == torch.float64
        assert torch.allclose(out, expected)
    empty = make_committee_median(n_committees=3)(torch.zeros(0, 6), np.random.default_rng(0))
    assert empty.shape == (6,) and float(empty.abs().sum()) == 0.0


def test_committee_count_from_size_rounds() -> None:
    deltas = torch.ones(198, 2)
    out = make_committee_median(committee_size=4)(deltas, np.random.default_rng(0))
    # 50 committees of 3 or 4 clients: the median sum is 4 and is scaled by 50
    assert float(out[0]) == pytest.approx(200.0)


def test_clean_committee_share() -> None:
    assert clean_committee_share(0.1, 4) == pytest.approx(0.9**4)
    assert clean_committee_share(0.0, 20) == 1.0
    assert clean_committee_share(0.3, 20) == pytest.approx(0.7**20)
    assert clean_committee_share(1.0, 4) == 0.0
