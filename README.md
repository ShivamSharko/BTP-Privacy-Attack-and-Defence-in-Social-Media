# PRISM-Rec

Privacy Attack and Defence in Social Media: a verifiable privacy-preserving
social recommendation research harness.

**Single source of truth: [`PROJECT_ROADMAP.md`](PROJECT_ROADMAP.md).**
If code and roadmap disagree, the roadmap wins until formally amended.

- Owners: Shivam Agarwal (23UEC621), Mokshit Jain (23UEC574)
- Guide: Dr. Malika Acharya, LNMIIT Jaipur
- Status: see [`docs/implementation-log.md`](docs/implementation-log.md) - the single progress tracker.
- Budget: Tier 0, Rs. 0. No paid services.

## Quickstart

```bash
uv sync                                   # create .venv, install locked deps
uv run ruff check .                       # lint
uv run mypy                               # strict type check
uv run pytest --cov --cov-report=term-missing
uv run python scripts/check_licenses.py   # ADR-015 licence gate
uv run pip-audit --skip-editable          # dependency vulnerabilities
uv run python -m prism.environment        # run provenance
```

On macOS/Linux the same tasks are available via `make help`.
On macOS/Linux, `make check` runs lint + types + tests + licence gate + audit.
The gitleaks secret scan runs in CI only.
