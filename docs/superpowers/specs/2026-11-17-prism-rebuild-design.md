# PRISM-Rec rebuild: audit, architecture and one-day roadmap

| | |
|---|---|
| Date | 17 November 2026 |
| Status | **APPROVED by the owner on 17 November 2026, about 12:10**, with one change: the source rule and literature review in section 1.3 |
| Deadline | 23:59 today. Code freeze 23:30. |
| Baseline plan | `PROJECT_ROADMAP.md` v1.9.0 (the request calls it `Project.md`; no file of that name exists) |
| Baseline code | `main` at `0ca8d6c` (steps 0 to 10) |
| Method | superpowers v7.0.2: brainstorming (this document), then writing-plans, test-driven-development, subagent-driven-development, verification-before-completion |

Evidence used here comes from four places: a line-by-line digest of the three governing documents, a
read-only code audit (158 tests pass, ruff and mypy clean, 71% coverage), web research restricted to
standards, official documentation, vendor engineering posts and GitHub repositories (no conference
or journal papers), and two throwaway experiments on the **validation** split kept in
`_workspace/scratch/`. Every number below marked *(spike)* comes from those experiments and is
untuned.

---

## 1. Scope and audit

### 1.1 Problem and objectives

Build a tested, reproducible research harness that answers one question with evidence: **what does
it cost, in recommendation quality and in engineering, to train a recommender on user data under a
user-level differential privacy guarantee, and how much do the defences actually reduce attacks?**

The old BTP (the attached PDF) described privacy attacks and defences in social media at survey
level. This project replaces description with measurement on one real dataset.

Objectives, unchanged from the roadmap unless marked:

| ID | Question | Change in this rebuild |
|---|---|---|
| RQ1 | Utility cost of user-level DP across ε ∈ {1, 2, 4, 8, 16, ∞} | **Reframed**, see 1.3 item 2 |
| RQ2 | Gap between gossip with local DP and federated with central DP | Reduced scope: ε ∈ {8, ∞}, degree 4, 3 seeds |
| RQ3 | How much DP and secure aggregation reduce attack success | **Both attacks redesigned**, see 3.5 |
| RQ4 | Poisoning protection left when secure aggregation hides updates | Fractions 10/20/30%, headline 20% |
| RQ5 | Participation bias from availability-gated sampling | Synthetic availability only today |
| RQ6 | Cost and correctness of the verifiable ledger | Unchanged |

### 1.2 What "production-grade" means here, and what it does not

It means: one installable package with one command-line entry point, typed, written test-first,
deterministic for a fixed seed, configuration-driven, resumable, with atomic writes, a passing CI
pipeline, a synthetic dataset so anyone can run the whole pipeline without Yelp data, and a
generated results report.

It does not mean a deployed service. The Yelp terms forbid sharing the data or derivatives, the
project budget is ₹0, and everything runs on one PC. Roadmap section 4.4 already puts deployment out
of scope and that stays.

### 1.3 Audit of the plan: twelve problems and the fix for each

1. **The model cannot personalise, by design.** ADR-019 fixed the model to frozen text embeddings
   only. On validation, untrained content similarity scores NDCG@10 0.0031 against MostPopular
   0.0174; a trained content-only projection reaches 0.0205 with 251 distinct items recommended. A
   model of the same size with item ID embeddings reaches 0.0345 with over 3,000 distinct items
   *(spike)*. ADR-019 was written in the v0.10.0 revision produced in this session; that call was
   wrong for this dataset and ADR-005 (ID embeddings) was right. **Fix:** hybrid model, section 3.2.
2. **RQ1 compares two settings that are the same mechanism.** With per-user clipping and noise on
   the sum, "central DP" and "federated DP" differ only in sampling rate, rounds and local steps.
   ADR-041 already found that rounds, not topology, drove the gap. **Fix:** RQ1 reports the
   privacy-utility curve for named sampling regimes. The topology difference is a trust difference
   and is measured in RQ3, where it belongs.
3. **H1 has no fixed denominator.** The same result reads as 123%, 92.3% or 88.0% retention.
   **Fix:** the denominator is the non-private model trained with the same rounds and sampling
   rate. A second metric is added: *personalisation retained* =
   (NDCG_DP − NDCG_MostPopular) / (NDCG_non-private − NDCG_MostPopular).
4. **Tuning and reporting used the same split.** The validation split is never loaded; test metrics
   are computed at intermediate rounds; validation items are neither masked nor used as history at
   test time. **Fix:** tune on validation only, freeze hyperparameters in the pre-registration
   before any test evaluation, train final models on train + validation, mask both at test time.
