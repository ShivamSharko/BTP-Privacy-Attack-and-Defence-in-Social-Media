# Implementation log

The single progress tracker. PROJECT_ROADMAP.md remains the SSOT for decisions.

| Step | Date | Scope | Evidence | Status |
|---|---|---|---|---|
| 0 | 15 Nov 2026 | Python 3.12 via uv, repo skeleton, ruff/mypy/pytest/pip-audit, uv.lock, private GitHub repo | commit `chore(step-0)`; local checks pass | Done |
| 1 | 15 Nov 2026 | CI workflow, licence gate, gitleaks, .gitattributes | commit `22e71d6` | Done |
| 1.1 | 15 Nov 2026 | Review fixes: gitignore anchoring, Yelp ignore, licence gate rewrite, run provenance, CI/make parity | commit `0334953`; GitHub Actions CI green in 2m 19s | Done |
| 2 | 15 Nov 2026 | Yelp acquisition, integrity record, aggregate-only dataset inventory | tar SHA-256 7196433B8A43...; docs/data-access.md; results/dataset_profile.json; 150346 businesses / 6990280 reviews / 1987897 users; 51 tests passing | Done - inventory verified |
| 3 | 16 Nov 2026 | Metro geographic analysis (Philadelphia selected), pandera data contracts, PREREGISTRATION.md draft | scripts/metro_analysis.py, src/prism/data/contracts.py, PREREGISTRATION.md | Done |
| 4 | 16 Nov 2026 | Philadelphia streaming subset, referential integrity, k-core measurement | scripts/build_philly_subset.py, src/prism/data/filtering.py, results/philly_filter_report.json | In progress |
| 5 | 16 Nov 2026 | k=15 applied, contracts fixed, chronological splits, dataset card | src/prism/data/splits.py, scripts/build_dataset.py, results/dataset_card.json | In progress |
| 6 | 16 Nov 2026 | Data-layer test hardening; metro CLI made testable; hardware and split shares recorded | tests/test_build_philly_subset_stages.py, tests/test_metro_analysis_stages.py, tests/test_splits_errors.py, tests/test_environment_paths.py | In progress |
| 7A | 17 Nov 2026 | Frozen content features, ranking metrics, MostPopular and ItemKNN baselines | src/prism/data/features.py, src/prism/eval/, results/features_card.json, results/baselines.json | In progress |
| 7B | 17 Nov 2026 | Two-tower trainer, user-level DP, PRV/RDP accounting, resumable central/federated grid | src/prism/privacy/dp.py, src/prism/models/two_tower.py, scripts/run_grid.py | Done |
| 8 | 17 Nov 2026 | Grid complete (60/60 runs); reproducible summary with bootstrap CIs, paired tests, Holm correction | results/summary.json, results/summary_table.csv | Done |
| 9 | 17 Nov 2026 | Grid extended: 10 seeds plus round-matched central control | scripts/run_grid.py, results/summary.json | Done |
| 10 | 17 Nov 2026 | Interaction-level MI over 180 checkpoints; analytic first-layer inversion | results/attacks_membership.json, results/attacks_inversion.json | In progress |

## Open items
- Holm rejects all five federated and all five central_matched comparisons; central_matched epsilon=16 is marginal at p=0.0488.
- Topology confound resolved with non-overlapping non-private intervals; per-epsilon cross-topology intervals overlap so no per-epsilon winner is claimed.
- User-level membership inference with a held-out user population and reference models is still outstanding (~10 training runs).
- DP mechanism verified active: C=4.9214; federated z 1.0961/0.8306/0.6745/0.5340/0.4247 for eps 1/2/4/8/16; central z 5.0149/2.8135/1.6893/1.0804/0.7370; clipped deltas 3.49-4.01 all below C; non-private runs have C=None and z=0.
- Clipping barely binds at convergence because deltas fall below C, so the DP effect comes mainly from the added noise, not the clipping.
- Federated retention 76.8/85.1/87.3/89.7/93.8 percent at eps 1/2/4/8/16; four configurations sit at p=0.0625, the arithmetic floor for 5 seeds.
- Central shows no detectable effect; eps=2 exceeds non-private, so the claim must be "not detectable at n=5", never "no cost".
- Federated DP shows a monotonic privacy-utility curve: retention 76.6% (eps 1), 84.9% (2), 87.3% (4), 89.5% (8), 93.7% (16) versus federated non-private 0.02384.
- Central DP shows no detectable degradation at any epsilon; all differences are inside seed noise and eps=2 exceeds non-private, so the correct claim is "no detectable effect", not "no cost".
- CONFOUND: federated used 400 server rounds versus central 40 at matched data budget. H1 as literally pre-registered gives 120.4% retention (satisfied) but is confounded by round count. A round-matched central control (q=0.02, E=1, T=400) is required.
- Neither topology beat MostPopular 0.0250; ItemKNN 0.0347 remains ahead. R-23 materialised.
- Five seeds cannot yield two-sided significance at alpha=0.05 (minimum p = 0.0625). Extend to 10 seeds for headline comparisons.
- Probe with item bias: best NDCG@10 0.0101 at lr=2.0 round 40 (6.7x random chance), still below MostPopular 0.0250 and ItemKNN 0.0347. Cause identified as bias learning rate; ADR-040 applied. Grid launched at lr=2.0 with RQ1 framed as relative retention.
- ADR-038 cosine fix raised deltas ~50x and NDCG@10 to 0.0071 (4.7x random) but still below MostPopular 0.0250; ADR-039 item bias added to restore popularity representation. Learning rate to be confirmed by the 40-round probe before launch.
- Step 7B smoke test verified DP accounting, clipping and resumability, but revealed the model at random chance; scoring fixed via ADR-038 and learning rate to be selected by probe before the overnight launch.
- Roadmap governance Commit B: section 19 signatures, ADRs to Approved, header v1.1.0, CHANGE-009/010.
- Mokshit's acknowledgement of the roadmap (blocks P1).
- Repo licence for our own code (MIT proposed) - owner decision pending.
- Yelp licence clauses and exact source URL to be pasted into docs/data-access.md.
- Verification queue items 1-15 (roadmap section 18); item 11 partially closed.
- k=15 and CHANGE-012 approved by both owners on 16 Nov 2026; Step 5 will apply the filter and build splits.
- Guide email (verification items 1 and 2) awaiting owner action - G0 cannot close without it.
- Yelp Section 3 pre-publication review is a new G7 exit condition (ADR-033, R-16).
- Repository stays private by default; public release needs Yelp + owners + guide approval.
- P-series peer-reviewed literature review is now permitted and required (CHANGE-013); dedicated step pending.
- Step 5 contract fixes identified: UserSchema declares a `name` column that the filtered users CSV does not contain; pandera will fail unless required=False or a subset schema is used.
- Documentation-versus-data discrepancies to encode in Step 5 contracts: user.friends is documented as an array but is a comma-separated string in the actual data; review.date is documented as YYYY-MM-DD but is YYYY-MM-DD HH:MM:SS in the actual data; business.categories documented as an array, actual format to be verified.
- Yelp pre-publication review deferred (CHANGE-015) but still blocks any public release; trigger is 3 weeks before the submission date, which is still unknown.
- Submission and mid-term dates still required from the guide.
- Single-PC execution (ADR-034); Section 9 compute budget to be re-measured on this machine at G1.
