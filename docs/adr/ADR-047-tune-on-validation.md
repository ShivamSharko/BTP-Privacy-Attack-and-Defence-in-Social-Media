# ADR-047: Tune on validation, final model on train plus validation, one test evaluation

- Status: Approved (CHANGE-023)
- Date: 17 November 2026

## Context
The earlier runs were tuned and reported on the same split. The validation split was never loaded, test metrics were computed at intermediate rounds, and validation items were neither masked nor used as history at test time.

## Decision
Hyperparameters are tuned on the validation split only (train history, validation targets) and frozen in `experiments/frozen.json` before any test-split evaluation of the new model. Final models train on train plus validation and are evaluated once, on test, at the final round, with train and validation items masked. Validation and test are later interactions of the same users, so n = 9,913, q, delta and the privacy unit do not change. Amendment 1 of `PREREGISTRATION.md` was written before the first test evaluation. Every epsilon is labelled "excluding hyperparameter selection".

## Consequences
The privacy cost of tuning is not accounted and is disclosed in every receipt and in the report (NIST SP 800-226). Tuning runs are separate ledger lineages whose epsilon is not composed with the final run's.

## Supersedes
The earlier tuning practice recorded in CHANGE-017 to CHANGE-020. No ADR number is replaced.