5. **The accounting ADRs contradict each other.** ADR-022 (PLD of record) and ADR-036 (PRV of
   record) are both "Approved", and ADR-036 says the two-accountant gate is preserved while
   deferring the second accountant. **Fix:** three accountants, section 3.4.
6. **RQ3 as built measures nothing.** The inversion attack reads the wrong slice of the parameter
   vector (verified: cosine 0.04 as coded, 1.0 with the right offset) and its noise setting matches
   gossip, not the federated design. The membership attack reads the model input, so it scores the
   same with and without DP. ADR-029 and ADR-042 disagree about scope. **Fix:** section 3.5, with a
   control gate so an attack whose positive control fails cannot produce a result file.
7. **The pre-registration is stale.** It says DRAFT, 5 seeds, has no deviations section, and its H3
   and H4 differ from the roadmap. **Fix:** a dated amendment section is appended (history is not
   rewritten) before the new grid runs.
8. **The stack lists tools that were never installed.** Flower on Ray, RecBole, OpenDP sampler, DVC,
   MLflow, Streamlit, PyG. Flower's own documentation calls Ray on Windows experimental and its DP
   wrappers a preview with no accounting. **Fix:** remove them by ADR; section 3.6 justifies each.
9. **Reproducibility objective P6 cannot be met by a third party**, because the data cannot be
   shared. **Fix:** a synthetic dataset generator and `prism demo-small`, used by CI.
10. **Privacy reporting is thinner than current guidance.** NIST SP 800-226 (final, March 2025)
    asks for the unit of privacy, ε, δ, the accountant, and warns about floating-point noise,
    tuning on private data and δ that is not far below 1/n. **Fix:** every receipt and the report
    carry these fields; ε is also reported at δ = 1/n² and without sampling amplification.
11. **The documents disagree in 33 places** (seeds, k-core values, hardware, gate dates, ADR
    statuses, licence status), and `docs/adr/` is empty although the roadmap says ADR texts live
    there. **Fix:** roadmap v2.0.0 with CHANGE-023, superseded ADRs marked, the 33 items closed.
12. **Roadmap rule 0.1.8** says Antigravity performs all edits. **Fix:** amended for this rebuild.
    Rule 7 (both owners must be able to explain every component) and section 17 item 10 (report
    prose is written by the owners) stay in force: this rebuild produces code, results, technical
    documentation and plain-language viva notes, not report prose.

**Source rule, decided by the owner on 17 November 2026:** conference papers and journal papers are
excluded from all research for this project, whatever any other document says. This supersedes
roadmap section 1 option (c) and CHANGE-013. The literature review is part of this rebuild, not an
owner task: it is written as `docs/literature-review.md` from standards, government and agency
reports, official documentation, vendor engineering write-ups and open-source repositories only.

### 1.4 Audit of the code: what is kept

| Area | Verdict | Reason |
|---|---|---|
| `data/contracts`, `filtering`, `splits`, `features`, the four ETL scripts, `check_licenses` | Keep | Tested 88 to 100%, correct, no leakage found |
| `privacy/dp.py` | Keep and extend | Clipping, Poisson assumption, noise scale and divisor all verified correct; add NaN guard and two more accountants |
| `eval/metrics.py`, `baselines.py` | Refactor | Add train + validation masking, deterministic tie-breaks, vectorise |
| Statistics in `summarize_results.py` (bootstrap, Holm, paired tests) | Keep, move into package | Good and tested |
| `models/two_tower.py` | Replace model, salvage `get_flat`/`set_flat` pattern and the clip-sum-noise order | Architecture cannot personalise; one shared RNG for sampling, negatives and noise |
| `scripts/run_grid.py`, `tune_learning.py`, `run_attacks.py` | Rewrite into the package | Core logic is in scripts at 0 to 38% coverage; non-atomic writes; cache races across workers; failures swallowed |
| `attacks/inversion.py` | Rewrite | Offset bug; tests pass while the code is wrong |
| `attacks/membership.py` metrics | Keep | AUC and TPR at fixed FPR are correct |
| The 180 existing runs and attack results | Archive under `results/archive/v1-content-only/` | Useful as the content-only ablation; the inversion result is marked invalid |

Gaps the audit found that become tests first: the DP noise branch is never executed by any test;
no test checks an ε value against an independent reference; no determinism test; `scipy` is used
but not declared; there is no entry point.

### 1.5 Expected outcomes, stated before the runs

- The non-private hybrid model beats MostPopular clearly on test. This is the gate for everything
  else. Centrally trained it matches a closed-form item-item baseline on validation *(spike)*.
