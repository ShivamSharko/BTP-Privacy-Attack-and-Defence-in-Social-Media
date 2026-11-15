"""Run provenance for reproducibility (PROJECT_ROADMAP.md section 17, DoD).

Records the interpreter, platform, package versions, git commit, working-tree
dirty flag and the SHA-256 of uv.lock. No scientific logic lives here.
"""

from __future__ import annotations

import hashlib
import platform
import subprocess
import sys
from collections.abc import Sequence
from importlib.metadata import PackageNotFoundError, version
from pathlib import Path
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

UNKNOWN: Final[str] = "unknown"
GIT_TIMEOUT_SECONDS: Final[float] = 5.0


class EnvironmentReport(BaseModel):
    """Deeply immutable snapshot of the environment behind a run."""

    model_config = ConfigDict(frozen=True)

    prism_version: str
    python_version: str
    python_implementation: str
    platform_system: str
    platform_machine: str
    packages: tuple[tuple[str, str], ...]
    git_commit: str
    git_dirty: bool | None
    uv_lock_sha256: str


def repo_root() -> Path:
    """Return the repository root inferred from this file's location."""
    return Path(__file__).resolve().parents[2]


def package_version(distribution: str) -> str:
    """Return an installed distribution's version, or UNKNOWN."""
    try:
        return version(distribution)
    except PackageNotFoundError:
        return UNKNOWN


def _run_git(args: Sequence[str]) -> str | None:
    """Run a read-only git command; return None if git is unavailable."""
    try:
        completed = subprocess.run(
            ["git", *args],
            cwd=repo_root(),
            capture_output=True,
            text=True,
            check=False,
            timeout=GIT_TIMEOUT_SECONDS,
            shell=False,
        )
    except (OSError, subprocess.SubprocessError):
        return None
    if completed.returncode != 0:
        return None
    return completed.stdout.strip()


def git_commit() -> str:
    """Return the current HEAD commit hash, or UNKNOWN."""
    return _run_git(["rev-parse", "HEAD"]) or UNKNOWN


def git_dirty() -> bool | None:
    """True if the working tree has uncommitted changes; None if unknown."""
    output = _run_git(["status", "--porcelain"])
    if output is None:
        return None
    return output != ""


def file_sha256(path: Path) -> str:
    """Return the SHA-256 of a file, or UNKNOWN if it cannot be read."""
    try:
        return hashlib.sha256(path.read_bytes()).hexdigest()
    except OSError:
        return UNKNOWN


def collect_environment_report() -> EnvironmentReport:
    """Build the provenance report for the current process."""
    root = repo_root()
    return EnvironmentReport(
        prism_version=__version__,
        python_version=platform.python_version(),
        python_implementation=platform.python_implementation(),
        platform_system=platform.system(),
        platform_machine=platform.machine(),
        packages=tuple((name, package_version(name)) for name in TRACKED_PACKAGES),
        git_commit=git_commit(),
        git_dirty=git_dirty(),
        uv_lock_sha256=file_sha256(root / "uv.lock"),
    )


def format_report(report: EnvironmentReport) -> str:
    """Render a report as stable, human-readable text."""
    dirty = UNKNOWN if report.git_dirty is None else str(report.git_dirty)
    lines = [
        "PRISM-Rec environment report",
        f"  prism-rec       : {report.prism_version}",
        f"  python          : {report.python_version} ({report.python_implementation})",
        f"  platform        : {report.platform_system} / {report.platform_machine}",
        f"  git commit      : {report.git_commit}",
        f"  git dirty       : {dirty}",
        f"  uv.lock sha256  : {report.uv_lock_sha256}",
        "  packages:",
    ]
    lines.extend(f"    {name:<16}: {value}" for name, value in sorted(report.packages))
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
