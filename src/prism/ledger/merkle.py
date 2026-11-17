"""RFC 6962 / RFC 9162 Merkle tree over SHA-256 with inclusion and consistency proofs."""

from __future__ import annotations

import hashlib
from collections.abc import Sequence


def leaf_hash(data: bytes) -> bytes:
    """Return SHA-256(0x00 || data)."""
    return hashlib.sha256(b"\x00" + data).digest()


def node_hash(left: bytes, right: bytes) -> bytes:
    """Return SHA-256(0x01 || left || right)."""
    return hashlib.sha256(b"\x01" + left + right).digest()


def _split(n: int) -> int:
    """Largest power of two strictly less than n (n >= 2)."""
    return 1 << ((n - 1).bit_length() - 1)


def _root(leaves: Sequence[bytes]) -> bytes:
    n = len(leaves)
    if n == 0:
        return hashlib.sha256(b"").digest()
    if n == 1:
        return leaf_hash(leaves[0])
    k = _split(n)
    return node_hash(_root(leaves[:k]), _root(leaves[k:]))


def merkle_root(leaves: Sequence[bytes]) -> bytes:
    """Return the Merkle tree hash of raw leaf entries (empty tree gives SHA-256 of b"")."""
    return _root(leaves)


def _path(m: int, leaves: Sequence[bytes]) -> list[bytes]:
    n = len(leaves)
    if n == 1:
        return []
    k = _split(n)
    if m < k:
        return [*_path(m, leaves[:k]), _root(leaves[k:])]
    return [*_path(m - k, leaves[k:]), _root(leaves[:k])]


def inclusion_proof(index: int, leaves: Sequence[bytes]) -> list[bytes]:
    """Return the audit path for leaf `index` in the tree over `leaves`."""
    if not 0 <= index < len(leaves):
        raise ValueError("leaf index out of range")
    return _path(index, leaves)


def verify_inclusion(
    leaf: bytes, index: int, tree_size: int, proof: Sequence[bytes], root: bytes
) -> bool:
    """Check an inclusion proof for a raw leaf entry (RFC 9162 section 2.1.3.2)."""
    if not 0 <= index < tree_size:
        return False
    fn, sn = index, tree_size - 1
    r = leaf_hash(leaf)
    for p in proof:
        if sn == 0:
            return False
        if fn & 1 or fn == sn:
            r = node_hash(p, r)
            if not fn & 1:
                while not (fn & 1) and fn != 0:
                    fn >>= 1
                    sn >>= 1
        else:
            r = node_hash(r, p)
        fn >>= 1
        sn >>= 1
    return sn == 0 and r == root


def _subproof(m: int, leaves: Sequence[bytes], complete: bool) -> list[bytes]:
    n = len(leaves)
    if m == n:
        return [] if complete else [_root(leaves)]
    k = _split(n)
    if m <= k:
        return [*_subproof(m, leaves[:k], complete), _root(leaves[k:])]
    return [*_subproof(m - k, leaves[k:], False), _root(leaves[:k])]


def consistency_proof(old_size: int, leaves: Sequence[bytes]) -> list[bytes]:
    """Return the proof that the first `old_size` leaves are a prefix of `leaves`."""
    if not 1 <= old_size <= len(leaves):
        raise ValueError("old_size must satisfy 1 <= old_size <= len(leaves)")
    return _subproof(old_size, leaves, True)


def verify_consistency(
    old_size: int, new_size: int, old_root: bytes, new_root: bytes, proof: Sequence[bytes]
) -> bool:
    """Check a consistency proof between two roots (RFC 9162 section 2.1.4.2)."""
    if old_size < 1 or old_size > new_size:
        return False
    if old_size == new_size:
        return not proof and old_root == new_root
    path = list(proof)
    if old_size & (old_size - 1) == 0:
        path.insert(0, old_root)
    if not path:
        return False
    fn, sn = old_size - 1, new_size - 1
    while fn & 1:
        fn >>= 1
        sn >>= 1
    fr = sr = path[0]
    for c in path[1:]:
        if sn == 0:
            return False
        if fn & 1 or fn == sn:
            fr = node_hash(c, fr)
            sr = node_hash(c, sr)
            if not fn & 1:
                while not (fn & 1) and fn != 0:
                    fn >>= 1
                    sn >>= 1
        else:
            sr = node_hash(sr, c)
        fn >>= 1
        sn >>= 1
    return sn == 0 and fr == old_root and sr == new_root
