"""Dependency licence gate (PROJECT_ROADMAP.md ADR-015 and Annex A.5).

Fails if an installed dependency uses a licence rejected by default:
AGPL, GPL, LGPL, SSPL, RSAL or BSL/BUSL. Licences that cannot be determined are
reported as UNKNOWN and reviewed manually under verification item 15.

Usage:
    uv run python scripts/check_licenses.py
    uv run python scripts/check_licenses.py --strict   # also fail on UNKNOWN

Exit codes: 0 = pass, 1 = policy violation.
"""

from __future__ import annotations

import argparse
import re
from importlib.metadata import Distribution, distributions
from typing import Final

SKIP_PACKAGES: Final[frozenset[str]] = frozenset({"prism-rec"})

BLOCKED_PREFIXES: Final[tuple[tuple[str, str], ...]] = (
    ("AGPL", "AGPL"),
    ("AFFERO", "AGPL"),
    ("LGPL", "LGPL"),
    ("GPL", "GPL"),
    ("SSPL", "SSPL"),
    ("RSAL", "RSAL"),
    ("BUSL", "BSL/BUSL"),
    ("BSL", "BSL/BUSL"),
)

BLOCKED_PHRASES: Final[tuple[str, ...]] = (
    "GNU GENERAL PUBLIC",
    "LESSER GENERAL PUBLIC",
    "SERVER SIDE PUBLIC",
    "BUSINESS SOURCE",
)

UNKNOWN: Final[str] = "UNKNOWN"


def normalize(text: str) -> str:
    """Uppercase and reduce every non-alphanumeric run to a single space."""
    return re.sub(r"[^A-Z0-9]+", " ", text.upper()).strip()


def find_blocked(license_text: str) -> str | None:
    """Return the blocked licence family found in text, or None if allowed."""
    normalized = normalize(license_text)
    for phrase in BLOCKED_PHRASES:
        if phrase in normalized:
            return phrase
    for token in normalized.split():
        for prefix, family in BLOCKED_PREFIXES:
            if token.startswith(prefix):
                return family
    return None


def license_text(dist: Distribution) -> str:
    """Collect every licence signal a distribution declares."""
    meta = dist.metadata
    parts: list[str] = []
    for key in ("License-Expression", "License"):
        value = meta.get(key)
        if value:
            parts.append(value)
    classifiers = meta.get_all("Classifier") or []
    parts.extend(item for item in classifiers if item.startswith("License ::"))
    return " | ".join(parts)


def package_name(dist: Distribution) -> str:
    """Return the declared distribution name."""
    return str(dist.metadata.get("Name") or "unknown")


def main(argv: list[str] | None = None) -> int:
    """Print a licence table and enforce ADR-015."""
    parser = argparse.ArgumentParser(description="Dependency licence gate (ADR-015).")
    parser.add_argument("--strict", action="store_true", help="also fail on UNKNOWN licences")
    args = parser.parse_args(argv)

    blocked: list[str] = []
    unknown: list[str] = []
    rows: list[tuple[str, str]] = []

    for dist in distributions():
        name = package_name(dist)
        if name.lower() in SKIP_PACKAGES:
            continue
        text = license_text(dist)
        rows.append((name, text or UNKNOWN))
        family = find_blocked(text)
        if family is not None:
            blocked.append(f"{name}: {family} -> {text}")
        elif not text:
            unknown.append(name)

    print("| Package | Licence |")
    print("|---|---|")
    for name, text in sorted(rows, key=lambda row: row[0].lower()):
        print(f"| {name} | {text} |")

    if unknown:
        print(f"\nWARNING: {len(unknown)} package(s) with UNKNOWN licence:")
        print(", ".join(sorted(unknown)))
        print("Review manually (roadmap verification item 15).")

    if blocked:
        print("\nBLOCKED by ADR-015:")
        for entry in blocked:
            print(f"  - {entry}")
        return 1

    if args.strict and unknown:
        print("\nBLOCKED: --strict was set and UNKNOWN licences remain.")
        return 1

    print("\nLicence gate: PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
