# ADR-045: Fast closed-form clipped sum with an autograd self-check

- Status: Approved (CHANGE-023)
- Date: 17 November 2026

## Context
Per-user clipping needs one update norm per user in the cohort. Computing every per-user gradient through autograd was the main cost of a federated run.

## Decision
For single-step clients the per-user update norm is computed in closed form and the clipped sum by one weighted backward pass (`src/prism/fl/fast.py`). The closed form is checked against autograd in the tests and again on a few users at the start of every run. The run refuses to start if the two disagree.

## Consequences
A real-data run fell from 171 s to 29 s with an identical result. The fast path covers single-step clients only. The start-of-run check protects the sensitivity bound, which the privacy guarantee depends on.

## Supersedes
Nothing. It is an implementation decision inside the clipping scheme of ADR-020.
