# PROJECT_ROADMAP.md — PRISM-Rec
**Privacy Attack and Defence in Social Media: A Verifiable Privacy-Preserving Social Recommendation Platform**

| Field | Value |
|---|---|
| Document version | 1.1.0 |
| Status | **APPROVED — IMPLEMENTATION AUTHORISED (P0 ONLY)** |
| Last updated | 15 November 2026 |
| Owners | Shivam Agarwal (23UEC621) — Privacy/ML lead; Mokshit Jain (23UEC574) — Systems/Security lead |
| Guide | Dr. Malika Acharya, LNMIIT Jaipur |
| Planned execution | 17 Nov 2026 → 5 Apr 2027 (20 weeks, 8 gates) |
| Budget | **Tier 0 only — ₹0** (paid tiers removed in CHANGE-005) |
| MVP milestone | Gate G3, 25 Jan 2027 (Section 4.5) |
| Previous version | v0.9.0 / v0.10.0 exist only in the planning conversation. From v1.0.0 onward, git history plus this change log is the authoritative record. |
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
8. **Division of labour:** Antigravity performs all file creation and editing.
   The owners install software, download data, run commands, and make decisions.

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
| CHANGE-008 | 15 Nov 2026 | 1.0.1 | Step 0 executed (toolchain + skeleton, GitHub private repo). Step 1 executed: GitHub Actions CI (ruff, mypy strict, pytest, licence gate, pip-audit, gitleaks), .gitattributes line-ending policy, scripts/check_licenses.py with tests. Progress tracked in docs/implementation-log.md. Repo licence still pending owner decision. | Superseded by CHANGE-010 (progress moved to docs/implementation-log.md) |
| CHANGE-009 | 15 Nov 2026 | 1.1.0 | Governance correction. Section 19 approval boxes ticked and owner-1 signature recorded; CHANGE-001…006 and all Proposed ADRs marked Approved. Owner-1 signature authorises P0; Dr. Acharya's review and owner-2 acknowledgement are G0 exit conditions, and P1 requires both owners. Added rule 0.1.8 (division of labour). Stale "On approval" line removed. | Approved |
| CHANGE-010 | 15 Nov 2026 | 1.1.0 | Correctness fixes from owner review: anchored .gitignore (/data/, /raw/), Yelp JSON ignored, results/*.jsonl un-ignored; licence gate rewritten with SPDX OR/AND evaluation, classifiers as OR, first-line-only free text, BSL=Boost allowed vs BUSL blocked, APPROVED_EXCEPTIONS keyed to CHANGE-IDs, markdown-safe output; Makefile check includes license-gate and audit; CI and make use bare --cov; environment report adds git commit, dirty flag, uv.lock SHA-256, immutable package tuple, version from installed metadata; coverage source includes scripts/. | Approved |
| CHANGE-011 | 16 Nov 2026 | 1.2.0 | Owner-2 (Mokshit Jain) approval recorded. MIT licence adopted for project code. ADR-031 approved: metro selection will use geographic bounding boxes (lat/lon) rather than fragile city-name string matching to avoid fragmentation (e.g., "St. Louis" vs "Saint Louis"). | Approved |

### 0.3 Decision register status legend
`Proposed` = awaiting approval · `Approved` = locked, build to it · `Rejected` = do not use · `Superseded` = replaced, kept for history.

---

## 1. Source policy (hard constraint)

> ⚠ **PENDING CONFIRMATION (verification item 1).** Confirm with the guide that excluding all papers is an actual requirement for this project. If it is not, amend this section via a CHANGE-ID and cite the original publications for DP-SGD, DP-FedAvg, SecAgg, LightGCN and RMIA in the literature review.

**Permitted sources:** standards (NIST, ISO/IEC, IETF RFC, W3C), regulatory texts (GDPR, DSA, DPDP), government/industry reports, vendor engineering documentation, official dataset documentation, and GitHub repositories/documentation.

**Excluded:** conference papers, journal papers, workshop papers, and arXiv preprints.

**Consequence for algorithms:** where a technique originated academically (DP-SGD, DP-FedAvg, SecAgg+, trimmed mean/Krum, LightGCN, RMIA), we ground it in its **shipped implementation and official docs** or in a **standards artifact**, never in the publication. The mapping is recorded in `docs/source-register.md`.

**Licence-attribution exception:** if a dataset licence *requires* a specific citation, we honour the licence text as a legal obligation and record it under "licence compliance", not under "literature review".

**Phase 1 note:** the April 2026 report's journal-only bibliography is retained as historical context only.

---

## 2. Phase 1 limitations and the Phase 2 response

Phase 1 (April 2026) was a feasibility prototype: it showed that an on-device recommendation pipeline with privacy components could run end to end. Reviewing it critically shows the limitations below, which Phase 2 is designed to fix.

| # | Phase 1 approach | Limitation | Phase 2 response |
|---|---|---|---|
| 1 | 29,999 posts → 20 virtual clients from `account_id` | No user–item interactions and no user–user graph, so ranking quality cannot be measured; user-level DP with n=20 is meaningless (δ must be ≪ 1/n) | Yelp Open Dataset filtered to one metro area: real interactions, timestamps and `friends` graph; ~5,000–20,000 users ⚠ |
| 2 | Quality = `1 − MAE` on a constructed target (Eq. 3.1) | Regression on a synthetic label, not recommendation. The score stayed ≈0.806 at every battery level and with or without DP (0.8065 vs 0.8066), and was never compared with a predict-the-mean baseline, which plausibly scores in the same range on this target | NDCG@10, Recall@20, HR@10, MRR, coverage, Gini; chronological split; full-catalogue ranking; MostPopular and ItemKNN baselines |
| 3 | `ε_cost = 0.35 / (1 + 18σ)` (Eq. 3.8) | Not a DP accountant: no sensitivity, clipping, δ, composition, or subsampling | PLD accountant (`dp_accounting`) cross-checked with Opacus PRV; RDP as upper bound; NIST SP 800-226 checklist (ADR-022) |
| 4 | More noise at low battery (Eq. 3.7) | Privacy that depends on device state is not a guarantee; an adversary waits for full charge | Availability gates **participation only**; noise fixed by the accountant; participation bias measured (RQ5, ADR-004/030) |
| 5 | "Pairwise masking" in gossip | Masks that do not cancel act as extra noise with no confidentiality argument | Flower SecAgg+ in federated mode; gossip uses explicit, accounted local DP (ADR-024) |
| 6 | SHA-256 hash chain described as proof of confidentiality | A hash chain gives ordering tamper-evidence only | Ed25519-signed budget receipts + RFC 6962-style Merkle log with inclusion/consistency proofs (ADR-026); non-claim: log ≠ confidentiality proof |
| 7 | Tabular "leakage proxy" (favourite category) | Not an inversion attack; results non-monotonic; MI accuracy 53.68% → 53.47% is within noise | Analytic first-layer inversion + nearest-neighbour item recovery; user-level MI (loss-threshold, RMIA); TPR@1%FPR (ADR-029) |
| 8 | Gossip 0.80657 vs central 0.80646 over 2 rounds | Inside run-to-run noise; 2 rounds and 1 seed cannot separate them; message counts ignore payload size | ≥100 rounds, 5 seeds, bootstrap CIs, paired tests, Holm correction; bytes-to-target-NDCG |
| 9 | Krum/trimmed mean alongside masking | Robust aggregation needs per-update visibility, which masking hides | Three explicit modes: plaintext + robust aggregation; SecAgg+ + clipping; SecAgg+ committees + median (ADR-025) |
| 10 | Free-rider defence (reported ineffective) | Objective not implemented | Free-rider utility gain measured; contribution scoring in plaintext mode only, with the SecAgg+ limitation stated |

**Retained from Phase 1:** the honest Demerits / Threats-to-Validity discipline; modular separation; one harness for attacks and defences; dashboard-based presentation; Flower as the FL runtime.

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
| R1 | `adap/flower` | FL simulation (Ray backend), SecAgg+ workflow, DP strategy wrappers | Apache-2.0 | ⚠ |
| R4 | `pytorch/opacus` | Central user-level DP baseline; PRV accountant (cross-check) | Apache-2.0 | ⚠ |
| R6 | `opendp/opendp` | Vetted noise samplers; DP item–item graph release (Could) | MIT | — |
| R7 | `google/differential-privacy` | `dp_accounting` PLD + RDP accountants (no TensorFlow dependency) | Apache-2.0 | ⚠ |
| R15 | `pyg-team/pytorch_geometric` | Optional item-graph propagation | MIT | — |
| R16 | `RUCAIBox/RecBole` | Baselines + evaluation cross-check | MIT | ⚠ Python/torch compatibility |
| R19 | `privacytrustlab/ml_privacy_meter` | RMIA reference implementation (adapted for user-level MI) | MIT | ⚠ |
| R24 | `astral-sh/uv`, `astral-sh/ruff`, `HypothesisWorks/hypothesis`, `unionai-oss/pandera` | Environments, lint, property tests, data contracts | MIT/Apache | — |
| R25 | `iterative/dvc`, `mlflow/mlflow`, `ray-project/ray` | Pipeline checksums (no remote), optional local tracking, Flower simulation backend | Apache-2.0 | — |
| R26 | `gitleaks/gitleaks`, `pypa/pip-audit` | Secret scanning, dependency audit | MIT / Apache-2.0 | — |
| R30 | `sentence-transformers` (UKP Lab) | Frozen item content embeddings (no paid API) | Apache-2.0 | — |
| R31 | `pyca/cryptography` | Ed25519 signatures, SHA-256 | Apache-2.0 / BSD | — |
| R32 | `SymbioticLab/FedScale` | Device-availability traces (data only) | Apache-2.0 | ⚠ trace licence + availability |
| R33 | `streamlit/streamlit` | Dashboard | Apache-2.0 | — |
| R34 | `raimon49/pip-licenses` | Licence gate in CI | MIT | ⚠ |

---

## 4. Problem, objectives, scope

### 4.1 Problem statement
Deliver personalised top-K social recommendations such that:
- **P1** no raw interaction leaves the (simulated) user device;
- **P2** every released model satisfies a stated **user-level (ε, δ)-DP** guarantee computed by a real accountant;
- **P3** in SecAgg+ mode, an honest-but-curious coordinator sees only the sum of client updates, never an individual update;
- **P4** behaviour under poisoning, free-riding and 10–30% dropout is measured and reported;
- **P5** every model release has a signed privacy receipt that a third party can verify against a tamper-evident log;
- **P6** every headline number is reproducible with one command;
- **P7** total spend is **₹0**.

### 4.2 Research questions
| RQ | Question | Primary measurement |
|---|---|---|
| RQ1 | What does user-level DP cost in utility, centrally and in federated training, across ε ∈ {1,2,4,8,16,∞}? | ΔNDCG@10 vs non-private central, 95% CI |
| RQ2 | How large is the utility gap between serverless gossip (local DP) and federated training (central DP) at equal ε, and at what byte cost? | NDCG@10 gap; bytes-to-target-NDCG; rounds-to-target |
| RQ3 | How much do DP and SecAgg+ reduce *empirical* attack success? | MI AUC + TPR@1%FPR; inversion recovery accuracy vs prior |
| RQ4 | How much poisoning protection remains when SecAgg+ hides individual updates? | Targeted-item hit rate and clean-utility drop across the three robustness modes |
| RQ5 | Does availability-gated participation (battery/charging/idle) bias recommendation quality across user groups? | NDCG@10 gap between groups under independent vs correlated availability |
| RQ6 | What does the verifiable privacy ledger cost, and does it block every over-budget release? | Overhead %, blocked-release correctness, proof verification time |

### 4.3 In scope
Two-tower recommender over frozen content features (optional DP item–item graph propagation); three training topologies — central, federated (DP, with SecAgg+ on a verified subset), gossip (local DP) — in one Flower/Ray simulation; user-level DP with real accounting; device-availability model and participation-bias study; attack suite (MI, analytic inversion, poisoning, free-riding) and defences (DP, SecAgg+, clipping, robust aggregation); signed privacy receipts + Merkle log + release gate; non-profiling mode; Streamlit dashboard; 1–2 page compliance mapping; reproducibility package.

### 4.4 Out of scope (explicit, not silent)
Production deployment to real users; real mobile devices; transport security, on-device storage encryption, anonymous participation credentials and Sybil resistance (the simulation has no real network or devices); TEEs; serving latency SLOs; scale beyond the filtered Yelp subset; edge-level DP on the global user–user graph; LLM content generation; ads/auctions; authoring cryptographic primitives; full DPIA and ISO crosswalks.

### 4.5 Priorities (MoSCoW) and MVP
| Priority | Content | Due |
|---|---|---|
| **MVP (Must, early)** | Yelp pipeline + baselines; two-tower; central non-private vs central-DP vs FL+DP ε-sweep with 5 seeds and CIs; accountant checks; SecAgg+ equivalence check; signed receipt per release | **G3 — 25 Jan 2027** |
| **Must** | RQ3 (MI + analytic inversion), RQ4 (plaintext robust aggregation vs SecAgg+ + clipping), RQ6 ledger with proofs + release gate, dashboard demo | G6 — 22 Mar 2027 |
| **Should** | RQ2 gossip + local DP; RQ5 participation bias; free-riding measurement; non-profiling mode | G5 — 8 Mar 2027 |
| **Could** | DP item–item graph propagation; SecAgg+ committees + median; optional local MLflow; minimal FastAPI endpoint; cross-dataset check (MIND or SNAP Gowalla ⚠) | only if a gate closes ≥1 week early (max one) |
| **Won't (this project)** | Everything in 4.4 and CHANGE-003 | — |

The MVP alone is a complete, defensible project. Every later item layers on top of it and can be dropped without breaking it.

### 4.6 Pre-registered hypotheses (not results; negative outcomes are reported, not hidden)
| ID | Hypothesis | Measurement | If false |
|---|---|---|---|
| H1 | FL+DP at ε=8 retains ≥90% of non-private central NDCG@10 | ΔNDCG@10 with 95% CI | Report negative result; diagnose cohort size, clip C, rounds T |
| H2 | Gossip with local DP shows a substantial utility gap vs federated central DP at equal ε | Gap + bytes-to-target | Report as found |
| H3 | At ε=8, MI TPR@1%FPR ≤ 2× random, and inversion recovers a user's top category ≤ 3 pp above the prior | Attack metrics with CIs | Report; adjust ε recommendation |
| H4 | Plaintext trimmed mean limits targeted-item promotion better than SecAgg+ modes; the gap grows with adversary fraction | Hit rate across modes at 10/20/30% | Report as found |
| H5 | Availability correlated with user activity produces a measurable NDCG@10 gap between groups that random availability does not | Group gap with CIs | Report no detectable difference |
| — | Accountant consistency: PLD and PRV agree within ±5%; RDP ε ≥ PLD ε; empirical-ε lower bound ≤ claimed ε | DP checks | **Stop-ship** |
| — | Ledger: 100% receipt coverage; 100% tamper detection in tests | Ledger tests | **Stop-ship** |
| — | Reproducibility: one command regenerates every headline table | Clean-machine rerun | Fix before G7 |
| — | Cost: ₹0 | Cost ledger | Any spend requires a CHANGE-ID first |

### 4.7 Non-claims (must appear verbatim in the final report)
DP ≠ anonymisation · secure aggregation ≠ DP · hash chain ≠ confidentiality · a verified log proves what was recorded, not that the DP code is correct · simulation ≠ on-device deployment · simulated device availability ≠ real device behaviour · the aggregator is trusted to add DP noise · SecAgg+ hides individual updates only under its collusion threshold · transport security and on-device encryption are not implemented · proxy attacks ≠ worst-case privacy · gossip amplification is **not** claimed.

---

## 5. Landscape review

### 5.1 Existing patterns
| Pattern | Evidence | Strength | Limitation | Used here? |
|---|---|---|---|---|
| Production federated learning | S23 | Raw data stays on device; formal DP | Central coordinator; secagg/robustness tension | **Yes** (federated mode) |
| Serverless gossip learning | R1 + custom | No coordinator | More bytes; weaker DP at equal ε | **Yes** (gossip mode) |
| MPC/DAP aggregate measurement | IETF PPM drafts | Verifiable, split trust | Aggregates only, not model training | No |
| Confidential computing | vendor docs | Attestation | Hardware dependence | No |
| Open federated social networks | S26 | No central gatekeeper | Public by default ⇒ easy mass profiling | Positioning only |

**Positioning:** open social networks solved control of the network, not privacy of behaviour. PRISM-Rec studies a personalisation layer that does not need users' raw behaviour, and measures honestly what that costs.

### 5.2 FL framework
**Flower (R1)** — shipped SecAgg+ workflow, DP strategy wrappers, Ray-backed simulation, Apache-2.0, already used in Phase 1. NVFlare, TFF and custom FL are not used (CHANGE-003).

### 5.3 DP libraries
`dp_accounting` PLD accountant of record (R7) · Opacus PRV accountant as cross-check and Opacus DP-SGD for the central baseline (R4) · OpenDP samplers for noise and the optional DP item–item graph release (R6). TensorFlow is not a dependency.

### 5.4 Secure aggregation
Flower SecAgg+ (honest-but-curious server, t-collusion bound, dropout tolerant) is the only secure-aggregation mechanism. Prio3/DAP, homomorphic encryption, MPC and TEEs were considered and are not used (CHANGE-003).

### 5.5 Model stack
Two-tower model over **frozen sentence-transformer embeddings of business metadata** with small trainable towers (ADR-019). The user representation is computed and kept on the device; recommendations are scored on the device against all item vectors, so no ANN server is needed. Optional parameter-free propagation over a DP item–item co-engagement graph (Could). Baselines via RecBole: MostPopular, ItemKNN, BPR-MF, LightGCN.

### 5.6 Attack tooling
Custom, small, and specific to this model (ADR-029): analytic first-layer inversion + nearest-neighbour item recovery; user-level MI via loss-threshold and RMIA with ≤4 reference models (adapted from R19); targeted item-promotion poisoning; free-riding clients.

### 5.7 Audit log
In-repo append-only Merkle log using RFC 6962 hashing (S13), Ed25519-signed receipts and tree heads (S12, R31), inclusion and consistency proofs, and a verifier CLI (ADR-026).

---

## 6. Architecture

### 6.1 Trust zones
```
DEVICE ZONE (simulated; raw data never exits)
  Local interaction history → pooled content vector → user tower
  Local trainer → contribution bound (≤50 interactions/round) → clip update to C
  Availability model (battery/charging/idle trace) decides whether a sampled client responds
  Gossip mode only: local DP noise added before any message is sent
        │ only clipped parameter arrays cross (message-schema test enforces this)
COORDINATION ZONE (honest-but-curious)
  Flower ServerApp · SecAgg+ workflow (verified subset) · DP wrapper adds noise once to the sum
  Robustness modes: plaintext robust aggregation | SecAgg+ + clipping | SecAgg+ committees (Could)
  GOSSIP MODE: peers from the friends graph, no coordinator
PRIVACY GOVERNANCE ZONE
  Accountant (PLD of record; PRV cross-check; RDP bound) → Ed25519-signed budget receipt
  Merkle log (RFC 6962 hashing) → inclusion/consistency proofs → release gate
EVALUATION ZONE (offline)
  Metrics + bootstrap CIs · attack harness · results as CSV/JSON in repo · Streamlit dashboard
```

### 6.2 Training round (federated mode)
1. Coordinator publishes a **signed round manifest**: model version, ε tranche, clip C, sampling rate q, SecAgg+ parameters (if enabled), commit hash.
2. Coordinator samples each user independently with probability q using a CSPRNG. The availability model can only remove sampled users, so q remains a per-round upper bound.
3. Sampled, available clients train locally (1–3 epochs), enforce the contribution bound, and clip their whole update to L2 norm C.
4. Updates are summed — via SecAgg+ on the verified subset of runs (ADR-023), in plaintext otherwise.
5. The aggregator adds Gaussian noise σ = z·C once to the sum using a vetted sampler, then averages by the expected cohort size.
6. The accountant consumes the tranche; if the budget would be exceeded the release gate refuses the release. Otherwise a **signed receipt** is appended to the Merkle log and anyone can verify its inclusion.
7. Metrics, checkpoint and receipt ID are written to the results store.

### 6.3 Gossip round
1. Each user's peers are their friends inside the filtered set (degree capped at d); users with no in-set friends get random peers (reported).
2. Each node trains locally, clips its update to C, adds local Gaussian noise calibrated for user-level DP against any single peer, and sends it to its d peers.
3. Each node averages its own and the received noised updates; models are post-processing of noised messages.
4. Every message is counted in bytes; ε is composed over all messages a user sends; no amplification is claimed.

### 6.4 Repository layout
```
prism-rec/
  PROJECT_ROADMAP.md          # THIS FILE — SSOT
  pyproject.toml  uv.lock  Makefile  dvc.yaml
  src/prism/
    data/        # Yelp loaders, metro filter, k-core, pandera contracts, splits, content embeddings
    models/      # two-tower, optional item-graph propagation
    baselines/   # RecBole configs + wrappers (separate pinned env if needed)
    privacy/     # clipping, contribution bound, accountants, noise sampler, receipts
    fl/          # Flower ClientApp/ServerApp, SecAgg+ config, DP wrappers, availability model
    gossip/      # topology from friends graph, local-DP messages, byte accounting
    attacks/     # MI, analytic inversion, poisoning, free-riding
    ledger/      # Merkle log, proofs, verifier CLI, release gate
    eval/        # metrics, bootstrap CIs, paired tests, table generation
  apps/dashboard/              # Streamlit
  experiments/ configs/ + PREREGISTRATION.md
  results/                     # small CSV/JSON outputs (committed)
  tests/ unit/ property/ dp/ repro/
  docs/ adr/ threat-model.md compliance-mapping.md model-card.md datasheet.md
        source-register.md verification-log.md cost-ledger.md
  .github/workflows/
```

---

## 7. Architecture Decision Records (summary; full text in `docs/adr/`)

| ADR | Decision | Alternatives | Rationale | Status |
|---|---|---|---|---|
| 001 | Flower as FL runtime | TFF, FedML, custom, NVFlare spike | SecAgg+ and DP wrappers shipped; Ray simulation; Apache-2.0 (R1) | Approved (amended CHANGE-003: NVFlare spike removed) |
| 002 | **User-level DP** as headline guarantee | example-level, edge-level | S1 neighbourhood discipline; avoids classic overclaim | Approved |
| 003 | Discrete Gaussian + OS CSPRNG; two-accountant CI gate | — | — | Superseded by ADR-021, ADR-022 |
| 004 | **Availability gates participation, never ε** | Phase 1 adaptive noise | Worst-case guarantee; S23 practice; bias measured in RQ5 | Approved (amended CHANGE-006) |
| 005 | Two-tower with ID embeddings; user embedding never leaves device | — | — | Superseded by ADR-019 |
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
| 016 | **Never commit raw datasets**; download scripts + DVC checksums, no DVC remote | data-in-repo | Yelp no-redistribution terms | Approved (amended CHANGE-005) |
| 017 | Private repo + self-hosted runner | — | — | Superseded by ADR-027 |
| 018 | CPU-first determinism; GPU optional | GPU-always | Free-tier fit + reproducibility; model sized for CPU (ADR-019) | Approved |
| 019 | Two-tower over **frozen sentence-transformer embeddings of business metadata** + small trainable towers (~1.15 lakh params); dense updates; no sparsification | ID embedding tables + top-1% sparsification | Sparse row indices reveal which businesses a user reviewed and cannot be summed under SecAgg+; small dense model is DP-friendly and CPU-feasible | Approved |
| 020 | User-level DP in FL by clipping each client's whole update + noise on the aggregate (Flower DP wrappers); Opacus only for the central baseline (user = one sample) | Opacus per-example DP-SGD on clients | Per-example DP-SGD gives example-level, not user-level, guarantees | Approved |
| 021 | Noise added **once by the aggregator** after summation, with an OpenDP/Google DP sampler | Distributed discrete Gaussian shares across clients | Accounting for distributed discrete noise is research-grade; production FL (S23) adds noise server-side; trust assumption stated as non-claim | Approved |
| 022 | Accounting: **PLD (`dp_accounting`) of record**; Opacus PRV within ±5%; RDP ε must be ≥ PLD ε; ε reported with and without Poisson amplification | PRV vs RDP ±5% gate | RDP is systematically looser, so a PRV–RDP gate fires on correct code; amplification depends on how sampling is really implemented | Approved |
| 023 | SecAgg+ run on a verified subset (aggregate equivalence within quantization tolerance + overhead); utility sweeps run without it | SecAgg+ on every run | SecAgg+ changes confidentiality, not the aggregate; saves Tier 0 compute | Approved |
| 024 | Gossip over friends graph (degree ≤ d) with per-message local DP; ε composed over all sent messages; no secure gossip; no amplification | Share-based/MPC gossip | Tractable in 3 weeks; honest accounting; gap vs central DP is measured (RQ2) | Approved |
| 025 | Robustness in three modes: (a) plaintext + trimmed mean/median; (b) SecAgg+ + clipping; (c) SecAgg+ committees + median of sums (Could) | SecAgg+ and Krum together | At 30% adversaries P(committee of size k is attacker-free) = 0.7^k (≈17% at k=5, ≈3% at k=10), so the conflict is measured, not assumed away | Approved |
| 026 | In-repo append-only Merkle log with RFC 6962 hashing, inclusion/consistency proofs, Ed25519-signed receipts and tree heads (`cryptography`); verifier CLI | Trillian service; plain hash chain | Third-party verifiable without running a separate service; SHA-256/Ed25519 from a vetted library — the tree is a data structure, not a new primitive | Approved |
| 027 | uv lockfile + Makefile + GitHub-hosted CI (lint, unit/property tests, pip-audit, gitleaks, licence check); experiments run locally | k3s/Helm, self-hosted runner, SLSA/cosign | Fits the free Actions minutes; nothing is deployed | Approved |
| 028 | Compute: 2 laptops + LNMIIT lab machine; Kaggle/Colab GPU optional; no cloud VM; no service that needs a payment card | Oracle Always Free | Simulation needs no server; Oracle signup needs a card; ARM capacity unreliable; idle reclamation | Approved |
| 029 | Attacks: analytic first-layer inversion + NN item recovery; user-level MI (loss-threshold, RMIA ≤4 reference models); item-promotion poisoning; free-riding | `breaching`, LiRA with many shadow models, ART | `breaching` targets vision models; many-shadow LiRA exceeds Tier 0 compute; custom attacks fit the model exactly | Approved |
| 030 | Availability model from FedScale device traces if licence permits ⚠, else synthetic; scenarios: always-available, independent random, correlated with user activity, trace-based | No availability model | Needed for RQ5; correlated scenario tests whether gating biases quality | Approved |
| 031 | Metro selection via geographic bounding box (lat/lon) | City-name string matching | Avoids fragmentation of metro areas across multiple city labels; reproducible and deterministic | Approved |

---

## 8. Privacy & security engineering

### 8.1 Threat model (`docs/threat-model.md`, 1–3 pages, attacks mapped to S2 classes)
**Assets:** users' interaction histories; derived user representations; released models; privacy-budget records.

**Adversaries in model:**
1. Honest-but-curious coordinator — sees the participant list and the aggregate; in non-SecAgg+ modes also sees individual updates.
2. External observer of released models — MI and inversion against the final model.
3. Curious gossip peer — sees its neighbours' messages.
4. Up to 30% malicious clients — poisoning (targeted item promotion) and free-riding.
5. Log tamperer — tries to rewrite or drop ledger entries.

**Out of model (documented):** coordinator colluding with more than the SecAgg+ threshold of clients; an aggregator that skips adding noise; Sybil creation; rooted devices; network attackers (no real network exists); side channels.

### 8.2 DP specification
| Parameter | Spec |
|---|---|
| Privacy unit | One user's entire contribution across all rounds |
| Neighbourhood | Add/remove one user (S1) |
| Contribution bound | ≤50 interactions per user per round, enforced before training |
| Clipping | Each client's whole update clipped to L2 norm C (C tuned on non-private validation runs only, then fixed) |
| Noise | Gaussian, σ = z·C, added once to the aggregated sum by the aggregator; z by binary search to target ε; OpenDP/Google DP sampler, never `numpy.random` |
| Sampling | Coordinator samples each user independently with probability q (Poisson) via CSPRNG; availability only removes sampled users |
| Amplification | ε reported both with Poisson amplification at rate q and without amplification |
| δ | ≤ 1/(10·n); recomputed on final n |
| Composition | PLD accountant over T rounds; ledger hard stop when the budget would be exceeded |
| Cross-checks | Opacus PRV within ±5% of PLD; RDP ε ≥ PLD ε |
| Central baseline | Opacus DP-SGD with each user treated as one sample (user-level) |
| Gossip | Each outgoing message clipped and noised locally for user-level DP against any single peer; composed over all messages a user sends; no amplification |
| Reporting | ε (both variants), δ, T, q, C, z, n, mechanism, accountant + version, commit hash — in every table |

### 8.3 Security controls that are real in this simulation
Ed25519-signed round manifests and receipts · Merkle log with inclusion/consistency proofs · signing keys generated locally (`make keys`), git-ignored, never committed · keyed-HMAC pseudonymised IDs at ingest · no raw text or user IDs in logs or published artefacts · message-schema tests proving clients send only parameter arrays of the expected shape.

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

**Model size (ADR-019).** Frozen 384-dim content vectors; each tower is 384→128→64 = 57,536 params; two towers ≈ **1,15,072 params ≈ 4,60,288 bytes (~0.46 MB) fp32**. Dense update per client-round ≈ 0.46 MB; cohort of 100 ⇒ ~46 MB/round in simulation; gossip at degree 4 ⇒ ~1.8 MB egress per node per round (reported, not hidden).

**Run cost (estimate, re-measured at G1).** ~200 rounds × ~10 s/round (100 clients, CPU) ≈ **30–45 min per federated/gossip run**. Central runs take minutes.

| Block | Settings | Seeds | Runs |
|---|---|---|---|
| RQ1 central DP | ε ∈ {1,2,4,8,16,∞} | 5 | 30 (cheap) |
| RQ1 FL+DP | ε ∈ {2,4,8,16,∞} | 5 | 25 |
| SecAgg+ check | ε ∈ {8,∞}: equivalence + overhead | 3 | 6 |
| RQ2 gossip + local DP | ε ∈ {4,8,16,∞}, degree 4 | 5 | 20 |
| RQ2 topology | degree {2,8} at ε=8 | 3 | 6 |
| RQ3 MI reference models | ε ∈ {∞,8,2}, 4 references each | 1 | 12 |
| RQ4 robustness | adversaries {10,20,30}% × modes + clean | 3 | ~40 |
| RQ5 availability | 4 scenarios at ε=8 | 5 | 20 |
| Ablations | −graph (if built), −contribution bound, content-only vs ID-based (central) | 5 | ~15 |

**Total ≈ 145 federated/gossip runs ≈ 75–110 machine-hours.** With 3× headroom for bugs and reruns ≈ 250 machine-hours ≈ **2–3 weeks of overnight runs on 2 laptops + the lab machine**. GPU is not required.

**Descoping ladder (in order, if the budget slips):** (1) 3 seeds for secondary blocks; (2) drop ε=16 and the degree sweep; (3) keep only the −graph ablation; (4) RQ4 at 20% adversaries only. **Never cut:** RQ1 FL+DP with 5 seeds; accountant checks.

---

## 10. Data strategy & ethics

| Dataset | Role | Licence note | Flag |
|---|---|---|---|
| **Yelp Open Dataset** | **Primary**: (user, business, stars, timestamp) interactions + `friends` graph + business metadata | Academic use; **no redistribution** | ⚠ full ≈ 69.9 lakh reviews, ~1.5 lakh businesses, ~19.87 lakh users |
| Synthetic generator | Controlled non-IID and availability scenarios (RQ5) | Ours | — |
| FedScale device traces | Availability model (ADR-030) | Check licence | ⚠ |
| MIND or SNAP Gowalla | Cross-dataset check (Could, after G5 only) | Research-only terms | ⚠ |

**Filtering.** One metro area + iterative k-core (k ∈ {5,10}, chosen at G0). Expected ~5,000–20,000 users and ~5,000–20,000 businesses ⚠ — measured at G0 and recorded in the datasheet.

**Interactions.** Every review is an implicit-feedback interaction; a sensitivity analysis with stars ≥ 4 only is pre-registered.

**Item content.** Business name, categories and attributes only. Review text is not used (data minimisation).

**Friends graph.** Restricted to filtered users; used only for gossip topology.

**Not used.** Phase 1 Instagram analytics; X/Twitter API (cost + ToS); Reddit dumps (governance); Bluesky firehose.

**Ethics & minimisation.** Public ≠ consented. Keyed-HMAC pseudonymisation at ingest (key deleted after linkage); no raw text or user IDs published; datasheet published; raw data deleted from personal machines when the BTP evaluation concludes, per Yelp terms ⚠.

---

## 11. Evaluation protocol (pre-registered in `PREREGISTRATION.md` before any privacy run)

**Splits.** Strict chronological per-user split (default: each user's last 20% of interactions → test, the 10% before → validation; final choice at G0). **Full-catalogue ranking, no sampled negatives.** Leakage assertions in CI.

**Baselines.** MostPopular (= non-profiling mode), ItemKNN, BPR-MF, LightGCN (RecBole); central non-private two-tower; central user-level DP; FL+DP; FL+DP+SecAgg+ (subset); gossip + local DP.

**Ablations and sweeps.** As in Section 9; plus dropout {10,20,30}% and sampling rate q.

**Statistics.** 5 seeds for headline blocks (3 for secondary blocks, Section 9); bootstrap 95% CIs over users; paired Wilcoxon across seeds; Holm–Bonferroni; minimum detectable effect declared up front; differences inside the CI reported as "no detectable difference".

| Family | Metrics |
|---|---|
| Utility | NDCG@10, Recall@20, HR@10, MRR, catalogue coverage, Gini |
| Privacy (formal) | ε (with/without amplification), δ, T, q, C, z, accountant versions |
| Privacy (empirical) | MI AUC + TPR@1%FPR; inversion: cosine similarity of recovered vs true pooled history, top-category recovery vs prior; empirical-ε lower bound |
| Robustness | Targeted-item hit rate@10, clean NDCG@10 drop, free-rider utility gain |
| Participation bias | NDCG@10 gap between availability groups; participation rate per group |
| Systems | Bytes per client per round, bytes-to-target-NDCG, rounds-to-target, wall-clock, SecAgg+ overhead |
| Ledger | Receipt coverage, append time, proof size, proof verification time, tamper detection |
| Cost | ₹ (target 0), machine-hours, CI minutes |

**Primary outputs:** utility-vs-ε curves per topology with CIs; attack × defence matrix; robustness-mode comparison; participation-bias table.

---

## 12. Implementation phases & gates

| Phase | Weeks | Dates (2026–27) | Key work | Gate / exit criteria | Owner |
|---|---|---|---|---|---|
| **P0 Foundations** | 1–2 | 17 Nov – 30 Nov | Close verification queue (Section 18, item 1 first); repo + uv lock + CI + licence gate; Yelp access, metro choice, k-core sizes; `PREREGISTRATION.md` draft; threat model v1; request lab machine; apply for Student Pack | **G0 (30 Nov):** sources verified & dated; source rule confirmed with guide; CI green; filtered dataset sizes recorded; guide sign-off | Both |
| **P1 Data, baselines, model** | 3–4 | 1 Dec – 14 Dec | Loaders + pandera; chronological split; content embeddings; RecBole baselines; central two-tower; metrics + bootstrap | **G1 (14 Dec):** our evaluation code reproduces RecBole's BPR-MF NDCG@10 within ±2% on the same split; leakage tests pass; per-round runtime measured and Section 9 updated | A |
| **P2 Central DP + accounting** | 5–7 | 15 Dec – 4 Jan | User-level central DP (Opacus); PLD + PRV + RDP; noise sampler; signed receipts; property tests; ε-sweep | **G2 (4 Jan):** accountant checks pass; central ε-sweep with CIs | A (+B receipts) |
| **P3 Federated + SecAgg+** | 8–10 | 5 Jan – 25 Jan | Flower simulation; client-update clipping + DP wrapper; availability model; dropout 10–30%; SecAgg+ equivalence + overhead | **G3 (25 Jan) = MVP:** central vs central-DP vs FL+DP ε-sweep, 5 seeds, CIs; SecAgg+ aggregate matches plaintext within tolerance; receipt per release | B (+A DP) |
| **P4 Gossip + participation bias** | 11–13 | 26 Jan – 15 Feb | Friends-graph topology; local-DP messages; byte accounting; ≥100 rounds; availability scenarios (RQ5) | **G4 (15 Feb):** gossip gap + bytes-to-target with CIs; RQ5 table | B (+A stats) |
| **P5 Attacks & defences** | 14–16 | 16 Feb – 8 Mar | MI (loss-threshold, RMIA); analytic inversion; item-promotion poisoning; free-riding; robustness modes | **G5 (8 Mar):** attack × defence matrix with CIs; RQ3–RQ4 answered | A (+B harness) |
| **P6 Ledger + demo** | 17–18 | 9 Mar – 22 Mar | Merkle log + proofs + verifier CLI; tamper tests; release gate; dashboard; non-profiling mode; model card; datasheet; compliance mapping | **G6 (22 Mar):** 100% receipt coverage; 100% tamper detection; demo shows a blocked over-budget release with a verifiable proof | B |
| **P7 Freeze & write-up** | 19–20 | 23 Mar – 5 Apr | Reproducibility freeze; ADRs, source register, cost ledger; report; demo video; viva prep | **G7 (5 Apr):** one-command reproduction of every table on a clean machine; defence-ready | Both |

**Calendar risk:** end-semester exams and winter break (late Dec) collide with P2; Nov–Dec may also include placement activity. Mitigation: lighter tasks in W6–W7; confirm the LNMIIT academic calendar and mid-term review dates at G0; each gate carries 2 buffer days; the MVP at G3 is ready before a typical mid-term review.

**Split:** **A (Shivam)** = data, models, DP + accounting, attacks, statistics. **B (Mokshit)** = Flower + SecAgg+, availability model, gossip, ledger, CI, dashboard. Shared: evaluation, report, viva prep.

---

## 13. Testing strategy

| Layer | Assertions | Tooling |
|---|---|---|
| Unit | Clipping correctness, contribution bound, split integrity, ledger monotonicity, signature validity | pytest; coverage ≥85% on `privacy/`, `ledger/` |
| Property-based | Budget never negative; SecAgg+ sum = plaintext sum within quantization tolerance; every inclusion/consistency proof verifies; any tampered entry is detected; no seed reuse | hypothesis |
| DP checks | PLD vs PRV within ±5%; RDP ≥ PLD; empirical-ε lower bound from MI ≤ claimed ε | custom; **CI-blocking** where fast, nightly otherwise |
| Data | Schema, chronological-split leakage, filtered-set statistics | pandera |
| Message schema | Clients send only parameter arrays of the expected shape — no raw interactions | pytest |
| Attacks | Nightly small attack suite; alert if attack success rises > 2 pp between commits | custom |
| Reproducibility | Same seed + lockfile ⇒ same headline numbers on CPU | DVC + CI replay |
| Security hygiene | Dependency audit, secret scan, licence gate | pip-audit, gitleaks, pip-licenses |

**Stop-ship rules:** accountant inconsistency · raw interaction found in a client message · release without a receipt · SecAgg+ aggregate ≠ plaintext beyond tolerance · empirical ε > claimed ε · licence gate failure.

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

**Accepted trade-offs:** user-level DP costs utility (paid for honesty) · gossip costs bytes and accuracy (paid for no coordinator) · SecAgg+ limits robustness (measured) · the aggregator is trusted to add noise (stated).

---

## 15. Annex A — Cost, licensing, and resource policy (Tier 0)

### A.1 Principle
**₹0 spend.** No service that requires a payment card. Any paid item requires a new CHANGE-ID approved by both owners with guide visibility.

### A.2 Resource register
| Item | Choice | Limit | Cost | Flag |
|---|---|---|---|---|
| Libraries | FOSS (Section 16) | — | ₹0 | — |
| Dataset | Yelp Open Dataset | No redistribution | ₹0 | ⚠ |
| Compute | 2 laptops + LNMIIT lab machine, overnight runs | Machine availability | ₹0 (+ electricity) | ⚠ lab access |
| GPU (optional) | Kaggle / Colab | Weekly quota, session limits | ₹0 | ⚠ |
| Fallback compute | Azure for Students credit (no card required ⚠) | Credit amount | ₹0 | ⚠ |
| Code + CI | GitHub private repo, hosted runners | 2,000 Linux min/month on Free plan; more with Student Pack ⚠ | ₹0 | ⚠ |
| Data storage | Local disks + external-drive backup; DVC checksums, no remote | Disk | ₹0 | — |
| Results tracking | CSV/JSON in `results/`; MLflow local (optional) | Disk | ₹0 | — |
| Demo access | Local; Cloudflare quick tunnel if remote viewing is needed (no account ⚠) | Temporary URL | ₹0 | ⚠ |
| Embeddings | Local sentence-transformers | CPU | ₹0; paid APIs prohibited (ADR-013) | — |

### A.3 Removed (CHANGE-005)
Tier 1 and Tier 2 budgets; Oracle Always Free; Cloudflare R2; GHCR; self-hosted runner; Hetzner/DigitalOcean/RunPod/Vast; custom domain; TEE spike.

### A.4 Cost-control rules (binding)
1. No payment card on any service; no trials that auto-convert to paid.
2. `docs/cost-ledger.md` updated weekly: machine-hours, CI minutes, ₹ (expected 0).
3. GPU only through Kaggle/Colab free quotas, never on the critical path.
4. Apply for the GitHub Student Developer Pack and request LNMIIT lab machine access at G0.

**Non-cash cost:** ~500–600 person-hours; electricity ~₹500–₹750 (at ₹8/kWh ⚠).

### A.5 Licence policy (ADR-015)
**Preferred:** Apache-2.0, MIT, BSD, MPL-2.0, PostgreSQL. **Rejected by default:** AGPL-3.0, BSL-1.1, SSPL, RSAL. **Gate:** pip-licenses runs in CI; a new copyleft/BSL dependency fails the build unless an approved CHANGE-ID exists.

### A.6 Data governance (ADR-016)
Raw datasets are **never committed**. The repo holds download scripts and DVC checksums. Processed derivatives stay local. The repo (public at freeze, if the owners choose) contains code, configs, aggregate results and figures only.

---

## 16. Resources & stack

**Language/runtime:** Python 3.12 (RecBole in a separate pinned env if incompatible ⚠) · uv · ruff · mypy · pydantic v2.
**ML/DP:** PyTorch · sentence-transformers · Opacus · `dp_accounting` · OpenDP · PyG (optional) · RecBole.
**FL:** Flower (simulation on Ray) · SecAgg+.
**Ledger:** `cryptography` (Ed25519, SHA-256).
**Data/experiments:** pandera · DVC (checksums, no remote) · hypothesis · MLflow (optional, local).
**Demo:** Streamlit.
**CI:** GitHub Actions (hosted) · pip-audit · gitleaks · pip-licenses.

**Hardware assumption:** 2 laptops (16–32 GB RAM) + LNMIIT lab machine. `make demo-small` must run end-to-end on CPU at reduced scale so the project is never blocked.

---

## 17. Deliverables & definition of done

1. Repo with lockfile, `make setup`, `make reproduce`, `make demo-small`.
2. Central, federated (with SecAgg+ subset) and gossip topologies in one simulation harness; non-profiling mode; Streamlit dashboard.
3. **Privacy dossier:** DP spec, accountant reports (PLD/PRV/RDP), empirical audits, signed receipts, log proofs.
4. **Threat model** (1–3 pages) + attack × defence matrix.
5. **Compliance mapping** (1–2 pages), datasheet, model card.
6. **Evaluation report:** ε curves, gossip gap, robustness modes, participation bias, ablations, CIs, negative results, non-claims.
7. **Docs:** ADRs, `source-register.md`, `verification-log.md`, `cost-ledger.md`.
8. **Demo:** 8-minute video + dashboard showing a blocked over-budget release with a verifiable proof.
9. **Reproducibility certificate:** independent clean-machine rerun by the second owner.
10. **Report-writing rule:** plain, direct technical English written by the owners; no paraphrasing or rewriting tools.

**DoD:** all G0–G7 gates closed · zero stop-ship violations · every headline number traceable to config hash + seed + commit · ₹0 spent.

---

## 18. Verification queue (must close at G0; log in `docs/verification-log.md`)

| # | Item | Owner | Due |
|---|---|---|---|
| 1 | **Source rule:** confirm with guide whether papers must be excluded (Section 1) | Both | 21 Nov 2026 |
| 2 | LNMIIT academic calendar, mid-term review dates, report format, lab machine access | Both | 24 Nov |
| 3 | NIST SP 800-226 final version/date | A | 24 Nov |
| 4 | NIST AI 100-2 revision | A | 24 Nov |
| 5 | DPDP Rules 2025 notification date + phasing | B | 24 Nov |
| 6 | DSA Art. 27/38 text | B | 24 Nov |
| 7 | Flower version: SecAgg+ workflow, DP wrappers, and their behaviour in simulation | B | 26 Nov |
| 8 | Opacus version, PRV accountant, torch compatibility | A | 26 Nov |
| 9 | `dp_accounting` version (PLD, RDP) | A | 26 Nov |
| 10 | RecBole compatibility with current Python/torch | A | 26 Nov |
| 11 | Yelp licence text + exact counts; filtered-subset sizes for candidate metros | A | 26 Nov |
| 12 | sentence-transformers model licence (e.g. `all-MiniLM-L6-v2`) | A | 26 Nov |
| 13 | FedScale device-trace availability + licence | B | 28 Nov |
| 14 | Free-tier facts: GitHub Actions + Student Pack, Kaggle GPU quota, Azure for Students, Cloudflare quick tunnel | B | 28 Nov |
| 15 | Licences of all remaining dependencies (pip-licenses run) | B | 28 Nov |

---

## 19. Approval gate

- [x] Scope (Section 4) approved, including MoSCoW, out-of-scope and non-claims
- [x] Dataset choice approved (Yelp primary, filtered to one metro)
- [x] ADR-001…030 approved (see Section 7 statuses)
- [x] Budget: Tier 0 (Rs. 0) confirmed - paid tiers removed in CHANGE-005
- [x] Compute plan (Section 9) accepted; lab machine access requested
- [ ] Source rule confirmed with guide (verification item 1) - G0 exit condition
- [ ] Timeline + gate dates confirmed against the LNMIIT calendar - G0 exit condition
- [x] Verification queue owners assigned
- [ ] Guide (Dr. Malika Acharya) has reviewed this document - G0 exit condition

| Role | Name | Signature | Date |
|---|---|---|---|
| Privacy/ML lead | Shivam Agarwal (23UEC621) | Shivam Agarwal | 15 Nov 2026 |
| Systems/Security lead | Mokshit Jain (23UEC574) | Mokshit Jain | 16 Nov 2026 |
| Guide | Dr. Malika Acharya | _pending review (G0)_ | |

Per CHANGE-009, owner-1 signature authorises P0 only. Guide review and the two
open boxes are G0 exit conditions. P1 requires both owner signatures.

---

## 20. Open questions for review

1. Is the "no papers" source rule an actual requirement for this project?
2. Submission deadline and mid-term review dates?
3. Is LNMIIT lab machine access available, and with what limits?
4. Which metro area and k-core threshold give enough users and friends-graph density? (measured at G0)
5. Any institute-mandated report format or deliverable not captured here?
6. Confirm the A/B role split.

---

## 21. Defence narrative (6 lines)

1. Social recommendation today either centralises everyone's behaviour or, on open networks, makes it public.
2. Phase 1 was a feasibility prototype: it showed the pipeline could run, but used a synthetic target, a custom privacy cost and only 20 clients.
3. Phase 2 rebuilds on real interaction data with ranking metrics and user-level DP checked by two independent accountants.
4. We measure what privacy costs in accuracy, how far serverless gossip falls behind federated training, and whether battery-gated participation leaves some users with worse recommendations.
5. We attack our own system and show where secure aggregation protects confidentiality and where it weakens poisoning defences.
6. Every model release carries a signed privacy receipt in a tamper-evident log, and an over-budget release is refused with a verifiable proof — at ₹0 cost.
