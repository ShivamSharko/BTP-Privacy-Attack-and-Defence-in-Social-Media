# PRISM-Rec: Privacy Attack and Defence in Social Media

## 1. What this is

PRISM-Rec (Python package `prism`) is a research harness. It trains a recommender for a social review platform in a simulated federated setting, with user-level differential privacy. The data is the Yelp Open Dataset, Philadelphia area: 9,913 users, 6,319 businesses, 410,193 interactions and a friend network of 70,691 friendships. The harness measures six things:

- **RQ1:** what privacy costs in recommendation quality.
- **RQ2:** gossip training between friends with local privacy, against server-based training.
- **RQ3:** what a curious server or an outsider can infer (visited businesses, friendships, membership), and how much secure aggregation and noise reduce it.
- **RQ4:** fake accounts promoting one business, against robust aggregation (including a committee-median mode), and free-riding clients that take the model without contributing.
- **RQ5:** whether availability-driven participation disadvantages quiet or isolated users.
- **RQ6:** a signed, append-only ledger with a release gate that blocks over-budget training.

It is not a deployed service. Everything is a simulation in one process on one PC: there is no network, no real device and no trust boundary. The privacy numbers are accounting results for the simulated mechanism, not a security audit. The package was rebuilt on 17 November 2026 from an earlier set of scripts; see `docs/superpowers/specs/2026-11-17-prism-rebuild-design.md`.

## 2. Results at a glance

All numbers are from the test split of the final runs of 17 November 2026. NDCG@10 is the
headline accuracy metric (higher is better). Every experiment below finished with status VALID,
meaning its positive and negative controls behaved as expected.

**Reference points.** MostPopular 0.0261, friends-based 0.0241, ItemKNN 0.0402, item-item ridge
0.0452. The non-private model scores 0.0365 to 0.0392 and recommends 1,800 to 3,000 distinct
businesses; MostPopular recommends the same 33 to everyone.

**RQ1, what privacy costs (10 seeds).**

| Regime | Non-private | ε = 16 | ε = 8 | ε = 4 | ε = 1 | Kept at ε = 8 |
|---|---|---|---|---|---|---|
| Large cohort (half the users per round, 40 rounds) | 0.0365 | 0.0301 | 0.0284 | 0.0260 | 0.0181 | 78% |
| Small cohort (5% of users per round, 400 rounds) | 0.0392 | 0.0269 | 0.0253 | 0.0233 | 0.0179 | 65% |

At ε = 8 the private model keeps 78% (large cohort) or 65% (small cohort) of the non-private
accuracy; the pre-registered target was 90%. At ε = 4 and below it is no better than MostPopular.
With 9,913 users the noise needed for the guarantee is large next to the signal: a simulation with
the noise divided by ten (roughly ten times more users per round) recovers 90% in the large-cohort
regime. The same ε = 8 reads as about 10.5 to 11 at the stricter δ = 1/n², and as 17 (large cohort)
or 330 (small cohort) if clients are not truly sampled at random.

**RQ3, what an attacker learns.**

| Attack | Without the defence | With the defence |
|---|---|---|
| Server reads a user's visited businesses from one update (AUC; precision in top 10) | 1.00; 1.00 | Masked update: 0.50; 0.004. Sum of 100 users: 0.85; 0.06. Sum of 100 with noise: 0.50; 0.006. Popularity alone: 0.77; 0.09 |
| Server guesses who is friends with whom from updates (AUC) | 0.58 (0.75 with full histories) | Not possible under secure aggregation: the server holds no per-user update |
| Outsider tells whether a user's data trained the released model (true-positive rate at 1% false positives) | 25.0% | ε = 8: 1.3%. ε = 1: 1.2%. Chance: 1.0% |

