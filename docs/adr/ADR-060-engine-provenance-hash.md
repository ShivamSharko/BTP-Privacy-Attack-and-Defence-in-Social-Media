# ADR-060: Engine-only provenance hash and strict resume

- Status: Approved (CHANGE-024)
- Date: 17 November 2026 (evening)

## Context
The independent review (design section 9.5) found that run records did not identify the code that produced them and that resume could reuse a record from older code. The first fix stored a package hash and a dirty flag. The records of 17 November were produced before the code was committed, so a git commit does not identify them.

## Decision
- `code_sha256` in `src/prism/experiments/runner.py` is a SHA-256 over the relative paths and contents (line endings normalised) of the 21 files in `ENGINE_FILES`: configuration, I/O, seeding, environment, data bundle, model, sampling, client, fast path, aggregation, server, privacy functions and accountants, the four ledger modules, metrics, calibration, regimes and the runner. It can be recomputed at any commit.
- Experiment, attack and report modules are not part of it, so adding an experiment does not make existing runs stale. Result files carry `payload_provenance`: `engine_sha256`, `module_sha256` (the experiment module and its listed helpers), the git commit and a dirty flag.
- Every run record stores `provenance.code_sha256`. `_finished` reuses a record only if its status is ok and its configuration hash matches, and adds `stale_code`: true when the stored hash differs from the current one, and also true for records that predate the hash.
- `PRISM_STRICT_RESUME=1` makes `_finished` refuse a stale record, so it is rerun.
- The clean rerun reproduced the earlier numbers exactly.

## Consequences
The hash is not a signature and does not cover data, the lockfile (hashed separately in the environment report) or experiment modules. A stale flag says the engine changed, not that results would differ. The records of 17 November still carry only the base commit.

## Supersedes
Completes the partly fixed finding on run provenance in design section 9.5.