- **H1 (≥ 90% retention at ε = 8) will probably fail** once the model has personalisation to lose.
  With 9,913 users the noise on a 113,823-parameter update is large relative to the signal: the
  first untuned DP run at ε = 8 collapsed to NDCG@10 0.001, and non-private federated training had
  not converged in 400 rounds *(spike)*. Tuning will improve this; how far is the result. A
  negative result with a diagnosis and a users-needed estimate is a valid and useful finding.
- Gossip with local DP is expected to be near popularity level or worse (H2).

---

## 2. Landscape review

Sources are standards, official documentation, vendor engineering posts and repositories only.
Items the research could not confirm from such sources are marked UNVERIFIED and are not relied on.

| Tool or source | Version, date | Licence | Decision | Why |
|---|---|---|---|---|
| NIST SP 800-226 | Final, Mar 2025 | US government | Use as reporting checklist | User-level unit is the recommended default; lists the hazards in 1.3 item 10 |
| NIST AI 100-2 E2025 | Mar 2025 | US government | Use for threat vocabulary | Standard names for poisoning, inversion, membership inference |
| Opacus | 1.6.0, May 2026 | Apache-2.0 | Use (already installed) | PRV and RDP accountants; source states the Poisson-sampling assumption |
| dp-accounting (Google) | 0.7.0, 10 Nov 2026 | Apache-2.0 | **Add** | Independent PLD accountant, pure-Python wheel, Python ≥ 3.10. Tested upstream on Linux only: install is checked first on this PC |
| TensorFlow Privacy, TFF | 0.9.0, 0.87.0 | Apache-2.0 | Skip | Require Python < 3.12 |
| Flower | 1.43.0 | Apache-2.0 | Skip as runtime; reuse its strategy names | Ray on Windows experimental; DP in preview, no accounting |
| RecBole, Microsoft Recommenders, LightFM | 1.2.1, 1.2.1, 1.17 | mixed | Skip | Heavy or no Windows wheel; baselines are implemented in under 60 lines each |
| ML Privacy Meter, IBM ART | n/a, 1.20 | MIT | Skip as dependency | Classifier-oriented APIs; the attack is ~100 lines and must fit a recommender |
| RFC 9162 / RFC 6962 | Dec 2021 | IETF | Implement directly | Leaf hash SHA-256(0x00‖d), node hash SHA-256(0x01‖l‖r), inclusion and consistency proofs |
| C2SP tlog-checkpoint | current | UNVERIFIED | Follow the three-line format | Origin, tree size, base64 root, signed |
| `cryptography` | 50.0.2, Sep 2026 | Apache-2.0 or BSD-3 | **Add** | Ed25519, X25519, HKDF; Windows wheels |
| `rfc8785` | current | Apache-2.0 | **Add** | Canonical JSON for signing, pure Python |
| pymerkle, P2PFL | 6.1.0, n/a | GPL | Reject | Licence policy ADR-015 |
| Tessera, Rekor, sigstore-python | n/a | Apache-2.0 | Skip | Go services or online infrastructure; this ledger is offline |
| Google Research post, Feb 2022 | n/a | n/a | Cite as practice | Production user-level DP avoids relying on uniform sampling because devices cannot guarantee it. Our ε assumes ideal Poisson sampling and says so |

Three new runtime dependencies in total: `dp-accounting`, `cryptography`, `rfc8785`. `scipy` is
declared explicitly. `matplotlib` is added for report figures.

---

## 3. Architecture and stack

### 3.1 Approaches considered

| | A. Patch in place | B. Refactor into a package with a new engine (chosen) | C. Port to Flower |
|---|---|---|---|
| What it is | Fix the three known bugs in the scripts, add features as more scripts | Keep the data layer; rebuild model, training engine, attacks, ledger and CLI as tested package modules | Rewrite training on Flower's simulation engine and strategies |
| For | Fastest start | Every later feature (secure aggregation, robust aggregation, gossip, poisoning) is a plug-in on one tested round loop | Standard framework name in the report |
| Against | Core logic stays untestable in scripts; `aggregate_round` has no place to plug in aggregators; the model still cannot personalise | About 90 minutes before the first experiment runs | Ray on Windows is experimental; no accounting; would consume the day |
| Verdict | Rejected | **Chosen** | Rejected |

### 3.2 Model

