# ADR-061: Flower parity run in a separate environment, not a dependency

- Status: Approved (CHANGE-024)
- Date: 17 November 2026 (evening)

## Context
ADR-035 deferred a Flower parity check and CHANGE-023 cancelled it; ADR-055 removed Flower from the stack. A reader can still ask whether the in-process engine behaves like a standard federated framework.

## Decision
- `scripts/flower_parity.py` runs a small federated training through Flower 1.43.0 (message-based API, simulation runtime, Windows) and compares it with an in-process reference built from the same prism functions (`make_delta_fn`, `split_history`, `clip_rows`, `noisy_mean`).
- Synthetic data (400 users, 300 items, 5 rounds, sample rate 0.1), cohorts fixed with the engine's own sampling stream, per-client history split fixed by (seed, round, client id). A custom strategy clips, sums, divides by the expected cohort and takes an SGD step. A variant adds Gaussian noise once per round from the same seeded stream on both sides.
- Result: after five rounds the largest parameter difference between the Flower run and the reference is about 6e-08, with and without noise (float32 rounding level). Details and commands: `docs/flower-parity.md`; output: `results/flower_parity.json`.
- Flower is not added to `pyproject.toml` or `uv.lock`. The script needs its own environment, is never imported by `prism` and is not a Makefile target.

## Consequences
It shows plumbing parity only: not scale, not the client mathematics (the same prism function runs on both sides), not equivalence to `prism.fl.server.train` itself, and nothing about Flower's own differential-privacy wrappers. The main experiments still use the in-process engine.

## Supersedes
Amends ADR-035 (the parity check is done, separately) and ADR-055 (Flower stays out of the dependencies).
