"""Release gate: budget refusals, missing round receipts, signed release checkpoint."""

from __future__ import annotations

from pathlib import Path

import pytest

from prism.ledger.gate import Budget, ReleaseGate, ReleaseRefused
from prism.ledger.log import Ledger, verify_ledger
from prism.ledger.receipts import generate_key, public_key_hex


def _gate(tmp_path: Path, eps: float = 2.0) -> tuple[ReleaseGate, Ledger, Path, str]:
    path = tmp_path / "g.jsonl"
    key = generate_key()
    led = Ledger(path, key, "prism.test/gate")
    gate = ReleaseGate(led, Budget(epsilon=eps, delta=1e-5), "run-a")
    return gate, led, path, public_key_hex(key)


def test_within_budget_authorised_and_nothing_logged(tmp_path: Path) -> None:
    gate, led, _, _ = _gate(tmp_path)
    assert gate.authorise_round(1, 1.0)
    assert gate.authorise_round(2, 2.0)
    assert gate.authorise_round(3, 2.0 * (1 + 1e-10))
    assert led.size == 0


def test_over_budget_refused_and_logged(tmp_path: Path) -> None:
    gate, led, _, _ = _gate(tmp_path)
    assert not gate.authorise_round(4, 2.5)
    assert led.leaves() == [
        {
            "kind": "refusal",
            "lineage": "run-a",
            "round": 4,
            "epsilon_after": 2.5,
            "budget_epsilon": 2.0,
            "reason": "epsilon_after exceeds budget",
        }
    ]


def test_nan_epsilon_is_rejected_not_authorised(tmp_path: Path) -> None:
    gate, led, _, _ = _gate(tmp_path)
    with pytest.raises(ValueError):
        gate.authorise_round(1, float("nan"))
    assert led.size == 0


def test_record_round_receipt(tmp_path: Path) -> None:
    gate, led, _, _ = _gate(tmp_path)
    assert gate.record_round(1, {"cohort": 3, "epsilon": 0.4}) == 0
    assert led.leaves()[0] == {
        "kind": "round",
        "lineage": "run-a",
        "round": 1,
        "cohort": 3,
        "epsilon": 0.4,
    }


def test_reserved_field_names_rejected(tmp_path: Path) -> None:
    gate, _, _, _ = _gate(tmp_path)
    with pytest.raises(ValueError):
        gate.record_round(1, {"kind": "evil"})
    with pytest.raises(ValueError):
        gate.release(1.0, 0, {"lineage": "evil"})


def test_successful_release_ends_with_verifying_checkpoint(tmp_path: Path) -> None:
    gate, led, path, pub = _gate(tmp_path)
    other = ReleaseGate(led, Budget(2.0, 1e-5), "run-b")
    for r in (1, 2, 3):
        gate.record_round(r, {"epsilon": r * 0.5})
    for r in (1, 2):  # a different lineage's receipts must not affect run-a
        other.record_round(r, {})
    cp = gate.release(1.5, 3, {"model_hash": "abc"})
    assert cp["type"] == "checkpoint" and cp["size"] == led.size
    rep = verify_ledger(path, pub)
    assert rep.ok and rep.size == led.size
    assert [x for x in led.leaves() if x["kind"] == "release"] == [
        {
            "kind": "release",
            "lineage": "run-a",
            "epsilon_spent": 1.5,
            "rounds_completed": 3,
            "model_hash": "abc",
        }
    ]
    assert '"type":"checkpoint"' in path.read_text(encoding="utf-8").splitlines()[-1]


def test_release_refused_over_budget(tmp_path: Path) -> None:
    gate, led, _, _ = _gate(tmp_path)
    gate.record_round(1, {})
    with pytest.raises(ReleaseRefused):
        gate.release(2.5, 1, {})
    assert led.leaves()[-1]["kind"] == "refusal"
    assert not any(x["kind"] == "release" for x in led.leaves())


@pytest.mark.parametrize(
    ("recorded", "claimed"),
    [([1, 3], 3), ([2, 3], 3), ([1, 2, 2], 3), ([1, 2, 3], 2), ([1], 2), ([1], 0)],
)
def test_release_refused_when_round_receipts_not_exactly_1_to_n(
    tmp_path: Path, recorded: list[int], claimed: int
) -> None:
    gate, led, _, _ = _gate(tmp_path)
    for r in recorded:
        gate.record_round(r, {})
    with pytest.raises(ReleaseRefused):
        gate.release(1.0, claimed, {})
    assert led.leaves()[-1]["kind"] == "refusal"
    assert not any(x["kind"] == "release" for x in led.leaves())


def test_release_zero_rounds_ok(tmp_path: Path) -> None:
    gate, _, _, _ = _gate(tmp_path)
    assert gate.release(0.0, 0, {})["type"] == "checkpoint"


def test_release_nan_epsilon_refused(tmp_path: Path) -> None:
    gate, _, _, _ = _gate(tmp_path)
    with pytest.raises(ReleaseRefused):
        gate.release(float("nan"), 0, {})
