# ADR-052: Static HTML report replaces the Streamlit dashboard

- Status: Approved (CHANGE-023)
- Date: 17 November 2026

## Context
The roadmap listed a Streamlit dashboard under Must (section 4.5) and in the deliverables. A dashboard needs a running server, which is a deployment this project excludes (section 4.4), and the Yelp terms limit what may be shown outside an academic setting.

## Decision
`prism report` builds a static HTML report with embedded figures, plus Markdown and CSV tables, from the aggregate results in `results/`. The main output is `results/report/report.html`. It contains aggregates only.

## Consequences
No server is needed and the report opens in any browser. Any public use of it still requires the Yelp pre-publication review. The report holds numbers and figures; the owners write the report prose (section 17, item 10).

## Supersedes
The dashboard items in sections 4.3, 4.5, 16 and 17 of the roadmap. No ADR number is replaced. R33 (Streamlit) is not used.
