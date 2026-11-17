# ADR-046: Three accountants, value of record is the larger of PRV and PLD

- Status: Approved (CHANGE-023)
- Date: 17 November 2026

## Context
ADR-022 (PLD of record) and ADR-036 (PRV of record, PLD deferred) were both Approved and contradicted each other. NIST SP 800-226 asks for the unit, epsilon, delta and the accountant to be reported.

## Decision
Every run uses Opacus PRV, Opacus RDP and dp-accounting PLD. PRV and PLD must agree within max(5%, 0.05 absolute); RDP must be no smaller than either, less 0.01. A run that fails is recorded as `accounting_inconsistent` and left out of every table. The epsilon of record is the larger of PRV and PLD, with delta = 1/(10n), n = 9,913. Epsilon at delta = 1/n^2 and without sampling amplification are reported next to it. The rounds a run may train are confirmed with both accountants before training. Seeded float Gaussian noise (ADR-037) is kept and disclosed in every receipt; the OpenDP sampler wording of ADR-021 is superseded by ADR-037.

## Consequences
Known answer: q = 0.01, z = 0.534, T = 400, n = 9,913 gives PRV 7.771, PLD 7.761, RDP 9.27 (measured on this PC, 17 November 2026).

## Supersedes
ADR-036 and ADR-021. Restores the gate of ADR-022 and amends its value of record. ADR-037 stays Approved.
