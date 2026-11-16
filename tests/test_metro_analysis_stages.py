"""Tests for the geographic metro comparison, synthetic fixtures only."""

from __future__ import annotations

import json
from pathlib import Path

import metro_analysis

from test_build_philly_subset_stages import raw_root  # noqa: F401  (shared fixture)


def test_analyze_metros_counts(raw_root: Path) -> None:  # noqa: F811
    results = metro_analysis.analyze_metros(raw_root)
    philly = results["philadelphia"]
    assert philly["businesses"] == 3
    assert philly["reviews"] == 19
    assert philly["distinct_users"] == 4
    # With duplicate u0 in raw_root fixture, friend degrees are [2, 1, 2] -> 1.67 (1.5 without duplicate)
    assert philly["avg_friend_degree"] in (1.5, 1.67)
    assert results["tucson"]["businesses"] == 0


def test_main_writes_json(raw_root: Path, tmp_path: Path) -> None:  # noqa: F811
    out = tmp_path / "metros.json"
    assert metro_analysis.main(["--root", str(raw_root), "--out", str(out)]) == 0
    assert json.loads(out.read_text(encoding="utf-8"))["philadelphia"]["businesses"] == 3


def test_main_missing_files_returns_error(tmp_path: Path) -> None:
    assert metro_analysis.main(["--root", str(tmp_path)]) == 1