Item vector = normalise(ID embedding + projected frozen text embedding). User vector = normalise(a
small linear map of the mean item vector over the user's history), computed on the device from the
user's own interactions; it never leaves. Score = temperature × cosine + item bias. Training
objective: hide a random half of the user's history, predict the hidden half with a softmax over the
full catalogue.

| Block | Shape | Parameters |
|---|---|---|
| Item ID embedding | 6,319 × 16 | 101,104 |
| Content projection | 16 × 384 | 6,144 |
| User map | 16 × 16 | 256 |
| Item bias | 6,319 | 6,319 |
| **Total** | | **113,823** (old model: 121,391) |

Alternatives measured on validation *(spike)*: content only 0.0205; IDs only at dimension 32,
0.0324; hybrid at dimension 16, 0.0345; hybrid at dimension 32, 0.0348 for twice the parameters.
Dimension 16 is chosen because DP noise grows with the square root of the parameter count.
`use_ids=False` remains available as the content-only ablation.

### 3.3 System layout

```
src/prism/
  config.py            frozen pydantic experiment configs, canonical config hash
  seeding.py           independent named random streams (init, sampling, masking, noise)
  io.py                atomic JSON and NPZ writes, run registry, resume
  data/                kept as is, plus synthetic.py (shareable demo dataset)
  models/hybrid.py     model, flat-vector layout map by parameter name
  fl/sampling.py       Poisson cohorts, availability scenarios
  fl/client.py         vectorised per-user updates (torch.func)
  fl/aggregate.py      Aggregator interface: mean, trimmed mean, coordinate median, norm bound
  fl/secagg.py         pairwise-mask secure sum (simulation, see 3.5)
  fl/server.py         one round loop: sample, update, clip, mask, aggregate, noise, step, account, receipt
  fl/gossip.py         decentralised loop with per-message local noise
  privacy/dp.py        clip, noise, calibration (kept)
  privacy/accounting.py three accountants and the consistency gate
  attacks/             inversion.py, membership.py, poisoning.py, controls.py
  ledger/              merkle.py, receipts.py, log.py, gate.py
  eval/                metrics.py, baselines.py, stats.py
  experiments/         grid.py, tuning.py, registry.py
  report/build.py      static HTML, Markdown and CSV from results
  cli.py               `prism` entry point
```

One round, in order: Poisson-sample the cohort → each client computes its update from its own data
→ clip each update to L2 norm C → optionally mask for secure aggregation → aggregate → add Gaussian
noise once to the sum → server step → advance the accountant → release gate checks the budget →
signed receipt appended to the Merkle log. Secure aggregation, robust aggregation and poisoning are
implementations of the same two interfaces (client behaviour, aggregator), so every combination runs
through the same tested loop.

Commands: `prism data`, `prism baselines`, `prism tune`, `prism train`, `prism grid`,
`prism attack inversion|membership|poison`, `prism ledger verify|prove|show`, `prism report`,
`prism demo-small`.

### 3.4 Privacy accounting

- Unit of privacy: one user, add-or-remove adjacency. δ = 1/(10n).
- Three accountants per run: Opacus PRV, Opacus RDP, dp-accounting PLD. **Gate:** PRV and PLD agree
  within 5% and RDP is at least as large as both, otherwise the run fails. The reported ε is the
  larger of PRV and PLD. This restores ADR-022's gate and supersedes ADR-036.
- Also reported for every run: ε at δ = 1/n², and ε without sampling amplification.
- Disclosed limits, printed in every receipt: floating-point Gaussian noise from a seeded generator
  (ADR-037); the clipping norm and hyperparameters are chosen on the same users' data without
  accounting for it; ε assumes ideal Poisson sampling.

### 3.5 Attacks, defences and the ledger

| Component | Design | Positive control (must succeed) | Negative control (must fail) |
|---|---|---|---|
| Update inversion | From one client's update, rank items by the change in their bias and embedding rows; score recovery of the user's history against a popularity prior. Layout taken from parameter names | Single raw update: recovery far above the prior | Individually masked update: at the prior |
| Settings measured | Raw update; update with local noise (gossip); sum over cohorts of 10 and 100 (secure aggregation); sum plus central noise | | |
| Membership inference | User-level. Train on a random half of users; score every user by the model's loss on their own held-back items, calibrated against 4 reference models trained on other random halves. Report AUC, TPR at 1% and 0.1% FPR, and the implied lower bound on ε | Deliberately overfit non-private model: TPR at 1% FPR well above 1% | Model trained on neither half: at chance |
| Poisoning | Malicious clients push one target item with updates scaled to the clipping norm. Metric: share of users with the target in their top 10, and clean NDCG drop | No defence, 30% attackers: target promoted | 0% attackers: target at its base rate |
| Robust aggregation | Three modes from ADR-025: (a) plaintext trimmed mean and median, (b) secure sum with norm bound only, (c) committee sums with median (only if time remains) | | |
| Secure aggregation | Pairwise masks from X25519 key agreement and HKDF, fixed-point values modulo 2⁶⁴, survivors reveal seeds for dropped clients. The aggregator's interface accepts only masked vectors | Sum equals the plaintext sum within quantisation tolerance | One masked vector alone is indistinguishable from uniform |
| Ledger | Append-only Merkle log (RFC 6962 hashing), receipts canonicalised with RFC 8785 and signed with Ed25519, signed checkpoints, inclusion and consistency proofs, verifier command | Known-answer vectors from the certificate-transparency reference tests | Any single-byte change is detected (property test) |
| Release gate | A model release is refused if cumulative ε exceeds the budget or a receipt is missing | Over-budget release is blocked and the refusal itself is logged | |

The secure aggregation module is a **functional simulation built only from library primitives**. It
has no secret sharing and no real network, so it demonstrates what the aggregator can and cannot
see, not a deployable protocol. That limit is stated wherever results from it appear.

**Control gate:** attack code writes a result file only if its controls behave as expected;
otherwise it writes a file marked INVALID with the reason. This is the direct fix for how the
broken inversion result was committed.

### 3.6 Definitions fixed for the build

These settle the questions an independent review of this document raised. Each is a call made here,
not something the owners were asked.

- **Splits and n.** Validation and test are later interactions of the *same* users (per-user
  chronological 70/10/20). Training the final model on train + validation changes no user count:
  n = 9,913, and q, δ and the privacy unit are unchanged.
- **Reported ε.** δ = 1/(10n) for calibration, the gate and the headline. ε at δ = 1/n² and ε
  without amplification are extra columns. Every ε is labelled "excluding hyperparameter selection".
- **Accountant gate.** PRV and PLD must agree within max(5%, 0.05 absolute). RDP must be no smaller
  than either, less 0.01. A run that fails is recorded as `accounting_inconsistent`, left out of
  every table and investigated; it is never reported with a single accountant's value.
- **Release gate.** One training run is one model lineage with a budget ε_budget set in its config.
  The accountant advances every round. Training halts before a round that would take the reported
  ε past the budget, and release is refused unless every round has a receipt and the log verifies.
  The demonstration and test: a run configured with 20% more rounds than its noise supports is
  halted and the refusal is logged. Tuning runs are separate lineages in the same log; their ε is
  not composed with the final run's, and the report says so.
- **Membership inference protocol.** For each target seed, users are split into random halves A
  and B. The target is trained on A with noise calibrated for n = |A| and δ = 1/(10|A|), so the ε
  tested is the ε claimed for that population. Each user's score is the target model's loss on a
  fixed, seeded hidden half of their history (independent of training masks), minus the mean of the
  same loss over the reference models that did not train on that user. The 4 reference models are
  non-private (the attacker is not bound by DP), trained on independent random halves, and shared
  by all targets: 9 targets + 4 references + 1 overfit control = 14 runs. Members are A,
  non-members are B. The ε lower bound is ln((TPR_low − δ) / FPR_high) at the 1% FPR threshold with
  one-sided 95% Clopper-Pearson bounds, floored at 0. TPR at 0.1% FPR is reported with its interval
  and flagged as low resolution (about 5 non-members set the threshold).
- **Inversion scoring.** The target is one known cohort member. The attacker scores every item by
  the standardised change in its bias plus the standardised norm of the change in its embedding
  row. Metrics: per-user AUC of ranking the user's train history above all other items, and
  precision@10, each compared with the same metric computed from item popularity alone (the
  prior). For cohort sums the same scoring is applied to the sum for a randomly chosen member.
  Controls: single raw update AUC ≥ 0.80 and precision@10 ≥ 5 × prior; individually masked update
  AUC within 0.5 ± 0.05.
- **Poisoning attack.** A malicious client holds a fake profile, computes the honest gradient of
  "the target item is the only hidden positive", and scales the update to exactly norm C. It knows
  nothing about the cohort. The target item is drawn by seed from the least popular third. Base
  rate is the target's top-10 exposure in the clean run; the positive control requires ≥ 10 × base
  rate with no defence at 30% attackers.
- **Secure sum arithmetic.** Fixed point with scale 2³²/C in unsigned 64-bit arithmetic modulo 2⁶⁴,
  which leaves room for cohorts up to 2²⁰ clients (this replaces the 2³² modulus mentioned in 3.5).
  Uniformity control: Kolmogorov-Smirnov p > 0.001 for the masked coordinates and absolute
  correlation with the plaintext below 0.05. Dropouts are simulated before the masked vector is
  sent. A client that drops *after* sending would be exposed when survivors reveal its seeds; real
  protocols prevent this with a second mask, and this simulation does not.
- **Availability and ε (RQ5).** A user participates with probability q × a_u, a_u ≤ 1; noise is
  calibrated at the maximum rate q and the divisor is the scenario's expected cohort size, a public
  constant. The ε shown for RQ5 is labelled *nominal*: it holds only if availability is independent
  of the user's data, which the correlated scenario violates on purpose.
- **Block B gate.** The gate is measured on the non-private model trained in the *federated*
  regime, because that is the denominator for RQ1. The central model's result (0.0345 on
  validation, *spike*) only shows the architecture is capable.

