# PRISM-Rec developer tasks (roadmap ADR-027).
# Windows users without `make`: run the equivalent `uv run ...` commands directly.

.DEFAULT_GOAL := help
.PHONY: help setup lint format typecheck test audit licenses license-gate check env clean

help:
	@echo "setup      - create .venv and install locked dependencies"
	@echo "lint       - ruff lint + format check"
	@echo "format     - auto-format and apply safe fixes"
	@echo "typecheck  - mypy --strict on src/prism"
	@echo "test       - pytest with coverage"
	@echo "audit      - pip-audit dependency vulnerability scan"
	@echo "licenses   - list dependency licences (ADR-015)"
	@echo "license-gate - enforce ADR-015 dependency licence policy"
	@echo "check      - lint + typecheck + test"
	@echo "env        - print the reproducibility environment report"
	@echo "clean      - remove tool caches (macOS/Linux)"

setup:
	uv sync

lint:
	uv run ruff check .
	uv run ruff format --check .

format:
	uv run ruff format .
	uv run ruff check --fix .

typecheck:
	uv run mypy

test:
	uv run pytest --cov --cov-report=term-missing

audit:
	uv run pip-audit --skip-editable

licenses:
	uv run pip-licenses --format=markdown --order=license

license-gate:
	uv run python scripts/check_licenses.py

check: lint typecheck test license-gate audit

env:
	uv run python -m prism.environment

clean:
	rm -rf .pytest_cache .mypy_cache .ruff_cache .hypothesis .coverage htmlcov