**RQ4, fake accounts promoting one business.** With secure aggregation and only a norm bound,
10% attacker accounts put the target business into 95% of honest users' top-10 lists. Plaintext
trimmed-mean aggregation holds that to 0.1% (and 6% at 30% attackers), but its model is almost
useless even with no attackers (0.0047 against 0.0279), because coordinate-wise robust statistics
discard the sparse signal a recommender learns from. Robustness and secure aggregation do not
combine here, and the robust alternative costs the model. The committee-median compromise (secure
sums inside small committees, median across them) has no good setting: committees of 4 stop 10%
attackers (0.03% exposure) but fail at 20% (94%) and leave a useless model (0.0040); committees of
20 keep most of the model (0.0220) but do not stop even 10% attackers (85%).

**Free-riding clients (3 seeds).** Accounts that take the model but send nothing useful cost the
others little and gain almost everything: with 10% free-riders overall accuracy drops 2% (0.0294
against 0.0301), with 30% it drops 3 to 4%, and a free-rider's own recommendations are only 0.0016
worse than a contributor's. A server that sees individual updates catches them easily by update
size (AUC 1.00 for empty updates, 0.99 for noise made to look like an update); under secure
aggregation it sees only the sum and cannot catch them at all.

**RQ2, gossip between friends (2,500 users, 3 seeds).** Without privacy, gossip reaches 0.0221
against 0.0282 for server-based training on the same users. With local privacy at ε = 8 it falls to
0.0054 against 0.0204, and it sends about 60 times more bytes. The local ε = 8 uses the project's
add-or-remove convention; under the stricter replace-one convention the same noise gives ε ≈ 19.

**RQ5, participation bias (5 seeds).** The most active and best-connected users are served better
than the least (a gap of about 0.014) in every scenario. When availability follows friend count and
training is private (ε = 8), the gap between well-connected and isolated users is wider than under
random availability in 5 of 5 seeds, but only by 0.0009 (about 7% of the gap). The other three
cells tested (friend count without privacy, activity with and without privacy) show no consistent
change. This is weak evidence: one cell of four, with a small effect.

With availability taken from a real device trace (107,749 devices, available 21% of the time on
average, assigned to users at random), accuracy falls further, and most under privacy: at ε = 8 it
is 0.0250 with everyone available, 0.0223 with a random half, 0.0168 with trace availability and
0.0160 when the trace is replayed round by round. Without privacy the same four are 0.0394,
0.0372, 0.0325 and 0.0302. Realistic availability costs a private model about a third of its
accuracy on top of the cost of the noise.

**Sensitivity (3 seeds, ε = 8, hyperparameters not re-tuned).** Retention is 76% and 64% (large
and small cohorts) at k = 10 with 19,141 users, 78% and 62% at k = 15, 80% and 68% at k = 20 with
6,001 users, and 83% and 71% when only reviews of 4 stars or more are kept. H1 fails on every
variant. Measured at list length 20 instead of 10, retention is one to three points lower.

**Framework parity.** The same training run through Flower 1.43 and through the project's engine
gives the same model on a small synthetic problem: after five rounds the largest parameter
difference is 6 × 10⁻⁸, with and without noise (`docs/flower-parity.md`).

**Reproducibility.** Every experiment was rerun with the training code frozen. The numbers
reproduce exactly, and each run record carries a hash of the engine source files.

**RQ6, ledger.** 162 of 162 ledgers verify and belong to their runs, every private model has a
release receipt, 300 of 300 single-byte tampers were detected, a receipt costs about 2 ms, and a
run asking for more rounds than its budget allowed was halted by the gate.

**Hypotheses.** H1 (90% kept at ε = 8): not supported. H2 (gossip worse than server-based at equal
ε): supported. H3: the membership part holds; the secure-sum part misses its threshold (AUC 0.85
against 0.82 allowed). H4: trimmed mean does limit promotion at every attacker share, but the gap
is not largest at the largest share, so not supported as stated. H5: supported by the
pre-registered sign rule for friend-count availability under privacy only, and weakly (see RQ5).

See `results/report/report.html`. The hypotheses, their decision rules and what was expected in
advance are in `PREREGISTRATION.md` (Amendments 1 and 2). An independent review of the code and
what was changed after it are in section 9.5 of the design document. The one item still open is
the pre-publication review by the dataset provider, which the owners must request.