### 3.7 Stack decisions

| Choice | Chosen | Alternatives rejected | Reason |
|---|---|---|---|
| Language and tooling | Python 3.12, uv, ruff, mypy strict, pytest, hypothesis | n/a | Already in place and green |
| Training | PyTorch on CPU with `torch.func` per-user gradients | Per-client Python loop (current); Flower | 400 rounds of ~198 users ran in 74 s on 6 threads *(spike)*; deterministic |
| FL runtime | In-process simulation | Flower on Ray | See section 2 |
| Baselines | MostPopular, ItemKNN, closed-form item-item ridge, in the package | RecBole, implicit | No heavy dependency; same evaluation code for every method |
| Configuration | pydantic models (already a dependency) | Hydra, YAML | Typed, hashable for receipts |
| CLI | argparse | Typer, Click | No new dependency |
| Report | Static HTML with embedded figures | Streamlit dashboard | No server, aggregates only (Yelp terms), opens anywhere |
| Experiment tracking | JSON run records in git | MLflow, DVC | Already works; records are small |

---

## 4. Non-functional requirements

| Area | Requirement | How it is checked |
|---|---|---|
| Privacy | Every DP run passes the three-accountant gate; no path lets an unclipped update reach the sum | Property test: adding or removing one user changes the pre-noise sum by at most C. Statistical test of noise scale and divisor |
| Privacy | Reported ε never understates: larger of two accountants, plus the unamplified and δ = 1/n² columns | Known-answer and cross-library tests |
| Security | Ed25519, X25519, HKDF and SHA-256 only through `cryptography`; signing keys under git-ignored `keys/`; no user IDs, business IDs or review text in any log or result | Tests on receipt contents; gitleaks in CI |
| Data compliance | Nothing under `data/` committed; repository stays private; results contain aggregates only | `.gitignore`, CI check on tracked paths |
| Reproducibility | Same seed and lockfile give byte-identical run records on this PC; thread count recorded | Determinism test in CI on the synthetic dataset |
| Reliability | Atomic writes; interrupted grids resume; a failed run is recorded as failed, never as done | Tests that kill a write midway and that inject a failing job |
| Performance | One federated run ≤ 3 minutes; full RQ1 grid ≤ 2.5 hours at 4 workers; peak memory ≤ 12 GB | Measured in the tuning block; grid sized from the measurement |
| Quality | ruff, mypy strict, coverage ≥ 90% on `privacy/`, `ledger/`, `fl/secagg.py` and ≥ 85% overall, enforced with `fail_under` | CI |
| Scalability | Stated honestly: designed for about 10⁴ users and 10⁴ items on one machine. Dense catalogue softmax and dense updates do not scale past that | Documented limit, not a claim |
| Cost | ₹0 | No paid service is used |

