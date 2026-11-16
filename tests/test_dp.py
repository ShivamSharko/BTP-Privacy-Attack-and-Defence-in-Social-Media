"""Tests for clipping and privacy accounting."""

from __future__ import annotations

import numpy as np
import pytest

from prism.privacy.dp import calibrate_noise, clip_l2, privacy_epsilon, target_delta


def test_clip_caps_norm_and_preserves_direction() -> None:
    vector = np.array([3.0, 4.0], dtype=np.float32)
    clipped = clip_l2(vector, 1.0)
    assert float(np.linalg.norm(clipped)) == pytest.approx(1.0, rel=1e-5)
    assert clipped[0] / clipped[1] == pytest.approx(0.75, rel=1e-5)


def test_clip_leaves_small_vectors_unchanged() -> None:
    vector = np.array([0.3, 0.4], dtype=np.float32)
    assert np.array_equal(clip_l2(vector, 1.0), vector)


def test_clip_handles_zero_vector() -> None:
    vector = np.zeros(4, dtype=np.float32)
    assert np.array_equal(clip_l2(vector, 1.0), vector)


def test_clip_rejects_nonpositive_norm() -> None:
    with pytest.raises(ValueError):
        clip_l2(np.ones(2, dtype=np.float32), 0.0)


def test_target_delta_scales_with_population() -> None:
    assert target_delta(1000) == pytest.approx(1e-4)
    with pytest.raises(ValueError):
        target_delta(0)


def test_no_noise_means_infinite_epsilon() -> None:
    assert privacy_epsilon(0.1, 0.0, 5, 1e-5) == float("inf")


def test_more_noise_means_less_epsilon() -> None:
    loose = privacy_epsilon(0.1, 1.0, 5, 1e-5)
    tight = privacy_epsilon(0.1, 4.0, 5, 1e-5)
    assert tight < loose


def test_subsampling_amplifies_privacy() -> None:
    full = privacy_epsilon(1.0, 1.0, 5, 1e-5)
    subsampled = privacy_epsilon(0.01, 1.0, 5, 1e-5)
    assert subsampled < full


def test_rdp_is_an_upper_bound_on_prv() -> None:
    prv = privacy_epsilon(0.1, 1.0, 5, 1e-5, "prv")
    rdp = privacy_epsilon(0.1, 1.0, 5, 1e-5, "rdp")
    assert rdp >= prv - 1e-6


def test_calibration_meets_target() -> None:
    delta = 1e-5
    noise = calibrate_noise(0.1, 5, delta, 8.0)
    assert privacy_epsilon(0.1, noise, 5, delta) <= 8.0


def test_unknown_mechanism_rejected() -> None:
    with pytest.raises(ValueError):
        privacy_epsilon(0.1, 1.0, 5, 1e-5, "magic")
