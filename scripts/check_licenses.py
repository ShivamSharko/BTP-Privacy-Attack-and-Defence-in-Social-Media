"""Dependency licence gate (PROJECT_ROADMAP.md ADR-015 and Annex A.5).

Evidence precedence for each installed distribution:
  1. SPDX ``License-Expression`` - evaluated with real OR / AND semantics
  2. ``License ::`` classifiers - several classifiers mean OR (choose any)
  3. first non-empty line of the free-text ``License`` field
  4. otherwise UNKNOWN

Full licence text is never scanned: MPL-2.0 legitimately mentions the GPL in
its definitions, so phrase-scanning long text produces false positives.

Verdicts: ALLOW, BLOCK, UNKNOWN. BLOCK fails the build unless the package is
listed in APPROVED_EXCEPTIONS with an approved CHANGE-ID. UNKNOWN warns, and
fails only under --strict.

Exit codes: 0 = pass, 1 = policy violation.
"""

from __future__ import annotations

import argparse
import re
from collections.abc import Sequence
from dataclasses import dataclass
from enum import StrEnum
from importlib.metadata import Distribution, distributions
from typing import Final

SKIP_PACKAGES: Final[frozenset[str]] = frozenset({"prism-rec"})

# Package name (lowercase) -> approved CHANGE-ID. Empty until owners approve one.
# Example (NOT approved): "pygit2": "CHANGE-0xx"  # GPLv2 with linking exception
APPROVED_EXCEPTIONS: Final[dict[str, str]] = {}

# BSL is Boost (permissive). Business Source is BUSL. Do not confuse them.
BLOCKED_PREFIXES: Final[tuple[str, ...]] = ("AGPL", "AFFERO", "LGPL", "GPL", "SSPL", "RSAL", "BUSL")

PERMISSIVE_PREFIXES: Final[tuple[str, ...]] = (
    "MIT",
    "APACHE",
    "BSD",
    "MPL",
    "MOZILLA",
    "ISC",
    "PSF",
    "PYTHON",
    "UNLICENSE",
    "ZLIB",
    "BSL",
    "BOOST",
    "CC0",
    "0BSD",
    "WTFPL",
    "HPND",
    "NCSA",
    "POSTGRESQL",
    "ARTISTIC",
    "BLUEOAK",
    "ZPL",
    "X11",
    "UPL",
    "OFL",
    "CURL",
)

BLOCKED_PHRASES: Final[tuple[str, ...]] = (
    "GNU GENERAL PUBLIC",
    "LESSER GENERAL PUBLIC",
    "AFFERO GENERAL PUBLIC",
    "SERVER SIDE PUBLIC",
    "BUSINESS SOURCE",
)

_TOKEN_RE: Final[re.Pattern[str]] = re.compile(r"\(|\)|[^\s()]+")


class Verdict(StrEnum):
    """Three-state licence decision."""

    ALLOW = "ALLOW"
    BLOCK = "BLOCK"
    UNKNOWN = "UNKNOWN"


@dataclass(frozen=True)
class Decision:
    """A verdict plus the evidence it came from."""

    verdict: Verdict
    source: str
    detail: str


def classify_symbol(symbol: str) -> Verdict:
    """Classify a single SPDX licence identifier."""
    token = symbol.upper().rstrip("+")
    if token.startswith("LICENSEREF"):
        return Verdict.UNKNOWN
    for prefix in BLOCKED_PREFIXES:
        if token.startswith(prefix):
            return Verdict.BLOCK
    for prefix in PERMISSIVE_PREFIXES:
        if token.startswith(prefix):
            return Verdict.ALLOW
    return Verdict.UNKNOWN


def classify_text(line: str) -> Verdict:
    """Classify one short line of human-written licence text."""
    normalized = re.sub(r"[^A-Z0-9]+", " ", line.upper()).strip()
    for phrase in BLOCKED_PHRASES:
        if phrase in normalized:
            return Verdict.BLOCK
    tokens = normalized.split()
    for token in tokens:
        for prefix in BLOCKED_PREFIXES:
            if token.startswith(prefix):
                return Verdict.BLOCK
    for token in tokens:
        for prefix in PERMISSIVE_PREFIXES:
            if token.startswith(prefix):
                return Verdict.ALLOW
    return Verdict.UNKNOWN


def _or(left: Verdict, right: Verdict) -> Verdict:
    if Verdict.ALLOW in (left, right):
        return Verdict.ALLOW
    if Verdict.UNKNOWN in (left, right):
        return Verdict.UNKNOWN
    return Verdict.BLOCK


def _and(left: Verdict, right: Verdict) -> Verdict:
    if Verdict.BLOCK in (left, right):
        return Verdict.BLOCK
    if Verdict.UNKNOWN in (left, right):
        return Verdict.UNKNOWN
    return Verdict.ALLOW


