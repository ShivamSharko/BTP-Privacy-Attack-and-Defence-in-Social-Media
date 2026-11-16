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

## Open items
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