---

## 5. Execution and QA plan

### 5.1 Schedule (clock times assume approval by 13:00; every block shifts by any delay)

| Block | Window | Work | Exit check |
|---|---|---|---|
| A. Foundation | 13:00 to 14:30 | Branch; config, seeding, I/O; hybrid model; round loop; metrics fix; three accountants; synthetic dataset; CLI skeleton. In parallel: ledger, secure aggregation, statistics and report skeleton | `prism demo-small` trains with DP on synthetic data and produces a verified receipt; all gates green |
| B. Tune and launch | 14:30 to 15:15 | Tune on validation, at most 45 minutes. Write frozen hyperparameters and the amended hypotheses into the pre-registration. Launch the RQ1 grid in the background | Non-private validation NDCG@10 above MostPopular with non-overlapping intervals and ≥ 500 distinct items. If the gate fails, see 6.1 |
| C. Attacks and defences | 15:15 to 18:00 | Inversion, membership inference, poisoning, robust aggregators, gossip, availability sampling, ledger integration and release gate, all test-first on synthetic data while the grid runs | Every control in 3.5 passes on synthetic data |
| D. Secondary runs | 18:00 to 20:30 | Background runs for RQ3, RQ4, RQ5, RQ2. Report generator and documentation in the foreground | All planned run records present or explicitly cut |
| E. Verification | 20:30 to 22:30 | Full suite, lint, types, coverage; clean-clone `prism demo-small`; independent review of the whole branch by a fresh reviewer; fix findings; roadmap v2.0.0, pre-registration amendment, implementation log, viva notes | Review findings closed or listed as known issues |
| F. Buffer | 22:30 to 23:30 | Slack for overruns. Freeze at 23:30, final summary by 23:59 | |

Time-based stops, because background runs and foreground work share one CPU:

- Secondary runs start as soon as their code passes its controls, not at 18:00. Blocks C and D overlap.
- Per-run time is measured in block B. If 180 × that time ÷ 4 exceeds 150 minutes, the
  large-cohort regime drops to 5 seeds before the grid starts.
- Gossip starts only if the RQ1 grid has finished by 18:30.
- At 20:30 nothing new is launched. At 21:30 any run still going is stopped and reported as partial.

### 5.2 Compute plan

| Experiment | Runs | Estimated wall-clock at 4 workers |
|---|---|---|
| Tuning on validation | ≤ 24 short runs | 45 min, hard stop |
| RQ1: 3 sampling regimes × 6 privacy levels × 10 seeds | 180 | ~2 h |
| RQ3: membership (3 privacy levels × 3 seeds, 4 reference models, 1 overfit control) and inversion | 14 + minutes | ~30 min |
| RQ4: 3 attacker fractions × 2 modes × 3 seeds, plus clean | ~21 | ~20 min |
| RQ5: 4 availability scenarios × 5 seeds at ε = 8 | 20 | ~20 min |
| RQ2: gossip, ε ∈ {8, ∞}, 3 seeds, run one at a time (memory) | 6 | ~60 to 90 min |

### 5.3 Who does what

The main session writes the privacy-critical path (model, round loop, accounting, attacks) and
integrates. Independent, tightly specified modules go to sub-agents in parallel, each writing tests
first and each reviewed before merge: ledger, secure aggregation, synthetic data, statistics and
report (Sonnet 5.5); mechanical work such as moving files, document consistency fixes and docstrings
(Haiku 5.5); final whole-branch review (Opus 5.5). At most 8 at once.

### 5.4 Test strategy

Tests are written before the code they test, and each is run once to see it fail.

| Layer | Examples |
|---|---|
| Unit | Clip handles zero, NaN and infinite updates; flat layout round-trips; metrics mask train and validation and break ties deterministically |
| Property (hypothesis) | One user's presence changes the clipped sum by ≤ C; masks cancel exactly for any cohort and any dropout set; any tampered log fails verification; inclusion and consistency proofs verify for every tree size up to 64 |
| Known-answer | Merkle roots against the RFC 6962 reference vectors; ε against an independent accountant |
| Statistical | Noise standard deviation and the expected-cohort divisor; Poisson cohort rate |
| Control | Each attack's positive and negative control from 3.5 |
| Determinism | Two runs with one seed give identical record hashes |
| End to end | `prism demo-small` on synthetic data in under 60 seconds, run in CI on Linux and locally on Windows |

### 5.5 Evaluation metrics

Utility: NDCG@10 (headline), Recall@20, HR@10, MRR, distinct items in top-10 lists, exposure Gini,
all with full-catalogue ranking. Privacy, formal: ε at three settings, δ, noise multiplier, clip
norm. Privacy, empirical: membership AUC and TPR at 1% and 0.1% FPR, implied ε lower bound, history
recovery against prior. Robustness: target-item exposure, clean utility drop. Fairness of
participation: NDCG@10 gap between activity terciles. Ledger: overhead per round, proof size,
verification time, blocked releases. Statistics: bootstrap 95% intervals over users, paired Wilcoxon
across seeds, Holm correction per question; 10 seeds for RQ1, 3 to 5 elsewhere.

### 5.6 Deliverables at freeze

Source on a local branch with one commit per task; `README.md` with step-by-step setup for a fresh
Windows machine and for the synthetic demo; `results/` with run records, summary tables and the
HTML report; test, lint, type and coverage output; `PROJECT_ROADMAP.md` v2.0.0; amended
pre-registration; `docs/viva-notes.md` explaining every component and its limits in plain language;
a list of anything cut or not verified.

---

## 6. Risk management

### 6.1 Risks

| # | Risk | Likelihood | Response |
|---|---|---|---|
| 1 | Federated training does not converge to the central result within the round budget | High *(spike)* | Tuning levers fixed in advance: larger cohorts with fewer rounds, server optimiser (momentum SGD or Adam), local steps, clip norm. Chosen on validation only |
| 2 | DP erases personalisation at every ε tested | High | Report as the finding, with *personalisation retained*, plus a labelled what-if curve (noise scaled as if the population were 2×, 5×, 10× larger; a simulation, not a guarantee) |
| 3 | The non-private gate in block B fails | Low to medium | Extend tuning by 30 minutes taken from gossip. If it still fails, run the grid with the best configuration and state the limit in the first line of the results |
| 4 | The day runs out | Medium | Cut order in 6.2; blocks are ordered so the work is coherent at every cut |
| 5 | `dp-accounting` will not install or disagrees with PRV | Low | If it will not install: PRV and RDP only, with the gate reported as not run. If it disagrees: stop, the run fails by design |
| 6 | Thermal throttling or memory pressure from parallel runs and tests | Medium | 4 workers × 2 threads; gossip runs alone; tests use the synthetic dataset |
| 7 | A sub-agent's module is wrong in a subtle way | Medium | Tests are specified by the main session before dispatch; review before merge; final independent review |
| 8 | Changing the model after seeing old test results looks like tuning to the test set | Certain, must be handled | The amendment is written before any new test evaluation; the old results stay in the archive; the report says what changed and why |
| 9 | Owners cannot explain a one-day build in the viva (roadmap rule 7) | Medium | Viva notes per component; anything that cannot be explained simply is flagged for removal |
| 10 | Privacy cost of tuning on private data is unaccounted | Certain | Disclosed in every receipt and in the report, as NIST SP 800-226 asks |