## 3. Quick start without the dataset

This needs no Yelp data. It uses a small synthetic social dataset (400 users, 300 items) that the code generates itself.

1. Install `uv` (the Python and package manager). In PowerShell:

   ```powershell
   powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
   ```

   `winget install --id=astral-sh.uv -e` also works. Open a new terminal afterwards.
2. In the project folder, create the environment. `uv` downloads Python 3.12 if you do not have it, then installs the locked dependencies (PyTorch is the large one):

   ```powershell
   uv sync
   ```
3. Run the demonstration:

   ```powershell
   uv run python -m prism demo-small
   ```

   `uv run prism demo-small` is the same command, but it needs the `prism` console script. At the time of writing `pyproject.toml` has no `[project.scripts]` entry, so use the `python -m prism` form (it works either way). Every `prism <command>` below can be started that way.

**What it does.** It generates the synthetic dataset in a temporary folder and then runs the whole pipeline once: baselines, a non-private model, a model trained with differential privacy at epsilon 8, the three-accountant privacy check, a signed ledger that is verified, and a deliberately over-budget run that the release gate must stop. Nothing is written to `results/` (the output goes to a temporary folder; pass `--out DIR` to keep it).

**Time.** On the development PC it took 2 minutes 20 seconds, while another long job was using the CPU. Expect one to three minutes.

**What "DEMO OK" means.** The last line is `DEMO OK` only if all four hold: the privacy grid finished with status VALID, the ledger audit finished with status VALID, the over-budget run was blocked, and the non-private model scored higher NDCG@10 than the MostPopular baseline. Otherwise it prints `DEMO FAILED` and exits with a non-zero code. It checks that the machinery works, not that the numbers are meaningful: the data is synthetic.

## 4. Full setup with the Yelp data

**Prerequisites.** Windows 11; Python 3.12 (installed by `uv`, see above); about 20 GB of free disk (the raw download is 4.35 GB compressed and 8.65 GB unpacked, and the processed files come on top); 16 GB of RAM; no GPU. The first run of the feature script also downloads the sentence-embedding model `sentence-transformers/all-MiniLM-L6-v2`, so it needs internet access once.

**Get the data yourself.** Request the Yelp Open Dataset ("Download JSON") from <https://business.yelp.com/data/resources/open-dataset/> and accept its terms. Unpack it so that these three files exist:

```
data/raw/yelp_academic_dataset_business.json
data/raw/yelp_academic_dataset_review.json
data/raw/yelp_academic_dataset_user.json
```

> **Warning.** The Yelp data, and anything derived from it (everything under `data/`), must never be committed, copied to another person or shared. Each team member downloads their own copy. `data/` and `keys/` are git-ignored; do not change that. See section 9.

**Prepare the data.** Run these from the repository root, in this order. None of the three scripts takes arguments; they use relative paths, so the working directory matters. The Makefile has no target for them.

| Step | Command | Writes |
|---|---|---|
| 1 | `uv run python scripts/build_philly_subset.py` | `data/processed/philly_*.csv.gz` and `results/philly_filter_report.json`. Keeps Philadelphia businesses, their reviews and reviewers, and measures k-core survival. Streams the large review file, so it is slow. |
| 2 | `uv run python scripts/build_dataset.py` | `data/processed/dataset_{train,val,test}.csv.gz`, `user_index.json`, `item_index.json`, and `results/dataset_card.json`. Applies the k = 15 filter and the per-user chronological 70/10/20 split. |
| 3 | `uv run python scripts/build_features.py` | `data/processed/features_semantic.npz` (used) and `features_tfidf.npz` (ablation), and `results/features_card.json`. |

Step 2 stops with an error if step 1 has not run. Optional inspection scripts: `scripts/inspect_yelp.py --root data/raw` (aggregate-only inventory) and `scripts/metro_analysis.py --root data/raw` (the geographic analysis behind the choice of Philadelphia). I did not run the three data scripts for this README (they need the raw files and a long CPU run); the commands and order are taken from the code.

