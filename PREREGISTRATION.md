# PREREGISTRATION: Privacy Attack and Defence in Social Media

**Project:** PRISM-Rec (BTP, LNMIIT Jaipur)
**Owners:** Shivam Agarwal (23UEC621), Mokshit Jain (23UEC574)
**Guide:** Dr. Malika Acharya
**Date of Pre-registration:** 16 Nov 2026
**Status:** LOCKED, with Amendments 1 and 2 of 17 November 2026 (see the end of this document). The text above the amendment is kept as first written.

This document locks in our hypotheses, data splitting strategy, and evaluation metrics *before* any filtering or model training occurs, preventing hindsight bias (PROJECT_ROADMAP.md §11).

## 1. Dataset & Filtering Strategy
- **Source:** Yelp Open Dataset (Jan 2022 release).
- **Metro Selection:** The **Philadelphia** metro area has been selected based on geographic bounding box analysis (lat: 39.8 to 40.2, lon: -75.3 to -74.9). This region yields ~3,67,534 users, ~13,12,661 reviews, and an average friend degree of 101.3, providing the strongest social graph connectivity for gossip experiments (ADR-031).
- **K-Core Filtering:** Iterative bipartite k-core with **k = 15**, chosen from the measured survival table (CHANGE-012, ADR-032). This yields 9,913 users, 6,319 businesses and 4,10,193 interactions; 77.1% of surviving users have at least one in-set friend (avg inner degree 18.5). The connectivity gate is defined as **>=70% connected share**. A **sensitivity sweep at k in {10, 20}** (3 seeds each) is pre-registered on the headline RQ1 and RQ2 comparisons as a robustness check. Because k-core guarantees >=15 interactions per user, the 70/10/20 chronological split always yields >=3 test, >=1 validation and >=11 training interactions.
- **Referential Integrity:** Reviews will be inner-joined with Users and Businesses. Orphan records (e.g., the ~32 distinct reviewers not in user.json) will be dropped and the count logged.
- **Known filtering bias:** k-core removes 74.8% of Philadelphia businesses (25,039 -> 6,319). Full-catalogue ranking is therefore over the filtered catalogue, which inflates absolute NDCG relative to the raw catalogue. This must be stated in the report.

## 2. Data Splitting (Chronological, Per-User)
To prevent temporal leakage, for each user:
- **Test set:** The last 20% of their interactions (by `date`).
- **Validation set:** The 10% of interactions immediately preceding the test set.
- **Training set:** All remaining earlier interactions.
- *Constraint:* Users with fewer than 10 total interactions will be excluded to ensure valid splits.
- **Realised split shares (measured 16 Nov 2026):** train 2,95,580 (72.06%),
  validation 36,206 (8.83%), test 78,407 (19.11%) of 4,10,193 interactions.
  Shares deviate from exactly 70/10/20 because integer floor on short histories
  rounds validation down and training absorbs the remainder. This is expected
  behaviour of the deterministic protocol, recorded here so it is not mistaken
  for a defect. Per-user minimum is 15 interactions, median 25, maximum 1,332.
- **Referential integrity outcome:** 4 orphan reviewer ids accounting for exactly
  4 reviews were dropped; 0 orphan businesses.

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

---

## Amendment 1 (17 November 2026, about 13:00 IST)

Written after tuning on the validation split and **before any test-split evaluation of the new
model**. Recorded in `PROJECT_ROADMAP.md` as CHANGE-023. Design record:
`docs/superpowers/specs/2026-11-17-prism-rebuild-design.md`.

### A1.1 What was already seen

Test-split results of the previous, content-only model were seen on 16 and 17 November (180 runs,
archived under `results/archive/v1-content-only/`). They showed that model ranks like MostPopular.
That is the reason for the changes below. No test-split result of the new model existed when this
amendment was written.

### A1.2 Deviations from the original text

1. **Model.** Item-ID embeddings on a fixed public projection of the text embeddings replace the
   content-only two-tower (the new model has 107,679 parameters; the old one had 121,391). Reason: content alone carries almost no signal on
   this dataset (validation NDCG@10 0.0031 untrained, 0.0205 trained, against MostPopular 0.0174).
2. **Seeds.** 10 seeds for RQ1 (was 5; already changed by CHANGE-021 without amending this file).
   3 to 5 seeds elsewhere, stated per experiment.
3. **Tuning and evaluation.** Hyperparameters are tuned on validation only and are frozen in
   `experiments/frozen.json`. Final models train on train plus validation and are evaluated once,
   on test, at the final round, with train and validation items masked.
4. **RQ1 comparison.** "Central" and "federated" are the same mechanism under user-level DP. RQ1
   reports two sampling regimes: `large` (rate 0.5, 40 rounds) and `small` (rate 0.05, 400 rounds).
5. **Accounting.** Epsilon of record is the larger of Opacus PRV and dp-accounting PLD, which must
   agree within max(5%, 0.05); RDP is a sanity bound. delta = 1/(10 n). Epsilon at delta = 1/n^2
   and without sampling amplification are reported next to it.
