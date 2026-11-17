# ADR-049: Secure aggregation as an in-process pairwise-mask simulation

- Status: Approved (CHANGE-023)
- Date: 17 November 2026

## Context
ADR-023 planned SecAgg+ through Flower on a verified subset. Flower is not used (Ray on Windows is experimental), and a full protocol would have consumed the day.

## Decision
`src/prism/fl/secagg.py` is a functional simulation built only from library primitives. Pairwise masks come from X25519 key agreement and HKDF. Values are fixed point with scale 2^32 / C, added modulo 2^64, which allows cohorts up to 2^20 clients. Survivors reveal seeds for dropped clients. The aggregator interface accepts only masked vectors. Controls: the sum equals the plaintext sum within quantisation tolerance; one masked vector is indistinguishable from uniform (Kolmogorov-Smirnov p > 0.001, absolute correlation with the plaintext below 0.05).

## Consequences
The module shows what an aggregator can and cannot see. It has no secret sharing and no network. A client that drops after sending would be exposed when survivors reveal its seeds; real protocols prevent this with a second mask and this simulation does not. Results from it must say so. Wherever the roadmap says SecAgg+, read this simulation.

## Supersedes
ADR-023. Amends ADR-001 and ADR-035 (Flower is not used).
