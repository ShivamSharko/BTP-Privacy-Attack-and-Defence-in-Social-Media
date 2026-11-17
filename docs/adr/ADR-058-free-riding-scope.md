# ADR-058: Free-riding experiment scope

- Status: Approved (CHANGE-024)
- Date: 17 November 2026 (evening)

## Context
Free-riding measurement was a Should item (roadmap 4.5), listed in ADR-029 and cut in CHANGE-023. A free-rider takes part in training and receives the model without doing the computation.

## Decision
- Two behaviours, in `src/prism/attacks/free_riding.py`: `zero` (an all-zero update) and `noise` (Gaussian noise rescaled to the mean L2 norm of the honest updates in the same chunk).
- Free-rider fractions 0, 10% and 30% (sets nest as the fraction grows); regime `small`, sampling rate 0.02, 200 rounds, 3 seeds. Every run is clip-only with the plain sum, no DP noise.
- Three readouts in `src/prism/experiments/free_riding.py`: the cost to everyone (relative drop in NDCG@10 against the 0% run), the free-riders' gain (mean NDCG@10 of free-riders minus contributors under the same model, with a bootstrap interval) and detection when updates are visible (AUC of separating free-riders from contributors by update norm and by cosine similarity to the mean of the others, over the last 20 rounds).
- Under secure aggregation detection is recorded as `not_applicable`: the server holds only the sum.
- Controls: the `zero` behaviour must be caught by the norm score (AUC at least 0.95) and the 0% model must reach at least 1.1 times MostPopular's NDCG@10, otherwise the file is INVALID. Whether `noise` evades the norm score (AUC within 0.1 of 0.5) and is caught by the cosine score (AUC at least 0.8) is a readout, not a control.

## Consequences
The experiment shows the conflict between detecting free-riders and keeping updates hidden. It does not propose a detector. Behaviours are simple and non-adaptive, runs carry no privacy guarantee, and intervals are min and max over three seeds. Numbers: see results/report/report.html.

## Supersedes
Implements the free-riding part of ADR-029, whose "not built" amendment is itself amended.
