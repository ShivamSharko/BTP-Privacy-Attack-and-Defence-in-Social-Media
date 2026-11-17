"""Device availability traces: restricted loading, active share, lookups and schedules."""

from __future__ import annotations

import collections
import os
import pickle
import time
from pathlib import Path
from typing import Any

import numpy as np
import pytest

from prism.data.traces import (
    TRACE_FILE,
    DeviceTrace,
    active_share,
    assign_devices,
    availability_schedule,
    is_active,
    load_device_traces,
    trace_summary,
)


def _entry(active: list[int], inactive: list[int], finish: int, model: str = "m") -> dict[str, Any]:
    return {
        "duration": finish,
        "inactive": inactive,
        "finish_time": finish,
        "active": active,
        "model": model,
    }


def _write(path: Path, entries: dict[int, dict[str, Any]]) -> Path:
    with open(path, "wb") as handle:
        pickle.dump(collections.OrderedDict(entries), handle)
    return path


def _trace(starts: list[int], ends: list[int], finish: int) -> DeviceTrace:
    return DeviceTrace(np.array(starts, dtype=np.int64), np.array(ends, dtype=np.int64), finish)


def test_trace_file_location_is_under_external() -> None:
    assert Path("data/external/fedscale/client_behave_trace") == TRACE_FILE


def test_loader_reads_the_expected_shape_and_drops_bad_devices(tmp_path: Path) -> None:
    path = _write(
        tmp_path / "trace",
        {
            7: _entry([0, 100], [50, 200], 1000, model="secret-model"),
            3: _entry([10], [20], 500),
            4: _entry([], [], 500),  # no interval: dropped
            5: _entry([1], [2], 0),  # finish_time 0: dropped
        },
    )
    traces = load_device_traces(path)
    assert len(traces) == 2
    first = traces[0]
    assert first.starts.dtype == np.int64 and first.ends.dtype == np.int64
    assert first.starts.tolist() == [0, 100] and first.ends.tolist() == [50, 200]
    assert first.finish_time == 1000
    assert not hasattr(first, "model")
    assert all("model" not in vars(t) for t in traces if hasattr(t, "__dict__"))


@pytest.mark.parametrize(
    "bad",
    [
        _entry([5], [3], 100),  # active > inactive
        _entry([0, 10], [20, 30], 100),  # overlapping
        _entry([10, 0], [20, 5], 100),  # unsorted
        _entry([0, 1], [5], 100),  # unequal lengths
    ],
)
def test_loader_rejects_malformed_intervals(tmp_path: Path, bad: dict[str, Any]) -> None:
    path = _write(tmp_path / "trace", {0: bad})
    with pytest.raises(ValueError):
        load_device_traces(path)


def test_loader_rejects_wrong_types(tmp_path: Path) -> None:
    with open(tmp_path / "list", "wb") as handle:
        pickle.dump([1, 2, 3], handle)
    with pytest.raises(ValueError):
        load_device_traces(tmp_path / "list")
    bad = _entry([0], [5], 100)
    bad["active"] = "oops"
    with pytest.raises(ValueError):
        load_device_traces(_write(tmp_path / "trace", {0: bad}))


class _Evil:
    def __reduce__(self) -> tuple[Any, ...]:
        return (os.system, ("echo should-never-run > evil_marker.txt",))


