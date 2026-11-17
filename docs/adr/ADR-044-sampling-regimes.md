# ADR-044: Sampling regimes replace central versus federated

- Status: Approved (CHANGE-023)
- Date: 17 November 2026

## Context
With per-user clipping and Gaussian noise on the sum, "central DP" and "federated DP" are the same mechanism. They differ only in sampling rate, number of rounds and local steps. ADR-041 had already found that rounds, not topology, drove the utility gap.

## Decision
RQ1 reports the privacy-utility curve for two named sampling regimes: `large` (sampling rate 0.5, 40 rounds) and `small` (sampling rate 0.05, 400 rounds). Privacy levels are epsilon in {1, 2, 4, 8, 16} and non-private, with 10 seeds. Each regime also runs a clip-only diagnostic that is not private. The H1 denominator is the non-private model trained with the same rounds and sampling rate in the same regime. A second metric is personalisation retained: (private - MostPopular) / (non-private - MostPopular).

## Consequences
No claim compares central with federated training. The trust difference between a server and no server is measured in RQ3 and RQ2, where it belongs.

## Supersedes
Amends ADR-041: the round-matched central control is replaced by the two regimes. Settings are in `experiments/frozen.json`.
