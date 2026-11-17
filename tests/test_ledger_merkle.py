"""Merkle tree tests: RFC 6962 known answers, hand-built trees and property tests.

Known-answer vectors (eight leaf inputs, all root hashes for sizes 0..8, node hashes) come from
https://raw.githubusercontent.com/transparency-dev/merkle/main/testonly/constants.go
(transparency-dev/merkle, Apache-2.0, RFC 6962 hashing with SHA-256).
"""

from __future__ import annotations

import hashlib

import pytest
from hypothesis import given
from hypothesis import strategies as st

from prism.ledger.merkle import (
    consistency_proof,
    inclusion_proof,
    leaf_hash,
    merkle_root,
    node_hash,
    verify_consistency,
    verify_inclusion,
)

LEAVES = [
    bytes.fromhex(h)
    for h in (
        "",
        "00",
        "10",
        "2021",
        "3031",
        "40414243",
        "5051525354555657",
        "606162636465666768696a6b6c6d6e6f",
    )
]
ROOTS = [
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    "6e340b9cffb37a989ca544e6bb780a2c78901d3fb33738768511a30617afa01d",
    "fac54203e7cc696cf0dfcb42c92a1d9dbaf70ad9e621f4bd8d98662f00e3c125",
    "aeb6bcfe274b70a14fb067a5e5578264db0fa9b51af5e0ba159158f329e06e77",
    "d37ee418976dd95753c1c73862b9398fa2a2cf9b4ff0fdfe8b30cd95209614b7",
    "4e3bbb1f7b478dcfe71fb631631519a3bca12c9aefca1612bfce4c13a86264d4",
    "76e67dadbcdf1e10e1b74ddc608abd2f98dfb16fbce75277b5232a127f2087ef",
    "ddb89be403809e325750d3d263cd78929c2942b7942a34b77e122c9594a74c8c",
    "5dc9da79a70659a9ad559cb701ded9a2ab9d823aad2f4960cfe370eff4604328",
]
H = bytes.fromhex


def test_empty_root_is_sha256_of_nothing() -> None:
    assert merkle_root([]) == hashlib.sha256(b"").digest()


def test_leaf_and_node_domain_separation() -> None:
    assert leaf_hash(b"x") == hashlib.sha256(b"\x00x").digest()
    assert (
        node_hash(b"a" * 32, b"b" * 32) == hashlib.sha256(b"\x01" + b"a" * 32 + b"b" * 32).digest()
    )


@pytest.mark.parametrize("n", range(9))
def test_rfc6962_roots(n: int) -> None:
    assert merkle_root(LEAVES[:n]).hex() == ROOTS[n]


def test_two_leaf_tree_by_hand() -> None:
    a, b = leaf_hash(b"a"), leaf_hash(b"b")
    assert merkle_root([b"a", b"b"]) == node_hash(a, b)
    assert inclusion_proof(0, [b"a", b"b"]) == [b]


def test_three_leaf_tree_by_hand() -> None:
    a, b, c = (leaf_hash(x) for x in (b"a", b"b", b"c"))
    assert merkle_root([b"a", b"b", b"c"]) == node_hash(node_hash(a, b), c)
    assert inclusion_proof(2, [b"a", b"b", b"c"]) == [node_hash(a, b)]


def test_known_inclusion_proofs_size_8() -> None:
    n11 = H("5f083f0a1a33ca076a95279832580db3e0ef4584bdff1f54c8a360f50de3031e")
    n10 = H("fac54203e7cc696cf0dfcb42c92a1d9dbaf70ad9e621f4bd8d98662f00e3c125")
    n21 = H("6b47aaf29ee3c2af9af889bc1fb9254dabd31177f16232dd6aab035ca39bf6e4")
    leaf1 = H("96a296d224f285c67bee93c30f8a309157f0daa35dc5b87e410b78630a09cfc7")
    leaf2 = H("0298d122906dcfc10892cb53a73992fc5b9f493ea4c9badb27b791b4127a7fe7")
    assert inclusion_proof(0, LEAVES) == [leaf1, n11, n21]
    assert inclusion_proof(3, LEAVES) == [leaf2, n10, n21]
    assert inclusion_proof(0, LEAVES) == [leaf1, n11, n21]


