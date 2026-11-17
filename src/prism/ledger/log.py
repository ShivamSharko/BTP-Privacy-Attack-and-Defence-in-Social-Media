"""Append-only JSONL ledger of receipts with signed Merkle checkpoints."""

from __future__ import annotations

import base64
import json
import os
import re
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from prism.ledger.merkle import inclusion_proof, merkle_root
from prism.ledger.receipts import canonical_bytes, sign, verify

_HEX = re.compile(r"[0-9a-f]+")


def _note(origin: str, size: int, root: bytes) -> bytes:
    """C2SP tlog-checkpoint body."""
    return f"{origin}\n{size}\n{base64.b64encode(root).decode('ascii')}\n".encode()


def _dumps(obj: Mapping[str, Any]) -> str:
    return json.dumps(obj, separators=(",", ":"), sort_keys=True, ensure_ascii=True)


def _is_hex(value: object, length: int) -> bool:
    return isinstance(value, str) and len(value) == length and _HEX.fullmatch(value) is not None


@dataclass(frozen=True)
class _Parsed:
    leaves: list[dict[str, Any]]
    checkpoints: list[tuple[int, dict[str, Any]]]  # (leaf count when written, line)
    errors: list[str]


def _parse(path: Path) -> _Parsed:
    """Read a ledger file strictly; every structural problem becomes an error string."""
    leaves: list[dict[str, Any]] = []
    checkpoints: list[tuple[int, dict[str, Any]]] = []
    errors: list[str] = []
    try:
        raw = path.read_bytes()
    except OSError as exc:
        return _Parsed([], [], [f"cannot read ledger: {exc}"])
    if raw and not raw.endswith(b"\n"):
        errors.append("file does not end with a newline (truncated write)")
    for n, chunk in enumerate(raw.split(b"\n")[:-1] if raw.endswith(b"\n") else raw.split(b"\n")):
        if not raw:
            break
        try:
            line = json.loads(chunk.decode("utf-8"))
        except (UnicodeDecodeError, ValueError):
            errors.append(f"line {n}: not valid UTF-8 JSON")
            continue
        if not isinstance(line, dict):
            errors.append(f"line {n}: not a JSON object")
            continue
        if _dumps(line).encode() != chunk:
            errors.append(f"line {n}: not in canonical line form")
            continue
        kind = line.get("type")
        if kind == "leaf":
            if set(line) != {"type", "index", "receipt"} or not isinstance(line["receipt"], dict):
                errors.append(f"line {n}: malformed leaf")
            elif line["index"] != len(leaves) or isinstance(line["index"], bool):
                errors.append(f"line {n}: leaf index {line['index']!r}, expected {len(leaves)}")
            else:
                leaves.append(line["receipt"])
        elif kind == "checkpoint":
            keys = {"type", "origin", "size", "root_hex", "signature_hex"}
            if set(line) != keys or not isinstance(line["origin"], str):
                errors.append(f"line {n}: malformed checkpoint")
            else:
                checkpoints.append((len(leaves), line))
        else:
            errors.append(f"line {n}: unknown line type {kind!r}")
    return _Parsed(leaves, checkpoints, errors)


def _write_line(path: Path, line: Mapping[str, Any]) -> None:
    data = (_dumps(line) + "\n").encode("utf-8")
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("ab") as fh:
        fh.write(data)
        fh.flush()
        os.fsync(fh.fileno())


class Ledger:
    """Append-only ledger file: receipts as leaves, signed Merkle roots as checkpoints."""

    def __init__(self, path: Path, key: Ed25519PrivateKey, origin: str) -> None:
        """Open an existing ledger or start an empty one; a corrupt file raises ValueError."""
        self._path = path
        self._key = key
        self._origin = origin
        if path.exists():
            parsed = _parse(path)
            if parsed.errors:
                raise ValueError(f"corrupt ledger {path.name}: {parsed.errors[0]}")
            self._receipts = parsed.leaves
        else:
            self._receipts = []
        self._leaf_bytes = [canonical_bytes(r) for r in self._receipts]

    @property
    def size(self) -> int:
        """Number of leaves."""
        return len(self._receipts)

    def append(self, receipt: Mapping[str, Any]) -> int:
        """Append a receipt as a leaf and return its index."""
        data = canonical_bytes(receipt)  # validates before anything is written
        index = len(self._receipts)
        _write_line(self._path, {"type": "leaf", "index": index, "receipt": dict(receipt)})
        self._receipts.append(json.loads(data))
        self._leaf_bytes.append(data)
        return index

    def root(self) -> bytes:
        """Merkle root over all leaves."""
        return merkle_root(self._leaf_bytes)

    def checkpoint(self) -> dict[str, Any]:
        """Append and return a signed checkpoint over the current tree."""
        root = self.root()
        line: dict[str, Any] = {
            "type": "checkpoint",
            "origin": self._origin,
            "size": self.size,
            "root_hex": root.hex(),
            "signature_hex": sign(self._key, _note(self._origin, self.size, root)),
        }
        _write_line(self._path, line)
        return line

    def leaves(self) -> list[dict[str, Any]]:
        """Receipts in order."""
        return [dict(r) for r in self._receipts]


@dataclass(frozen=True)
class VerifyReport:
    """Outcome of verifying a ledger file; `size` is the leaf count under the last checkpoint."""

    ok: bool
    size: int
    checkpoints: int
    errors: tuple[str, ...]


def verify_ledger(path: Path, public_hex: str) -> VerifyReport:
    """Check line structure, leaf order, every checkpoint root and signature, and coverage."""
    parsed = _parse(path)
    errors = list(parsed.errors)
    leaf_bytes: list[bytes] = []
    for i, receipt in enumerate(parsed.leaves):
        try:
            leaf_bytes.append(canonical_bytes(receipt))
        except ValueError as exc:
            errors.append(f"leaf {i}: {exc}")
    covered = 0
    good = 0
    if len(leaf_bytes) == len(parsed.leaves):
        for count, cp in parsed.checkpoints:
            size = cp["size"]
            if isinstance(size, bool) or not isinstance(size, int) or size != count:
                errors.append(f"checkpoint size {size!r} does not match {count} leaves before it")
                continue
            if not _is_hex(cp["root_hex"], 64) or not _is_hex(cp["signature_hex"], 128):
                errors.append("checkpoint root or signature is not lowercase hex")
                continue
            root = merkle_root(leaf_bytes[:size])
            if cp["root_hex"] != root.hex():
                errors.append(f"checkpoint at size {size}: root does not match leaves")
                continue
            if not verify(public_hex, _note(cp["origin"], size, root), cp["signature_hex"]):
                errors.append(f"checkpoint at size {size}: bad signature")
                continue
            good += 1
            covered = size
    if len(parsed.leaves) != covered and not errors:
        errors.append(f"{len(parsed.leaves) - covered} leaves after the last checkpoint")
    return VerifyReport(not errors, covered, good, tuple(errors))


def prove_inclusion(path: Path, index: int) -> dict[str, Any]:
    """Return leaf, index, size, hex inclusion proof and hex root for a leaf in the file."""
    parsed = _parse(path)
    if parsed.errors:
        raise ValueError(f"corrupt ledger: {parsed.errors[0]}")
    data = [canonical_bytes(r) for r in parsed.leaves]
    proof = inclusion_proof(index, data)
    return {
        "leaf": parsed.leaves[index],
        "index": index,
        "size": len(data),
        "proof": [h.hex() for h in proof],
        "root": merkle_root(data).hex(),
    }
