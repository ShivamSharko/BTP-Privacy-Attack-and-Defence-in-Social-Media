# ADR-051: Receipts hold only data-independent fields; empty cohorts are noised

- Status: Approved (CHANGE-023)
- Date: 17 November 2026

## Context
The old loop skipped a round when nobody was sampled. Whether a round is skipped depends on who was sampled. Realised cohort sizes and update norms depend on who took part.

## Decision
The loop always adds the Gaussian noise, including for an empty cohort, and the accountant counts the round. Receipts in the ledger carry only values that do not depend on who took part: the round number, the configuration hash, the sampling rate, the noise multiplier, the clipping norm, the expected cohort size (a public constant) and the privacy spent. Realised cohort sizes and update norms are written only to run records, under diagnostics.

## Consequences
The public ledger reveals nothing about who participated, and one user's absence from a round changes no receipt. The diagnostics stay available for debugging; they are not covered by the privacy guarantee and contain no user or business identifiers.

## Supersedes
Nothing. It changes the round loop inherited from CHANGE-017.
