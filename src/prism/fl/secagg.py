"""Functional simulation of a pairwise-mask secure sum, built only from library primitives.

Each client holds an X25519 key pair. For every peer it derives a shared seed with
HKDF-SHA256 over the X25519 shared secret, expands the seed with a ChaCha20 keystream
(``cryptography`` package) into a vector of uint64 words, and adds or subtracts that mask
modulo 2**64. Masks cancel in the sum over a full cohort. When clients drop, the survivors
reveal their seeds with the dropped clients and the server removes those masks.

Limits of this simulation: there is no secret sharing of keys or seeds, no network and no
authenticated channels, and no double masking. A client that sends its masked update and
then drops would be exposed when survivors reveal seeds with it, because the server could
strip that client's masks. This module models the arithmetic and the byte cost of secure
aggregation; it is not a deployable protocol and gives no security proof.
"""

from __future__ import annotations

import time
from collections.abc import Mapping, Sequence
from dataclasses import dataclass

import numpy as np
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric.x25519 import X25519PrivateKey, X25519PublicKey
from cryptography.hazmat.primitives.ciphers import Cipher
from cryptography.hazmat.primitives.ciphers.algorithms import ChaCha20
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
from numpy.typing import NDArray

MAX_CLIENTS = 2**20
_GUARD = 1e-6
_PUBLIC_KEY_BYTES = 32
_SEED_BYTES = 32


@dataclass(frozen=True)
class FixedPoint:
    """Fixed-point codec mapping [-clip, clip] floats to two's-complement uint64 words."""

    clip_norm: float
    scale_bits: int = 32

    def encode(self, values: NDArray[np.floating]) -> NDArray[np.uint64]:
        """Round values to fixed point; raise ValueError if any is non-finite or beyond clip."""
        v = np.asarray(values, dtype=np.float64)
        if not np.all(np.isfinite(v)):
            raise ValueError("update contains NaN or infinite values")
        if v.size and float(np.max(np.abs(v))) > self.clip_norm * (1.0 + _GUARD):
            raise ValueError("update coordinate exceeds the clip norm")
        scaled = np.rint(v * (2.0**self.scale_bits / self.clip_norm)).astype(np.int64)
        return scaled.view(np.uint64)

    def decode_sum(self, total: NDArray[np.uint64]) -> NDArray[np.float64]:
        """Interpret words as signed two's complement and rescale to floats."""
        signed = np.ascontiguousarray(total, dtype=np.uint64).view(np.int64)
        return signed.astype(np.float64) * (self.clip_norm / 2.0**self.scale_bits)


@dataclass(frozen=True)
class MaskedUpdate:
    """A client's masked fixed-point update."""

    client_id: int
    payload: NDArray[np.uint64]


def _seed(private: X25519PrivateKey, peer_public: bytes, round_id: int, i: int, j: int) -> bytes:
    """Derive the 32-byte pairwise seed for clients i and j in a round."""
    shared = private.exchange(X25519PublicKey.from_public_bytes(peer_public))
    info = f"prism-secagg|{round_id}|{min(i, j)}|{max(i, j)}".encode()
    return HKDF(algorithm=hashes.SHA256(), length=_SEED_BYTES, salt=None, info=info).derive(shared)


def _mask(seed: bytes, length: int) -> NDArray[np.uint64]:
    """Expand a seed into ``length`` little-endian uint64 words (ChaCha20, zero nonce)."""
    encryptor = Cipher(ChaCha20(seed, bytes(16)), mode=None).encryptor()
    stream = encryptor.update(bytes(8 * length))
    return np.frombuffer(stream, dtype="<u8").astype(np.uint64)


class SecAggClient:
    """One participant holding a fresh X25519 key pair and deriving its own masks."""

    def __init__(self, client_id: int) -> None:
        self.client_id = client_id
        self._private = X25519PrivateKey.generate()
        self._public = self._private.public_key().public_bytes(Encoding.Raw, PublicFormat.Raw)

    @property
    def public_bytes(self) -> bytes:
        """Raw 32-byte X25519 public key."""
        return self._public

    def masked_update(
        self,
        update: NDArray[np.floating],
        peers: Mapping[int, bytes],
        round_id: int,
        codec: FixedPoint,
    ) -> MaskedUpdate:
        """Encode the update and add pairwise masks for every peer (own entry is skipped)."""
        if len(peers) > MAX_CLIENTS:
            raise ValueError("too many clients")
        payload = codec.encode(update).copy()
        for peer_id, peer_public in peers.items():
            if peer_id == self.client_id:
                continue
            seed = self.reveal_seed(peer_id, peer_public, round_id)
            mask = _mask(seed, payload.size)
            if self.client_id < peer_id:
                payload += mask
            else:
                payload -= mask
        return MaskedUpdate(self.client_id, payload)

    def reveal_seed(self, peer_id: int, peer_public: bytes, round_id: int) -> bytes:
        """Return the pairwise seed shared with ``peer_id`` for this round."""
        return _seed(self._private, peer_public, round_id, self.client_id, peer_id)