class _ExpressionParser:
    """Recursive-descent SPDX parser: OR is lowest precedence, AND binds tighter."""

    def __init__(self, tokens: Sequence[str]) -> None:
        self._tokens = list(tokens)
        self._pos = 0

    def _peek(self) -> str | None:
        if self._pos < len(self._tokens):
            return self._tokens[self._pos]
        return None

    def _take(self) -> str:
        token = self._peek()
        if token is None:
            raise ValueError("unexpected end of licence expression")
        self._pos += 1
        return token

    def parse(self) -> Verdict:
        verdict = self._parse_or()
        if self._peek() is not None:
            raise ValueError("trailing tokens in licence expression")
        return verdict

    def _parse_or(self) -> Verdict:
        verdict = self._parse_and()
        while (token := self._peek()) is not None and token.upper() == "OR":
            self._take()
            verdict = _or(verdict, self._parse_and())
        return verdict

    def _parse_and(self) -> Verdict:
        verdict = self._parse_atom()
        while (token := self._peek()) is not None and token.upper() == "AND":
            self._take()
            verdict = _and(verdict, self._parse_atom())
        return verdict

    def _parse_atom(self) -> Verdict:
        token = self._take()
        if token == "(":
            verdict = self._parse_or()
            if self._take() != ")":
                raise ValueError("unbalanced parentheses in licence expression")
            return verdict
        if token == ")":
            raise ValueError("unexpected closing parenthesis")
        verdict = classify_symbol(token)
        if (nxt := self._peek()) is not None and nxt.upper() == "WITH":
            self._take()
            self._take()  # an exception does not change the base licence family
        return verdict


def evaluate_expression(expression: str) -> Verdict:
    """Evaluate an SPDX expression; malformed input yields UNKNOWN, never a crash."""
    try:
        return _ExpressionParser(_TOKEN_RE.findall(expression)).parse()
    except ValueError:
        return Verdict.UNKNOWN


def first_meaningful_line(text: str) -> str:
    """Return the first non-empty line of a free-text licence field."""
    for line in text.splitlines():
        stripped = line.strip()
        if stripped:
            return stripped
    return ""


def decide(expression: str, classifiers: Sequence[str], license_field: str) -> Decision:
    """Apply the evidence precedence rules to one distribution."""
    expr = expression.strip()
    if expr:
        verdict = evaluate_expression(expr)
        if verdict is not Verdict.UNKNOWN:
            return Decision(verdict, "expression", expr)

    names = [c.split("::")[-1].strip() for c in classifiers if c.startswith("License ::")]
    if names:
        verdict = Verdict.BLOCK  # identity element for OR
        for name in names:
            verdict = _or(verdict, classify_text(name))
        return Decision(verdict, "classifiers", " | ".join(names))

    line = first_meaningful_line(license_field)
    if line:
        return Decision(classify_text(line), "license-text", line)

    if expr:
        return Decision(Verdict.UNKNOWN, "expression", expr)
    return Decision(Verdict.UNKNOWN, "none", "")


def apply_exception(package: str, decision: Decision) -> tuple[Verdict, str | None]:
    """A BLOCK may be overridden only by an explicitly approved CHANGE-ID."""
    change_id = APPROVED_EXCEPTIONS.get(package.lower())
    if decision.verdict is Verdict.BLOCK and change_id:
        return Verdict.ALLOW, change_id
    return decision.verdict, None


def package_name(dist: Distribution) -> str:
    """Return the declared distribution name."""
    return str(dist.metadata.get("Name") or "unknown")


def distribution_decision(dist: Distribution) -> Decision:
    """Read licence evidence from installed metadata."""
    meta = dist.metadata
    expression = str(meta.get("License-Expression") or "")
    license_field = str(meta.get("License") or "")
    classifiers = [str(item) for item in (meta.get_all("Classifier") or [])]
    return decide(expression, classifiers, license_field)


def sanitize(detail: str, limit: int = 90) -> str:
    """Collapse whitespace and escape pipes so the markdown table stays valid."""
    collapsed = re.sub(r"\s+", " ", detail).strip().replace("|", "/")
    if not collapsed:
        return "-"
    if len(collapsed) > limit:
        return collapsed[: limit - 3] + "..."
    return collapsed


def main(argv: list[str] | None = None) -> int:
    """Print the licence table and enforce ADR-015."""
    parser = argparse.ArgumentParser(description="Dependency licence gate (ADR-015).")
    parser.add_argument("--strict", action="store_true", help="also fail on UNKNOWN")
    args = parser.parse_args(argv)

    rows: list[tuple[str, str, str, str]] = []
    blocked: list[str] = []
    unknown: list[str] = []
    overridden: list[str] = []

    for dist in distributions():
        name = package_name(dist)
        if name.lower() in SKIP_PACKAGES:
            continue
        decision = distribution_decision(dist)
        verdict, change_id = apply_exception(name, decision)
        if change_id is not None:
            overridden.append(f"{name} -> {change_id} ({decision.detail})")
        rows.append((name, str(verdict), decision.source, sanitize(decision.detail)))
        if verdict is Verdict.BLOCK:
            blocked.append(f"{name}: {decision.detail}")
        elif verdict is Verdict.UNKNOWN:
            unknown.append(name)

    print("| Package | Verdict | Evidence | Licence |")
    print("|---|---|---|---|")
    for row in sorted(rows, key=lambda item: item[0].lower()):
        print(f"| {row[0]} | {row[1]} | {row[2]} | {row[3]} |")

    if overridden:
        print("\nApproved exceptions applied:")
        for entry in overridden:
            print(f"  - {entry}")

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
