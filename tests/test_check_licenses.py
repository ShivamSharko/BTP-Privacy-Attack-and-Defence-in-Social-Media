"""Tests for the dependency licence gate (ADR-015)."""

from __future__ import annotations

from importlib.metadata import distribution

import check_licenses as gate
import pytest
from hypothesis import given
from hypothesis import strategies as st

PERMISSIVE = (
    "MIT",
    "MIT License",
    "Apache-2.0",
    "Apache Software License",
    "BSD-3-Clause",
    "BSD License",
    "Mozilla Public License 2.0 (MPL 2.0)",
    "PostgreSQL",
    "ISC",
    "Python Software Foundation License",
    "The Unlicense",
    "Apache-2.0 OR MIT",
    "",
)

REJECTED = (
    "AGPL-3.0-only",
    "GNU Affero General Public License v3",
    "GPL-2.0-or-later",
    "GNU General Public License v2 (GPLv2)",
    "LGPL-3.0",
    "GNU Lesser General Public License",
    "SSPL-1.0",
    "Server Side Public License",
    "RSALv2",
    "BUSL-1.1",
    "Business Source License 1.1",
)


@pytest.mark.parametrize("text", PERMISSIVE)
def test_permissive_licences_pass(text: str) -> None:
    assert gate.find_blocked(text) is None


@pytest.mark.parametrize("text", REJECTED)
def test_rejected_licences_are_blocked(text: str) -> None:
    assert gate.find_blocked(text) is not None


@given(st.text())
def test_normalize_is_idempotent(text: str) -> None:
    once = gate.normalize(text)
    assert gate.normalize(once) == once


def test_installed_package_declares_a_licence() -> None:
    assert gate.license_text(distribution("pytest")) != ""
