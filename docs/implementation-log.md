# Implementation log

The single progress tracker. PROJECT_ROADMAP.md remains the SSOT for decisions.

| Step | Date | Scope | Evidence | Status |
|---|---|---|---|---|
| 0 | 15 Nov 2026 | Python 3.12 via uv, repo skeleton, ruff/mypy/pytest/pip-audit, uv.lock, private GitHub repo | commit `chore(step-0)`; local checks pass | Done |
| 1 | 15 Nov 2026 | CI workflow, licence gate, gitleaks, .gitattributes | commit `22e71d6` | Done |
| 1.1 | 15 Nov 2026 | Review fixes: gitignore anchoring, Yelp ignore, licence gate rewrite, run provenance, CI/make parity | commit `0334953`; GitHub Actions CI green in 2m 19s | Done |
| 2 | 15 Nov 2026 | Yelp acquisition, integrity record, aggregate-only dataset inventory | tar SHA-256 7196433B8A43...; docs/data-access.md; results/dataset_profile.json; 150346 businesses / 6990280 reviews / 1987897 users; 51 tests passing | Done - inventory verified |
| 3 | 16 Nov 2026 | Metro geographic analysis (Philadelphia selected), pandera data contracts, PREREGISTRATION.md draft | scripts/metro_analysis.py, src/prism/data/contracts.py, PREREGISTRATION.md | Done |
| 4 | 16 Nov 2026 | Philadelphia streaming subset, referential integrity, k-core measurement | scripts/build_philly_subset.py, src/prism/data/filtering.py, results/philly_filter_report.json | Done |
| 5 | 16 Nov 2026 | k=15 applied, contracts fixed, chronological splits, dataset card | src/prism/data/splits.py, scripts/build_dataset.py, results/dataset_card.json | Done |
| 6 | 16 Nov 2026 | Data-layer test hardening; metro CLI made testable; hardware and split shares recorded | tests/test_build_philly_subset_stages.py, tests/test_metro_analysis_stages.py, tests/test_splits_errors.py, tests/test_environment_paths.py | Done |
| 7A | 17 Nov 2026 | Frozen content features, ranking metrics, MostPopular and ItemKNN baselines | src/prism/data/features.py, src/prism/eval/, results/features_card.json, results/baselines.json | Done |
| 7B | 17 Nov 2026 | Two-tower trainer, user-level DP, PRV/RDP accounting, resumable central/federated grid | src/prism/privacy/dp.py, src/prism/models/two_tower.py, scripts/run_grid.py | Done (content-only model; superseded by step 11, results archived) |
| 8 | 17 Nov 2026 | Grid complete (60/60 runs); reproducible summary with bootstrap CIs, paired tests, Holm correction | results/summary.json, results/summary_table.csv | Done (archived under results/archive/v1-content-only/) |
| 9 | 17 Nov 2026 | Grid extended: 10 seeds plus round-matched central control | scripts/run_grid.py, results/summary.json | Done (archived under results/archive/v1-content-only/) |
| 10 | 17 Nov 2026 | Interaction-level MI over 180 checkpoints; analytic first-layer inversion | results/attacks_membership.json, results/attacks_inversion.json | Done. The inversion result was later found invalid (the attack read the wrong block of the parameter vector) and is archived with a warning; the membership result is uninformative. Both are replaced by step 11 |
| 11 | 17 Nov 2026 | Rebuild under the approved design (CHANGE-023, ADR-043 to ADR-055): see "Step 11: what was built" below | `docs/superpowers/specs/2026-11-17-prism-rebuild-design.md`, `docs/superpowers/plans/2026-11-17-prism-rebuild.md`, `PREREGISTRATION.md` Amendment 1, `experiments/frozen.json` | Done in code and documents; results: see results/report/report.html |

Evidence paths of steps 7B to 10 point to files that no longer exist under those names: the scripts were rewritten into the `prism` package and the results moved to `results/archive/v1-content-only/` (see its README).

## Step 11: what was built

Results: see results/report/report.html.

