# PRISM-Rec developer tasks and experiment runner.
# Windows users without `make`: run the equivalent `uv run ...` commands directly
# (each recipe below is one or more plain commands).
#
# PRISM is how the `prism` command is started. `python -m prism` works whether or not the
# console script is installed; override with `make PRISM="uv run prism" demo` if you prefer.

PRISM ?= uv run python -m prism
CLEAN_PY := import pathlib, shutil; [shutil.rmtree(p, ignore_errors=True) for p in ('.pytest_cache', '.mypy_cache', '.ruff_cache', '.hypothesis', 'htmlcov')]; pathlib.Path('.coverage').unlink(missing_ok=True)

.DEFAULT_GOAL := help
.PHONY: help setup lint format typecheck test audit licenses license-gate check env clean \
	demo social baselines grid attacks social-experiments sensitivity free-riding ledger report all-experiments

help:
	@echo "Developer tasks"
	@echo "  setup               - create .venv and install locked dependencies"
	@echo "  lint                - ruff lint + format check"
	@echo "  format              - auto-format and apply safe fixes"
	@echo "  typecheck           - mypy --strict on src/prism and scripts"
	@echo "  test                - pytest with coverage"
	@echo "  audit               - pip-audit dependency vulnerability scan"
	@echo "  licenses            - list dependency licences (ADR-015)"
	@echo "  license-gate        - enforce ADR-015 dependency licence policy"
	@echo "  check               - lint + typecheck + test + license-gate + audit"
	@echo "  env                 - print the reproducibility environment report"
	@echo "  clean               - remove tool caches (works on Windows, macOS, Linux)"
	@echo ""
	@echo "Experiments (the Yelp data must be prepared first, except for demo)"
	@echo "  demo                - end-to-end run on synthetic data, no Yelp data needed"
	@echo "  social              - build the friend graph (prism social)"
	@echo "  baselines           - MostPopular, ItemKNN, item-item ridge, friends"
	@echo "  grid                - RQ1 privacy-utility grid (long; resumable)"
	@echo "  attacks             - RQ3 and RQ4: update-leakage, membership, poisoning"
	@echo "  social-experiments  - RQ2 and RQ5: gossip, participation"
	@echo "  sensitivity         - k-core (10, 20) and 4-star variants of RQ1 (builds data/processed_<name>)"
	@echo "  free-riding         - RQ4: free-riding clients, cost, gain and detection"
	@echo "  ledger              - RQ6: verify every ledger, measure overhead"
	@echo "  report              - build results/report/report.html"
	@echo "  all-experiments     - social, baselines, grid, attacks, social-experiments, sensitivity, free-riding, ledger, report"

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
	uv run python -c "$(CLEAN_PY)"

demo:
	$(PRISM) demo-small

social:
	$(PRISM) social

baselines:
	$(PRISM) baselines

grid:
	$(PRISM) grid

attacks:
	$(PRISM) update-leakage
	$(PRISM) membership
	$(PRISM) poisoning

social-experiments:
	$(PRISM) gossip
	$(PRISM) participation

sensitivity:
	$(PRISM) sensitivity

free-riding:
	$(PRISM) free-riding

ledger:
	$(PRISM) ledger

report:
	$(PRISM) report

all-experiments: social baselines grid attacks social-experiments sensitivity free-riding ledger report
