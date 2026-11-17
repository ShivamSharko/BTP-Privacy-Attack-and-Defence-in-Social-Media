# ADR-048: Attack scope with reference models and control gates

- Status: Approved (CHANGE-023)
- Date: 17 November 2026

## Context
The step-10 inversion attack read the wrong slice of the parameter vector (cosine 0.04 as coded, 1.0 with the right offset). The interaction-level membership attack read the model input, so it scored the same with and without DP. ADR-029 and ADR-042 disagreed about scope.

## Decision
Three attacks. (1) History inversion: from one update, score items by the standardised change in their bias plus the standardised norm of their embedding-row change; compare per-user AUC and precision@10 with a popularity prior, for a raw update, a locally noised update, cohort sums of 10 and 100, and a sum with central noise. (2) Friendship-link inference from the similarity of update vectors. (3) User-level membership inference: random user halves, 4 non-private reference models, loss on a held-back half of each user's history; report AUC, TPR at 1% and 0.1% FPR and an epsilon lower bound (9 targets, 4 references, 1 overfit control: 14 runs). No named paper method is used. Attack code writes a result file only if its controls pass; otherwise the file is marked INVALID. Inversion controls: raw AUC at least 0.80 and precision@10 at least 5 times the prior; masked update AUC within 0.5 +/- 0.05.

## Consequences
The invalid step-10 result is archived and never cited.

## Supersedes
ADR-042. Restores the user-level scope of ADR-029.
