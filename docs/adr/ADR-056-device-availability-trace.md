# ADR-056: Device availability trace: source and safe loading

- Status: Approved (CHANGE-024)
- Date: 17 November 2026 (evening)

## Context
Participation (RQ5) used four synthetic availability scenarios (ADR-030 as amended by CHANGE-023). A measured trace of device availability was left out in the morning. The FedScale repository publishes one, `client_behave_trace`, as a Python pickle.

## Decision
- Use the FedScale `client_behave_trace` (25,640,150 bytes, 107,749 devices, mean share of time available 0.21). Source URL, download date and SHA-256 are in `docs/data-access.md`.
- The file is optional and lives at `data/external/fedscale/client_behave_trace`, which is git-ignored. It is never committed or redistributed. The repository is Apache-2.0; its dataset notes say the datasets are for research use only.
- Read it only with `RestrictedUnpickler` in `src/prism/data/traces.py`, which resolves exactly one global, `collections.OrderedDict`, and refuses every other. The structure is validated, only the availability intervals and the trace length are kept per device, and the device model string is dropped. `pickle.load` is never used on it.
- Three participation scenarios: `trace` (devices assigned to users at random, static probability = the device's active share, floored at 0.05), `trace_activity` (the same devices rank-matched to history length) and `trace_replay` (availability replayed round by round with random device and random time offset per user).
- One round is taken as 30 minutes in `trace_replay`. This is an assumption, not a measurement.
- Epsilon is exact for `trace` and `trace_replay`: assignment, offsets and schedule do not depend on user data, selection is still Poisson at the nominal rate, and a zero update from an unavailable client is within the clipping norm. It is nominal for `trace_activity`, because rank-matching is a rank over all users (the same reason as `activity` and `social`).
- Without the file the three scenarios are skipped, with a note in the result.

## Consequences
Devices are not linked to real users: they come from another population and are assigned by chance or by rank. The trace is read cyclically (time modulo the trace length) and devices are sampled without regard to model, region or trace length. For SGD server optimisers the rate is scaled by 1 / (mean availability over the schedule); Adam is left alone.

## Supersedes
Amends ADR-030. Replaces the "not used" status of R32 in the roadmap.
