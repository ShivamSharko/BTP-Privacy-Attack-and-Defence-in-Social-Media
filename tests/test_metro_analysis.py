"""Basic smoke tests for metro analysis script."""

from __future__ import annotations

import metro_analysis


def test_in_metro_philadelphia():
    # Center of Philly
    assert metro_analysis.in_metro(40.0, -75.1, metro_analysis.METROS["philadelphia"]) is True
    # Outside Philly (e.g., NYC)
    assert metro_analysis.in_metro(40.7, -74.0, metro_analysis.METROS["philadelphia"]) is False


def test_in_metro_tampa():
    assert metro_analysis.in_metro(27.9, -82.4, metro_analysis.METROS["tampa_bay"]) is True
    assert metro_analysis.in_metro(25.7, -80.1, metro_analysis.METROS["tampa_bay"]) is False


def test_metro_keys_exist():
    assert set(metro_analysis.METROS.keys()) == {
        "philadelphia",
        "tampa_bay",
        "tucson",
        "indianapolis",
    }
