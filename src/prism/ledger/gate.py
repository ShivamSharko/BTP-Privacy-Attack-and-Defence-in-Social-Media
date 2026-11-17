"""Release gate: refuses rounds and releases that exceed the privacy budget or lack receipts."""

from __future__ import annotations

import math
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any

from prism.ledger.log import Ledger

_TOL = 1e-9
_RESERVED = frozenset({"kind", "lineage", "round", "epsilon_spent", "rounds_completed"})


@dataclass(frozen=True)
class Budget:
    """Total (epsilon, delta) the run may spend."""

    epsilon: float
    delta: float


class ReleaseRefused(Exception):
    """Raised when a model release is not allowed."""


def _check_fields(fields: Mapping[str, Any]) -> None:
    clash = _RESERVED & set(fields)
    if clash:
        raise ValueError(f"fields may not override reserved keys: {sorted(clash)}")


class ReleaseGate:
    """Writes budget refusals, per-round receipts and the final release to a ledger."""

    def __init__(self, ledger: Ledger, budget: Budget, lineage: str) -> None:
        """Bind a gate to a ledger, a budget and a lineage name."""
        self._ledger = ledger
        self._budget = budget
        self._lineage = lineage

    def _over(self, epsilon: float) -> bool:
        return not epsilon <= self._budget.epsilon * (1 + _TOL)

    def authorise_round(self, round_index: int, epsilon_after: float) -> bool:
        """Return True if the round fits the budget; otherwise log a refusal and return False."""
        if math.isnan(epsilon_after):
            raise ValueError("epsilon_after is NaN")
        if not self._over(epsilon_after):
            return True
        self._ledger.append(
            {
                "kind": "refusal",
                "lineage": self._lineage,
                "round": round_index,
                "epsilon_after": epsilon_after,
                "budget_epsilon": self._budget.epsilon,
                "reason": "epsilon_after exceeds budget",
            }
        )
        return False

    def record_round(self, round_index: int, fields: Mapping[str, Any]) -> int:
        """Append a round receipt and return its leaf index."""
        _check_fields(fields)
        return self._ledger.append(
            {"kind": "round", "lineage": self._lineage, "round": round_index, **fields}
        )

    def _refuse(self, reason: str, epsilon_spent: float, rounds_completed: int) -> ReleaseRefused:
        self._ledger.append(
            {
                "kind": "refusal",
                "lineage": self._lineage,
                "reason": reason,
                "epsilon_spent": epsilon_spent if math.isfinite(epsilon_spent) else None,
                "rounds_completed": rounds_completed,
                "budget_epsilon": self._budget.epsilon,
            }
        )
        return ReleaseRefused(reason)

    def release(
        self, epsilon_spent: float, rounds_completed: int, fields: Mapping[str, Any]
    ) -> dict[str, Any]:
        """Log the release and return a signed checkpoint, or raise ReleaseRefused."""
        _check_fields(fields)
        if self._over(epsilon_spent):
            raise self._refuse("epsilon_spent exceeds budget", epsilon_spent, rounds_completed)
        rounds = sorted(
            r["round"]
            for r in self._ledger.leaves()
            if r.get("kind") == "round" and r.get("lineage") == self._lineage
        )
        if rounds != list(range(1, rounds_completed + 1)):
            raise self._refuse(
                "round receipts are not exactly 1..rounds_completed",
                epsilon_spent,
                rounds_completed,
            )
        self._ledger.append(
            {
                "kind": "release",
                "lineage": self._lineage,
                "epsilon_spent": epsilon_spent,
                "rounds_completed": rounds_completed,
                **fields,
            }
        )
        return self._ledger.checkpoint()