### 6.2 Cut order if behind schedule

1. Committee-median robustness mode (mode c).
2. Gossip (RQ2) reduced to one seed, then dropped and reported as not run.
3. Availability reduced to the correlated and random scenarios.
4. Poisoning at 20% attackers only.
5. RQ1 large-cohort regime at 5 seeds.

Never cut: RQ1 federated regime with 10 seeds, the accountant gate, the corrected inversion attack,
user-level membership inference with controls, the ledger with its release gate, the test suite.

Not attempted today, by decision: the k ∈ {10, 20} sensitivity sweep (needs the dataset and
embeddings rebuilt twice), trace-based availability, free-riding, Flower parity, a hosted dashboard,
pushing to GitHub.

### 6.3 Trade-offs made

| Trade-off | Chosen side | Cost accepted |
|---|---|---|
| Model size against DP noise | Dimension 16 | About 0.0003 NDCG@10 lower non-privately *(spike)* |
| Faithful protocol against time | Simulated secure sum without secret sharing | Shows what the server sees; not a deployable protocol |
| Standard framework against a working day | In-process engine | No "runs on Flower" claim |
| Breadth against depth | All six questions at reduced seeds outside RQ1 | Wider intervals for RQ2, RQ4, RQ5 |
| Continuity against correctness | New model, old results archived | RQ1 numbers from steps 8 and 9 become an ablation |

---

## 7. Sources

- NIST SP 800-226, Guidelines for Evaluating Differential Privacy Guarantees: https://csrc.nist.gov/pubs/sp/800/226/final
- NIST AI 100-2 E2025, Adversarial Machine Learning taxonomy: https://csrc.nist.gov/pubs/ai/100/2/e2025/final
- Opacus releases and PRV accountant source: https://pypi.org/project/opacus/ , https://github.com/pytorch/opacus
- dp-accounting: https://pypi.org/project/dp-accounting/ , https://github.com/google/differential-privacy/tree/main/python/dp_accounting
- Flower DP, simulation and strategy documentation: https://flower.ai/docs/framework/explanation-differential-privacy.html , https://flower.ai/docs/framework/how-to-run-simulations.html , https://flower.ai/docs/framework/ref-api/flwr.serverapp.strategy.html
- Google Research, Federated Learning with Formal Differential Privacy Guarantees (Feb 2022): https://research.google/blog/federated-learning-with-formal-differential-privacy-guarantees/
- RFC 9162, Certificate Transparency Version 2.0: https://datatracker.ietf.org/doc/html/rfc9162
- C2SP tlog-checkpoint: https://github.com/C2SP/C2SP/blob/main/tlog-checkpoint.md
- `cryptography`: https://pypi.org/project/cryptography/ ; `rfc8785`: https://github.com/trailofbits/rfc8785.py
- ML Privacy Meter: https://github.com/privacytrustlab/ml_privacy_meter ; IBM ART: https://github.com/Trusted-AI/adversarial-robustness-toolbox
- RecBole evaluation settings: https://recbole.io/docs/user_guide/train_eval_intro.html ; TensorFlow Recommenders retrieval tutorial: https://www.tensorflow.org/recommenders/examples/basic_retrieval
- Yelp Open Dataset: https://business.yelp.com/data/resources/open-dataset/
- superpowers v7.0.2: https://github.com/obra/superpowers

## 8. Calls made here that the owners can overrule

- Work happens on a new local branch `rebuild/v2` with a commit per task. Nothing is pushed.
- The old results are archived, not deleted.
- `PROJECT_ROADMAP.md` remains the single source of truth and is updated to v2.0.0 at the end; this
  document is the design record for CHANGE-023.
- The Streamlit dashboard in the roadmap's Must list is replaced by a static HTML report.
- Scratch work, research notes and the vendored superpowers copy live in `_workspace/`, which is
  git-ignored.