def test_malicious_pickle_is_refused_without_executing(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.chdir(tmp_path)
    with open(tmp_path / "evil", "wb") as handle:
        pickle.dump(_Evil(), handle)
    with pytest.raises(pickle.UnpicklingError):
        load_device_traces(tmp_path / "evil")
    assert not (tmp_path / "evil_marker.txt").exists()


def test_custom_class_and_nested_global_are_refused(tmp_path: Path) -> None:
    with open(tmp_path / "custom", "wb") as handle:
        pickle.dump(collections.OrderedDict({0: _trace([0], [1], 5)}), handle)
    with pytest.raises(pickle.UnpicklingError):
        load_device_traces(tmp_path / "custom")
    nested = collections.OrderedDict({0: {"model": _Evil()}})
    with open(tmp_path / "nested", "wb") as handle:
        pickle.dump(nested, handle)
    with pytest.raises(pickle.UnpicklingError):
        load_device_traces(tmp_path / "nested")


def test_active_share_and_clipping() -> None:
    assert active_share(_trace([0, 50], [10, 60], 100)) == pytest.approx(0.2)
    assert active_share(_trace([0], [100], 100)) == 1.0
    # intervals running past the trace length are clipped
    assert active_share(_trace([90], [500], 100)) == pytest.approx(0.1)
    assert 0.0 <= active_share(_trace([0], [1000], 100)) <= 1.0


def test_is_active_boundaries_and_wraparound() -> None:
    trace = _trace([10, 50], [20, 60], 100)
    assert is_active(trace, 10) is True  # start is inclusive
    assert is_active(trace, 19) is True
    assert is_active(trace, 20) is False  # end is exclusive
    assert is_active(trace, 9) is False
    assert is_active(trace, 55) is True
    assert is_active(trace, 60) is False
    assert is_active(trace, 110) is True  # 110 % 100 == 10
    assert is_active(trace, 1000 + 55) is True
    assert is_active(trace, 99) is False
    assert is_active(trace, 0) is False


def test_assign_devices_without_replacement_when_enough() -> None:
    rng = np.random.default_rng(0)
    out = assign_devices(50, 80, rng)
    assert out.dtype == np.int64 and out.shape == (50,)
    assert len(set(out.tolist())) == 50 and out.min() >= 0 and out.max() < 80
    again = assign_devices(50, 80, np.random.default_rng(0))
    assert np.array_equal(out, again)
    few = assign_devices(50, 8, np.random.default_rng(0))
    assert few.shape == (50,) and few.max() < 8


def _reference_schedule(
    traces: list[DeviceTrace], devices: np.ndarray, offsets: np.ndarray, rounds: int, spr: int
) -> np.ndarray:
    out = np.zeros((rounds, devices.size), dtype=bool)
    for r in range(rounds):
        for u in range(devices.size):
            out[r, u] = is_active(traces[int(devices[u])], int(offsets[u]) + r * spr)
    return out


def _random_traces(n: int, seed: int) -> list[DeviceTrace]:
    rng = np.random.default_rng(seed)
    traces = []
    for _ in range(n):
        finish = int(rng.integers(1000, 5000))
        cuts = np.sort(rng.integers(0, finish, size=2 * int(rng.integers(1, 6))))
        traces.append(DeviceTrace(cuts[0::2].astype(np.int64), cuts[1::2].astype(np.int64), finish))
    return traces


def test_schedule_matches_slow_reference() -> None:
    traces = _random_traces(12, 1)
    rng = np.random.default_rng(2)
    devices = rng.integers(0, 12, size=30).astype(np.int64)
    offsets = np.array([rng.integers(0, traces[d].finish_time) for d in devices], dtype=np.int64)
    got = availability_schedule(traces, devices, offsets, rounds=40, seconds_per_round=137)
    assert got.dtype == np.bool_ and got.shape == (40, 30)
    assert np.array_equal(got, _reference_schedule(traces, devices, offsets, 40, 137))


def test_schedule_is_fast_at_full_size() -> None:
    traces = _random_traces(50, 3)
    rng = np.random.default_rng(4)
    devices = rng.integers(0, 50, size=9913).astype(np.int64)
    offsets = np.array([rng.integers(0, traces[d].finish_time) for d in devices], dtype=np.int64)
    started = time.time()
    out = availability_schedule(traces, devices, offsets, rounds=400, seconds_per_round=1800)
    assert out.shape == (400, 9913)
    assert time.time() - started < 10.0


def test_trace_summary_is_aggregate_only() -> None:
    traces = [_trace([0], [50], 100), _trace([0], [100], 300), _trace([0], [30], 200)]
    summary = trace_summary(traces)
    assert set(summary) == {
        "devices", "mean_active_share", "median_active_share", "median_finish_time"
    }  # fmt: skip
    assert summary["devices"] == 3
    assert summary["mean_active_share"] == pytest.approx((0.5 + 1 / 3 + 0.15) / 3)
    assert summary["median_active_share"] == pytest.approx(1 / 3)
    assert summary["median_finish_time"] == 200
