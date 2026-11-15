# Implementation log

The single progress tracker. PROJECT_ROADMAP.md remains the SSOT for decisions.

| Step | Date | Scope | Evidence | Status |
|---|---|---|---|---|
| 0 | 15 Nov 2026 | Python 3.12 via uv, repo skeleton, ruff/mypy/pytest/pip-audit, uv.lock, private GitHub repo | commit `chore(step-0)`; local checks pass | Done |
| 1 | 15 Nov 2026 | CI workflow, licence gate, gitleaks, .gitattributes | commit `22e71d6` | Done |
| 1.1 | 15 Nov 2026 | Review fixes: gitignore anchoring, Yelp ignore, licence gate rewrite, run provenance, CI/make parity | commit `0334953`; GitHub Actions CI green in 2m 19s | Done |
| 2 | 15 Nov 2026 | Yelp acquisition, integrity record, aggregate-only dataset inventory | tar SHA-256 7196433B8A43...; docs/data-access.md; results/dataset_profile.json; 150346 businesses / 6990280 reviews / 1987897 users; 51 tests passing | Done - inventory verified |

## Open items
- Roadmap governance Commit B: section 19 signatures, ADRs to Approved, header v1.1.0, CHANGE-009/010.
- Mokshit's acknowledgement of the roadmap (blocks P1).
- Repo licence for our own code (MIT proposed) - owner decision pending.
- Yelp licence clauses and exact source URL to be pasted into docs/data-access.md.
- Verification queue items 1-15 (roadmap section 18); item 11 partially closed.
