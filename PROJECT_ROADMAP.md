# PROJECT_ROADMAP.md — PRISM-Rec
**Privacy Attack and Defence in Social Media: A Verifiable Privacy-Preserving Social Recommendation Platform**

| Field | Value |
|---|---|
| Document version | 2.1.1 |
| Status | **APPROVED - REBUILD IMPLEMENTED 17 NOVEMBER 2026 (see CHANGE-023); items cut in the morning built and run the same evening (see CHANGE-024)** |
| Last updated | 19 November 2026 (CHANGE-025) |
| Owners | Shivam Agarwal (23UEC621) — Privacy/ML lead; Mokshit Jain (23UEC574) — Systems/Security lead |
| Guide | Dr. Malika Acharya, LNMIIT Jaipur |
| Planned execution | 17 Nov 2026 → 5 Apr 2027 (20 weeks, 8 gates). The implementation work of Section 12 was compressed into 17 Nov 2026 (CHANGE-023); the report, the pre-publication review by the dataset provider and viva preparation keep their calendar gates |
| Budget | **Tier 0 only — ₹0** (paid tiers removed in CHANGE-005) |
| MVP milestone | Gate G3, 25 Jan 2027 (Section 4.5); the MVP content was delivered on 17 Nov 2026 |
| Previous version | v0.9.0 / v0.10.0 exist only in the planning conversation. From v1.0.0 onward, git history plus this change log is the authoritative record. v1.9.0 (15 to 17 Nov 2026) is superseded by this version. |
| Builds on | Phase 1 BTP report `BTP_23UEC621_23UEC574.pdf` (April 2026) — reference only, not a codebase to extend |

---

## 0. Governance of this document

### 0.1 Rules
1. This file is the **single source of truth (SSOT)**. If code, slides, or the report disagree with this file, this file wins until formally amended.
2. **No implementation begins before Section 19 approval is signed.**
3. Only the two owners jointly (with guide visibility) may approve a change.
4. Every change gets a `CHANGE-ID`, date, rationale, impact, and a version bump. Approved decisions are **never silently deleted** — they are marked `Superseded by …` or `Rejected`.
5. Any external fact (price, version, licence, law, dataset count) must carry a **⚠VERIFY** tag until checked and dated. Unverified facts may not be used to justify a decision.
6. Semantic versioning: MAJOR = scope/architecture change, MINOR = new decision, PATCH = clarification/typo.
7. **Viva rule:** every component in this file must be explainable in the viva by both owners. If neither owner can explain it, it does not go in.
8. **Division of labour:** ~~Antigravity performs all file creation and editing. The owners install software, download data, run commands, and make decisions.~~ *Superseded for the 17 November 2026 rebuild by CHANGE-023:* for that rebuild the edits were performed by an AI coding assistant at the owners' instruction. The owners install software, download data, run commands, make decisions and make all git commits.

