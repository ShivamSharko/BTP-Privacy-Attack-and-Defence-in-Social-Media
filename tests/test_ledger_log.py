"""Receipt signing and the append-only ledger file, including tamper detection."""

from __future__ import annotations

import base64
import json
from pathlib import Path

import pytest

from prism.ledger.log import Ledger, prove_inclusion, verify_ledger
from prism.ledger.merkle import merkle_root, verify_inclusion
from prism.ledger.receipts import (
    canonical_bytes,
    generate_key,
    load_or_create_key,
    public_key_hex,
    sign,
    verify,
)

ORIGIN = "prism.test/ledger"


def test_canonical_bytes_sorted_and_compact() -> None:
    assert canonical_bytes({"b": 1, "a": [1, 2]}) == b'{"a":[1,2],"b":1}'
    assert canonical_bytes({"x": 1.0}) == canonical_bytes({"x": 1})


@pytest.mark.parametrize("bad", [float("nan"), float("inf"), float("-inf")])
def test_canonical_bytes_rejects_non_finite(bad: float) -> None:
    with pytest.raises(ValueError):
        canonical_bytes({"x": bad})
    with pytest.raises(ValueError):
        canonical_bytes({"x": [{"y": bad}]})


def test_sign_verify_roundtrip_and_failures() -> None:
    key = generate_key()
    pub = public_key_hex(key)
    sig = sign(key, b"payload")
    assert verify(pub, b"payload", sig)
    assert not verify(pub, b"payload2", sig)
    assert not verify(public_key_hex(generate_key()), b"payload", sig)
    assert not verify("zz", b"payload", sig)
    assert not verify(pub, b"payload", "nothex")
    assert not verify(pub, b"payload", sig[:-2])
    assert not verify("", b"payload", "")


def test_load_or_create_key_persists(tmp_path: Path) -> None:
    p = tmp_path / "a" / "b" / "key.pem"
    k1 = load_or_create_key(p)
    assert p.read_bytes().startswith(b"-----BEGIN PRIVATE KEY-----")
    k2 = load_or_create_key(p)
    assert public_key_hex(k1) == public_key_hex(k2)


def _ledger(tmp_path: Path, n: int = 3) -> tuple[Path, str, Ledger]:
    path = tmp_path / "ledger.jsonl"
    key = generate_key()
    led = Ledger(path, key, ORIGIN)
    for i in range(n):
        assert led.append({"kind": "round", "round": i + 1, "eps": 0.5 * i}) == i
    led.checkpoint()
    return path, public_key_hex(key), led


def test_append_checkpoint_and_verify(tmp_path: Path) -> None:
    path, pub, led = _ledger(tmp_path)
    assert led.size == 3
    assert led.leaves()[1] == {"kind": "round", "round": 2, "eps": 0.5}
    rep = verify_ledger(path, pub)
    assert rep.ok and rep.size == 3 and rep.checkpoints == 1 and rep.errors == ()
    lines = path.read_text(encoding="utf-8").splitlines()
    assert json.loads(lines[0]) == {
        "type": "leaf",
        "index": 0,
        "receipt": {"kind": "round", "round": 1, "eps": 0.0},
    }
    cp = json.loads(lines[-1])
    assert cp["type"] == "checkpoint" and cp["size"] == 3 and cp["origin"] == ORIGIN
    assert cp["root_hex"] == led.root().hex()
    note = f"{ORIGIN}\n3\n{base64.b64encode(led.root()).decode()}\n".encode()
    assert verify(pub, note, cp["signature_hex"])


def test_reopen_continues(tmp_path: Path) -> None:
    path, _, led = _ledger(tmp_path)
    led2 = Ledger(path, generate_key(), ORIGIN)
    assert led2.size == 3 and led2.root() == led.root()
    led2.append({"kind": "x"})
    assert led2.size == 4
    assert led2.root() == merkle_root([canonical_bytes(r) for r in led2.leaves()])


def test_wrong_public_key_fails(tmp_path: Path) -> None:
    path, _, _ = _ledger(tmp_path)
    assert not verify_ledger(path, public_key_hex(generate_key())).ok


