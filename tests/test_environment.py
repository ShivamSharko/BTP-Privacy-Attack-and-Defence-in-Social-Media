"""Tests for run provenance and environment reporting."""

from __future__ import annotations

import re
from importlib.metadata import version

import pytest
from pydantic import ValidationError

from prism import __version__
from prism.environment import (
    TRACKED_PACKAGES,
    UNKNOWN,
    collect_environment_report,
    format_report,
    package_version,
)

HEX40 = re.compile(r"^[0-9a-f]{40}$")
HEX64 = re.compile(r"^[0-9a-f]{64}$")


def test_python_version_is_312() -> None:
    assert collect_environment_report().python_version.startswith("3.12")


def test_version_comes_from_installed_metadata() -> None:
    assert __version__ == version("prism-rec")


def test_packages_are_an_immutable_tuple() -> None:
    report = collect_environment_report()
    assert isinstance(report.packages, tuple)
    assert tuple(name for name, _ in report.packages) == TRACKED_PACKAGES
    with pytest.raises(TypeError):
        report.packages[0] = ("pydantic", "0")  # type: ignore[index]


def test_report_is_frozen() -> None:
    report = collect_environment_report()
    with pytest.raises(ValidationError):
        report.prism_version = "tampered"


def test_missing_distribution_is_marked() -> None:
    assert package_version("prism-rec-no-such-distribution") == UNKNOWN


def test_git_commit_is_hash_or_unknown() -> None:
    commit = collect_environment_report().git_commit
    assert commit == UNKNOWN or HEX40.match(commit)


def test_lock_hash_is_sha256_or_unknown() -> None:
    digest = collect_environment_report().uv_lock_sha256
    assert digest == UNKNOWN or HEX64.match(digest)


def test_dirty_flag_is_bool_or_none() -> None:
    assert collect_environment_report().git_dirty in (True, False, None)


def test_format_report_is_deterministic() -> None:
    report = collect_environment_report()
    text = format_report(report)
    assert text == format_report(report)
    assert "PRISM-Rec environment report" in text
    assert report.git_commit in text
    assert report.uv_lock_sha256 in text
