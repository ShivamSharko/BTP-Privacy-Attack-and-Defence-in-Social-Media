# ADR-054: The what-if population simulation carries no epsilon claim

- Status: Approved (CHANGE-023)
- Date: 17 November 2026

## Context
With 9,913 users the noise on a 107,679-parameter update is large relative to the signal, and the first untuned DP run at epsilon 8 collapsed. DP may erase personalisation at every epsilon tested (design risk 2). The report should still say how many users would be needed.

## Decision
The what-if runs divide the noise by k, as if the population were k times larger (the design names 2, 5 and 10). They are labelled simulations. They carry no epsilon, write no ledger entries and are never shown in a table of private results.

## Consequences
The result is a users-needed estimate, not a privacy guarantee. A reader cannot confuse it with an accounted run, because the run has no epsilon and the report labels the curve as a simulation.

## Supersedes
Nothing.