**Run the experiments.** Every command takes `--root DIR` (default `.`) and writes only aggregates and model checkpoints, never user ids. Settings come from `experiments/frozen.json`, which was fixed on validation data before any test evaluation. Run `uv run python -m prism <command> --help` for all options. `make all-experiments` runs all of them (the commands in the second table, added on 17 November 2026 in the evening, `sensitivity` and `free-riding`, run after `participation`).

| Command | What it does and where it writes |
|---|---|
| `prism social` | Builds the friend graph from the users file. Writes `data/processed/friends.npz` and `results/social_graph.json`. Run it before `baselines`, `update-leakage`, `gossip` and `participation`. |
| `prism baselines` | MostPopular, ItemKNN, item-item ridge and a friends-based baseline, on validation and test. Writes `results/baselines.json`. |
| `prism grid` | RQ1. Two sampling regimes (`large`, `small`) x non-private, clip-only and five epsilons x 10 seeds, plus labelled what-if runs. Writes `results/privacy_utility.json`, one record per run in `results/runs/privacy_utility/`, and one ledger per private run in `results/ledger/privacy_utility/`. Long. Resumable: a finished run with an unchanged configuration is skipped, so an interrupted grid continues where it stopped. |
| `prism update-leakage` | RQ3. History inversion and friendship-link inference from single updates, with local noise, under secure aggregation and with central noise. Writes `results/update_leakage.json`. Fails its controls, and is marked INVALID, if the raw attack does not work or the masked one is not at chance. |
| `prism membership` | RQ3. User-level membership inference with reference models and two controls. Writes `results/membership.json`. Resumable at the level of trained models (checkpoints are reused). |
| `prism poisoning` | RQ4. Fake accounts promote one unpopular business, against a plain secure sum, a trimmed mean and a median. Writes `results/poisoning.json`. Resumable. |
| `prism participation` | RQ5. Four synthetic availability scenarios; quality compared across activity and friend-count groups. Writes `results/participation.json`. Resumable. |
| `prism gossip` | RQ2. Gossip between friends with local DP against server-based training with central DP at the same epsilon. Writes `results/gossip.json`. Uses a lot of memory; run it alone. It caches each finished gossip run (under `data/processed/models/gossip/`) and reuses finished federated runs, so a rerun with the same settings skips them. |
| `prism ledger` | RQ6. Verifies every ledger under `results/ledger/`, flips single bytes to check tampering is detected, demonstrates a blocked over-budget release and measures the cost. Writes `results/ledger_audit.json`. `--prove FILE --index N` prints an inclusion proof for one receipt. |
| `prism report` | Reads the JSON files above and writes `results/report/report.html`, `report.md` and `tables/*.csv`. A missing input appears as "not run". |

Signing keys are created on first use in `keys/` (git-ignored). Model checkpoints go to `data/processed/models/`.

**Added on the evening of 17 November 2026 (CHANGE-024).**

| Command | What it does and where it writes |
|---|---|
| `prism sensitivity` | The pre-registered sensitivity analyses: the dataset rebuilt with k = 10, k = 20 and with reviews of 4 stars or more only (then k = 15), and a reduced RQ1 rerun on each (non-private reference plus epsilon 8 and 1, 3 seeds, both regimes, with the list-length readout at NDCG@20 and HR@10 and HR@20). Hyperparameters stay frozen from the main dataset. Writes `results/sensitivity.json`, `results/sensitivity/<variant>/dataset_card.json` (aggregate counts only) and the variant data under `data/processed_<variant>/` (git-ignored). Needs `data/processed/philly_*.csv.gz` from data step 1; it reuses the main item embeddings when they exist and are verified, otherwise it encodes the items. Options: `--variants k10,k20,stars4`, `--seeds`, `--epsilons`. |
| `prism sensitivity --build-only` | Builds the variant datasets and card only, no training. A built variant is reused on the next run. |
| `prism free-riding` | RQ4. A fraction of clients (0, 10%, 30%) sends all-zero updates or noise with the honest norm; measures the cost to everyone's NDCG@10, the free-riders' gain and detection by update norm and by cosine similarity (not applicable under secure aggregation). Clip-only runs, no DP noise. Writes `results/free_riding.json`. Resumable. |
| `prism poisoning` (new modes) | Two committee-median modes are now in the default list: `committee_median_size4` and `committee_median_size20`. The server sees only committee sums and takes their coordinate-wise median. Choose modes with `--modes`. These runs have no DP noise. |
| `prism participation` (trace scenarios) | Three further scenarios from a real device trace: `trace`, `trace_activity`, `trace_replay`. They run only if the trace file exists (see below); otherwise they are skipped with a note. `--trace-path FILE` points to another location. |