6. **Sensitivity sweeps.** The k in {10, 20} sweep and the stars >= 4 analysis are not run in this
   build. They remain open.
7. **Social scope.** Friendship-link inference, a friends-based baseline, gossip between friends
   and fairness across friend-count groups are added.

### A1.3 Hypotheses as tested

| ID | Statement | Decision rule |
|---|---|---|
| H1 | In each regime, the model at epsilon = 8 retains at least 90% of the NDCG@10 of the non-private model trained with the same sampling rate and rounds | Retention = mean over seeds of private NDCG@10 divided by mean non-private NDCG@10, at least 0.90. Also reported: personalisation retained, (private - MostPopular) / (non-private - MostPopular) |
| H2 | Gossip between friends with local DP at epsilon = 8 has a lower NDCG@10 than server-based training with central DP at epsilon = 8 on the same users | 95% bootstrap interval of the per-user difference excludes 0 |
| H3 | At epsilon = 8, user-level membership inference has TPR at 1% FPR of at most 2%, and a server that sees only cohort sums of 100 users recovers a member's history no better than the popularity prior plus 0.05 AUC | Both parts reported separately; controls must pass or the result is invalid |
| H4 | With attacker accounts at 10%, 20% and 30%, plaintext trimmed-mean aggregation gives lower target-item exposure than the secure-sum mode, and the gap grows with the attacker share | Lower at every share and the gap largest at 30% |
| H5 | Availability correlated with activity (or with friend count) produces a larger NDCG@10 gap between the top and bottom groups than independent availability | Paired across seeds. With 5 seeds the two-sided Wilcoxon p cannot go below 0.0625, so the sign pattern (5 of 5) is reported as the evidence and the test is reported as underpowered |

### A1.4 Expectations stated in advance

- H1 is expected to **fail**. On validation the retention at epsilon = 8 was 0.70 (`large`) and
  0.61 (`small`); personalisation retained was 0.27 and 0.07 (MostPopular scores 0.0181 on
  validation with the final metric code, which breaks ties by item index; 0.0174 quoted above was
  measured with the earlier metric code).
- H2 is expected to hold.
- The friendship-link attack is expected to work on raw updates and to be impossible under secure
  aggregation, where the server holds no per-user vector.

### A1.5 Frozen settings

See `experiments/frozen.json` (version 1). Clipping norm 5.0 in both regimes. Private runs use
Adam with rate 0.02 (`large`) and momentum SGD with rate 0.05 (`small`); non-private runs use Adam
with rates 0.05 and 0.02. The clipping norm and these settings were chosen on the validation data
of the same users; that choice is not covered by epsilon and is disclosed with every result.

---

## Amendment 2 (17 November 2026, about 21:45 IST)

Written **after** the main results were known. It records what was added the same evening. It
changes no hypothesis and no decision rule of Amendment 1.

### A2.1 Sensitivity sweeps (open in A1.2 item 6, now run)

The k-core sweep (k = 10 and k = 20 against the k = 15 used) and the analysis restricted to
reviews of 4 stars or more were run with 3 seeds, the non-private reference and epsilon = 8, in
both regimes. Hyperparameters were **not** re-tuned: they are the frozen values chosen on the main
dataset. Outcome: H1 fails on every variant, as on the main dataset. Retention is also reported
from NDCG@20; it is one to three points lower than from NDCG@10.

### A2.2 Exploratory additions

These were not pre-registered. They carry no hypothesis and are reported as measurements:

- free-riding clients (cost to others, gain to the free-rider, detectability);
- committee-median aggregation as a third robustness mode in the poisoning experiment;
- availability taken from a real device trace (random assignment, rank-matched to activity, and
  round-by-round replay) in the participation experiment;
- a parity check of the training loop against the Flower framework on a small synthetic problem.

### A2.3 Changes to experiments that test a hypothesis

- **H2 (gossip).** Rerun with 2,500 users and 3 seeds (was 2,000 and 2). The verdict is unchanged.
- **H5 (participation).** An independent review found that the code decided H5 with a two-sided
  test that cannot reach 0.05 with five seeds, instead of the sign pattern that A1.3 names as the
  evidence. The code now follows A1.3. The verdict changed from "not supported" to "supported",
  on one cell only: availability tied to friend count, at epsilon = 8, widens the gap in 5 of 5
  seeds, by 0.0009. Three other cells show no consistent change. This is weak evidence and is
  reported as such.
- **H4 (poisoning).** The code rule was stricter than A1.3 and now matches it. The verdict is
  unchanged.

### A2.4 Clean rerun and one corrected budget

Every experiment was rerun with the training code frozen; the numbers reproduce exactly, and each
run record now carries a hash of the engine source files. The free-riding experiment first ran
with a short training budget (rate 0.02, 200 rounds) and failed its own sanity control: the clean
model reached 1.07 times MostPopular against a required 1.10. It was rerun with the frozen
budget of the `small` regime (rate 0.05, 400 rounds). The control's threshold was not changed.
