# ADR-053: Source rule excludes conference and journal papers

- Status: Approved (CHANGE-023)
- Date: 17 November 2026

## Context
CHANGE-013 adopted option (c): any credible source, including conference and journal papers, with a peer-reviewed literature review as a planned step. The owner decided on 17 November 2026 to reverse this.

## Decision
Conference papers and journal papers are excluded from all research for this project, whatever any other document says. Permitted sources are standards, government and agency reports, official documentation, vendor engineering write-ups and open-source repositories. The literature review is part of the rebuild and is written under this rule as `docs/literature-review.md`. Items that cannot be confirmed from such sources are marked UNVERIFIED and are not relied on.

## Consequences
Verification item 1 and open question 1 are closed by this decision. Section 1 of the roadmap is rewritten. The P-series is not created.

## Supersedes
The source rule of CHANGE-013 (roadmap section 1, option (c)).
