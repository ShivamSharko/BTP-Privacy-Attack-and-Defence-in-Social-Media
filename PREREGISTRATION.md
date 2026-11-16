# PREREGISTRATION: Privacy Attack and Defence in Social Media

**Project:** PRISM-Rec (BTP, LNMIIT Jaipur)
**Owners:** Shivam Agarwal (23UEC621), Mokshit Jain (23UEC574)
**Guide:** Dr. Malika Acharya
**Date of Pre-registration:** 16 Nov 2026
**Status:** DRAFT (Pending Metro Selection)

This document locks in our hypotheses, data splitting strategy, and evaluation metrics *before* any filtering or model training occurs, preventing hindsight bias (PROJECT_ROADMAP.md §11).

## 1. Dataset & Filtering Strategy
- **Source:** Yelp Open Dataset (Jan 2022 release).
- **Metro Selection:** The **Philadelphia** metro area has been selected based on geographic bounding box analysis (lat: 39.8 to 40.2, lon: -75.3 to -74.9). This region yields ~3,67,534 users, ~13,12,661 reviews, and an average friend degree of 101.3, providing the strongest social graph connectivity for gossip experiments (ADR-031).
- **K-Core Filtering:** After metro selection, we will compute the per-user interaction histogram. The k-core threshold (k) will be chosen to balance graph density with population size (target: >5,000 users). We will not arbitrarily fix k=5 or k=10 without measuring the drop-off first.
- **Referential Integrity:** Reviews will be inner-joined with Users and Businesses. Orphan records (e.g., the ~32 distinct reviewers not in user.json) will be dropped and the count logged.

## 2. Data Splitting (Chronological, Per-User)
To prevent temporal leakage, for each user:
- **Test set:** The last 20% of their interactions (by `date`).
- **Validation set:** The 10% of interactions immediately preceding the test set.
- **Training set:** All remaining earlier interactions.
- *Constraint:* Users with fewer than 10 total interactions will be excluded to ensure valid splits.

## 3. Pre-registered Hypotheses
| ID | Hypothesis | Metric |
|---|---|---|
| H1 | FL+DP at ε=8 retains ≥90% of non-private central NDCG@10. | ΔNDCG@10 (95% CI) |
| H2 | Gossip with local DP shows a measurable utility gap vs federated central DP at equal ε, at a higher byte cost. | NDCG@10 gap, bytes-to-target |
| H3 | At ε=8, MI TPR@1%FPR ≤ 2× random baseline. | MI TPR@1%FPR |
| H4 | Plaintext trimmed-mean limits targeted-item promotion better than SecAgg+ modes under 20% adversary fraction. | Targeted-item hit rate@10 |
| H5 | Availability correlated with user activity produces a measurable NDCG@10 gap between groups. | Group NDCG@10 gap |

## 4. Evaluation Metrics
- **Utility:** NDCG@10, Recall@20, HR@10, MRR, catalogue coverage, Gini.
- **Privacy (Formal):** ε (with/without amplification), δ, T, q, C, z.
- **Privacy (Empirical):** MI AUC + TPR@1%FPR; inversion recovery accuracy.
- **Robustness:** Targeted-item hit rate@10, clean NDCG@10 drop.
- **Systems:** Bytes per client per round, rounds-to-target, wall-clock.

## 5. Statistical Rigour
- **Seeds:** 5 independent random seeds for all headline experiments.
- **Confidence Intervals:** 95% bootstrap CIs over users.
- **Significance:** Paired Wilcoxon signed-rank test with Holm-Bonferroni correction across metric families.
- **Negative Results:** If a hypothesis is falsified (e.g., utility drops >20% at ε=8), it will be reported and diagnosed, not hidden or tweaked post-hoc.

---
*Any deviation from this pre-registration during execution must be documented with a CHANGE-ID in PROJECT_ROADMAP.md.*
