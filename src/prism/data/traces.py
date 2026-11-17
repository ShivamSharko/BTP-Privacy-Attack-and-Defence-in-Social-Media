"""Real device availability traces (FedScale ``client_behave_trace``), read safely.

The file is a Python pickle that comes from the internet, so it is NEVER read with
``pickle.load``. :class:`RestrictedUnpickler` resolves exactly one global,
``collections.OrderedDict``, and refuses every other one, so a crafted pickle cannot import
or call anything. Per device only the availability intervals and the trace length are kept;
the device model string is dropped on load.

Each device is available during the intervals ``[start, end)`` (seconds). A trace is read
cyclically: time ``t`` means ``t % finish_time``, the way the source repository wraps it.
The file lives under ``data/`` (git-ignored) and must never be committed.
"""

from __future__ import annotations

import io
import pickle
from collections import OrderedDict
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np
import numpy.typing as npt

TRACE_FILE = Path("data/external/fedscale/client_behave_trace")
"""Location relative to the repository root."""


class RestrictedUnpickler(pickle.Unpickler):
    """Unpickler that only knows ``collections.OrderedDict``."""

    def find_class(self, module: str, name: str) -> Any:
        if (module, name) == ("collections", "OrderedDict"):
            return OrderedDict
        raise pickle.UnpicklingError(f"refusing to load global {module}.{name}")


@dataclass(frozen=True)
class DeviceTrace:
    """Sorted, non-overlapping availability intervals ``[start, end)`` of one device."""

    starts: npt.NDArray[np.int64]
    ends: npt.NDArray[np.int64]
    finish_time: int


def _int_list(value: object, label: str) -> npt.NDArray[np.int64]:
    if not isinstance(value, list) or not all(
        isinstance(v, int) and not isinstance(v, bool) for v in value
    ):
        raise ValueError(f"{label} must be a list of ints")
    return np.asarray(value, dtype=np.int64)


def _parse_device(entry: object) -> DeviceTrace | None:
    """Validate one device entry; None when it has no usable interval."""
    if not isinstance(entry, dict):
        raise ValueError("a device entry must be a dict")
    finish = entry.get("finish_time")
    if not isinstance(finish, int) or isinstance(finish, bool):
        raise ValueError("finish_time must be an int")
    starts = _int_list(entry.get("active"), "active")
    ends = _int_list(entry.get("inactive"), "inactive")
    if starts.size != ends.size:
        raise ValueError("active and inactive must have equal length")
    if np.any(ends < starts):
        raise ValueError("an interval ends before it starts")
    if starts.size > 1 and np.any(starts[1:] < ends[:-1]):
        raise ValueError("intervals must be sorted and non-overlapping")
    keep = ends > starts  # zero-length intervals carry no availability
    if finish <= 0 or not keep.any():
        return None
    return DeviceTrace(starts[keep].copy(), ends[keep].copy(), int(finish))


def load_device_traces(path: Path) -> list[DeviceTrace]:
    """Read the trace file with the restricted unpickler and validate it.

    Devices with ``finish_time <= 0`` or no interval are dropped; the order of the remaining
    devices is the file's. Raises ``pickle.UnpicklingError`` for any other pickled global and
    ``ValueError`` for a structure that is not the documented shape.
    """
    data = Path(path).read_bytes()
    loaded = RestrictedUnpickler(io.BytesIO(data)).load()
    if not isinstance(loaded, dict):
        raise ValueError("the trace file must hold a dict of devices")
    traces: list[DeviceTrace] = []
    for entry in loaded.values():
        trace = _parse_device(entry)
        if trace is not None:
            traces.append(trace)
    return traces


def active_share(trace: DeviceTrace) -> float:
    """Fraction of ``[0, finish_time)`` covered by the intervals, in [0, 1]."""
    finish = trace.finish_time
    covered = np.clip(trace.ends, 0, finish) - np.clip(trace.starts, 0, finish)
    return float(min(max(covered.sum() / finish, 0.0), 1.0))


def is_active(trace: DeviceTrace, t: int) -> bool:
    """Whether the device is available at second ``t`` (wrapped: ``t % finish_time``)."""
    moment = int(t) % trace.finish_time
    index = int(np.searchsorted(trace.starts, moment, side="right")) - 1
    return index >= 0 and moment < int(trace.ends[index])


def assign_devices(n_users: int, n_devices: int, rng: np.random.Generator) -> npt.NDArray[np.int64]:
    """A random device index per user: without replacement when there are enough devices."""
    if n_devices <= 0:
        raise ValueError("there must be at least one device")
    if n_devices >= n_users:
        return rng.permutation(n_devices)[:n_users].astype(np.int64)
    return rng.integers(0, n_devices, size=n_users, dtype=np.int64)


def availability_schedule(
    traces: Sequence[DeviceTrace],
    devices: npt.NDArray[np.int64],
    offsets: npt.NDArray[np.int64],
    rounds: int,
    seconds_per_round: int,
) -> npt.NDArray[np.bool_]:
    """``(rounds, n_users)``: user u is available in round r if its device is active at
    ``offsets[u] + r * seconds_per_round`` (wrapped)."""
    steps = np.arange(rounds, dtype=np.int64) * int(seconds_per_round)
    schedule = np.zeros((rounds, devices.size), dtype=np.bool_)
    for user in range(devices.size):
        trace = traces[int(devices[user])]
        moments = (int(offsets[user]) + steps) % trace.finish_time
        index = np.searchsorted(trace.starts, moments, side="right") - 1
        schedule[:, user] = (index >= 0) & (moments < trace.ends[np.maximum(index, 0)])
    return schedule


def trace_summary(traces: Sequence[DeviceTrace]) -> dict[str, float]:
    """Aggregates only: device count, mean and median active share, median trace length."""
    shares = np.array([active_share(t) for t in traces], dtype=np.float64)
    finish = np.array([t.finish_time for t in traces], dtype=np.float64)
    return {
        "devices": float(len(traces)),
        "mean_active_share": float(shares.mean()),
        "median_active_share": float(np.median(shares)),
        "median_finish_time": float(np.median(finish)),
    }
