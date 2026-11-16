"""Tests for provenance failure paths and the CLI entry point."""

from __future__ import annotations

import subprocess
from pathlib import Path
from typing import Any

import pytest

import prism.environment as env


def test_file_sha256_missing_file(tmp_path: Path) -> None:
    assert env.file_sha256(tmp_path / "does-not-exist") == env.UNKNOWN


def test_git_unavailable_yields_unknown(monkeypatch: pytest.MonkeyPatch) -> None:
    def boom(*args: Any, **kwargs: Any) -> Any:
        raise OSError("git not installed")

    monkeypatch.setattr(env.subprocess, "run", boom)
    assert env.git_commit() == env.UNKNOWN
    assert env.git_dirty() is None


def test_git_nonzero_exit_yields_unknown(monkeypatch: pytest.MonkeyPatch) -> None:
    completed = subprocess.CompletedProcess(args=["git"], returncode=1, stdout="", stderr="")
    monkeypatch.setattr(env.subprocess, "run", lambda *a, **k: completed)
    assert env.git_commit() == env.UNKNOWN
    assert env.git_dirty() is None


def test_main_prints_report(capsys: pytest.CaptureFixture[str]) -> None:
    assert env.main() == 0
    assert "PRISM-Rec environment report" in capsys.readouterr().out


def test_repo_root_contains_lockfile() -> None:
    assert (env.repo_root() / "pyproject.toml").is_file()