- **Package `src/prism/`** (design section 3.3):
  - `config.py`, `seeding.py`, `io.py`, `environment.py`, `cli.py`: frozen configuration with a canonical hash, independent named random streams, atomic writes, run provenance, one entry point.
  - `data/`: kept loaders, contracts, filtering, splits and features; added `bundle.py` (train, validation and test per user plus item content), `social.py` (friend graph, peer and pair sampling) and `synthetic.py` (shareable demo dataset).
  - `models/hybrid.py`: item ID embeddings on a fixed content projection, 107,679 parameters (ADR-043).
  - `fl/`: `sampling.py`, `availability.py`, `client.py`, `fast.py` (closed-form clipped sum with autograd self-check), `aggregate.py` (sum, trimmed mean, median), `secagg.py` (pairwise-mask secure-sum simulation), `server.py` (the round loop), `gossip.py`.
  - `privacy/`: `dp.py` (kept and extended) and `accounting.py` (Opacus PRV, Opacus RDP, dp-accounting PLD, consistency gate, value of record).
  - `attacks/`: `inversion.py`, `links.py`, `membership.py`, `poisoning.py`, each with controls.
  - `ledger/`: `merkle.py`, `receipts.py`, `log.py`, `gate.py` (Merkle log, Ed25519-signed receipts and checkpoints, release gate).
  - `eval/`: `metrics.py`, `baselines.py` (MostPopular, ItemKNN, item-item ridge, friends-based), `stats.py`.
  - `experiments/`: `runner.py`, `regimes.py`, `calibration.py`, and one module per question: `baselines.py`, `privacy_utility.py`, `update_leakage.py`, `membership.py`, `poisoning.py`, `gossip.py`, `participation.py`, `ledger_audit.py`, `social_build.py`, `demo.py`.
  - `report/build.py`: static HTML, Markdown and CSV report.
- **Tests** in `tests/`, written first: unit, property (hypothesis), known-answer, statistical, control, determinism and end-to-end tests as listed in design section 5.4.
- **CLI commands** (`prism <command>`): `baselines`, `grid`, `update-leakage`, `membership`, `poisoning`, `gossip`, `participation`, `ledger`, `social`, `demo-small`, `report`. Makefile targets: `demo`, `social`, `baselines`, `grid`, `attacks`, `social-experiments`, `ledger`, `report`, `all-experiments`.
- **Archived results:** the 180 content-only runs and the step-10 attack files moved to `results/archive/v1-content-only/`, with a README that marks the inversion result INVALID.
- **Frozen hyperparameters:** `experiments/frozen.json` version 1, tuned on the validation split only (29 runs, 17 Nov 2026, 12:37 to 12:57 IST) before any test evaluation of the new model. Two regimes: `large` (rate 0.5, 40 rounds) and `small` (rate 0.05, 400 rounds); clip norm 5.0; epsilons 1, 2, 4, 8, 16; seeds 0 to 9.
- **Amended pre-registration:** `PREREGISTRATION.md` Amendment 1, with the H1 to H5 wording as tested and the expectations stated before the runs.
- **Literature review:** `docs/literature-review.md`, written under the new source rule (ADR-053).
- **Plain-language viva notes:** `docs/viva-notes.md`.
- **Decisions:** `PROJECT_ROADMAP.md` v2.0.0 with CHANGE-023, ADR-043 to ADR-055 with a file each in `docs/adr/`, and a new compliance note in `docs/yelp-compliance.md`.
- **Dependencies:** `dp-accounting`, `cryptography`, `rfc8785` and `matplotlib` added; `scipy` declared.

## Open items

