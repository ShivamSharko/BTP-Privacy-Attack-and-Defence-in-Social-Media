"""Reproducibility helper: report the runtime environment.

Step 0 of PROJECT_ROADMAP.md. This module contains no scientific logic. It only
records the interpreter, platform and package versions behind a run, so that
every headline number can be traced to an environment (roadmap section 17).
"""

from __future__ import annotations

import platform
import sys
from importlib.metadata import PackageNotFoundError, version
from typing import Final

from pydantic import BaseModel, ConfigDict

from prism import __version__

TRACKED_PACKAGES: Final[tuple[str, ...]] = (
    "pydantic",
    "pytest",
    "hypothesis",
    "ruff",
    "mypy",
)

UNKNOWN_VERSION: Final[str] = "not-installed"


class EnvironmentReport(BaseModel):
    """Immutable snapshot of the runtime environment."""

    model_config = ConfigDict(frozen=True)

    prism_version: str
    python_version: str
    python_implementation: str
    platform_system: str
    platform_machine: str
    packages: dict[str, str]


def package_version(distribution: str) -> str:
    """Return the installed version of a distribution, or a marker if absent."""
    try:
        return version(distribution)
    except PackageNotFoundError:
        return UNKNOWN_VERSION


def collect_environment_report() -> EnvironmentReport:
    """Build a report for the current process."""
    return EnvironmentReport(
        prism_version=__version__,
        python_version=platform.python_version(),
        python_implementation=platform.python_implementation(),
        platform_system=platform.system(),
        platform_machine=platform.machine(),
        packages={name: package_version(name) for name in TRACKED_PACKAGES},
    )


def format_report(report: EnvironmentReport) -> str:
    """Render a report as stable, human-readable text."""
    lines = [
        "PRISM-Rec environment report",
        f"  prism-rec       : {report.prism_version}",
        f"  python          : {report.python_version} ({report.python_implementation})",
        f"  platform        : {report.platform_system} / {report.platform_machine}",
        "  packages:",
    ]
    lines.extend(f"    {name:<16}: {value}" for name, value in sorted(report.packages.items()))
    return "\n".join(lines)


def main() -> int:
    """Print the report; exit non-zero if the interpreter is not Python 3.12."""
    report = collect_environment_report()
    print(format_report(report))
    if sys.version_info[:2] != (3, 12):
        print(
            "ERROR: Python 3.12 is required by PROJECT_ROADMAP.md section 16.",
            file=sys.stderr,
        )
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
