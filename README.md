# PRISM-Rec

Privacy Attack and Defence in Social Media: a verifiable privacy-preserving
social recommendation research harness.

**Single source of truth: [`PROJECT_ROADMAP.md`](PROJECT_ROADMAP.md).**
If code and roadmap disagree, the roadmap wins until formally amended.

- Owners: Shivam Agarwal (23UEC621), Mokshit Jain (23UEC574)
- Guide: Dr. Malika Acharya, LNMIIT Jaipur
- Status: Step 0 (environment and skeleton). No research code yet.
- Budget: Tier 0, Rs. 0. No paid services.

## Quickstart

```bash
uv sync          # create .venv and install locked dependencies
uv run pytest    # run tests
uv run mypy      # strict type check
uv run ruff check .
uv run python -m prism.environment
```

On macOS/Linux the same tasks are available via `make help`.
