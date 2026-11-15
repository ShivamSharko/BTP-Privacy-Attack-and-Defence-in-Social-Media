"""Tests for the dependency licence gate (ADR-015), including review regressions."""

from __future__ import annotations

from importlib.metadata import distribution

import check_licenses as gate
import pytest
from hypothesis import given
from hypothesis import strategies as st

ALLOWED_EXPRESSIONS = (
    "MIT",
    "Apache-2.0",
    "BSD-3-Clause",
    "MPL-2.0",
    "ISC",
    "PSF-2.0",
    "Unlicense",
    "BSL-1.0",
    "Apache-2.0 OR MIT",
    "MIT AND BSD-3-Clause",
    "MIT AND (GPL-2.0-only OR BSD-3-Clause)",
    "GPL-2.0-only OR Apache-2.0",
)

BLOCKED_EXPRESSIONS = (
    "AGPL-3.0-only",
    "GPL-2.0-or-later",
    "GPL-3.0+",
    "LGPL-3.0-only",
    "SSPL-1.0",
    "BUSL-1.1",
    "MIT AND GPL-2.0-only",
    "AGPL-3.0-only OR GPL-3.0-only",
    "GPL-2.0-only WITH Classpath-exception-2.0",
)

MPL_FULL_TEXT = (
    "Mozilla Public License Version 2.0\n"
    "==================================\n"
    "1. Definitions\n"
    '1.7. "Larger Work" means a work that combines Covered Software with other\n'
    "material. The GNU General Public License is a Secondary License.\n"
)


@pytest.mark.parametrize("expression", ALLOWED_EXPRESSIONS)
def test_allowed_expressions(expression: str) -> None:
    assert gate.evaluate_expression(expression) is gate.Verdict.ALLOW


@pytest.mark.parametrize("expression", BLOCKED_EXPRESSIONS)
def test_blocked_expressions(expression: str) -> None:
    assert gate.evaluate_expression(expression) is gate.Verdict.BLOCK


def test_regression_dual_licence_or_is_allowed() -> None:
    decision = gate.decide("Apache-2.0 OR GPL-2.0-or-later", [], "")
    assert decision.verdict is gate.Verdict.ALLOW
    assert decision.source == "expression"


def test_regression_boost_bsl_is_allowed() -> None:
    assert gate.decide("BSL-1.0", [], "").verdict is gate.Verdict.ALLOW


def test_regression_business_source_is_blocked() -> None:
    assert gate.decide("", [], "Business Source License 1.1").verdict is gate.Verdict.BLOCK
    assert gate.decide("BUSL-1.1", [], "").verdict is gate.Verdict.BLOCK


def test_regression_full_mpl_text_is_allowed() -> None:
    assert gate.decide("", [], MPL_FULL_TEXT).verdict is gate.Verdict.ALLOW


def test_multiple_classifiers_are_or() -> None:
    classifiers = [
        "License :: OSI Approved :: MIT License",
        "License :: OSI Approved :: GNU General Public License v2 (GPLv2)",
    ]
    assert gate.decide("", classifiers, "").verdict is gate.Verdict.ALLOW


def test_expression_takes_precedence_over_text() -> None:
    decision = gate.decide("MIT", [], "Business Source License 1.1")
    assert decision.verdict is gate.Verdict.ALLOW
    assert decision.source == "expression"


def test_unknown_when_no_evidence() -> None:
    assert gate.decide("", [], "").verdict is gate.Verdict.UNKNOWN


def test_malformed_expression_is_unknown_not_crash() -> None:
    assert gate.evaluate_expression("MIT AND (") is gate.Verdict.UNKNOWN


def test_exception_overrides_only_named_package(monkeypatch: pytest.MonkeyPatch) -> None:
    blocked = gate.Decision(gate.Verdict.BLOCK, "expression", "GPL-2.0-only")
    monkeypatch.setitem(gate.APPROVED_EXCEPTIONS, "pygit2", "CHANGE-999")
    verdict, change_id = gate.apply_exception("pygit2", blocked)
    assert verdict is gate.Verdict.ALLOW
    assert change_id == "CHANGE-999"
    other_verdict, other_id = gate.apply_exception("some-other-pkg", blocked)
    assert other_verdict is gate.Verdict.BLOCK
    assert other_id is None


def test_installed_package_declares_evidence() -> None:
    assert gate.distribution_decision(distribution("pytest")).verdict is gate.Verdict.ALLOW


def test_main_passes_in_this_environment() -> None:
    assert gate.main([]) == 0


@given(st.text())
def test_evaluate_expression_never_crashes(text: str) -> None:
    assert gate.evaluate_expression(text) in set(gate.Verdict)


@given(st.text())
def test_sanitize_is_single_line_and_bounded(text: str) -> None:
    result = gate.sanitize(text)
    assert "\n" not in result
    assert "|" not in result
    assert len(result) <= 90