**Optional device trace.** The trace scenarios use the FedScale `client_behave_trace` (25.6 MB, 107,749 devices). It is not part of the repository. Download it from the source and checksum given in `docs/data-access.md` (section "Device availability trace") and place it at:

```
data/external/fedscale/client_behave_trace
```

It is a Python pickle, so it is read only with a restricted loader (`src/prism/data/traces.py`), never with `pickle.load`. It is research-use only and git-ignored; do not commit or share it. Without it, everything else still runs.

**Flower parity check (separate environment).** `scripts/flower_parity.py` runs a small synthetic federated training through Flower 1.43.0 and compares it with the in-process reference. Flower is not a project dependency and is not installed in the project environment: the script needs its own environment, whose creation commands are in `docs/flower-parity.md`. Then, from the repository root, run `_workspace/flower-env/Scripts/python.exe scripts/flower_parity.py` (about four minutes; `--skip-noise` runs only the noise-free variant). It writes `results/flower_parity.json`. It is not a `prism` command and not a Makefile target.

**Provenance and resume.** Run records now store a hash of the engine source files. When a finished run is reused, its record is flagged `stale_code` if the engine code has changed. Set `PRISM_STRICT_RESUME=1` to rerun such records instead of reusing them.

`make sensitivity` and `make free-riding` run the two new commands, and `make all-experiments` includes both.
## 5. Running the checks

From the Makefile (or run the underlying command if `make` is not installed):

| Task | Command |
|---|---|
| Tests with coverage | `uv run pytest --cov --cov-report=term-missing` (`make test`) |
| Lint | `uv run ruff check .` and `uv run ruff format --check .` (`make lint`) |
| Format | `uv run ruff format .` then `uv run ruff check --fix .` (`make format`) |
| Types (mypy strict) | `uv run mypy` (`make typecheck`) |
| Licence policy | `uv run python scripts/check_licenses.py` (`make license-gate`) |
| Dependency audit | `uv run pip-audit --skip-editable` (`make audit`) |
| Everything | `make check` |
| Remove caches | `make clean` (works on Windows) |

The tests use the synthetic dataset and never read `data/`. Coverage is measured but no minimum is enforced in `pyproject.toml`.

## 6. Repository layout

