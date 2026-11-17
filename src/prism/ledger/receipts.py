"""Canonical receipt bytes (RFC 8785) and Ed25519 signing via the `cryptography` package."""

from __future__ import annotations

import math
from collections.abc import Mapping
from pathlib import Path
from typing import Any

import rfc8785
from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import (
    Ed25519PrivateKey,
    Ed25519PublicKey,
)


def _check_finite(obj: Any) -> None:
    if isinstance(obj, float) and not math.isfinite(obj):
        raise ValueError("non-finite number in receipt")
    if isinstance(obj, Mapping):
        for v in obj.values():
            _check_finite(v)
    elif isinstance(obj, list | tuple):
        for v in obj:
            _check_finite(v)


def canonical_bytes(obj: Mapping[str, Any]) -> bytes:
    """Serialise a receipt to RFC 8785 canonical JSON bytes; NaN or infinity raises ValueError."""
    _check_finite(obj)
    try:
        return rfc8785.dumps(dict(obj))
    except (rfc8785.CanonicalizationError, TypeError) as exc:
        raise ValueError(f"receipt is not canonicalisable: {exc}") from exc


def generate_key() -> Ed25519PrivateKey:
    """Create a fresh Ed25519 private key."""
    return Ed25519PrivateKey.generate()


def load_or_create_key(path: Path) -> Ed25519PrivateKey:
    """Load an unencrypted PKCS8 PEM key, creating it (and parent folders) if absent."""
    if path.exists():
        loaded = serialization.load_pem_private_key(path.read_bytes(), password=None)
        if not isinstance(loaded, Ed25519PrivateKey):
            raise ValueError("key file does not hold an Ed25519 private key")
        return loaded
    key = generate_key()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(
        key.private_bytes(
            serialization.Encoding.PEM,
            serialization.PrivateFormat.PKCS8,
            serialization.NoEncryption(),
        )
    )
    return key


def public_key_hex(key: Ed25519PrivateKey) -> str:
    """Return the raw 32-byte public key as lowercase hex."""
    raw = key.public_key().public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw)
    return raw.hex()


def sign(key: Ed25519PrivateKey, payload: bytes) -> str:
    """Return the Ed25519 signature over `payload` as hex."""
    return key.sign(payload).hex()


def verify(public_hex: str, payload: bytes, signature_hex: str) -> bool:
    """Return True iff the signature is valid; malformed inputs give False, never an error."""
    try:
        Ed25519PublicKey.from_public_bytes(bytes.fromhex(public_hex)).verify(
            bytes.fromhex(signature_hex), payload
        )
    except (InvalidSignature, ValueError):
        return False
    return True
