"""Atomic file writes: a reader never sees a half-written result.

Each write goes to a temporary file in the target's directory, is flushed and
synced, and is then moved over the target with ``os.replace``. If anything
fails, the temporary file is removed and any previous target is left untouched.
"""

from __future__ import annotations

import contextlib
import json
import os
from pathlib import Path
from typing import Any

import numpy as np
import numpy.typing as npt


def _temporary(path: Path) -> Path:
    return path.with_name(f"{path.name}.tmp{os.getpid()}")


def _replace(temporary: Path, path: Path) -> None:
    try:
        os.replace(temporary, path)
    except BaseException:
        with contextlib.suppress(OSError):
            temporary.unlink()
        raise


def atomic_write_text(path: Path, text: str) -> None:
    """Write text atomically with LF line endings."""
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = _temporary(path)
    with open(temporary, "w", encoding="utf-8", newline="\n") as handle:
        handle.write(text)
        handle.flush()
        os.fsync(handle.fileno())
    _replace(temporary, path)


def atomic_write_json(path: Path, payload: Any) -> None:
    """Write sorted, indented JSON atomically. NaN and infinity are rejected."""
    text = json.dumps(payload, indent=2, sort_keys=True, allow_nan=False) + "\n"
    atomic_write_text(path, text)


def atomic_write_npz(path: Path, **arrays: npt.NDArray[Any]) -> None:
    """Write a compressed NPZ archive atomically."""
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = _temporary(path)
    with open(temporary, "wb") as handle:
        np.savez_compressed(handle, **arrays)  # type: ignore[arg-type]
        handle.flush()
        os.fsync(handle.fileno())
    _replace(temporary, path)


def read_json(path: Path) -> Any:
    """Read a JSON file written by ``atomic_write_json``."""
    return json.loads(path.read_text(encoding="utf-8"))