def test_known_consistency_proof_4_to_8() -> None:
    n21 = H("6b47aaf29ee3c2af9af889bc1fb9254dabd31177f16232dd6aab035ca39bf6e4")
    assert consistency_proof(4, LEAVES) == [n21]
    assert verify_consistency(4, 8, H(ROOTS[4]), H(ROOTS[8]), [n21])


@pytest.mark.parametrize("m", range(1, 9))
@pytest.mark.parametrize("n", range(1, 9))
def test_vector_consistency_all_pairs(m: int, n: int) -> None:
    if m > n:
        return
    proof = consistency_proof(m, LEAVES[:n])
    assert verify_consistency(m, n, H(ROOTS[m]), H(ROOTS[n]), proof)


def _entries(n: int) -> list[bytes]:
    return [f"entry-{i}".encode() for i in range(n)]


@given(st.integers(1, 64), st.data())
def test_inclusion_roundtrip_and_tamper(n: int, data: st.DataObject) -> None:
    leaves = _entries(n)
    root = merkle_root(leaves)
    i = data.draw(st.integers(0, n - 1))
    proof = inclusion_proof(i, leaves)
    assert verify_inclusion(leaves[i], i, n, proof, root)
    assert not verify_inclusion(b"wrong", i, n, proof, root)
    assert not verify_inclusion(leaves[i], i, n, proof, b"\x00" * 32)
    assert not verify_inclusion(leaves[i], i, 2 * n + 1, proof, root)
    if n > 1:
        assert not verify_inclusion(leaves[i], (i + 1) % n, n, proof, root)


def test_every_index_every_size_verifies() -> None:
    for n in range(1, 65):
        leaves = _entries(n)
        root = merkle_root(leaves)
        for i in range(n):
            assert verify_inclusion(leaves[i], i, n, inclusion_proof(i, leaves), root)


def test_every_consistency_pair_verifies() -> None:
    leaves = _entries(64)
    roots = [merkle_root(leaves[:k]) for k in range(65)]
    for n in range(1, 65):
        for m in range(1, n + 1):
            proof = consistency_proof(m, leaves[:n])
            assert verify_consistency(m, n, roots[m], roots[n], proof)


@given(st.integers(2, 64), st.data())
def test_consistency_tamper(n: int, data: st.DataObject) -> None:
    m = data.draw(st.integers(1, n - 1))
    leaves = _entries(n)
    old, new = merkle_root(leaves[:m]), merkle_root(leaves)
    proof = consistency_proof(m, leaves)
    assert verify_consistency(m, n, old, new, proof)
    assert not verify_consistency(m, n, b"\x01" * 32, new, proof)
    assert not verify_consistency(m, n, old, b"\x01" * 32, proof)
    assert not verify_consistency(m, 2 * n + 1, old, new, proof)
    if proof:
        bad = [bytes([proof[0][0] ^ 1]) + proof[0][1:], *proof[1:]]
        assert not verify_consistency(m, n, old, new, bad)
    assert not verify_consistency(m, n, old, new, [*proof, b"\x00" * 32])


def test_invalid_arguments() -> None:
    leaves = _entries(3)
    with pytest.raises(ValueError):
        inclusion_proof(3, leaves)
    with pytest.raises(ValueError):
        inclusion_proof(-1, leaves)
    with pytest.raises(ValueError):
        consistency_proof(0, leaves)
    with pytest.raises(ValueError):
        consistency_proof(4, leaves)
    assert not verify_inclusion(b"x", 0, 0, [], merkle_root([]))
    assert not verify_inclusion(b"x", 5, 3, [], merkle_root(leaves))
    assert not verify_consistency(0, 3, b"", merkle_root(leaves), [])
    assert not verify_consistency(4, 3, b"", merkle_root(leaves), [])


def test_consistency_equal_sizes_needs_empty_proof_and_equal_roots() -> None:
    leaves = _entries(5)
    root = merkle_root(leaves)
    assert consistency_proof(5, leaves) == []
    assert verify_consistency(5, 5, root, root, [])
    assert not verify_consistency(5, 5, root, b"\x00" * 32, [])
    assert not verify_consistency(5, 5, root, root, [root])
