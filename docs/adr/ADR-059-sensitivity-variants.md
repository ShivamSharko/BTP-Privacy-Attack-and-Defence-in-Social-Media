# ADR-059: Sensitivity variants with frozen hyperparameters

- Status: Approved (CHANGE-024)
- Date: 17 November 2026 (evening)

## Context
CHANGE-012 and ADR-032 pre-registered a k-core sensitivity sweep at k in {10, 20}, and the pre-registration also names an analysis with reviews of 4 stars or more. Both were open after CHANGE-023.

## Decision
- Three variants in `src/prism/data/variants.py`, built from the same filtered source files as the main dataset: `k10` (19,141 users, 9,950 businesses, 557,772 interactions), `k20` (6,001, 4,284, 311,935) and `stars4` (reviews of 4 stars or more, then k = 15: 5,551, 3,759, 209,961). The main dataset has 9,913, 6,319 and 410,193.
- The same per-user chronological 70/10/20 split, the same text embeddings (reused from the main build by business after a sample of 64 re-encodes to cosine at least 0.999, else encoded) and the friend graph restricted to the variant's users. Data goes to `data/processed_<name>` (git-ignored); the aggregate card goes to `results/sensitivity/<name>/dataset_card.json`.
- `prism sensitivity` runs a reduced RQ1 on each variant: both regimes, the non-private reference and epsilon 8 and 1, 3 seeds. Hyperparameters stay frozen from the main dataset; noise is recalibrated for each variant's user count. `prism sensitivity --build-only` builds the data only.
- A list-length readout gives retention from NDCG@20, HR@10 and HR@20 next to NDCG@10.
- `conclusion_stable` compares each variant with the main dataset (row "k15"): same H1 verdict at epsilon 8 and same sign of personalisation retained.
- Control: the non-private model must reach at least 1.1 times MostPopular's NDCG@10, otherwise the file is INVALID.

## Consequences
H1 fails on every variant, so the conclusion does not depend on the filter; retention measured at list length 20 is one to three points lower than at list length 10. Frozen settings may favour or hurt a variant of a different size, and nothing was re-tuned. The variants are subsets of the same Philadelphia sample, so they test sensitivity to preprocessing, not to another city. Numbers: see results/report/report.html.

## Supersedes
Completes the sweep named in ADR-032, whose "remains open" amendment is itself amended.