- Guide email and dates: the guide email (verification item 2) is awaiting owner action. The submission date and mid-term review dates are still unknown, and G0 cannot close without them.
- Pre-publication review by the dataset provider: findings must be submitted at least three weeks before the submission date and the outcome recorded. This blocks any public presentation or publication (ADR-033, CHANGE-015, R-16). The trigger date cannot be set until the submission date is known.
- k sensitivity sweep at k in {10, 20} (pre-registered, not run in step 11).
- Stars >= 4 sensitivity analysis (pre-registered, not run in step 11).
- Owners to read `docs/viva-notes.md` and be able to explain each component (roadmap rule 0.1.7, R-24).
- Commits: the three earlier local commits on branch `rebuild/v2` (`db7633f`, `dbeb9cf`, `1718f84`) and all later uncommitted work await the owner's commits. Nothing has been pushed.
- Second owner's acknowledgement of roadmap v2.0.0 (rule 0.1.3).
- Cut in step 11 and still open: free-riding measurement, trace-based availability, committee-median robustness mode, Flower parity check (roadmap 4.5.1).
- Verification queue (roadmap section 18): items 2 to 6, 8, 11, 12, 14, 15 and 16 are still open (see `docs/verification-log.md`). Items 1, 7, 9, 10 and 13 are closed or no longer needed.
- `docs/data-access.md` still has a TODO for the exact Yelp source URL, and the Yelp licence clauses are to be checked there (verification item 11 partly closed).
- MIT is declared in `pyproject.toml` (CHANGE-011), but there is no `LICENSE` file in the repository root.
- Owner-written deliverables not yet started: threat model, compliance mapping, model card, datasheet, report prose, demo video and the clean-environment rerun (roadmap section 17). Any public use of results needs the pre-publication review first.
- Repository stays private by default; public release needs Yelp, both owners and the guide (ADR-033).

### Closed on 17 Nov 2026

- Holm rejections and the marginal central_matched epsilon=16 result (p=0.0488): they describe the old content-only model, now archived and replaced by the new grid.
- Topology confound resolved with non-overlapping intervals; no per-epsilon winner: central versus federated is no longer compared (ADR-044).
- User-level membership inference with reference models was outstanding: implemented with control gates (ADR-048); results in the report.
- DP mechanism verified active with C=4.9214 and the old noise multipliers: values of the old model; calibration is redone for the new model and the accountant gate (ADR-046) replaces the manual check.
- Clipping barely binds at convergence: old-model observation; each regime now also runs a clip-only diagnostic.
- Federated retention 76.8/85.1/87.3/89.7/93.8 percent and four configurations at p=0.0625: old results; retention is redefined (ADR-044) and RQ1 uses 10 seeds.
- Central shows no detectable effect and eps=2 exceeds non-private: old-model result, archived.
- Federated DP monotonic privacy-utility curve (76.6 to 93.7 percent): old-model result, archived.
- Central DP no detectable degradation (duplicate of the central item above): old-model result, archived.
- CONFOUND of 400 versus 40 rounds: removed by replacing the topology comparison with sampling regimes (ADR-044).
- Neither topology beat MostPopular and R-23 materialised: the cause was the content-only model, replaced by the hybrid model (ADR-043); R-23 stays in the register as history.
- Five seeds cannot reach two-sided significance: RQ1 uses 10 seeds (CHANGE-021, Amendment 1); H5 with 5 seeds is reported as underpowered.
- Probe with item bias (best NDCG@10 0.0101 at lr=2.0) and ADR-040: superseded by ADR-043 and the frozen settings.
- ADR-038 cosine fix and ADR-039 item bias: both carried into the hybrid model (ADR-043); the learning rate was fixed by validation tuning.
- Step 7B smoke test (model at random chance): fixed by ADR-038 in step 7B, and the old trainer is replaced by the new round loop.
- Roadmap governance Commit B (section 19 signatures, ADRs to Approved, v1.1.0, CHANGE-009/010): done in CHANGE-009.
- Mokshit's acknowledgement of the roadmap (blocks P1): recorded in CHANGE-011 on 16 Nov 2026. The acknowledgement of v2.0.0 is a new open item above.
- Repo licence for our own code (MIT proposed): adopted in CHANGE-011. The missing `LICENSE` file is a new open item above.
- k=15 and CHANGE-012 approved on 16 Nov 2026; Step 5 will apply the filter: step 5 is done.
- P-series peer-reviewed literature review permitted and required (CHANGE-013): the rule is superseded by ADR-053; the review is written as `docs/literature-review.md`.
- Step 5 contract fixes (UserSchema `name` column): done in step 5 (the contracts keep only the needed columns and never store user names).
- Documentation-versus-data discrepancies to encode in contracts (friends as a string, review.date with a time): encoded in `src/prism/data/contracts.py`.
- Single-PC execution; Section 9 budget to be re-measured at G1: Section 9 was restated in CHANGE-023 and measured values are in the report.