### 0.2 Change log
| CHANGE-ID | Date | Version | Change | Status |
|---|---|---|---|---|
| CHANGE-001 | 15 Nov 2026 | 0.9.0 | Initial roadmap created from fresh research plan; prior BTP reclassified as reference | Approved |
| CHANGE-002 | 15 Nov 2026 | 0.9.0 | Cost strategy added; budget revised down to Tier 0 ₹0 default with optional tiers; ADR-013…018 added | Approved |
| CHANGE-003 | 15 Nov 2026 | 0.10.0 | **Scope cut to the research core.** Removed components that have no effect inside a single-process simulation or do not serve a research question: SPIRE/mTLS, HPKE, Privacy Pass, SQLCipher, OpenBao, NATS, Valkey, Prio3/DAP, Cedar/OPA, Trillian service, k3s/Helm, OTel/Prometheus/Grafana/Loki, k6 + serving SLOs, toxiproxy chaos, ONNX, pgvector/Qdrant, cosign/SLSA/Scorecard, mutmut, atheris, ASVS, NVFlare parity spike, MP-SPDZ gossip spike, TEE/Android/Bluesky stretch, 2-lakh-client soak, full DPIA + ISO crosswalks, SNAP/MIND as default datasets. Added MVP + MoSCoW (4.5) and the viva rule (0.1.7). ADR-009/010/011 rejected; other ADRs superseded as marked in Section 7. Removed evidence IDs (S3–S11, S16, S18–S22, S24, S25, S28; R2, R3, R5, R8–R14, R17, R18, R20–R23, R27–R29) are not reused | Approved |
| CHANGE-004 | 15 Nov 2026 | 0.10.0 | **Technical corrections.** No top-k sparsification (leaks interacted items, breaks SecAgg+ summation) → small dense content-feature model (ADR-019); user-level DP via client-update clipping, Opacus only for the central baseline (ADR-020); noise added once by the aggregator (ADR-021); accountant gate fixed — PLD vs PRV ±5%, RDP as upper bound, ε with and without amplification (ADR-022); SecAgg+ verified on a subset (ADR-023); gossip uses local DP only and its gap is measured, not assumed small (ADR-024); robustness measured in three modes (ADR-025); in-repo Merkle log (ADR-026); custom attacks replace `breaching`/many-shadow LiRA (ADR-029); success criteria reframed as pre-registered hypotheses (4.6) | Approved |
| CHANGE-005 | 15 Nov 2026 | 0.10.0 | **Tier 0 only.** Tier 1/2 removed; Oracle Always Free, Cloudflare R2, GHCR, self-hosted runner, paid GPU/VM providers dropped; no service that requires a payment card; compute budget and experiment grid added (Section 9) | Approved |
| CHANGE-006 | 15 Nov 2026 | 0.10.0 | **Framing and research questions.** Phase 1 described as a feasibility prototype (Section 2, 21); RQ5 participation bias added; source-policy confirmation with guide added as verification item 1; report-writing rule added (Section 17) | Approved |
| CHANGE-007 | 15 Nov 2026 | 1.0.0 | Roadmap approved by both owners. Implementation authorised for P0 only. Step 0 executed: uv-managed Python 3.12, repo skeleton, ruff/mypy/pytest/pip-audit/pip-licenses gates, uv.lock. Guide sign-off and verification items 1-15 remain open G0 conditions. | Approved |
| CHANGE-008 | 15 Nov 2026 | 1.0.1 | Step 0 executed (toolchain + skeleton, GitHub private repo). Step 1 executed: GitHub Actions CI (ruff, mypy strict, pytest, licence gate, pip-audit, gitleaks), .gitattributes line-ending policy, scripts/check_licenses.py with tests. Progress tracked in docs/implementation-log.md. Repo licence still pending owner decision. | Superseded by CHANGE-010 (progress moved to docs/implementation-log.md). The pending repo licence was resolved by CHANGE-011 (MIT) |
| CHANGE-009 | 15 Nov 2026 | 1.1.0 | Governance correction. Section 19 approval boxes ticked and owner-1 signature recorded; CHANGE-001…006 and all Proposed ADRs marked Approved. Owner-1 signature authorises P0; Dr. Acharya's review and owner-2 acknowledgement are G0 exit conditions, and P1 requires both owners. Added rule 0.1.8 (division of labour). Stale "On approval" line removed. | Approved |
| CHANGE-010 | 15 Nov 2026 | 1.1.0 | Correctness fixes from owner review: anchored .gitignore (/data/, /raw/), Yelp JSON ignored, results/*.jsonl un-ignored; licence gate rewritten with SPDX OR/AND evaluation, classifiers as OR, first-line-only free text, BSL=Boost allowed vs BUSL blocked, APPROVED_EXCEPTIONS keyed to CHANGE-IDs, markdown-safe output; Makefile check includes license-gate and audit; CI and make use bare --cov; environment report adds git commit, dirty flag, uv.lock SHA-256, immutable package tuple, version from installed metadata; coverage source includes scripts/. | Approved |
| CHANGE-011 | 16 Nov 2026 | 1.2.0 | Owner-2 (Mokshit Jain) approval recorded. MIT licence adopted for project code. ADR-031 approved: metro selection will use geographic bounding boxes (lat/lon) rather than fragile city-name string matching to avoid fragmentation (e.g., "St. Louis" vs "Saint Louis"). | Approved |
| CHANGE-012 | 16 Nov 2026 | 1.3.0 | k-core threshold fixed at k=15 from measured evidence (9,913 users; 6,319 businesses; 4,10,193 interactions; 77.1% of users have in-set friends; avg inner degree 18.5). Numeric connectivity gate defined as >=70% connected share. Added a pre-registered k-sensitivity sweep at k in {10,20} on headline RQ1/RQ2 comparisons (3 seeds each) as a robustness check. Amendment made before any model training or result existed. | Approved |
| CHANGE-013 | 16 Nov 2026 | 1.4.0 | Source rule confirmed as option (c): any credible source including conference and journal papers. Section 1 rewritten; the no-papers restriction is superseded. S-series and R-series retained; a P-series peer-reviewed literature review is added as a planned step. Also records the Yelp licence compliance posture (ADR-033): stricter 7 Jul 2023 terms control, 12-month term to 15 Nov 2027, no third-party data sharing, aggregate-metric disclosure limited to academic purposes, and mandatory pre-publication review of findings by Yelp. Repository default changed to private. | Approved. The source rule (option c) is superseded by CHANGE-023; the Yelp posture stands |
| CHANGE-014 | 16 Nov 2026 | 1.5.0 | Execution topology fixed to a single PC (owner-1 machine). No second data copy and no lab machine dependency. Mokshit contributes code and synthetic-fixture tests from his own machine; all data-dependent runs execute on this PC, so the Data never leaves it (satisfies Yelp 4.D by construction). Section 9 compute budget re-based on one machine with parallelism across seeds. Deliverable 9 restated as a clean-environment rerun, not a clean-machine rerun. | Approved |
| CHANGE-015 | 16 Nov 2026 | 1.5.0 | Yelp Section 3 pre-publication review deferred until the implementation is complete. The gate is retained, not removed: it blocks any public presentation or publication, including making the repository public, public demo video, blog, paper or institutional upload. Trigger: submit findings to Yelp at least 3 weeks before the final submission date. Submission date still pending from the guide. | Approved |
| CHANGE-016 | 17 Nov 2026 | 1.6.0 | Time-boxed execution: a single overnight compute window is available. Scope for this window is the MVP utility-vs-privacy core only (features, metrics, baselines, two-tower, central and federated DP epsilon sweep). SecAgg+, gossip, attacks and ledger are explicitly deferred to later sessions and are NOT claimed. Two amendments: (a) headline grid uses an in-process federated simulation instead of Flower/Ray, as anticipated by risk R-20, with a Flower parity check deferred; (b) Opacus PRV becomes the accountant of record with RDP as the required upper bound, and the dp_accounting PLD cross-check is deferred to remove an unfamiliar API from the critical path. GPU (RTX 3050, 4 GB) documented but unused; CPU-only for determinism per ADR-018. | Approved. Item (b), the accountant of record, is superseded by CHANGE-023 (ADR-046) |
| CHANGE-017 | 17 Nov 2026 | 1.7.0 | Step 7B: unified two-tower trainer serving central and federated modes with per-user update clipping, single aggregator-side Gaussian noise, and Opacus PRV accounting (RDP upper bound). Matched expected user-update budget: central q=0.20/E=1/T=40 versus federated q=0.01/E=2/T=400. Clipping norm fixed once from a non-private pilot and cached. Resumable per-run JSON grid output. Extended ambition accepted for gossip, poisoning, attacks, SecAgg+ equivalence and ledger as a priority queue; anything unfinished is reported as not done. ADR-037 records the float-Gaussian seeded-PRNG limitation. | Approved |
| CHANGE-018 | 17 Nov 2026 | 1.7.1 | Smoke test caught a utility failure before the overnight launch: unnormalised tower outputs gave dot-product scores of order 1e-3, gradients ~100x too small, and NDCG@10 at random chance (0.0008-0.0024 versus MostPopular 0.0250). Fixed by L2-normalising both tower outputs and scoring cosine similarity at a fixed temperature of 10 (ADR-038). Parameter count unchanged at 115,072. Privacy machinery verified correct by the same smoke test: PRV epsilon 7.708 and 7.592 against a target of 8, clipping norm calibrated, non-private runs correctly infinite. Clipping norm must be re-probed after the scoring change; noise multipliers are unaffected because accounting depends on z, q, T and delta only. | Approved |
| CHANGE-019 | 17 Nov 2026 | 1.7.2 | Second utility fix. The cosine normalisation introduced in ADR-038 removed the model's ability to represent item popularity, because unit-norm embeddings carry no magnitude; popularity is the dominant Yelp signal (MostPopular 0.0250 versus our personalised 0.0071). Added a learnable per-item bias initialised to zeros, giving 121,391 parameters (115,072 towers + 6,319 biases). The bias belongs to the shared public item catalogue, is clipped and noised like every other parameter, and does not change epsilon accounting. Probe extended to 40 rounds at two stable learning rates and now reports the server step norm and bias standard deviation. | Approved |
| CHANGE-020 | 17 Nov 2026 | 1.7.3 | Item bias given its own learning rate (10x tower rate). Probe showed the bias standard deviation reaching only 0.0070 after 40 rounds against a score scale of order 1, because the mean-reduced BPR loss plus cohort averaging starves shallow scalar parameters. Grid learning rate fixed at 2.0 from the measured probe (NDCG@10 0.0101 at round 40 versus 0.0094 at 0.5). Decision recorded: launch the overnight grid regardless of whether the model matches ItemKNN, because RQ1/H1 is a relative comparison against the non-private central model. If the content-only DP-friendly two-tower trails ItemKNN, that is reported as a finding with the baseline as an unmatched reference, not hidden. | Approved |
| CHANGE-021 | 17 Nov 2026 | 1.8.0 | Grid extended to 10 seeds and a round-matched central control (q=0.02, E=1, T=400). Two weaknesses found in the completed 60-run grid: (a) with 5 paired seeds the minimum achievable two-sided Wilcoxon/sign p-value is 0.0625, so four federated configurations sit at the arithmetic floor and Holm can reject nothing regardless of effect size; (b) federated used 400 server rounds against central's 40 at a matched data budget, confounding the topology comparison. The round-matched control holds rounds and expected user-updates equal so only cohort size and local epochs differ. DP mechanism verified active: C=4.9214, monotonic noise multipliers, clipped deltas below C, non-private runs correctly unclipped and unnoised. | Approved |
| CHANGE-022 | 17 Nov 2026 | 1.9.0 | RQ1 complete with 180 runs and 10 seeds. Holm correction rejects all five federated epsilon comparisons and all five round-matched central comparisons; the central_matched epsilon=16 rejection is marginal (p=0.0488 against a 0.0500 threshold) and is flagged as fragile. The topology confound is resolved: at matched rounds and matched expected user-update budget, central_matched non-private 0.02483 [0.02441,0.02515] exceeds federated 0.02365 [0.02332,0.02398] with non-overlapping intervals, and 40 versus 400 rounds accounts for a 40 percent utility gap. H1 is reported against three explicit references, leading with 88.0 percent against the round-matched baseline. Per-epsilon cross-topology intervals overlap, so no per-epsilon topology winner is claimed. Step 10 adds interaction-level membership inference and single-client analytic inversion; user-level membership inference with reference models is deferred and is not claimed. | Approved. The attack scope and the inversion result are superseded by CHANGE-023 (ADR-048) |
| CHANGE-023 | 17 Nov 2026 | 2.0.0 | **Rebuild under the approved design** (`docs/superpowers/specs/2026-11-17-prism-rebuild-design.md`; ADR-043 to ADR-055). (a) A new hybrid model (item ID embeddings on a fixed content projection, 107,679 parameters) replaces the content-only model (ADR-043). (b) RQ1 is reframed as sampling regimes, `large` (rate 0.5, 40 rounds) and `small` (rate 0.05, 400 rounds), not central versus federated (ADR-044). (c) Hyperparameters are tuned on the validation split only and frozen in `experiments/frozen.json` before any test evaluation; final models train on train plus validation and are evaluated once on test (ADR-047). (d) Three-accountant gate (Opacus PRV, Opacus RDP, dp-accounting PLD); the epsilon of record is the larger of PRV and PLD (ADR-046). (e) Attacks redesigned with control gates: history inversion, friendship-link inference, and user-level membership inference with reference models (ADR-048). (f) The social layer becomes core scope: friends baseline, link inference, gossip between friends, participation bias by friend count (ADR-050). (g) The in-repo ledger with its release gate is implemented (ADR-026, ADR-051). (h) The step 0 to 10 scripts are rewritten into the `prism` package and CLI; the old results are archived under `results/archive/v1-content-only/`. (i) The source rule changes: conference and journal papers are excluded, and the literature review is written under that rule in `docs/literature-review.md` (ADR-053). (j) The owners make all commits; an AI coding assistant performed the edits for this rebuild at the owners' instruction (rule 0.1.8). (k) `PREREGISTRATION.md` Amendment 1 is written before any test evaluation of the new model. Results: see results/report/report.html. | Approved by the owner on 17 Nov 2026 (design record); acknowledgement by the second owner to be recorded |
| CHANGE-024 | 17 Nov 2026 (evening) | 2.1.0 | **Items cut in CHANGE-023 are built and run** (ADR-056 to ADR-061). (a) Sensitivity analyses at k = 10, k = 20 and with reviews of 4 stars or more (`prism sensitivity`, `--build-only` for the data alone): datasets of 19,141, 6,001 and 5,551 users (main dataset 9,913), hyperparameters kept frozen from the main dataset, plus a list-length readout (retention from NDCG@20, HR@10 and HR@20); H1 fails on every variant, and retention at list length 20 is one to three points lower than at 10 (ADR-059). (b) Free-riding clients, two behaviours (zeros; noise with the honest norm): cost, gain, and detection by update norm and cosine similarity, not applicable under secure aggregation; clip-only runs, no DP noise (`prism free-riding`, ADR-058). (c) Committee-median aggregation (ADR-025 mode c) as two new poisoning modes, committee sizes 4 and 20, a custom aggregator outside the engine, no DP noise (ADR-057). (d) Trace-based availability from the FedScale `client_behave_trace` (107,749 devices, 25.6 MB), read with a restricted unpickler: scenarios `trace`, `trace_activity`, `trace_replay`; one round is taken as 30 minutes; epsilon exact for the first and third, nominal for the second (ADR-056). (e) Flower parity: Flower 1.43.0 simulation runtime on Windows in a separate environment, largest parameter difference about 6e-08 after five rounds, with and without noise; Flower is not a dependency (ADR-061). (f) Provenance: a hash of the engine source files in every run record, a `stale_code` flag on resume and `PRISM_STRICT_RESUME=1`; the clean rerun reproduced the earlier numbers exactly (ADR-060). (g) Gossip rerun with 2,500 users and 3 seeds (3,000 did not fit in memory beside the other experiments). (h) Makefile targets `sensitivity` and `free-riding`; README, viva notes (sections 22 to 29) and implementation log (step 12) updated. Results: see results/report/report.html. **Still open and with the owners:** the pre-publication review by the dataset provider, guide dates, viva preparation, the second owner's acknowledgement and the commits. | Approved by the owner on 17 Nov 2026 (the build and run of the items listed as open in CHANGE-023); acknowledgement by the second owner to be recorded |
| CHANGE-025 | 19 Nov 2026 | 2.1.1 | **Owner decision: the repository is public and the deck is hosted.** The owner made the GitHub repository public (https://github.com/ShivamSharko/BTP-Privacy-Attack-and-Defence-in-Social-Media) and deployed the interactive deck on Vercel (https://prism-rec-deck.vercel.app) to share both with the guide. This departs from ADR-033 (repository private by default; findings submitted to the dataset provider before any public presentation) and from the Demo access row of Section 15 (no hosted demo): the pre-publication review of open item 16 had not been requested, so risk R-16 is now realised and accepted by the owner. Checked before the change: no raw dataset file, no derivative under `data/`, no dataset identifier and no key or secret is in the repository or anywhere in its history. Still to do: request the review (item 16). Either exposure can be withdrawn (repository back to private; Vercel Authentication on all deployments), but copies made while public cannot be recalled. | Decided by the owner on 19 Nov 2026; acknowledgement by the second owner and by the guide to be recorded |

### 0.3 Decision register status legend
`Proposed` = awaiting approval · `Approved` = locked, build to it · `Rejected` = do not use · `Superseded` = replaced, kept for history.

---

## 1. Source policy

**Confirmed rule (CHANGE-023, ADR-053; decided by the owner on 17 November 2026):** conference papers and journal papers are excluded from all research for this project, whatever any other document says. Permitted sources are standards, government and agency reports, official documentation, vendor engineering write-ups and open-source repositories.

Rules:
1. Every source cited has an issuing body or author, a version or date, and a link. Anything that cannot be confirmed from such a source is marked UNVERIFIED and may not justify a decision (rule 0.1.5 applies).
2. Where a shipped implementation or a standard exists, implementation decisions cite that artifact.
3. Licence-attribution obligations are recorded under licence compliance, not under the literature review.
4. The literature review is written: see `docs/literature-review.md`. It was written under this rule as part of the rebuild.

The standards-and-reports evidence base (S-series) and the repository evidence base (R-series) in Section 3 remain the backbone for implementation decisions. No P-series is created.

### Superseded text (CHANGE-013, kept for history; do not follow)

> **Confirmed rule (verification item 1, option c):** any credible source is permitted, including conference papers, journal papers, workshop papers, standards, regulatory texts, government and industry reports, vendor engineering documentation, official dataset documentation, and GitHub repositories and their documentation.
>
> This supersedes the earlier Phase-2 restriction that excluded all papers (CHANGE-013). The standards-and-reports evidence base (S-series) and the repository evidence base (R-series) are retained and remain the backbone for implementation decisions. A peer-reviewed literature review (P-series) is added for academic grounding and is required for the report.
>
> Rules: 1. Every cited paper must have authors, venue and year verified before use. Unverified entries carry a VERIFY flag and may not justify a decision. 2. Where a shipped implementation or a standard exists, implementation decisions cite that artifact, and the original paper is cited for the method's origin. 3. The seven journal papers from Phase 1 are re-admitted as citable sources. 4. Licence-attribution obligations are recorded under licence compliance, not under the literature review. 5. (The statement that the P-series review was not yet written is replaced by new rule 4 above.)

---

## 2. Phase 1 limitations and the Phase 2 response

Phase 1 (April 2026) was a feasibility prototype: it showed that an on-device recommendation pipeline with privacy components could run end to end. Reviewing it critically shows the limitations below, which Phase 2 is designed to fix.

| # | Phase 1 approach | Limitation | Phase 2 response |
|---|---|---|---|
| 1 | 29,999 posts → 20 virtual clients from `account_id` | No user–item interactions and no user–user graph, so ranking quality cannot be measured; user-level DP with n=20 is meaningless (δ must be ≪ 1/n) | Yelp Open Dataset filtered to one metro area: real interactions, timestamps and `friends` graph; ~5,000–20,000 users ⚠ |
| 2 | Quality = `1 − MAE` on a constructed target (Eq. 3.1) | Regression on a synthetic label, not recommendation. The score stayed ≈0.806 at every battery level and with or without DP (0.8065 vs 0.8066), and was never compared with a predict-the-mean baseline, which plausibly scores in the same range on this target | NDCG@10, Recall@20, HR@10, MRR, coverage, Gini; chronological split; full-catalogue ranking; MostPopular and ItemKNN baselines |
| 3 | `ε_cost = 0.35 / (1 + 18σ)` (Eq. 3.8) | Not a DP accountant: no sensitivity, clipping, δ, composition, or subsampling | Three accountants (Opacus PRV, Opacus RDP, `dp_accounting` PLD); the epsilon of record is the larger of PRV and PLD; NIST SP 800-226 checklist (ADR-022, ADR-046) |
| 4 | More noise at low battery (Eq. 3.7) | Privacy that depends on device state is not a guarantee; an adversary waits for full charge | Availability gates **participation only**; noise fixed by the accountant; participation bias measured (RQ5, ADR-004/030) |
| 5 | "Pairwise masking" in gossip | Masks that do not cancel act as extra noise with no confidentiality argument | Pairwise-mask secure-sum simulation in server-based training (ADR-049; Flower SecAgg+ is not used); gossip uses explicit, accounted local DP (ADR-024) |
| 6 | SHA-256 hash chain described as proof of confidentiality | A hash chain gives ordering tamper-evidence only | Ed25519-signed budget receipts + RFC 6962-style Merkle log with inclusion/consistency proofs (ADR-026); non-claim: log ≠ confidentiality proof |
| 7 | Tabular "leakage proxy" (favourite category) | Not an inversion attack; results non-monotonic; MI accuracy 53.68% → 53.47% is within noise | History inversion from one update, friendship-link inference, and user-level MI with reference models and control gates; TPR@1%FPR (ADR-048, which supersedes ADR-042 and restores the user-level scope of ADR-029) |
| 8 | Gossip 0.80657 vs central 0.80646 over 2 rounds | Inside run-to-run noise; 2 rounds and 1 seed cannot separate them; message counts ignore payload size | 3 seeds for gossip, 10 for RQ1; bootstrap CIs, paired tests, Holm correction; bytes sent per node per round |
| 9 | Krum/trimmed mean alongside masking | Robust aggregation needs per-update visibility, which masking hides | Three explicit modes: plaintext + robust aggregation; secure sum + clipping; secure-sum committees + median (ADR-025; the committee mode is not built, CHANGE-023) *(CHANGE-024, 17 Nov 2026 evening: now built and run; see ADR-057.)* |
| 10 | Free-rider defence (reported ineffective) | Objective not implemented | Free-rider utility gain measured; contribution scoring in plaintext mode only, with the secure-sum limitation stated (free-riding is not built in CHANGE-023 and remains open) *(CHANGE-024, 17 Nov 2026 evening: now built and run; see ADR-058.)* |

**Retained from Phase 1:** the honest Demerits / Threats-to-Validity discipline; modular separation; one harness for attacks and defences; dashboard-based presentation; Flower as the FL runtime. (Superseded by CHANGE-023: results are shown in a static HTML report, ADR-052, and the FL runtime is an in-process simulation, ADR-055.)

---

## 3. Evidence base

Removed IDs (CHANGE-003) are not reused, so remaining IDs keep their original numbers.

### 3.1 Standards, regulation, reports (S-series)
| ID | Source | Grounds | Flag |
|---|---|---|---|
| S1 | NIST SP 800-226 — Guidelines for Evaluating Differential Privacy Guarantees (Mar 2025) | DP unit, neighbourhood, ε/δ, composition, implementation pitfalls | ⚠ |
| S2 | NIST AI 100-2e2025 — Adversarial ML taxonomy & mitigations | Attack/defence taxonomy for the threat model | ⚠ |
| S12 | RFC 8032 (Ed25519) | Signatures on round manifests, receipts and tree heads | — |
| S13 | RFC 6962 (Certificate Transparency) | Merkle log hashing, inclusion/consistency proofs | — |
| S14 | GDPR Art. 5/22/25/35; EDPB Opinion 28/2024 | Compliance mapping; a model is not assumed anonymous | — |
| S15 | EU DSA Reg. 2022/2065 Art. 27/38 | Recommender transparency; non-profiling option | ⚠ |
| S17 | India DPDP Act 2023 + DPDP Rules 2025 | Consent, notice, purpose, retention | ⚠ |
| S23 | Google Research Blog — Federated Learning with Formal DP Guarantees (Gboard) | Production FL with formal DP; server-side noise; condition-gated participation | — |
| S26 | Bluesky AT Protocol docs; Mastodon/ActivityPub specs | Positioning: open social networks are public by default | — |
| S27 | Yelp Open Dataset documentation + licence | Primary dataset schema, `friends` graph, terms | ⚠ |
| S29 | Free-tier pages: GitHub (Actions, Student Pack), Kaggle, Colab, Azure for Students, Cloudflare Tunnel | Annex A resource register | ⚠ |

### 3.2 Repositories (R-series)
| ID | Repo | Role | Licence | Flag |
|---|---|---|---|---|
| R1 | `adap/flower` | FL simulation (Ray backend), SecAgg+ workflow, DP strategy wrappers. **Not used** (ADR-055); strategy names reused only *(CHANGE-024, 17 Nov 2026 evening: now built and run: Flower 1.43.0 is used only in `scripts/flower_parity.py`, in a separate environment, not as a dependency; see ADR-061.)* | Apache-2.0 | ⚠ |
| R4 | `pytorch/opacus` | PRV and RDP accountants (no central DP-SGD baseline is built; ADR-046) | Apache-2.0 | ⚠ |
| R6 | `opendp/opendp` | Vetted noise samplers; DP item–item graph release (Could). **Not used** (ADR-037, ADR-055) | MIT | — |
| R7 | `google/differential-privacy` | `dp_accounting` PLD accountant (no TensorFlow dependency); used as one of the three accountants (ADR-046) | Apache-2.0 | ⚠ |
| R15 | `pyg-team/pytorch_geometric` | Optional item-graph propagation. **Not used** (ADR-055) | MIT | — |
| R16 | `RUCAIBox/RecBole` | Baselines + evaluation cross-check. **Not used** (ADR-055) | MIT | ⚠ Python/torch compatibility |
| R19 | `privacytrustlab/ml_privacy_meter` | Listed in v1.9.0 as an RMIA reference. **Not used**: the user-level membership attack is custom (ADR-048) | MIT | ⚠ |
| R24 | `astral-sh/uv`, `astral-sh/ruff`, `HypothesisWorks/hypothesis`, `unionai-oss/pandera` | Environments, lint, property tests, data contracts | MIT/Apache | — |
| R25 | `iterative/dvc`, `mlflow/mlflow`, `ray-project/ray` | Pipeline checksums, local tracking, Flower simulation backend. **Not used**: JSON run records in git (ADR-055) | Apache-2.0 | — |
| R26 | `gitleaks/gitleaks`, `pypa/pip-audit` | Secret scanning, dependency audit | MIT / Apache-2.0 | — |
| R30 | `sentence-transformers` (UKP Lab) | Frozen item content embeddings (no paid API) | Apache-2.0 | — |
| R31 | `pyca/cryptography` | Ed25519 signatures, SHA-256, X25519, HKDF (ledger and secure-sum simulation) | Apache-2.0 / BSD | — |
| R35 | `trailofbits/rfc8785.py` | RFC 8785 canonical JSON for signed receipts | Apache-2.0 | — |
| R32 | `SymbioticLab/FedScale` | Device-availability traces (data only). **Not used**: availability scenarios are synthetic (Section 4.5) *(CHANGE-024, 17 Nov 2026 evening: now built and run: the `client_behave_trace` file is used by three optional participation scenarios; repository Apache-2.0, dataset notes say research use only; see ADR-056.)* | Apache-2.0 | ⚠ trace licence + availability |
| R33 | `streamlit/streamlit` | Dashboard. **Not used**: static HTML report (ADR-052) | Apache-2.0 | — |
| R34 | `raimon49/pip-licenses` | Licence gate in CI | MIT | ⚠ |

---

## 4. Problem, objectives, scope

> **Version 2.0.0 note (CHANGE-023).** Where this document says "secure sum" it means the in-process pairwise-mask simulation of ADR-049, not Flower's SecAgg+ workflow. Entries that name SecAgg+ in the change log, the ADR table and text marked superseded refer to the plan that was not built. Text changed by CHANGE-023 is marked where the old wording is historically true.

### 4.1 Problem statement
Deliver personalised top-K social recommendations such that:
- **P1** no raw interaction leaves the (simulated) user device;
- **P2** every released model satisfies a stated **user-level (ε, δ)-DP** guarantee computed by a real accountant;
- **P3** in secure-sum mode (a simulation, ADR-049), the aggregator interface accepts only masked vectors and recovers only the sum of client updates, never an individual update;
- **P4** behaviour under poisoning and 10–30% dropout is measured and reported (free-riding is not built, CHANGE-023; CHANGE-024: built and run, ADR-058);
- **P5** every model release has a signed privacy receipt that a third party can verify against a tamper-evident log;
- **P6** every headline number is reproducible with one command;
- **P7** total spend is **₹0**.

### 4.2 Research questions
| RQ | Question | Primary measurement |
|---|---|---|
| RQ1 | What does user-level DP cost in utility across ε ∈ {1,2,4,8,16,∞} in two sampling regimes, `large` (rate 0.5, 40 rounds) and `small` (rate 0.05, 400 rounds)? *Reframed by CHANGE-023 (ADR-044); the v1.9.0 wording "centrally and in federated training" is superseded.* | Retention, and personalisation retained, against the non-private model with the same rounds and sampling rate; 95% CI |
| RQ2 | How large is the utility gap between gossip between friends (local DP) and server-based training (central DP) on the same users at equal ε (ε ∈ {8, ∞}, degree 4, 3 seeds), and at what byte cost? *(Scope reduced by CHANGE-023.)* | NDCG@10 gap with 95% bootstrap interval of the per-user difference; bytes sent per node per round |
| RQ3 | How much do DP and secure aggregation reduce *empirical* attack success, for history inversion, friendship-link inference and user-level membership inference? *(Attacks redesigned by CHANGE-023, ADR-048.)* | MI AUC, TPR at 1% and 0.1% FPR, implied ε lower bound; inversion AUC and precision@10 against the popularity prior; link-inference AUC. Controls must pass or the result is INVALID |
| RQ4 | How much protection against fake-account promotion remains when secure aggregation hides individual updates? | Target-item exposure (share of users with the target in their top 10) and clean NDCG drop at 10, 20 and 30% attacker accounts; plaintext robust aggregation versus secure sum with norm bound |
| RQ5 | Does availability-gated participation (battery/charging/idle) bias recommendation quality across user groups, including groups by friend count? Availability is synthetic (always, independent, correlated with activity, correlated with friend count) | NDCG@10 gap between groups under independent vs correlated availability |
| RQ6 | What does the verifiable privacy ledger cost, and does it block every over-budget release? | Overhead %, blocked-release correctness, proof verification time |

### 4.3 In scope
Hybrid recommender: item ID embeddings on a fixed public content projection (ADR-043), with MostPopular, ItemKNN, item-item ridge and friends-based baselines; one in-process round loop with two sampling regimes, plus gossip between friends (local DP); user-level DP with real accounting by three accountants; a synthetic availability model and a participation-bias study, including friend-count groups; attacks (history inversion, friendship-link inference, user-level membership inference, fake-account poisoning) and defences (DP, secure-sum simulation, clipping, robust aggregation by trimmed mean and median); signed privacy receipts + Merkle log + release gate; non-profiling mode (MostPopular); static HTML report; 1–2 page compliance mapping; reproducibility package (synthetic dataset and `prism demo-small`).

*Superseded by CHANGE-023 (v1.9.0 scope wording):* a two-tower recommender over frozen content features with optional DP item–item graph propagation; three topologies (central, federated with SecAgg+ on a verified subset, gossip) in one Flower/Ray simulation; free-riding; a Streamlit dashboard.

### 4.4 Out of scope (explicit, not silent)
Production deployment to real users; real mobile devices; transport security, on-device storage encryption, anonymous participation credentials and Sybil resistance (the simulation has no real network or devices); TEEs; serving latency SLOs; scale beyond the filtered Yelp subset; edge-level DP on the global user–user graph; LLM content generation; ads/auctions; authoring cryptographic primitives; full DPIA and ISO crosswalks.

### 4.5 Priorities (MoSCoW) and MVP
| Priority | Content | Due |
|---|---|---|
| **MVP (Must, early)** | Yelp pipeline + baselines; hybrid model; non-private vs DP ε-sweep in two sampling regimes with 10 seeds and CIs; accountant checks; secure-sum equivalence check; signed receipt per release. *(v1.9.0 wording superseded: two-tower; central non-private vs central-DP vs FL+DP, 5 seeds; SecAgg+ equivalence.)* | **G3 — 25 Jan 2027** (built 17 Nov 2026) |
| **Must** | RQ3 (history inversion, friendship-link inference, user-level MI), RQ4 (plaintext robust aggregation vs secure sum + clipping), RQ6 ledger with proofs + release gate, static HTML report *(v1.9.0: dashboard demo)* | RQ3 and RQ4: G5 — 8 Mar 2027; RQ6 and report: G6 — 22 Mar 2027 (gate placement as in Section 12) |
| **Should** | RQ2 gossip + local DP; RQ5 participation bias; non-profiling mode; free-riding measurement (cut, see below; built in CHANGE-024, ADR-058) | G4 — 15 Feb 2027 (gate placement as in Section 12) |
| **Could** | DP item–item graph propagation; secure-sum committees + median; optional local MLflow; minimal FastAPI endpoint; cross-dataset check (MIND or SNAP Gowalla ⚠) | only if a gate closes ≥1 week early (max one). None was built in CHANGE-023; the secure-sum committees + median item was built later the same day (CHANGE-024, ADR-057) |
| **Won't (this project)** | Everything in 4.4 and CHANGE-003 | — |

The MVP alone is a complete, defensible project. Every later item layers on top of it and can be dropped without breaking it.

#### 4.5.1 What the rebuild delivered and what it cut (CHANGE-023)
**Delivered on 17 Nov 2026** (code and tests in the repository; results: see results/report/report.html, which also states any run that is partial or not done): the MVP; RQ1 in two sampling regimes with 10 seeds; RQ2 gossip between friends; RQ3 history inversion, friendship-link inference and user-level membership inference with control gates; RQ4 fake-account poisoning against plaintext robust aggregation and the secure-sum mode; RQ5 availability scenarios including friend-count correlation; RQ6 ledger with release gate; the friends-based baseline; non-profiling mode (MostPopular); static HTML report; synthetic dataset and `prism demo-small`.

**Cut today and still open:** the k ∈ {10, 20} sensitivity sweep; the stars ≥ 4 analysis; trace-based availability; free-riding measurement; committee-median robustness mode (ADR-025 mode c); the Flower parity check. **Update, CHANGE-024 (17 Nov 2026, evening): all of these are now built and run** (sensitivity ADR-059, trace availability ADR-056, free-riding ADR-058, committee median ADR-057, Flower parity ADR-061; run provenance, ADR-060, was added at the same time). Only the dataset provider's pre-publication review stays open, with the owners. Also not built: DP item–item graph propagation, optional MLflow, FastAPI endpoint and the cross-dataset check (all Could items).

**Schedule.** The implementation work of Section 12 was compressed into one day (17 Nov 2026). The report, the pre-publication review by the dataset provider and viva preparation keep their calendar gates in Section 12 (G6 and G7).

### 4.6 Pre-registered hypotheses (not results; negative outcomes are reported, not hidden)
**Wording of record: `PREREGISTRATION.md` Amendment 1 (17 Nov 2026), which supersedes the H1 to H5 wording of v1.9.0 below.** "Retention" uses the non-private model trained with the same rounds and sampling rate.

| ID | Statement | Decision rule |
|---|---|---|
| H1 | In each regime, the model at epsilon = 8 retains at least 90% of the NDCG@10 of the non-private model trained with the same sampling rate and rounds | Retention = mean over seeds of private NDCG@10 divided by mean non-private NDCG@10, at least 0.90. Also reported: personalisation retained, (private - MostPopular) / (non-private - MostPopular) |
| H2 | Gossip between friends with local DP at epsilon = 8 has a lower NDCG@10 than server-based training with central DP at epsilon = 8 on the same users | 95% bootstrap interval of the per-user difference excludes 0 |
| H3 | At epsilon = 8, user-level membership inference has TPR at 1% FPR of at most 2%, and a server that sees only cohort sums of 100 users recovers a member's history no better than the popularity prior plus 0.05 AUC | Both parts reported separately; controls must pass or the result is invalid |
| H4 | With attacker accounts at 10%, 20% and 30%, plaintext trimmed-mean aggregation gives lower target-item exposure than the secure-sum mode, and the gap grows with the attacker share | Lower at every share and the gap largest at 30% |
| H5 | Availability correlated with activity (or with friend count) produces a larger NDCG@10 gap between the top and bottom groups than independent availability | Paired across seeds. With 5 seeds the two-sided Wilcoxon p cannot go below 0.0625, so the sign pattern (5 of 5) is reported as the evidence and the test is reported as underpowered |

Further checks (stop-ship where marked):

| Check | Measurement | If false |
|---|---|---|
| Accountant consistency: PRV and PLD agree within max(5%, 0.05); RDP no smaller than either, less 0.01 (ADR-046) | DP checks; a failing run is recorded as `accounting_inconsistent` and excluded | **Stop-ship** |
| Empirical-ε lower bound from membership inference does not exceed the claimed ε | Attack metrics | **Stop-ship** |
| Ledger: 100% receipt coverage; 100% tamper detection in tests | Ledger tests | **Stop-ship** |
| Attack controls: an attack writes a result file only if its positive and negative controls pass | Control gate | Result marked INVALID |
| Reproducibility: one command regenerates every headline table | Clean-environment rerun on the same PC | Fix before G7 |
| Cost: ₹0 | Cost ledger | Any spend requires a CHANGE-ID first |

**Superseded wording (v1.9.0, kept for history; do not follow):**

| ID | Hypothesis (v1.9.0) |
|---|---|
| H1 | FL+DP at ε=8 retains ≥90% of non-private central NDCG@10 |
| H2 | Gossip with local DP shows a substantial utility gap vs federated central DP at equal ε |
| H3 | At ε=8, MI TPR@1%FPR ≤ 2× random, and inversion recovers a user's top category ≤ 3 pp above the prior |
| H4 | Plaintext trimmed mean limits targeted-item promotion better than SecAgg+ modes; the gap grows with adversary fraction |
| H5 | Availability correlated with user activity produces a measurable NDCG@10 gap between groups that random availability does not |

### 4.7 Non-claims (must appear verbatim in the final report)
DP ≠ anonymisation · secure aggregation ≠ DP · hash chain ≠ confidentiality · a verified log proves what was recorded, not that the DP code is correct · simulation ≠ on-device deployment · simulated device availability ≠ real device behaviour · the aggregator is trusted to add DP noise · the secure-sum simulation has no secret sharing and no network, and a client that drops after sending would be exposed when survivors reveal its seeds (ADR-049) · transport security and on-device encryption are not implemented · proxy attacks ≠ worst-case privacy · gossip amplification is **not** claimed.

- Reported epsilon is accountant-derived under an ideal Gaussian mechanism; the implementation uses float Gaussian draws from a seeded non-cryptographic PRNG, so this is a reproducibility-oriented utility study, not a deployment-grade guarantee.
- Reported epsilon assumes ideal Poisson sampling and is labelled "excluding hyperparameter selection": the clipping norm and the other hyperparameters were chosen on the same users' data, and that choice is not covered by epsilon (ADR-047).
- The what-if population simulation carries no epsilon claim (ADR-054). The epsilon shown for the availability study (RQ5) is nominal: it holds only if availability is independent of a user's data.

---

## 5. Landscape review

### 5.1 Existing patterns
| Pattern | Evidence | Strength | Limitation | Used here? |
|---|---|---|---|---|
| Production federated learning | S23 | Raw data stays on device; formal DP | Central coordinator; secagg/robustness tension | **Yes** (server-based training, in-process simulation) |
| Serverless gossip learning | custom (`src/prism/fl/gossip.py`) | No coordinator | More bytes; weaker DP at equal ε | **Yes** (gossip mode) |
| MPC/DAP aggregate measurement | IETF PPM drafts | Verifiable, split trust | Aggregates only, not model training | No |
| Confidential computing | vendor docs | Attestation | Hardware dependence | No |
| Open federated social networks | S26 | No central gatekeeper | Public by default ⇒ easy mass profiling | Positioning only |

**Positioning:** open social networks solved control of the network, not privacy of behaviour. PRISM-Rec studies a personalisation layer that does not need users' raw behaviour, and measures honestly what that costs.

### 5.2 FL framework
**In-process simulation (ADR-035, ADR-055).** One round loop (`src/prism/fl/server.py`) serves every experiment. Flower (R1) is not used for the experiments: Ray on Windows is experimental and its DP wrappers are a preview. *(CHANGE-024: Flower 1.43.0 is used once, in a separate environment, for the parity check in `scripts/flower_parity.py`; ADR-061.)* NVFlare, TFF and custom FL beyond this loop are not used (CHANGE-003). *(v1.9.0 named Flower with its Ray backend as the runtime; superseded.)*

### 5.3 DP libraries
Three accountants: Opacus PRV and RDP (R4) and `dp_accounting` PLD (R7). The epsilon of record is the larger of PRV and PLD (ADR-046). Noise is a seeded float Gaussian from NumPy (ADR-037); OpenDP samplers (R6) are not used. TensorFlow is not a dependency. *(v1.9.0: PLD accountant of record, Opacus PRV cross-check, Opacus DP-SGD for the central baseline, OpenDP samplers; superseded by ADR-046 and ADR-037.)*

### 5.4 Secure aggregation
An in-process pairwise-mask secure-sum simulation (ADR-049): X25519 key agreement and HKDF masks, fixed-point values modulo 2^64, no secret sharing, no network. It shows what an aggregator can and cannot see; it is not a deployable protocol. Flower SecAgg+ is not used. Prio3/DAP, homomorphic encryption, MPC and TEEs were considered and are not used (CHANGE-003).

### 5.5 Model stack
Hybrid recommender (ADR-043): item ID embeddings (16 dimensions) added to a fixed public content base, which is the top 16 principal directions of frozen sentence-transformer embeddings of business metadata (R30). The user vector is computed and kept on the device from the user's own history; recommendations are scored on the device against all item vectors, so no ANN server is needed. Score = temperature × cosine + item bias. 107,679 parameters, dense updates, no sparsification. Baselines in `src/prism/eval/baselines.py`: MostPopular, ItemKNN, closed-form item-item ridge and a friends-based baseline. BPR-MF and LightGCN through RecBole are not built. Content-only (`use_ids=False`) is the ablation. Optional item-graph propagation (Could) is not built. *(v1.9.0: two-tower over frozen content embeddings, ADR-019; superseded.)*

### 5.6 Attack tooling
Custom, small, and specific to this model (ADR-048): history inversion from one update; friendship-link inference from update similarity; user-level membership inference with 4 non-private reference models; targeted promotion by fake accounts against sum, trimmed-mean and median aggregation. Each attack has a positive and a negative control, and a result file is written only if both behave as expected. Free-riding clients are not built.

### 5.7 Audit log
In-repo append-only Merkle log with RFC 6962 hashing (S13; RFC 9162 uses the same hashing), receipts canonicalised with RFC 8785 (R35) and signed with Ed25519 (S12, R31), signed checkpoints in the three-line C2SP tlog-checkpoint format (UNVERIFIED source, format followed but not relied on), inclusion and consistency proofs, verified by `prism ledger` (ADR-026).

---

## 6. Architecture

### 6.1 Trust zones
```
DEVICE ZONE (simulated; raw data never exits)
  Local interaction history → user vector (map of the mean item vector) → hidden-half loss
  Local update clipped to L2 norm C (no per-round interaction cap is built; the clip alone bounds sensitivity)
  Availability scenario decides whether a client responds
  Gossip mode only: local DP noise added before any message is sent
        │ only clipped parameter arrays cross
COORDINATION ZONE (honest-but-curious)
  Round loop · secure-sum simulation (optional) · Gaussian noise added once to the sum
  Robustness modes: plaintext robust aggregation (trimmed mean, median) | secure sum + norm bound
  GOSSIP MODE: peers from the friends graph, no coordinator
PRIVACY GOVERNANCE ZONE
  Three accountants (PRV, RDP, PLD; value of record = larger of PRV and PLD) → release gate → Ed25519-signed receipt
  Merkle log (RFC 6962 hashing) → inclusion/consistency proofs
EVALUATION ZONE (offline)
  Metrics + bootstrap CIs · attack harness with control gates · results as JSON/CSV in repo · static HTML report
```

### 6.2 Training round (server-based mode)
1. The cohort is Poisson-sampled: each user independently with probability q, from a seeded random stream (ADR-037; no CSPRNG). An availability scenario can only remove sampled users or scale participation, so q stays a per-round upper bound.
2. Each sampled client computes its update from its own data and clips it to L2 norm C. A NaN or infinite update is zeroed and counted.
3. Optionally the clipped updates are masked for the secure sum (ADR-049).
4. The updates are aggregated (sum, trimmed mean or median).
5. Gaussian noise σ = z·C is added once to the sum, **also when the cohort is empty** (ADR-051), and the result is divided by the expected cohort size, a public constant.
6. The server takes its step (Adam or momentum SGD, per regime).
7. The accountant advances. The release gate refuses a round that would take the reported ε past the budget, and the refusal is logged.
8. A signed receipt with data-independent fields is appended to the Merkle log. A release is refused unless every round has a receipt and the log verifies.
9. Realised cohort sizes and update norms go to the run record only, as diagnostics.

### 6.3 Gossip round
1. Each user's peers are their friends inside the filtered set (degree capped at d); users with no in-set friends get random peers (reported).
2. Each node trains locally, clips its update to C, adds local Gaussian noise calibrated for user-level DP against any single peer, and sends it to its d peers.
3. Each node averages its own and the received noised updates; models are post-processing of noised messages.
4. Every message is counted in bytes; ε is composed over all messages a user sends; no amplification is claimed. RQ2 uses degree d = 4.

### 6.4 Repository layout
```
prism-rec/
  PROJECT_ROADMAP.md          # THIS FILE — SSOT
  PREREGISTRATION.md  pyproject.toml  uv.lock  Makefile
  experiments/frozen.json     # hyperparameters frozen after tuning on validation
  src/prism/
    cli.py  config.py  seeding.py  io.py  environment.py
    data/        # loaders, bundle, metro filter, k-core, pandera contracts, splits, content features, friend graph, synthetic dataset
    models/      # hybrid.py
    fl/          # sampling, availability, client, fast clipped sum, aggregate, secagg (simulation), server (round loop), gossip
    privacy/     # dp.py (clip, noise, calibration), accounting.py (three accountants, gate)
    attacks/     # inversion, links, membership, poisoning
    ledger/      # merkle, receipts, log, gate
    eval/        # metrics, baselines, stats
    experiments/ # runner, regimes, one module per research question, demo
    report/      # build.py (static HTML report)
  results/       # aggregates only; results/report/report.html; results/archive/v1-content-only/
  tests/
  docs/          # adr/ (ADR-043 onward), literature-review.md, implementation-log.md, verification-log.md,
                 # cost-ledger.md, data-access.md, yelp-compliance.md, superpowers/ (design and plan)
  .github/workflows/
```
*(v1.9.0 layout, with `apps/dashboard`, `dvc.yaml`, `baselines/` and `gossip/` folders, is superseded.)*

---

## 7. Architecture Decision Records

This table is the record for ADR-001 to ADR-042 (ADR-056 to ADR-061, added by CHANGE-024, also have files). Full text files exist in `docs/adr/` only for ADR-043 onward (CHANGE-023 did not back-fill the older ones). The earlier claim that full texts live in `docs/adr/` was wrong for ADR-001 to ADR-042 and is withdrawn.

| ADR | Decision | Alternatives | Rationale | Status |
|---|---|---|---|---|
| 001 | Flower as FL runtime | TFF, FedML, custom, NVFlare spike | SecAgg+ and DP wrappers shipped; Ray simulation; Apache-2.0 (R1) | Approved (amended CHANGE-003: NVFlare spike removed; amended CHANGE-023: Flower is not used, see ADR-049 and ADR-055) |
| 002 | **User-level DP** as headline guarantee | example-level, edge-level | S1 neighbourhood discipline; avoids classic overclaim | Approved |
| 003 | Discrete Gaussian + OS CSPRNG; two-accountant CI gate | — | — | Superseded by ADR-021, ADR-022 |
| 004 | **Availability gates participation, never ε** | Phase 1 adaptive noise | Worst-case guarantee; S23 practice; bias measured in RQ5 | Approved (amended CHANGE-006) |
| 005 | Two-tower with ID embeddings; user embedding never leaves device | — | — | Superseded by ADR-019; ADR-019 is itself superseded by ADR-043, which restores the intent of this ADR |
| 006 | Gossip: local-DP baseline first, share-based secure gossip second | — | — | Superseded by ADR-024 |
| 007 | Committee secagg + robust aggregation across committees | — | — | Superseded by ADR-025 |
| 008 | Trillian Merkle log + signed receipts | — | — | Superseded by ADR-026 |
| 009 | Cedar policies | — | No research question needs it; "formally verified engine" invites a privacy overclaim | **Rejected** (CHANGE-003) |
| 010 | Prio3/DAP for telemetry | — | Simulation has no operational telemetry plane | **Rejected** (CHANGE-003) |
| 011 | Postgres + pgvector ANN | — | Scoring happens on the device against all item vectors | **Rejected** (CHANGE-003) |
| 012 | Compose → k3s + Helm; uv lock; SLSA + cosign | — | — | Superseded by ADR-027 |
| 013 | **Zero paid inference/embedding APIs**; local sentence-transformers | OpenAI/Gemini embeddings | ₹0; no data egress to third parties | Approved |
| 014 | Free-first hosting: local + Oracle Always Free | — | — | Superseded by ADR-028 |
| 015 | **Licence policy**: Apache/MIT/BSD/MPL/PostgreSQL; reject AGPL/BSL/SSPL/RSAL unless a CHANGE-ID approves | permissive-only | Simple, enforceable with pip-licenses in CI | Approved (amended CHANGE-003) |
| 016 | **Never commit raw datasets**; download scripts + DVC checksums, no DVC remote | data-in-repo | Yelp no-redistribution terms | Approved (amended CHANGE-005; the "public at freeze" clause is superseded by ADR-033; no DVC is used, ADR-055) |
| 017 | Private repo + self-hosted runner | — | — | Superseded by ADR-027 |
| 018 | CPU-first determinism; GPU optional | GPU-always | Free-tier fit + reproducibility; model sized for CPU (ADR-019) | Approved |
| 019 | Two-tower over **frozen sentence-transformer embeddings of business metadata** + small trainable towers (~1.15 lakh params); dense updates; no sparsification | ID embedding tables + top-1% sparsification | Sparse row indices reveal which businesses a user reviewed and cannot be summed under SecAgg+; small dense model is DP-friendly and CPU-feasible | Superseded by ADR-043 |
| 020 | User-level DP in FL by clipping each client's whole update + noise on the aggregate (Flower DP wrappers); Opacus only for the central baseline (user = one sample) | Opacus per-example DP-SGD on clients | Per-example DP-SGD gives example-level, not user-level, guarantees | Approved (amended CHANGE-023: no Flower DP wrappers and no central Opacus baseline; Opacus is used for its PRV and RDP accountants) |
| 021 | Noise added **once by the aggregator** after summation, with an OpenDP/Google DP sampler | Distributed discrete Gaussian shares across clients | Accounting for distributed discrete noise is research-grade; production FL (S23) adds noise server-side; trust assumption stated as non-claim | Superseded by ADR-037 as to the sampler (seeded float Gaussian, not an OpenDP/Google DP sampler). The principle that the aggregator adds noise once to the sum stands |
| 022 | Accounting: **PLD (`dp_accounting`) of record**; Opacus PRV within ±5%; RDP ε must be ≥ PLD ε; ε reported with and without Poisson amplification | PRV vs RDP ±5% gate | RDP is systematically looser, so a PRV–RDP gate fires on correct code; amplification depends on how sampling is really implemented | Approved (amended CHANGE-023: gate restored by ADR-046; the value of record is now the larger of PRV and PLD) |
| 023 | SecAgg+ run on a verified subset (aggregate equivalence within quantization tolerance + overhead); utility sweeps run without it | SecAgg+ on every run | SecAgg+ changes confidentiality, not the aggregate; saves Tier 0 compute | Superseded by ADR-049 |
| 024 | Gossip over friends graph (degree ≤ d) with per-message local DP; ε composed over all sent messages; no secure gossip; no amplification | Share-based/MPC gossip | Tractable in 3 weeks; honest accounting; gap vs central DP is measured (RQ2) | Approved (extended by ADR-050: gossip between friends is core scope) |
| 025 | Robustness in three modes: (a) plaintext + trimmed mean/median; (b) SecAgg+ + clipping; (c) SecAgg+ committees + median of sums (Could) | SecAgg+ and Krum together | At 30% adversaries P(committee of size k is attacker-free) = 0.7^k (≈17% at k=5, ≈3% at k=10), so the conflict is measured, not assumed away | Approved (amended CHANGE-023: mode (c) is not built; amended CHANGE-024: mode (c) is built and run as the committee-median poisoning modes, ADR-057) |
| 026 | In-repo append-only Merkle log with RFC 6962 hashing, inclusion/consistency proofs, Ed25519-signed receipts and tree heads (`cryptography`); verifier CLI | Trillian service; plain hash chain | Third-party verifiable without running a separate service; SHA-256/Ed25519 from a vetted library — the tree is a data structure, not a new primitive | Approved |
| 027 | uv lockfile + Makefile + GitHub-hosted CI (lint, unit/property tests, pip-audit, gitleaks, licence check); experiments run locally | k3s/Helm, self-hosted runner, SLSA/cosign | Fits the free Actions minutes; nothing is deployed | Approved |
| 028 | Compute: 2 laptops + LNMIIT lab machine; Kaggle/Colab GPU optional; no cloud VM; no service that needs a payment card | Oracle Always Free | Simulation needs no server; Oracle signup needs a card; ARM capacity unreliable; idle reclamation | Superseded by ADR-034 |
| 029 | Attacks: analytic first-layer inversion + NN item recovery; user-level MI (loss-threshold, RMIA ≤4 reference models); item-promotion poisoning; free-riding | `breaching`, LiRA with many shadow models, ART | `breaching` targets vision models; many-shadow LiRA exceeds Tier 0 compute; custom attacks fit the model exactly | Approved (amended CHANGE-023: user-level scope restored by ADR-048, which supersedes ADR-042; RMIA and free-riding are not built; amended CHANGE-024: free-riding is built, ADR-058) |
| 030 | Availability model from FedScale device traces if licence permits ⚠, else synthetic; scenarios: always-available, independent random, correlated with user activity, trace-based | No availability model | Needed for RQ5; correlated scenario tests whether gating biases quality | Approved (amended CHANGE-023: scenarios are always, independent, correlated with activity, correlated with friend count; FedScale traces are not used and trace-based availability is not built; amended CHANGE-024: the traces are used and trace-based availability is built, ADR-056) |
| 031 | Metro selection via geographic bounding box (lat/lon) | City-name string matching | Avoids fragmentation of metro areas across multiple city labels; reproducible and deterministic | Approved |
| 032 | k=15 selected from measured k-core survival; sensitivity sweep at k in {10,20} | k=5 / k=10 / k=20 as primary; guessing k in advance | k=15 clears the 5,000-user floor with ~2x margin and the >=70% connectivity gate; k=20 maximises connectivity (84.1%) but leaves only 6,001 users, k=10 maximises population (19,141) but leaves 31.8% of nodes without in-set peers. Trade-off reported, not hidden. | Approved (amended CHANGE-023: k = 15 stands; the k in {10, 20} sensitivity sweep was not run and remains open; amended CHANGE-024: the sweep was run, ADR-059) |
| 033 | Yelp licence compliance posture: comply with the stricter 7 Jul 2023 terms; repository stays PRIVATE by default; submit findings to Yelp before any public presentation or publication; each owner downloads their own data copy (superseded by ADR-034: one data copy on one PC); delete Data and derivatives on term expiry | Comply with the older 2021 terms; make the repo public at freeze | The 2023 terms are newer and stricter and add an explicit no-third-party-sharing clause (4.D). Section 3 requires Yelp review before public release, and 4.E restricts disclosure of dataset summaries and metrics outside the academic-purpose exception. Supersedes the "public at freeze" clause of ADR-016 / Annex A.6. | Approved |
| 034 | Single-PC execution; code-only collaboration with owner-2 | Two laptops plus lab machine; second data copy | Removes the lab dependency and removes any data transfer between owners, satisfying Yelp 4.D by construction. Parallelism is applied across seeds and configs rather than within a run, because the model is small. Amends the compute topology of ADR-028; its Tier-0 no-card and free-tier rules remain in force. | Approved |
| 035 | In-process federated simulation for the headline grid; Flower parity check deferred | Flower plus Ray simulation tonight | 99 clients per round and ~1.15 lakh parameters need no distributed runtime; Ray per-process memory threatens the 16 GB budget (R-20). One trainer serves central and federated modes, reducing the chance of a DP implementation divergence. | Approved (amended CHANGE-023: the in-process simulation is the only runtime, Flower is removed by ADR-055, and the parity check is cancelled; amended CHANGE-024: the parity check was done as a separate script in a separate environment, ADR-061, and the main results still use the in-process simulation) |
| 036 | Opacus PRV accountant of record; RDP must be >= PRV; dp_accounting PLD cross-check deferred | PLD of record tonight | Removes an unfamiliar API and an extra dependency from a time-boxed overnight run. The two-accountant sanity gate is preserved. PLD remains a planned cross-check. | Superseded by ADR-046 |
| 037 | Seeded NumPy PCG64 float Gaussian noise for reproducibility; OpenDP discrete-Gaussian hardening deferred | OpenDP discrete Gaussian tonight | Reproducibility requires published seeds, and a vetted discrete mechanism adds API risk inside a single overnight window. Reported epsilon is accountant-derived under an ideal Gaussian mechanism. A deployment requires an OS CSPRNG and a discrete mechanism against floating-point precision attacks. Added to the non-claims list. | Approved (retained by CHANGE-023 and ADR-046; it also supersedes the sampler wording of ADR-021) |
| 038 | Cosine scoring at fixed temperature 10 with L2-normalised tower outputs | Raw dot product of unnormalised embeddings | Default initialisation gave scores of order 1e-3 and gradients two orders of magnitude too small, leaving the model at random chance. Normalisation plus temperature is standard two-tower practice, keeps the parameter count at 115,072, and does not affect epsilon accounting. Learning rate is chosen by measurement via scripts/tune_learning.py. | Approved (amended CHANGE-023: the model is now ADR-043 and the temperature is frozen at 20.0 in `experiments/frozen.json`) |
| 039 | Learnable per-item bias added to the temperature-scaled cosine score, zero-initialised | Pure cosine scoring; unnormalised dot product; popularity-scaled initialisation from private counts | Cosine cannot express popularity, which dominates this dataset. A zero-initialised bias restores it without using private statistics at init, adds only 6,319 public-catalogue parameters, and is clipped and noised identically to the towers. | Approved (retained in ADR-043) |
| 040 | Separate item-bias learning rate at 10x the tower rate | Single learning rate for all parameters; larger global rate; sum-reduced loss | Mean-reduced BPR plus cohort averaging gives the scalar bias gradients ~100x too small; raising the global rate would destabilise the towers. A separate bias rate is standard practice, adds no parameters, and leaves clipping and epsilon unchanged. | Superseded by ADR-043 (one server learning rate per regime in `experiments/frozen.json`) |
| 041 | Round-matched central control at q=0.02, E=1, T=400; extend to 10 seeds | Compare central T=40 against federated T=400; keep 5 seeds | Matched data budget alone leaves a 10x optimisation-step confound. Five paired seeds cannot reach two-sided significance at alpha=0.05 because the minimum p-value is 0.0625. Both are design defects, not findings, and are corrected before any headline claim. | Approved (amended by ADR-044: sampling regimes replace the round-matched central control) |
| 042 | Attack scope: interaction-level score-based MI over all checkpoints, plus analytic first-layer inversion on single client updates | Claim user-level MI from interaction-level evidence; many-shadow LiRA | Interaction-level evidence cannot support a user-level claim. Analytic inversion matches the non-SecAgg+ threat model where the coordinator sees individual updates, and uses absolute cosine so the sign ambiguity favours the attacker, keeping privacy claims conservative. Proper user-level MI requires a held-out user population and reference models and is scheduled separately. | Superseded by ADR-048 |
| 043 | **Hybrid model**: item ID embeddings plus a fixed content projection (top 16 principal directions of the public text embeddings); user vector from the user's own history on the device; 107,679 parameters | Content-only two-tower (ADR-019); a trained projection; dimension 32 | Content only reached validation NDCG@10 0.0205 against 0.0345 with IDs; the fixed projection matched the trained one (0.0347 vs 0.0345). Supersedes ADR-019; restores the intent of ADR-005 | Approved (CHANGE-023) |
| 044 | **Sampling regimes** (`large`: rate 0.5, 40 rounds; `small`: rate 0.05, 400 rounds) replace central-versus-federated in RQ1; the H1 denominator is the non-private model with the same rounds and rate | Central versus federated comparison; round-matched central control | Under per-user clipping and noise on the sum the two are the same mechanism. Amends ADR-041 | Approved (CHANGE-023) |
| 045 | **Fast closed-form clipped sum** for single-step clients, checked against autograd at the start of every run | Per-user autograd gradients | 171 s to 29 s on a real-data run with an identical result; the run refuses to start if the check fails | Approved (CHANGE-023) |
| 046 | **Three accountants** (Opacus PRV, Opacus RDP, dp-accounting PLD); value of record is the larger of PRV and PLD; PRV and PLD within max(5%, 0.05), RDP no smaller; seeded float Gaussian noise (ADR-037) kept | PRV of record (ADR-036); PLD of record (ADR-022) | Two Approved ADRs contradicted each other. Supersedes ADR-036 and ADR-021; restores the gate of ADR-022 | Approved (CHANGE-023) |
| 047 | **Tune on validation, final model on train + validation, one test evaluation**; hyperparameters frozen in `experiments/frozen.json` before any test evaluation | Tune and report on the same split | Earlier runs were tuned on test; validation was never loaded. Tuning cost is disclosed, not accounted | Approved (CHANGE-023) |
| 048 | **Attack scope**: history inversion, friendship-link inference, user-level membership inference with reference models; a result file is written only if the controls pass | Interaction-level MI (ADR-042); many-shadow LiRA | The step-10 inversion read the wrong slice and the MI read the model input. Supersedes ADR-042; restores the user-level scope of ADR-029 | Approved (CHANGE-023) |
| 049 | **Secure aggregation as an in-process pairwise-mask simulation** (X25519, HKDF, fixed point modulo 2^64); no secret sharing, no network | SecAgg+ through Flower on a verified subset (ADR-023) | Shows what an aggregator can see; not a deployable protocol. Supersedes ADR-023; amends ADR-001 and ADR-035 | Approved (CHANGE-023) |
| 050 | **Social layer as core scope**: friends baseline, friendship-link inference, gossip between friends, participation bias by friend count, fake-account promotion | Friend graph used only for the gossip topology | The dataset is a social review platform and the project is about social media | Approved (CHANGE-023) |
| 051 | **Receipts hold only data-independent fields; empty cohorts are noised** | Skip a round when nobody is sampled; log realised cohort sizes | Whether a round is skipped, and the realised cohort size, depend on who took part | Approved (CHANGE-023) |
| 052 | **Static HTML report** replaces the Streamlit dashboard | Streamlit dashboard | No server, aggregates only (Yelp terms), opens anywhere | Approved (CHANGE-023) |
| 053 | **Source rule**: no conference or journal papers; standards, government and agency reports, official documentation, vendor engineering write-ups and repositories only | Option (c) of CHANGE-013 | Decided by the owner on 17 Nov 2026. Supersedes the rule of CHANGE-013 | Approved (CHANGE-023) |
| 054 | **The what-if population simulation carries no epsilon claim** | Reporting an epsilon for the scaled-noise runs | Dividing the noise by k is a simulation of a larger population, not a guarantee | Approved (CHANGE-023) |
| 055 | **Stack reduction**: remove Flower on Ray, RecBole, OpenDP sampler, DVC, MLflow, Streamlit and PyG; add dp-accounting, cryptography, rfc8785, matplotlib; scipy declared | Keep the v1.9.0 stack list | None of the removed items was ever installed. Amends ADR-001 and ADR-035 | Approved (CHANGE-023) |
| 056 | **Device availability trace**: FedScale `client_behave_trace` (25.6 MB, 107,749 devices) as an optional file at `data/external/fedscale/client_behave_trace`; read only with a restricted unpickler that allows one global (`collections.OrderedDict`) and keeps only availability intervals and trace length; three scenarios `trace`, `trace_activity`, `trace_replay`; one round = 30 minutes (an assumption); epsilon exact for `trace` and `trace_replay`, nominal for `trace_activity` | `pickle.load`; synthetic scenarios only; committing or redistributing the file | A pickle from the internet can run code on load; assignment, offsets and schedule that ignore user data keep epsilon exact, while rank-matching to history length does not. Repository Apache-2.0, dataset notes say research use only, so the file stays under git-ignored `data/`. Devices are not linked to real users. Amends ADR-030 | Approved (CHANGE-024) |
| 057 | **Committee-median mode as a custom aggregator outside the engine**: random committees summed (as under secure aggregation), coordinate-wise median of the committee sums times the committee count; modes `committee_median_size4` and `committee_median_size20`; defined in `attacks/poisoning.py` and passed to `train` as a callable; no DP noise | A new named aggregator in `fl/aggregate.py`; not building mode (c) | The aggregator needs the cohort partition and its own random stream, which a callable receives; `train` refuses non-sum aggregators together with DP noise. The chance a committee has no attacker is (1 - f) to the power of the size: 66% and 12% at 10% attackers. Committees are simulated in the clear. Implements ADR-025 mode (c) | Approved (CHANGE-024) |
| 058 | **Free-riding experiment scope**: two behaviours (zero update; noise at the honest mean norm); fractions 0, 10, 30%; regime `small`, rate 0.02, 200 rounds, 3 seeds; clip-only, plain sum, no DP noise; measures cost to everyone, free-rider gain and detection AUC by norm and by cosine to the mean of the others over the last 20 rounds; `not_applicable` under secure aggregation; controls: zero behaviour caught by norm (AUC at least 0.95), fraction-0 model at least 1.1 times MostPopular | Adaptive free-riders; a proposed detector; free-riding under DP noise | The aim is to show the conflict between detection and secure aggregation, not to propose a defence. Honest limits: simple, non-adaptive behaviours; no privacy guarantee. Implements the free-riding part of ADR-029 | Approved (CHANGE-024) |
| 059 | **Sensitivity variants with frozen hyperparameters**: k = 10, k = 20 and reviews of 4 stars or more with k = 15, built from the same filtered source files and split protocol; reduced RQ1 rerun (non-private plus epsilon 8 and 1, 3 seeds, both regimes) with hyperparameters frozen from the main dataset, noise recalibrated per variant, a list-length readout, and a control (non-private at least 1.1 times MostPopular) | Re-tuning on each variant; the full 10-seed grid per variant | Re-tuning would mix a data effect with a tuning effect; a reduced grid fits the compute budget. Frozen settings may favour or hurt a variant, and this is stated. H1 fails on every variant. Completes the sweep of ADR-032 | Approved (CHANGE-024) |
| 060 | **Engine-only provenance hash and strict resume**: `code_sha256` over 21 engine files (`ENGINE_FILES`), stored in every run record; experiment, attack and report modules are excluded and covered by `module_sha256` in result files; resume flags `stale_code`, and `PRISM_STRICT_RESUME=1` reruns stale records | Git commit only; hashing the whole package | The runs of 17 Nov 2026 predate the commit of the code that made them, and a dirty tree has no commit. Adding an experiment must not make other runs stale. Closes the partly fixed finding of design section 9.5 | Approved (CHANGE-024) |
| 061 | **Flower parity run in a separate environment, not a dependency**: `scripts/flower_parity.py` with Flower 1.43.0 (simulation runtime, Windows), small synthetic problem (400 users, 5 rounds), fixed cohorts and splits, custom strategy; largest parameter difference about 6e-08 with and without noise; write-up in `docs/flower-parity.md` | Adding Flower to `pyproject.toml`; running the main grid on Flower | The project environment stays unchanged and the ADR-055 stack reduction stands. It shows plumbing parity only, not scale, client mathematics or Flower's own DP wrappers. Amends ADR-035 and ADR-055 | Approved (CHANGE-024) |

---

## 8. Privacy & security engineering

### 8.1 Threat model (`docs/threat-model.md`, 1–3 pages, attacks mapped to S2 classes)
**Assets:** users' interaction histories; derived user representations; released models; privacy-budget records.

**Adversaries in model:**
1. Honest-but-curious coordinator — sees the participant list and the aggregate; in modes without secure sum also sees individual updates, and may try to recover histories and infer friendships from them.
2. External observer of released models — MI and inversion against the final model.
3. Curious gossip peer — sees its neighbours' messages.
4. Up to 30% malicious clients (fake accounts) — poisoning by targeted item promotion. Free-riding is not modelled (CHANGE-023). *(CHANGE-024: free-riding is now modelled, in two behaviours, ADR-058.)*
5. Log tamperer — tries to rewrite or drop ledger entries.

**Out of model (documented):** a coordinator colluding with clients beyond what the secure-sum simulation tolerates (it has no secret sharing); an aggregator that skips adding noise; Sybil creation; rooted devices; network attackers (no real network exists); side channels.

### 8.2 DP specification
| Parameter | Spec |
|---|---|
| Privacy unit | One user's entire contribution across all rounds |
| Neighbourhood | Add/remove one user (S1) |
| Contribution bound | ~~≤50 interactions per user per round, enforced before training~~ Superseded by CHANGE-023: no per-round interaction cap is built; the per-user update clip C alone bounds sensitivity |
| Clipping | Each client's whole update clipped to L2 norm C (C = 5.0 in both regimes, chosen on validation data of the same users and frozen in `experiments/frozen.json`; that choice is not covered by ε) |
| Noise | Gaussian, σ = z·C, added once to the aggregated sum by the aggregator, also for an empty cohort; z searched to the target ε under the three-accountant gate; seeded float Gaussian from NumPy PCG64 (ADR-037), not a deployment-grade sampler. *(v1.9.0: OpenDP/Google DP sampler, never `numpy.random`; superseded.)* |
| Sampling | Each user is sampled independently with probability q (Poisson) from a seeded stream; availability only removes sampled users or scales participation (the ε shown for RQ5 is nominal) |
| Amplification | ε reported both with Poisson amplification at rate q and without amplification |
| δ | = 1/(10·n) with n = 9,913 for calibration, the gate and the headline; recomputed if n changes. ε at δ = 1/n² is also reported, because NIST SP 800-226 advises δ far below 1/n and the headline δ is at that boundary |
| Composition | Three accountants over T rounds (Opacus PRV, Opacus RDP, dp-accounting PLD); the ε of record is the larger of PRV and PLD; the release gate halts training before a round that would take the reported ε past the budget |
| Cross-checks | PRV and PLD agree within max(5%, 0.05); RDP no smaller than either, less 0.01; a failing run is recorded as `accounting_inconsistent` and excluded (ADR-046) |
| Central baseline | ~~Opacus DP-SGD with each user treated as one sample~~ Superseded by CHANGE-023 (ADR-044): no separate central baseline is built; RQ1 uses the two sampling regimes, and Opacus is used only for its accountants |
| Gossip | Each outgoing message clipped and noised locally for user-level DP against any single peer; composed over all messages a user sends; no amplification |
| Reporting | ε (both variants), δ, T, q, C, z, n, mechanism, the three accountants and their versions, ε at δ = 1/n², the label "excluding hyperparameter selection", commit hash — in every table |

### 8.3 Security controls that are real in this simulation
Ed25519-signed receipts and checkpoints · Merkle log with inclusion/consistency proofs · one signing key, created on first use by `load_or_create_key`, kept under git-ignored `keys/`, never committed · no raw text or user IDs in logs, receipts or results (users and businesses are integer-indexed in the processed files). *Superseded by CHANGE-023 as not implemented: signed round manifests, keyed-HMAC pseudonymisation at ingest and message-schema tests; no code in the tree implements them.*

**Not implemented (no real network or devices; listed in non-claims):** transport security (TLS/mTLS), on-device storage encryption, anonymous participation credentials, Sybil resistance.

### 8.4 Secure development
pre-commit (ruff, mypy on `src/prism`, gitleaks) → CI on GitHub-hosted runners (pytest + hypothesis, pip-audit, pip-licenses gate) → nightly on a local machine (DP checks, small attack suite, reproducibility check). CI must stay within the free Actions minutes ⚠.

### 8.5 Compliance mapping (`docs/compliance-mapping.md`, 1–2 pages)
| Obligation | What the project shows |
|---|---|
| DPDP Act 2023 + Rules 2025 (S17) | Design notes on consent, notice, purpose limitation, retention |
| GDPR Art. 25 / 35 (S14) | Privacy-by-design choices; DPIA screening note with residual risks |
| EDPB Opinion 28/2024 (S14) | Model not assumed anonymous; DP + MI results cited as evidence |
| DSA Art. 27/38 (S15) | Recommender transparency card; non-profiling mode with measured utility cost |

---

## 9. Compute budget and experiment grid (Tier 0)

**Model size (ADR-043).** 107,679 parameters (embedding 101,104, user map 256, item bias 6,319) = 430,716 bytes fp32 (~0.43 MB). A dense update per client-round is about 0.43 MB. Expected cohort per round for n = 9,913 users: about 4,957 in the `large` regime (rate 0.5) and about 496 in the `small` regime (rate 0.05). In the attack experiments the secure-sum cohorts are 10 and 100 users; a cohort of 100 is about 43 MB per round in simulation. Gossip at degree 4 is about 1.7 MB egress per node per round (reported, not hidden).

*Superseded estimates (v1.9.0): two-tower with 1,15,072 parameters (~0.46 MB), ~30–45 min per federated or gossip run, a 145-run grid of ~20–60 machine-hours. Measured figures: see results/report/report.html.*

**Run cost targets (design section 4).** One federated run ≤ 3 minutes; the full RQ1 grid ≤ 2.5 hours at 4 workers; peak memory ≤ 12 GB. The measured values are in the report.

| Block | Settings | Seeds | Runs |
|---|---|---|---|
| Tuning on validation | learning rates, clip norm, dimension, server optimiser; frozen in `experiments/frozen.json` | 1 | 29 (`tune-s1` to `tune-s3`) |
| RQ1 privacy-utility | 2 regimes × (non-private, clip-only diagnostic, ε ∈ {1,2,4,8,16}) | 10 | 140, plus what-if runs that carry no ε |
| RQ2 gossip between friends | ε ∈ {8, ∞}, degree 4; run one at a time (memory) | 3 | 6 |
| RQ3 user-level membership | 3 privacy levels × 3 seeds, 4 reference models, 1 overfit control | 3 | 14 |
| RQ3 inversion and link inference | settings of ADR-048 on trained models | n/a | minutes |
| RQ4 poisoning | attackers {10,20,30}% × 2 modes × 3 seeds, plus clean | 3 | about 21 |
| RQ5 availability | 4 scenarios at ε = 8 | 5 | 20 |
| Ablations | the archived 180 content-only runs serve as the content-only ablation (`results/archive/v1-content-only/`); the −graph and −contribution-bound ablations of v1.9.0 are not built | n/a | n/a |

The design document's compute table counted 3 regimes (180 runs for RQ1); the frozen configuration has two regimes, so RQ1 is 140 runs including the clip-only diagnostic. The report states exact run counts.

**Measured execution hardware (ADR-034, 16 Nov 2026):** Intel i5-12500H,
12 cores / 16 logical processors (4 Performance-cores + 8 Efficiency-cores),
16 GB RAM, single Windows PC. RAM is the binding constraint, not CPU.
Execution policy: at most 4 concurrent experiment runs (workers), 2 threads per run
(OMP_NUM_THREADS=2), CPU only for determinism (ADR-018). Thread count is a
reproducibility parameter because floating-point reduction order varies with
it, and is recorded in run provenance. Gossip runs alone because of memory.

**Cut order (CHANGE-023, design section 6.2 as amended; supersedes the v1.9.0 descoping ladder):** (1) committee-median robustness mode *(CHANGE-024: built later the same day, ADR-057)*; (2) availability reduced to the correlated and random scenarios; (3) poisoning at 20% attackers only; (4) RQ1 `large` regime at 5 seeds. Gossip was removed from the cut order by the owner (design section 9.1). **Never cut:** RQ1 `small` regime with 10 seeds; the accountant gate; the corrected inversion attack; user-level membership inference with controls; the ledger with its release gate; the test suite.

---

## 10. Data strategy & ethics

| Dataset | Role | Licence note | Flag |
|---|---|---|---|
| **Yelp Open Dataset** | **Primary**: (user, business, stars, timestamp) interactions + `friends` graph + business metadata | Academic use; **no redistribution** | ⚠ full ≈ 69.9 lakh reviews, ~1.5 lakh businesses, ~19.87 lakh users |
| Synthetic generator | Controlled non-IID and availability scenarios (RQ5); the shareable demo dataset used by CI and `prism demo-small` (`prism.data.synthetic`) | Ours | — |
| FedScale device traces | Availability model (ADR-030). **Not used** (CHANGE-023): availability scenarios are synthetic. *(CHANGE-024: used by the optional trace scenarios; file at `data/external/fedscale/client_behave_trace`, git-ignored, source and checksum in `docs/data-access.md`; ADR-056.)* | Check licence | ⚠ |
| MIND or SNAP Gowalla | Cross-dataset check (Could, after G5 only) | Research-only terms | ⚠ |

**Filtering.** Philadelphia metro area (bounding box, ADR-031) + iterative bipartite k-core with **k = 15** (CHANGE-012, ADR-032): 9,913 users, 6,319 businesses, 4,10,193 interactions. *(v1.9.0: k ∈ {5,10} chosen at G0; superseded.)* The k ∈ {10, 20} sensitivity sweep was not run in CHANGE-023 and remains open. *(CHANGE-024: run on 17 Nov 2026, evening; datasets of 19,141 users at k = 10 and 6,001 users at k = 20; ADR-059.)*

**Interactions.** Every review is an implicit-feedback interaction; a sensitivity analysis with stars ≥ 4 only is pre-registered and was not run in CHANGE-023; it remains open. *(CHANGE-024: run on 17 Nov 2026, evening; 5,551 users, 3,759 businesses, 209,961 interactions; ADR-059.)*

**Item content.** Business name, categories and attributes only. Review text is not used (data minimisation).

**Friends graph.** Restricted to filtered users (70,691 friendships among 9,913 users; 77% of users have at least one friend; median 3, mean 14.3). Used for the gossip topology, the friends-based baseline, friendship-link inference and the friend-count groups of the participation study (ADR-050). The graph is written to `data/processed/friends.npz`; only an aggregate summary of it enters `results/`. *(v1.9.0: gossip topology only; superseded.)*

**Not used.** Phase 1 Instagram analytics; X/Twitter API (cost + ToS); Reddit dumps (governance); Bluesky firehose.

**Ethics & minimisation.** Public ≠ consented. Users and businesses are integer-indexed in the processed files (keyed-HMAC pseudonymisation at ingest is not implemented, see Section 8.3); no raw text or user IDs are published or written to results; the datasheet is still to be written; the single data copy and every derived file under `data/` (including `friends.npz` and model checkpoints under `data/processed/models/`) are deleted when the Yelp licence ends or is terminated, 15 Nov 2027 at the latest, as `docs/yelp-compliance.md` records, or earlier if the owners decide. *(v1.9.0: deleted when the BTP evaluation concludes; superseded by the licence term.)*

---

## 11. Evaluation protocol (pre-registered in `PREREGISTRATION.md` before any privacy run; Amendment 1 of 17 Nov 2026 was written before any test evaluation of the new model)

**Splits.** Strict chronological per-user split, fixed in `PREREGISTRATION.md` section 2: each user's last 20% of interactions → test, the 10% before → validation (realised shares 72.06 / 8.83 / 19.11%). Tuning uses train history and validation targets; final models train on train + validation and are evaluated once on test with train and validation items masked (ADR-047). **Full-catalogue ranking, no sampled negatives.** Leakage assertions in CI.

**Baselines.** MostPopular (= non-profiling mode), ItemKNN, item-item ridge and a friends-based baseline; the non-private hybrid model in each regime; the same model under user-level DP at each ε; the clip-only diagnostic; the secure-sum mode; gossip between friends with local DP. *(v1.9.0 listed BPR-MF and LightGCN through RecBole, the central two-tower and central user-level DP; superseded.)*

**Ablations and sweeps.** As in Section 9; plus dropout {10,20,30}% and sampling rate q.

**Statistics.** 10 seeds for RQ1 (CHANGE-021, Amendment 1) and 3 to 5 elsewhere, stated per experiment (Section 9); bootstrap 95% CIs over users; paired Wilcoxon across seeds; Holm–Bonferroni; minimum detectable effect declared up front; differences inside the CI reported as "no detectable difference".

| Family | Metrics |
|---|---|
| Utility | NDCG@10 (headline), Recall@20, HR@10, MRR, distinct items in top-10 lists, exposure Gini; retention and personalisation retained |
| Privacy (formal) | ε (with/without amplification), δ, T, q, C, z, accountant versions |
| Privacy (empirical) | User-level MI AUC, TPR at 1% and 0.1% FPR, empirical-ε lower bound; history inversion: per-user AUC and precision@10 against the popularity prior; friendship-link inference AUC |
| Robustness | Target-item exposure (share of users with the target in their top 10), clean NDCG@10 drop |
| Participation bias | NDCG@10 gap between availability groups and between friend-count groups; participation rate per group |
| Systems | Bytes per client per round, bytes-to-target-NDCG, rounds-to-target, wall-clock, SecAgg+ overhead |
| Ledger | Receipt coverage, append time, proof size, proof verification time, tamper detection |
| Cost | ₹ (target 0), machine-hours, CI minutes |

**Primary outputs:** utility-vs-ε curves per sampling regime with CIs; attack × defence matrix; robustness-mode comparison; participation-bias table.

---

## 12. Implementation phases & gates

| Phase | Weeks | Dates (2026–27) | Key work | Gate / exit criteria | Owner |
|---|---|---|---|---|---|
| **P0 Foundations** | 1–2 | 17 Nov – 30 Nov | Close verification queue (Section 18, item 1 first); repo + uv lock + CI + licence gate; Yelp access, metro choice, k-core sizes; `PREREGISTRATION.md` draft; threat model v1; apply for Student Pack (the lab machine request is cancelled, ADR-034) | **G0 (30 Nov):** sources verified & dated; source rule set (CHANGE-023); CI green; filtered dataset sizes recorded; guide sign-off | Both |
| **P1 Data, baselines, model** | 3–4 | 1 Dec – 14 Dec | Loaders + pandera; chronological split; content embeddings; baselines (MostPopular, ItemKNN, item-item ridge, friends); hybrid model; metrics + bootstrap | **G1 (14 Dec):** leakage tests pass; every baseline runs through the same evaluation code; per-round runtime measured and Section 9 updated. *(v1.9.0 also required reproducing RecBole's BPR-MF NDCG@10 within ±2%; dropped because RecBole is not used, ADR-055.)* | A |
| **P2 Central DP + accounting** | 5–7 | 15 Dec – 4 Jan | User-level DP in the round loop; PRV + RDP + PLD with the consistency gate; seeded noise; signed receipts; property tests; ε-sweep | **G2 (4 Jan):** accountant checks pass; ε-sweep with CIs | A (+B receipts) |
| **P3 Federated + SecAgg+** | 8–10 | 5 Jan – 25 Jan | In-process round loop; client-update clipping and DP in the loop; availability model; dropout 10–30%; secure-sum equivalence + overhead | **G3 (25 Jan) = MVP:** non-private vs DP ε-sweep in two sampling regimes, 10 seeds, CIs; secure-sum aggregate matches plaintext within tolerance; receipt per release | B (+A DP) |
| **P4 Gossip + participation bias** | 11–13 | 26 Jan – 15 Feb | Friends-graph topology; local-DP messages; byte accounting; ≥100 rounds; availability scenarios (RQ5) | **G4 (15 Feb):** gossip gap + bytes-to-target with CIs; RQ5 table | B (+A stats) |
| **P5 Attacks & defences** | 14–16 | 16 Feb – 8 Mar | History inversion; friendship-link inference; user-level MI; item-promotion poisoning; robustness modes (free-riding is cut; built later, CHANGE-024) | **G5 (8 Mar):** attack × defence matrix with CIs; RQ3–RQ4 answered | A (+B harness) |
| **P6 Ledger + demo** | 17–18 | 9 Mar – 22 Mar | Merkle log + proofs + verifier CLI; tamper tests; release gate; static HTML report; non-profiling mode; model card; datasheet; compliance mapping | **G6 (22 Mar):** 100% receipt coverage; 100% tamper detection; demo shows a blocked over-budget release with a verifiable proof | B |
| **P7 Freeze & write-up** | 19–20 | 23 Mar – 5 Apr | Reproducibility freeze; ADRs, source register, cost ledger; report; demo video; viva prep | **G7 (5 Apr):** one-command reproduction of every table in a clean environment on the same PC; the findings submitted to the dataset provider for pre-publication review at least 3 weeks before the submission date, with the outcome recorded in `docs/yelp-compliance.md`; defence-ready | Both |

**Status after CHANGE-023.** The implementation content of P0 to P6 was built on 17 Nov 2026 (Section 4.5.1 lists what was delivered and what was cut). The dates and gates above stay as the calendar for what is still open: the report, the pre-publication review by the dataset provider, the open verification items, the owners' viva preparation and the clean-environment rerun.

**Calendar risk:** end-semester exams and winter break (late Dec) collide with P2; Nov–Dec may also include placement activity. Mitigation: lighter tasks in W6–W7; confirm the LNMIIT academic calendar and mid-term review dates at G0; each gate carries 2 buffer days; the MVP at G3 is ready before a typical mid-term review.

**Split:** **A (Shivam)** = data, models, DP + accounting, attacks, statistics. **B (Mokshit)** = secure-sum simulation, availability model, gossip, ledger, CI, report. (The 17 Nov 2026 implementation was performed by an AI coding assistant at the owners' instruction; the split above is the owners' ownership of components for the viva.) Shared: evaluation, report, viva prep.

---

## 13. Testing strategy

| Layer | Assertions | Tooling |
|---|---|---|
| Unit | Clipping correctness, contribution bound, split integrity, ledger monotonicity, signature validity | pytest; coverage ≥ 90% on `privacy/`, `ledger/`, `fl/secagg.py` and ≥ 85% overall, enforced with `fail_under` |
| Property-based | Budget never negative; secure-sum total = plaintext sum within quantization tolerance; every inclusion/consistency proof verifies; any tampered entry is detected; no seed reuse | hypothesis |
| DP checks | PRV vs PLD within max(5%, 0.05); RDP no smaller than either, less 0.01; ε against an independent reference (known answer); empirical-ε lower bound from MI ≤ claimed ε | custom; **CI-blocking** where fast, nightly otherwise |
| Data | Schema, chronological-split leakage, filtered-set statistics | pandera |
| Message schema | Clients send only parameter arrays of the expected shape — no raw interactions | pytest |
| Attacks | Positive and negative control per attack (test suite and run-time control gate); nightly small attack suite; alert if attack success rises > 2 pp between commits | custom |
| Reproducibility | Same seed + lockfile ⇒ same headline numbers on CPU; two runs with one seed give identical record hashes | determinism test in CI on the synthetic dataset |
| Security hygiene | Dependency audit, secret scan, licence gate | pip-audit, gitleaks, pip-licenses |

**Stop-ship rules:** accountant inconsistency · raw interaction found in a client message · release without a receipt · secure-sum aggregate ≠ plaintext beyond tolerance · empirical ε > claimed ε · licence gate failure.

---

## 14. Risk register

| ID | Risk | L×I | Mitigation | Trigger / fallback |
|---|---|---|---|---|
| R-01 | DP misimplementation ⇒ false guarantee | M×Critical | Library accountants, property tests, vetted sampler, no hand-rolled accounting | Check failure ⇒ freeze releases |
| R-02 | Gossip utility much worse than federated DP | H×M | Expected (H2); report the gap with bytes | Not a failure — it is the RQ2 answer |
| R-03 | SecAgg+ vs robust-aggregation conflict | H×H | Three modes (ADR-025) | Weak robustness under SecAgg+ ⇒ report as finding |
| R-04 | Utility collapse at low ε with ~10k users | M×H | Larger cohort q, tuned C, more rounds T | Report negative result with diagnosis |
| R-05 | Compute over budget | M×M | Section 9 estimate re-measured at G1; descoping ladder | Apply ladder steps in order |
| R-06 | Crypto misuse | L×Critical | Ed25519/SHA-256 from `cryptography` only; RFC 6962 hashing; property tests | Any bespoke primitive ⇒ removed |
| R-07 | Dataset licence/ethics objection | M×H | Terms review, pseudonymisation, no redistribution | Objection ⇒ synthetic + MIND/SNAP ⚠ |
| R-08 | Scope creep | H×M | MoSCoW (4.5); viva rule (0.1.7); max one Could item | Any core slip ⇒ all Could items cancelled |
| R-09 | Dependency drift (Flower/Opacus/RecBole APIs) | M×M | Pin versions in uv.lock; RecBole in its own env if needed | Upstream break ⇒ pin older version |
| R-10 | Flower DP wrapper + SecAgg+ incompatibility in simulation | M×M | ADR-023 already separates them | Run SecAgg+ equivalence checks without DP noise; apply DP noise only in separate runs |
| R-11 | Filtered Yelp subset too small or friends graph too sparse | M×M | Measure at G0; adjust metro/k | Random-regular peers for isolated users (reported) |
| R-12 | Regulatory/pricing facts stale | M×L | Verification queue + dated register | Re-verify at G0 and G7 |
| R-13 | Free-tier quota/policy change (Kaggle, Actions) | M×L | Nothing on the critical path needs GPU or heavy CI | Run locally |
| R-14 | Academic calendar / placement collision | H×M | Buffer days; MVP early; light tasks in exam weeks | Slip > 1 week ⇒ apply descoping ladder |
| R-15 | Viva depth — a component neither owner can explain | M×H | Viva rule; each owner reviews the other's modules | Remove the component |
| R-16 | Yelp pre-publication review not obtained before public release | M×H | Submit findings to Yelp at least 3 weeks before any public presentation or publication; track as a G7 exit item in docs/yelp-compliance.md | No approval => no public release; discuss internal-only submission with the guide |
| R-17 | Accidental public disclosure of dataset statistics (public repo, blog, demo video) | M×H | Repo private by default (ADR-033); no dataset counts in any public artifact before Yelp approval; run the yelp-compliance.md checklist before publishing anything | Any public artifact => checklist first |
| R-18 | Licence term expiry on 15 Nov 2027, or earlier termination by Yelp | L×M | Calendar reminder; on expiry or termination delete all Data and derivative works and certify in writing on request | Project extends past expiry => re-accept terms and re-download |
| R-19 | Laptop thermal throttling distorts wall-clock measurements | M×L | Cap concurrency at 4 runs / 8 threads; keep plugged in on a hard surface; report wall-clock with the thread setting stated | Timings unstable => report machine-hours and thread config, not raw wall-clock |
| R-20 | Ray per-process memory overhead exceeds 16 GB when runs are parallelised | M×M | Measure at the FL step; fall back to in-process Flower simulation, which is sufficient at 99 clients per round and ~1.15 lakh parameters | Memory pressure => in-process simulation, recorded as an ADR amendment |
| R-21 | Single overnight window is insufficient for the full roadmap | H×H | Time-box to the MVP utility-vs-privacy core; resumable per-run JSON output so partial results survive a crash; report only what actually completed | Window ends => report completed runs honestly and schedule the remainder |
| R-22 | Clipping norm chosen from a non-private pilot on the same data leaks a small amount of information | M×M | Chosen once, cached, held identical across all DP runs, and disclosed as a limitation | Reviewer objects => re-choose C from a public proxy and re-run the sweep |
| R-23 | Content-only two-tower may not match the non-learned ItemKNN baseline | H×M | Report absolute utility honestly against MostPopular and ItemKNN; frame RQ1 as relative retention versus the non-private central model; record the architectural cause (no user-ID embeddings, frozen content features, unit-norm scoring) | Model trails baseline => state it as a limitation with the measured gap, do not reframe the claim |
| R-24 | One-day AI-assisted build: the owners cannot explain components built in one day (extends R-15) | M×H | `docs/viva-notes.md` explains every component and its limits in plain language; each owner reads it and can explain each component (rule 0.1.7); the owners write the report prose (Section 17, item 10) | A component that neither owner can explain simply ⇒ flag it for removal |
| R-25 | Privacy cost of tuning on private data is unaccounted: hyperparameters and the clipping norm were chosen on the same users | Certain×M | Disclosed in every receipt and in the report ("excluding hyperparameter selection"), as NIST SP 800-226 asks; tuning runs are separate ledger lineages and are not composed with the final run | Cannot be removed in this design; disclosure only |
| R-26 | DP erases personalisation at this population size (9,913 users) at every ε tested | H×H | Report it as the finding, with personalisation retained and a users-needed estimate from the labelled what-if simulation (ADR-054) | Expected for H1; report the negative result with its diagnosis |
| R-27 | A single Ed25519 key signs every receipt and checkpoint: loss or leak lets someone forge or disown the ledger history | L×M | Key kept under git-ignored `keys/`, never committed (gitleaks in CI); the ledger proves what was recorded, not that the DP code is correct (non-claim) | Key leaked ⇒ new key, new ledger lineage, old ledgers marked untrusted |

**Accepted trade-offs:** user-level DP costs utility (paid for honesty) · gossip costs bytes and accuracy (paid for no coordinator) · secure aggregation limits robustness (measured) · the aggregator is trusted to add noise (stated).

---

## 15. Annex A — Cost, licensing, and resource policy (Tier 0)

### A.1 Principle
**₹0 spend.** No service that requires a payment card. Any paid item requires a new CHANGE-ID approved by both owners with guide visibility.

### A.2 Resource register
| Item | Choice | Limit | Cost | Flag |
|---|---|---|---|---|
| Libraries | FOSS (Section 16) | — | ₹0 | — |
| Dataset | Yelp Open Dataset | No redistribution | ₹0 | ⚠ |
| Compute | One PC (ADR-034). *(v1.9.0: 2 laptops + lab machine; superseded.)* | Machine availability | ₹0 (+ electricity) | — |
| GPU (optional) | Kaggle / Colab | Weekly quota, session limits | ₹0 | ⚠ |
| Fallback compute | Azure for Students credit (no card required ⚠) | Credit amount | ₹0 | ⚠ |
| Code + CI | GitHub private repo, hosted runners | 2,000 Linux min/month on Free plan; more with Student Pack ⚠ | ₹0 | ⚠ |
| Data storage | Local disks + external-drive backup; no DVC (ADR-055) | Disk | ₹0 | — |
| Results tracking | CSV/JSON run records in `results/`; no MLflow (ADR-055) | Disk | ₹0 | — |
| Demo access | Local static report; no hosted demo (any public demo needs the Yelp pre-publication review first) | n/a | ₹0 | — |
| Embeddings | Local sentence-transformers | CPU | ₹0; paid APIs prohibited (ADR-013) | — |

### A.3 Removed (CHANGE-005)
Tier 1 and Tier 2 budgets; Oracle Always Free; Cloudflare R2; GHCR; self-hosted runner; Hetzner/DigitalOcean/RunPod/Vast; custom domain; TEE spike.

### A.4 Cost-control rules (binding)
1. No payment card on any service; no trials that auto-convert to paid.
2. `docs/cost-ledger.md` updated weekly: machine-hours, CI minutes, ₹ (expected 0).
3. GPU only through Kaggle/Colab free quotas, never on the critical path.
4. Apply for the GitHub Student Developer Pack and request LNMIIT lab machine access at G0. (Lab machine access is no longer needed, ADR-034.)

**Non-cash cost:** ~500–600 person-hours; electricity ~₹500–₹750 (at ₹8/kWh ⚠).

### A.5 Licence policy (ADR-015)
**Preferred:** Apache-2.0, MIT, BSD, MPL-2.0, PostgreSQL. **Rejected by default:** AGPL-3.0, BSL-1.1, SSPL, RSAL. **Gate:** pip-licenses runs in CI; a new copyleft/BSL dependency fails the build unless an approved CHANGE-ID exists.

### A.6 Data governance (ADR-016)
Raw datasets are **never committed**. The repo holds download scripts (no DVC). Processed derivatives, including the friend graph (`data/processed/friends.npz`) and model checkpoints (`data/processed/models/`), stay local and git-ignored. The repository stays PRIVATE by default (ADR-033). Public release requires Yelp
Section 3 approval, both owners' approval, and the guide's approval.

---

## 16. Resources & stack

**Language/runtime:** Python 3.12 · uv · ruff · mypy strict · pydantic v2 · pytest · hypothesis.
**ML/DP:** PyTorch (CPU, `torch.func`) · NumPy · SciPy · sentence-transformers (frozen item embeddings) · Opacus (PRV and RDP accountants) · `dp-accounting` (PLD accountant).
**Ledger and secure sum:** `cryptography` (Ed25519, X25519, HKDF, SHA-256) · `rfc8785` (canonical JSON).
**Data/experiments:** pandera · JSON run records in git.
**Report:** matplotlib · static HTML.
**CI:** GitHub Actions (hosted) · pip-audit · gitleaks · pip-licenses.

**Not used (v1.9.0 listed them; removed by ADR-055):** Flower on Ray, RecBole, OpenDP sampler, DVC, MLflow, Streamlit, PyG.

**Hardware assumption:** a single Windows PC (ADR-034; measured specification in Section 9). `prism demo-small` (`make demo`) runs end to end on CPU on the synthetic dataset, so the project is never blocked and anyone can run the pipeline without Yelp data. *(v1.9.0: 2 laptops + lab machine and `make demo-small`; superseded.)*

---

## 17. Deliverables & definition of done

1. Repo with lockfile, `make setup`, `make all-experiments` (the reproduction command), `make demo` (runs `prism demo-small`).
2. Server-based training in two sampling regimes (with the secure-sum simulation) and gossip between friends in one simulation harness; non-profiling mode; static HTML report.
3. **Privacy dossier:** DP spec, accountant reports (PLD/PRV/RDP), empirical audits, signed receipts, log proofs.
4. **Threat model** (1–3 pages) + attack × defence matrix.
5. **Compliance mapping** (1–2 pages), datasheet, model card.
6. **Evaluation report:** ε curves, gossip gap, robustness modes, participation bias, ablations, CIs, negative results, non-claims.
7. **Docs:** ADRs (files in `docs/adr/` from ADR-043 onward), `docs/literature-review.md`, `docs/viva-notes.md`, `source-register.md`, `verification-log.md`, `cost-ledger.md`, `implementation-log.md`. The threat model, compliance mapping, model card and datasheet (items 4 and 5) are not yet written.
8. **Demo:** 8-minute video + static report and `prism ledger` output showing a blocked over-budget release with a verifiable proof. A public video needs the Yelp pre-publication review first.
9. **Reproducibility certificate:** clean-environment rerun by the second owner on the same PC (fresh clone into a separate directory, fresh `uv sync` from `uv.lock`, `make all-experiments`), comparing every headline number. This is a clean-environment check, not an independent-machine check.
10. **Report-writing rule:** plain, direct technical English written by the owners; no paraphrasing or rewriting tools.

**DoD:** all G0–G7 gates closed · zero stop-ship violations · every headline number traceable to config hash + seed + commit · ₹0 spent.

---

## 18. Verification queue (must close at G0; log in `docs/verification-log.md`)

| # | Item | Owner | Due |
|---|---|---|---|
| 1 | **Source rule:** ~~confirm with guide whether papers must be excluded~~ Closed by the owner's decision of 17 Nov 2026 (CHANGE-023, ADR-053): papers are excluded | Both | Done 17 Nov 2026 |
| 2 | LNMIIT academic calendar, mid-term review dates, report format, lab machine access (no longer needed, ADR-034) | Both | 24 Nov | PARTIAL - Guide approval given; submission and mid-term dates still required to schedule the Yelp pre-publication trigger. |
| 3 | NIST SP 800-226 final version/date | A | 24 Nov |
| 4 | NIST AI 100-2 revision | A | 24 Nov |
| 5 | DPDP Rules 2025 notification date + phasing | B | 24 Nov |
| 6 | DSA Art. 27/38 text | B | 24 Nov |
| 7 | Flower version: SecAgg+ workflow, DP wrappers, and their behaviour in simulation | B | Not needed: Flower is not used (ADR-055). CHANGE-024: Flower 1.43.0 was run once for the parity check (ADR-061) |
| 8 | Opacus version, PRV accountant, torch compatibility | A | 26 Nov |
| 9 | `dp_accounting` version (PLD) | A | Done 17 Nov 2026: 0.7.0 installed and used (ADR-046) |
| 10 | RecBole compatibility with current Python/torch | A | Not needed: RecBole is not used (ADR-055) |
| 11 | Yelp licence text + exact counts; filtered-subset sizes for candidate metros | A | 26 Nov |
| 12 | sentence-transformers model licence (e.g. `all-MiniLM-L6-v2`) | A | 26 Nov |
| 13 | FedScale device-trace availability + licence | B | Not needed: availability scenarios are synthetic. CHANGE-024: the FedScale trace is used by three optional scenarios; licence noted in `docs/data-access.md` (ADR-056) |
| 14 | Free-tier facts: GitHub Actions + Student Pack, Kaggle GPU quota, Azure for Students, Cloudflare quick tunnel | B | 28 Nov |
| 15 | Licences of all remaining dependencies (pip-licenses run) | B | 28 Nov |
| 16 | Submit findings to Yelp for pre-publication review (Section 3) and record the approval | Both | Before any public release | OPEN | | |

---

## 19. Approval gate

- [x] Scope (Section 4) approved, including MoSCoW, out-of-scope and non-claims
- [x] Dataset choice approved (Yelp primary, filtered to one metro)
- [x] ADR-001…042 approved, as amended or superseded in the Section 7 statuses; ADR-043…055 approved under CHANGE-023 (design approved by the owner on 17 Nov 2026)
- [x] Budget: Tier 0 (Rs. 0) confirmed - paid tiers removed in CHANGE-005
- [x] Compute plan (Section 9) accepted; lab machine access requested (the lab machine plan is superseded by ADR-034; Section 9 is re-stated by CHANGE-023)
- [ ] ~~Source rule confirmed with guide (verification item 1) - G0 exit condition~~ Superseded by CHANGE-023: the rule is now set by the owners
- [x] Source rule set by the owner on 17 November 2026 (CHANGE-023, ADR-053): no conference or journal papers
- [ ] Timeline + gate dates confirmed against the LNMIIT calendar - G0 exit condition
- [x] Verification queue owners assigned
- [x] Guide (Dr. Malika Acharya) has reviewed this document - G0 exit condition

| Role | Name | Signature | Date |
|---|---|---|---|
| Privacy/ML lead | Shivam Agarwal (23UEC621) | Shivam Agarwal | 15 Nov 2026 |
| Systems/Security lead | Mokshit Jain (23UEC574) | Mokshit Jain | 16 Nov 2026 |
| Guide | Dr. Malika Acharya | Approved - relayed by owner 16 Nov 2026; written confirmation to be filed | 16 Nov 2026 |

Per CHANGE-009, owner-1 signature authorises P0 only. Guide review and the two
open boxes are G0 exit conditions. P1 requires both owner signatures.

CHANGE-023 (v2.0.0) was approved by the owner on 17 Nov 2026, as the design document records. Rule 0.1.3 requires both owners, so the second owner's acknowledgement of v2.0.0 is still to be recorded here.

---

## 20. Open questions for review

1. Is the "no papers" source rule an actual requirement for this project? *(Closed 17 Nov 2026: the owners set the rule, CHANGE-023.)*
2. Submission deadline and mid-term review dates?
3. Is LNMIIT lab machine access available, and with what limits? *(Closed: not needed, ADR-034.)*
4. Which metro area and k-core threshold give enough users and friends-graph density? (measured at G0) *(Closed at CHANGE-012: Philadelphia, k = 15.)*
5. Any institute-mandated report format or deliverable not captured here?
6. Confirm the A/B role split.

---

## 21. Defence narrative (6 lines)

1. Social recommendation today either centralises everyone's behaviour or, on open networks, makes it public.
2. Phase 1 was a feasibility prototype: it showed the pipeline could run, but used a synthetic target, a custom privacy cost and only 20 clients.
3. Phase 2 rebuilds on real interaction data with ranking metrics and user-level DP checked by three accountants that must agree.
4. We measure what privacy costs in accuracy, how far gossip between friends falls behind server-based training, which histories and friendships a curious server can recover from model updates, and whether uneven participation leaves some users with worse recommendations.
5. We attack our own system and show where secure aggregation protects confidentiality and where it weakens poisoning defences.
6. Every model release carries a signed privacy receipt in a tamper-evident log, and an over-budget release is refused with a verifiable proof — at ₹0 cost.
