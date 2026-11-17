# ADR-055: Remove stack items that were never installed

- Status: Approved (CHANGE-023)
- Date: 17 November 2026

## Context
Section 16 listed Flower on Ray, RecBole, OpenDP sampler, DVC, MLflow, Streamlit and PyG, but none was ever installed (design section 1.3, item 8).

## Decision
Remove them. Flower: Ray on Windows is experimental and its DP wrappers are a preview; the decision stands although Flower does document an accountant wrapper. RecBole: heavy, and the baselines take under 60 lines each. OpenDP sampler: see ADR-037. DVC and MLflow: JSON run records in git are enough. Streamlit: see ADR-052. PyG: never installed; the optional item-graph propagation is not built. Added: `dp-accounting`, `cryptography`, `rfc8785`, `matplotlib`; `scipy` is declared explicitly. The FL runtime is an in-process simulation.

## Consequences
No claim of running on Flower. Verification items 7, 10 and 13 no longer apply.

## Supersedes
Amends ADR-001 and ADR-035. Removes the OpenDP sampler from ADR-021 (see ADR-037).