def test_empty_and_missing_file(tmp_path: Path) -> None:
    key = generate_key()
    led = Ledger(tmp_path / "new.jsonl", key, ORIGIN)
    assert led.size == 0
    assert led.checkpoint()["size"] == 0
    assert verify_ledger(tmp_path / "new.jsonl", public_key_hex(key)).ok
    assert not verify_ledger(tmp_path / "absent.jsonl", public_key_hex(key)).ok


def test_open_rejects_corrupt_file(tmp_path: Path) -> None:
    path, _, _ = _ledger(tmp_path)
    path.write_bytes(path.read_bytes()[:-5])
    with pytest.raises(ValueError):
        Ledger(path, generate_key(), ORIGIN)


def test_prove_inclusion(tmp_path: Path) -> None:
    path, _, led = _ledger(tmp_path, 5)
    for i in range(5):
        pr = prove_inclusion(path, i)
        assert pr["index"] == i and pr["size"] == 5 and pr["root"] == led.root().hex()
        assert verify_inclusion(
            canonical_bytes(pr["leaf"]), i, 5, [bytes.fromhex(h) for h in pr["proof"]], led.root()
        )
    with pytest.raises(ValueError):
        prove_inclusion(path, 5)


def test_uncheckpointed_tail_is_not_ok(tmp_path: Path) -> None:
    path, pub, led = _ledger(tmp_path)
    led.append({"kind": "late"})
    rep = verify_ledger(path, pub)
    assert not rep.ok and rep.size == 3


def _mutations(raw: bytes) -> list[tuple[str, bytes]]:
    lines = raw.split(b"\n")[:-1]
    out: list[tuple[str, bytes]] = []
    for li, line in enumerate(lines):
        for bi in range(len(line)):
            off = sum(len(x) + 1 for x in lines[:li]) + bi
            for mask in (0x01, 0x20):
                b = bytearray(raw)
                b[off] ^= mask
                out.append((f"flip {mask} {li}:{bi}", bytes(b)))
    for li in range(len(lines)):
        rest = [x for i, x in enumerate(lines) if i != li]
        out.append((f"delete {li}", b"\n".join(rest) + b"\n"))
    for i in range(len(lines)):
        for j in range(i + 1, len(lines)):
            sw = list(lines)
            sw[i], sw[j] = sw[j], sw[i]
            out.append((f"swap {i},{j}", b"\n".join(sw) + b"\n"))
    for cut in range(1, len(raw)):
        if raw[cut - 1 : cut] == b"\n":
            continue  # line-boundary truncation is covered by its own test
        out.append((f"truncate {cut}", raw[:cut]))
    return out


def test_every_single_edit_is_detected(tmp_path: Path) -> None:
    path, pub, _ = _ledger(tmp_path, 3)
    raw = path.read_bytes()
    assert verify_ledger(path, pub).ok
    for name, mutated in _mutations(raw):
        if mutated == raw:
            continue
        path.write_bytes(mutated)
        assert not verify_ledger(path, pub).ok, name
    path.write_bytes(raw)
    assert verify_ledger(path, pub).ok


def test_truncation_at_line_boundary(tmp_path: Path) -> None:
    path = tmp_path / "l.jsonl"
    key = generate_key()
    led = Ledger(path, key, ORIGIN)
    led.append({"a": 1})
    led.append({"a": 2})
    led.checkpoint()
    led.append({"a": 3})
    led.checkpoint()
    pub = public_key_hex(key)
    lines = path.read_bytes().split(b"\n")[:-1]
    assert verify_ledger(path, pub).size == 3
    # Dropping the last leaf and checkpoint rolls back to the earlier verified state.
    path.write_bytes(b"\n".join(lines[:3]) + b"\n")
    rep = verify_ledger(path, pub)
    assert rep.ok and rep.size == 2 and rep.checkpoints == 1
    # Keeping a checkpoint but dropping leaves it covers is detected.
    path.write_bytes(b"\n".join([lines[0], lines[2]]) + b"\n")
    assert not verify_ledger(path, pub).ok
    # Dropping everything is an empty, trivially valid ledger.
    path.write_bytes(b"")
    rep = verify_ledger(path, pub)
    assert rep.ok and rep.size == 0


def test_non_utf8_and_garbage(tmp_path: Path) -> None:
    path, pub, _ = _ledger(tmp_path)
    for junk in (b"\xff\xfe\n", b"[1,2]\n", b'{"type":"mystery"}\n', b"\n"):
        path.write_bytes(junk)
        assert not verify_ledger(path, pub).ok
