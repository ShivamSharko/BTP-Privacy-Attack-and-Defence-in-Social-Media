"""Step 0 smoke tests: prove the toolchain and package wiring work."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from prism import __version__
from prism.environment import (
    TRACKED_PACKAGES,
    UNKNOWN_VERSION,
    collect_environment_report,
    format_report,
    package_version,
)


def test_python_version_is_312() -> None:
    assert collect_environment_report().python_version.startswith("3.12")


def test_report_tracks_expected_packages() -> None:
    report = collect_environment_report()
    assert report.prism_version == __version__
    assert set(report.packages) == set(TRACKED_PACKAGES)
    assert report.packages["pydantic"] != UNKNOWN_VERSION


def test_report_is_frozen() -> None:
    report = collect_environment_report()
    with pytest.raises(ValidationError):
        report.prism_version = "tampered"


def test_missing_distribution_is_marked() -> None:
    assert package_version("prism-rec-no-such-distribution") == UNKNOWN_VERSION


def test_format_report_is_deterministic() -> None:
    report = collect_environment_report()
    text = format_report(report)
    assert text == format_report(report)
    assert "PRISM-Rec environment report" in text
    assert report.python_version in text