```
README.md, PROJECT_ROADMAP.md, PREREGISTRATION.md, Makefile, pyproject.toml, uv.lock
src/prism/
  cli.py, __main__.py   the `prism` command; dispatches to the modules below
  config.py             frozen run configuration and its canonical hash
  seeding.py            independent named random streams per seed
  io.py                 atomic JSON, text and NPZ writes
  environment.py        reproducibility report (versions, git commit, lockfile hash)
  data/                 loading, k-core filter, split, features, friend graph, synthetic dataset,
                        dataset variants for the sensitivity analyses (variants.py), device
                        trace reader with a restricted unpickler (traces.py)
  models/               the hybrid recommender (item-ID embeddings on a fixed content base)
  fl/                   round loop, sampling, clipping, aggregators, secure sum, gossip, availability
                        (synthetic scenarios and trace-based schedules)
  privacy/              clipping and noise (dp.py), three accountants and their gate (accounting.py)
  ledger/               Merkle tree, signed receipts, append-only log, release gate
  attacks/              inversion, friendship-link inference, membership, poisoning (with the
                        committee-median aggregator), free-riding
  eval/                 ranking metrics, baselines, statistics
  experiments/          one module per `prism` command (including sensitivity and free_riding),
                        plus the run engine (with the engine hash and strict resume) and frozen settings
  report/               builds the HTML and Markdown report
scripts/                data preparation (three steps above), dataset inspection, licence gate,
                        flower_parity.py (needs its own environment, see docs/flower-parity.md)
tests/                  pytest suite (unit, property, known-answer, control and end-to-end tests)
experiments/            frozen.json: hyperparameters fixed on validation data
docs/                   design and plan (docs/superpowers/), literature review, viva notes,
                        implementation and verification logs, Yelp compliance checklist
results/                aggregate outputs only; safe to commit (includes sensitivity.json,
                        free_riding.json and flower_parity.json)
results/archive/v1-content-only/   results of the earlier content-only model, kept as a record
data/                   Yelp raw and processed data, variant datasets (processed_k10, processed_k20,
                        processed_stars4) and the optional device trace under data/external/
                        (git-ignored, never share)
keys/                   ledger signing key (git-ignored)
_workspace/             git-ignored scratch space for notes and throwaway experiments
.github/workflows/      continuous integration
```

## 7. How the privacy guarantee works here

