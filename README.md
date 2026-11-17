# PRISM-Rec: Privacy Attack and Defence in Social Media

## 1. What this is

PRISM-Rec (Python package `prism`) is a research harness. It trains a recommender for a social review platform in a simulated federated setting, with user-level differential privacy. The data is the Yelp Open Dataset, Philadelphia area: 9,913 users, 6,319 businesses, 410,193 interactions and a friend network of 70,691 friendships. The harness measures six things:

- **RQ1:** what privacy costs in recommendation quality.
- **RQ2:** gossip training between friends with local privacy, against server-based training.
- **RQ3:** what a curious server or an outsider can infer (visited businesses, friendships, membership), and how much secure aggregation and noise reduce it.
- **RQ4:** fake accounts promoting one business, against robust aggregation.
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
combine here, and the robust alternative costs the model.

**RQ2, gossip between friends (2,000 users, 2 seeds).** Without privacy, gossip reaches 0.0208
against 0.0292 for server-based training on the same users. With local privacy at ε = 8 it falls to
0.0054 against 0.0172, and it sends about 60 times more bytes.

**RQ5, participation bias (5 seeds).** The most active and best-connected users are served better
than the least (a gap of about 0.014) in every scenario. When availability follows friend count and
training is private (ε = 8), the gap between well-connected and isolated users is wider than under
random availability in 5 of 5 seeds, but only by 0.0009 (about 7% of the gap). The other three
cells tested (friend count without privacy, activity with and without privacy) show no consistent
change. This is weak evidence: one cell of four, with a small effect.

**RQ6, ledger.** 146 of 146 ledgers verify and belong to their runs, every private model has a
release receipt, 300 of 300 single-byte tampers were detected, a receipt costs about 2 ms, and a
run asking for more rounds than its budget allowed was halted by the gate.

**Hypotheses.** H1 (90% kept at ε = 8): not supported. H2 (gossip worse than server-based at equal
ε): supported. H3: the membership part holds; the secure-sum part misses its threshold (AUC 0.85
against 0.82 allowed). H4: trimmed mean does limit promotion at every attacker share, but the gap
is not largest at the largest share, so not supported as stated. H5: supported by the
pre-registered sign rule for friend-count availability under privacy only, and weakly (see RQ5).

See `results/report/report.html`. The hypotheses, their decision rules and what was expected in
advance are in `PREREGISTRATION.md` (Amendment 1). An independent review of the code and what was
changed after it are in section 9.5 of the design document.

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

**Run the experiments.** Every command takes `--root DIR` (default `.`) and writes only aggregates and model checkpoints, never user ids. Settings come from `experiments/frozen.json`, which was fixed on validation data before any test evaluation. Run `uv run python -m prism <command> --help` for all options. `make all-experiments` runs all of them in the order below.

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
  data/                 loading, k-core filter, split, features, friend graph, synthetic dataset
  models/               the hybrid recommender (item-ID embeddings on a fixed content base)
  fl/                   round loop, sampling, clipping, aggregators, secure sum, gossip, availability
  privacy/              clipping and noise (dp.py), three accountants and their gate (accounting.py)
  ledger/               Merkle tree, signed receipts, append-only log, release gate
  attacks/              inversion, friendship-link inference, membership, poisoning
  eval/                 ranking metrics, baselines, statistics
  experiments/          one module per `prism` command, plus the run engine and frozen settings
  report/               builds the HTML and Markdown report
scripts/                data preparation (three steps above), dataset inspection, licence gate
tests/                  pytest suite (unit, property, known-answer, control and end-to-end tests)
experiments/            frozen.json: hyperparameters fixed on validation data
docs/                   design and plan (docs/superpowers/), literature review, viva notes,
                        implementation and verification logs, Yelp compliance checklist
results/                aggregate outputs only; safe to commit
results/archive/v1-content-only/   results of the earlier content-only model, kept as a record
data/                   Yelp raw and processed data (git-ignored, never share)
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
- Poisoning is one strategy (a norm-bounded push of one item); attackers do not adapt to the aggregator. Robust aggregators need to see individual updates, so they cannot be combined with secure aggregation, and they run without DP noise.
- Gossip simulates a random sample of users (3,000 nodes by default), in synchronous rounds, with random peers where a user has too few friends. Its local epsilon has no sampling amplification.
- RQ5 availability is synthetic, not measured from devices. Epsilon is only nominal there, because the correlated scenarios deliberately violate the independence it assumes. With five seeds the smallest possible two-sided Wilcoxon p-value is 0.0625.
- The k in {10, 20} sensitivity sweep and the analysis of ratings of 4 stars or more were not run. A ledger proves what was recorded and that it was not altered afterwards; it does not prove that the training happened as described.

## 9. Data and licence

The project code is MIT licensed. The Yelp data is not part of this repository and is under Yelp's dataset terms (Terms of Use of 7 July 2023): the data must not be shared with any third party, and findings that involve the data must be submitted to Yelp for review before any public presentation or publication. The licence runs for 12 months from 15 November 2026 and the data must be deleted at the end of the term. The checklist is `docs/yelp-compliance.md`. The repository must stay private.

## 10. Where to read more

- Design and audit of the rebuild: `docs/superpowers/specs/2026-11-17-prism-rebuild-design.md` (section 9 holds the amendments).
- Implementation plan: `docs/superpowers/plans/2026-11-17-prism-rebuild.md`.
- Pre-registered hypotheses and Amendment 1: `PREREGISTRATION.md`. Frozen settings: `experiments/frozen.json`.
- Literature review (standards, agency reports and official documentation only): `docs/literature-review.md`.
- Explanations of every component for the oral examination: `docs/viva-notes.md`.
- Roadmap and decision records: `PROJECT_ROADMAP.md`; progress log: `docs/implementation-log.md`.