class SecAggServer:
    """Sums masked updates; it never receives or stores a plaintext update."""

    def __init__(self, codec: FixedPoint, round_id: int, length: int) -> None:
        self._codec = codec
        self._round_id = round_id
        self._length = length
        self._total = np.zeros(length, dtype=np.uint64)
        self._received: set[int] = set()

    def receive(self, masked: MaskedUpdate) -> None:
        """Add one masked update to the running modular sum."""
        if masked.client_id in self._received:
            raise ValueError(f"duplicate update from client {masked.client_id}")
        if masked.payload.shape != (self._length,):
            raise ValueError("masked update has the wrong length")
        self._total += masked.payload
        self._received.add(masked.client_id)

    def unmask(self, revealed: Mapping[tuple[int, int], bytes]) -> NDArray[np.float64]:
        """Remove masks of dropped clients (keys are (survivor, dropped)) and decode the sum."""
        total = self._total.copy()
        for (survivor, dropped), seed in revealed.items():
            if survivor not in self._received:
                raise ValueError(f"client {survivor} did not send an update")
            if dropped in self._received:
                raise ValueError(f"client {dropped} sent an update and is not dropped")
            mask = _mask(seed, self._length)
            if survivor < dropped:
                total -= mask
            else:
                total += mask
        return self._codec.decode_sum(total)


@dataclass(frozen=True)
class SecureSumResult:
    """Output of an in-process secure sum run."""

    total: NDArray[np.float64]
    bytes_per_client: int
    seconds: float
    survivors: int


def secure_sum(
    updates: NDArray[np.floating],
    clip_norm: float,
    round_id: int,
    dropped: Sequence[int] = (),
) -> SecureSumResult:
    """Securely sum rows of ``updates`` over survivors, ignoring clients in ``dropped``.

    Each pairwise mask is generated once and applied to both clients (same arithmetic as
    ``SecAggClient``/``SecAggServer``). ``bytes_per_client`` is the upload per survivor:
    masked payload, its public key, and one 32-byte seed per dropped client.
    """
    start = time.perf_counter()
    arr = np.asarray(updates)
    if arr.ndim != 2:
        raise ValueError("updates must be a 2-D array (clients x coordinates)")
    n, length = arr.shape
    if n > MAX_CLIENTS:
        raise ValueError("too many clients")
    drop = set(dropped)
    if any(not 0 <= i < n for i in drop):
        raise ValueError("dropped contains an invalid client index")
    survivors = [i for i in range(n) if i not in drop]
    if not survivors:
        raise ValueError("no surviving clients")

    codec = FixedPoint(clip_norm)
    clients = [SecAggClient(i) for i in range(n)]
    payloads: dict[int, NDArray[np.uint64]] = {i: codec.encode(arr[i]).copy() for i in survivors}
    revealed: dict[tuple[int, int], bytes] = {}
    for i in range(n):
        for j in range(i + 1, n):
            if i in drop and j in drop:
                continue
            seed = clients[i].reveal_seed(j, clients[j].public_bytes, round_id)
            mask = _mask(seed, length)
            if i not in drop:
                payloads[i] += mask
            if j not in drop:
                payloads[j] -= mask
            if i in drop and j not in drop:
                revealed[(j, i)] = seed
            elif j in drop and i not in drop:
                revealed[(i, j)] = seed

    server = SecAggServer(codec, round_id, length)
    for i in survivors:
        server.receive(MaskedUpdate(i, payloads[i]))
    total = server.unmask(revealed)
    per_client = 8 * length + _PUBLIC_KEY_BYTES + _SEED_BYTES * len(drop)
    return SecureSumResult(total, per_client, time.perf_counter() - start, len(survivors))