- **Unit of privacy: one user.** Adding or removing one user's whole history must change the output by a bounded amount (add-or-remove adjacency).
- **Clip.** Each user's entire model update is cut to L2 norm C (5.0 in both regimes). So one user changes the sum of updates by at most C. Updates that are NaN or infinite are replaced by zero.
- **Noise once, on the sum.** The aggregator adds Gaussian noise of standard deviation z x C to the summed update, once per round, then divides by the expected cohort size (a public constant, not the realised size). An empty round is noised too.
- **Poisson sampling.** Every user joins a round independently with probability q. The accountants rely on this to give a smaller epsilon than training on everyone ("amplification").
- **Three accountants and a gate.** Epsilon is computed with Opacus PRV, Google's `dp-accounting` PLD and Opacus RDP. PRV and PLD must agree within max(5%, 0.05) and RDP must not be smaller than either. The value of record is the larger of PRV and PLD at delta = 1/(10 n). Epsilon at delta = 1/n^2 and epsilon without amplification are reported next to it.
- **Release gate.** Training stops before a round that would take epsilon past the budget. A release is refused unless every round has a receipt in the ledger.
- **What epsilon does NOT cover.** The choice of clipping norm and hyperparameters (tuned on the same users' validation data); floating-point Gaussian noise from a seeded generator; the assumption of ideal Poisson sampling; anything the pattern of participation reveals; the secure-sum simulation, which is not a real protocol; and anything about what the model itself is used for later.

## 8. Limits and honest caveats

- It is a simulation on one machine. There is no network, no real devices, no dropout behaviour, no trust boundary.
- Epsilon is for the simulated mechanism under ideal Poisson sampling. Real devices cannot guarantee that sampling.
- The clipping norm, the learning rates and the server optimiser were tuned on the validation split of the same users. That selection is not covered by epsilon. Epsilon is also labelled "excluding hyperparameter selection".
- Noise is float Gaussian from a seeded NumPy generator, chosen for reproducibility. A deployment would need a hardened sampler and a discrete mechanism.
- The secure sum is a functional simulation of pairwise masking built from library primitives. It has no secret sharing, no network, no double masking and no security proof. A client that drops after sending would be exposed.
- The study is on one dataset and one city, in a filtered form: a k = 15 core removes about 75% of Philadelphia businesses, so ranking over the filtered catalogue gives higher absolute NDCG than the raw catalogue would. The data is from the January 2022 release.
- With about 9,913 users, the noise needed for epsilon 8 is large relative to the signal. A negative result for hypothesis H1 (at least 90% of non-private quality at epsilon 8) was expected and is valid. The what-if runs that divide the noise by k are simulations of a bigger population, not guarantees.
- The membership attack is a loss-threshold test with reference models, not the strongest possible attack. A low score bounds this attack only. The model is trained on half the users, so the epsilon tested is that of the half-population model.
- Poisoning is one strategy (a norm-bounded push of one item); attackers do not adapt to the aggregator. The trimmed mean and the median need to see individual updates, so they cannot be combined with secure aggregation, and all robust modes run without DP noise.
- Gossip simulates a random sample of users (3,000 nodes by default; the final run used 2,500 users and 3 seeds because 3,000 did not fit in this PC's memory beside the other experiments), in synchronous rounds, with random peers where a user has too few friends. Its local epsilon has no sampling amplification.
- RQ5 availability is synthetic in four scenarios and trace-based in three. Epsilon is only nominal for the scenarios that correlate availability with user data (`activity`, `social`, `trace_activity`), because they violate the independence it assumes; it is exact for `trace` and `trace_replay`. The trace devices are not linked to real users: they come from another population and are assigned to users by chance or by rank. One round is assumed to take 30 minutes in the replay scenario; this is a modelling choice. With five seeds the smallest possible two-sided Wilcoxon p-value is 0.0625.
- Free-riding and committee-median runs are clip-only: they add no DP noise, so no privacy guarantee applies to them. Free-riders do not adapt, and detection needs the server to see individual updates, so it is not possible under secure aggregation. Committees are simulated in the clear; no secure aggregation protocol runs.
- The sensitivity runs (k = 10, k = 20, 4 stars or more) reuse the hyperparameters tuned on the main dataset; nothing was re-tuned, and they use fewer seeds and privacy levels than the main grid. They test sensitivity to preprocessing of the same Philadelphia sample, not to another city.
- The Flower parity check is on a small synthetic problem (400 users, 5 rounds) with a custom strategy. It shows that the plumbing agrees to float32 rounding, not that anything holds at scale, and Flower is not used for the main results. It runs in a separate environment and is not a dependency.
- A ledger proves what was recorded and that it was not altered afterwards; it does not prove that the training happened as described.
- The pre-publication review by the dataset provider has not been done. It stays with the project owners and blocks any public presentation or publication of results.

## 9. Data and licence

The project code is MIT licensed. The Yelp data is not part of this repository and is under Yelp's dataset terms (Terms of Use of 7 July 2023): the data must not be shared with any third party, and findings that involve the data must be submitted to Yelp for review before any public presentation or publication. The licence runs for 12 months from 15 November 2026 and the data must be deleted at the end of the term. The checklist is `docs/yelp-compliance.md`. The repository must stay private.

## 10. Where to read more

- Design and audit of the rebuild: `docs/superpowers/specs/2026-11-17-prism-rebuild-design.md` (section 9 holds the amendments).
- Implementation plan: `docs/superpowers/plans/2026-11-17-prism-rebuild.md`.
- Pre-registered hypotheses and Amendment 1: `PREREGISTRATION.md`. Frozen settings: `experiments/frozen.json`.
- Literature review (standards, agency reports and official documentation only): `docs/literature-review.md`.
- Flower parity check (what it shows and how to reproduce it): `docs/flower-parity.md`.
- Device trace source, checksum and handling: `docs/data-access.md`, section "Device availability trace".
- Explanations of every component for the oral examination: `docs/viva-notes.md`.
- Roadmap and decision records: `PROJECT_ROADMAP.md`; progress log: `docs/implementation-log.md`.

## 11. The interactive deck

`deck/` holds "PRISM-Rec Explained", an 88-slide interactive 3D presentation of the project. Each concept is shown in the same order: the theory with a live 3D scene, then the measured impact with interactive charts, then the code. Every number is read from the result files in `results/` when the deck is built, and every code excerpt is copied from `src/prism` with its real line numbers.

```
cd deck
npm install
npm run dev
```

Then open http://localhost:5173. Keys, checks and how to regenerate the deck's data after a rerun are in `deck/README.md`. The deck is for local use: like the results it shows, it must not be hosted publicly before the dataset provider's review.
