# Viva notes: every component, in plain language

These notes let either project owner explain any part of PRISM-Rec in an oral examination. Each component has the same seven parts: what it is, why it is there, how it works (with the file and the main function), numbers to remember, what it does not do, and likely questions. Technical terms are explained where they first appear and again in the glossary at the end.

Where a number will only be known after the final runs, the notes say `[see report]` and the answer is in `results/report/report.html`. Numbers marked "validation" were measured on the validation split during tuning, before any test evaluation; they come from `experiments/frozen.json` and the pre-registration amendment.

**One-sentence version of the project.** We train a recommender for a social review platform on real data under a formal privacy guarantee, measure what the guarantee costs in quality, attack the system the way a curious server or an outsider would, and check how much the defences help.

---

## 1. The dataset and the friend graph

**What it is.** The Yelp Open Dataset, restricted to the Philadelphia area. After filtering there are 9,913 users, 6,319 businesses and 410,193 interactions (a review of a business by a user). Users also have friend lists. The friend network has 70,691 friendships among these users.

**Why it is there.** The project is about social media, so it needs real behaviour (who visited what) and a real social graph (who is friends with whom). Yelp is a review platform with both, and it is free for academic use under its terms.

**How it works.**
1. `scripts/build_philly_subset.py` keeps businesses inside a latitude/longitude box around Philadelphia, keeps their reviews, drops the review text, and measures how many users survive a "k-core" filter. A k-core filter repeatedly removes users and businesses with fewer than k interactions until none are left.
2. `scripts/build_dataset.py` applies k = 15, checks referential integrity (dropped 4 orphan reviewer ids, 4 reviews), and writes the split files with integer ids (`user_idx`, `item_idx`).
3. `scripts/build_features.py` turns each business's public metadata (name, categories, attributes; never review text) into a 384-number vector with the `all-MiniLM-L6-v2` sentence model.
4. `prism social` (`experiments/social_build.py`, `data/social.py: build_friend_graph`) builds the friend graph from the `friends` field of the users file. An edge is kept only when both users are in the dataset.

**Numbers to remember.** k = 15 means every user has at least 15 interactions (median 25, maximum 1,332). 77% of users have at least one friend in the data; the median user has 3 friends and the mean is 14.3. The k-core removes 74.8% of Philadelphia businesses (25,039 down to 6,319).

**What it does not do.** It is one city and one data release (January 2022). The filter makes the catalogue easier than the real one, so absolute NDCG@10 is inflated compared with the raw catalogue. Friendship in Yelp is not documented as symmetric or verified; we treat it as undirected.

**Likely questions.**
- *Why Philadelphia?* It had the densest friend graph of the cities we measured (average friend degree 101.3 before filtering), and gossip and friendship attacks need a graph. The geographic analysis is in `scripts/metro_analysis.py`.
- *Why k = 15?* It was chosen from a measured survival table so that every user has enough history for a train, validation and test split, while keeping 77% of users connected to a friend.
- *Can you share the data or the processed files?* No. Yelp's terms forbid sharing the data or derivatives; `data/` is git-ignored, and results contain only aggregates.

---

## 2. The split and the evaluation protocol

**What it is.** The rule that decides which interactions the model may learn from and which it is tested on, and the metrics used to score it.

**Why it is there.** Without a strict rule it is easy to fool yourself. If a model sees the future, or if you tune and report on the same data, the results are too good.

**How it works.** `data/splits.py: chronological_split` sorts each user's interactions by date. The last 20% are test, the 10% before them are validation, the rest are train. `data/bundle.py: DataBundle` holds the three parts. The method `history(phase)` returns train (phase `tune`) or train plus validation (phase `final`); `targets(phase)` returns validation or test. Evaluation (`eval/metrics.py: ranking_metrics_per_user`) scores every one of the 6,319 businesses for each user, hides the businesses the user already has in their history, and checks where the held-out businesses land in the ranking. Ties are broken by the lower item index, so results are deterministic.

- **Why chronological.** A recommender is used to predict the future. A random split would let the model learn from reviews written after the ones it is tested on.
- **Why full-catalogue ranking.** Ranking against all 6,319 items is harder and more honest than ranking against a handful of sampled negatives, which is known to inflate scores and change model rankings.
- **Why train plus validation for the final model.** Validation interactions are real, earlier behaviour. Once hyperparameters are frozen, nothing is gained by throwing them away. At test time both train and validation items are masked. This changes no user count, so n = 9,913 and the privacy parameters do not change.

**Numbers to remember.** Realised shares: train 295,580 (72.06%), validation 36,206 (8.83%), test 78,407 (19.11%). Not exactly 70/10/20, because of integer rounding on short histories; this is expected. The headline metric is NDCG@10; others are Recall@20, HR@10, MRR, distinct@10 and an exposure Gini. Confidence intervals are 95% percentile bootstraps over users (1,000 draws).

**What it does not do.** The split is per user, not global: the model can learn from other users' later behaviour. A global time-cutoff variant was not run. Validation and test targets are later interactions of the same users, so this measures next-item recommendation for known users, not cold-start users.

**Likely questions.**
- *What stops you tuning on the test set?* Tuning used only the `tune` phase (train history, validation targets). The settings were written to `experiments/frozen.json` and Amendment 1 of the pre-registration before any test evaluation of the new model.
- *You had seen test results of the old model. Is that a problem?* It is disclosed. The old model's test results are archived in `results/archive/v1-content-only/`. They are why the model changed; the amendment says so.
- *Why NDCG@10?* It rewards putting the held-out businesses near the top of a list of ten and discounts lower positions, which is how a recommender is used.

---

## 3. The baselines

**What it is.** Four recommenders that need no training rounds. They give the floor and the ceiling against which the private model is judged.

**Why it is there.** A quality number means nothing alone. "NDCG@10 0.03" is good or bad only relative to what simple methods achieve.

**How it works.** `eval/baselines.py` and `experiments/baselines.py`.
- **MostPopular** (`popularity_score_fn`): the same list for everyone, ordered by how many users have the item. It is also the "no personal data" mode.
- **ItemKNN** (`knn_score_fn`): recommend items similar to what the user has, where two items are similar if the same users have both.
- **Item-item ridge** (`ease_score_fn`): a closed-form linear model that predicts each item from the others with an L2 penalty of 500 (chosen on validation from 100, 500, 2000). It has a one-line solution and is a strong baseline.
- **Friends** (`friend_score_fn`): score an item by how many of the user's friends have it, with a tiny popularity tie-break. It shows how much signal the social graph alone carries.

**Numbers to remember (validation, seed 0).** MostPopular 0.0174, ItemKNN 0.0308, item-item ridge 0.0342. Friends baseline: [see report]. The model is "personalised" only if it clearly beats MostPopular.

**What it does not do.** The baselines are not private; they use all the data directly. They are not tuned beyond one ridge setting.

**Likely questions.**
- *Why include a friends baseline?* Because this is a social platform. If friends predict taste well, the friend graph is both useful and a privacy risk.
- *Why is MostPopular the floor?* A model that cannot beat the same list for everyone has learned no personalisation. It is also what you get if differential privacy noise erases everything.
- *Why write the baselines yourself?* RecBole and similar tools are heavy or lack Windows wheels, and each baseline is under 60 lines. Every method uses the same evaluation code.

---

## 4. The hybrid model

**What it is.** A small recommender with 107,679 numbers (parameters) to learn. Each business has a 16-number vector made of a learned part (its ID embedding) plus a fixed part derived from its public text. A user is represented by averaging the vectors of the businesses in their history and passing that through a 16x16 matrix. Score = 20 x cosine similarity of user and business + a per-business bias.

**Why it is there.** The privacy mechanism adds noise proportional to the square root of the number of parameters, so the model has to be small. It also has to personalise, which the first design did not.

**How it works.** `models/hybrid.py`.
- `make_layout` names the blocks of one flat vector: `emb` (6,319 x 16 = 101,104), `umap` (16 x 16 = 256), `bias` (6,319). Code finds blocks by name through `Layout.slices`, never by hand-computed offsets. A hand-computed offset caused the old inversion bug.
- `content_base` takes the 384-number text embeddings, finds the top 16 principal directions (a standard way to compress vectors while keeping the biggest differences), and scales them by `content_scale` 0.4. This is computed once from public item data only, so it costs no privacy budget.
- `user_loss` hides a random half of one user's history and scores how well the model predicts the hidden half with a softmax over the whole catalogue (visible items are excluded).
- Item embeddings start at zero, so initialisation uses no private data.

**Why item IDs.** On validation, an untrained content-only model scored NDCG@10 0.0031, far below MostPopular at 0.0174. A trained content-only projection reached 0.0205 and recommended only 251 distinct items. With ID embeddings it reached about 0.0345 and recommended over 3,000 distinct items. Text metadata says what kind of place a business is, not who likes it; IDs let the model learn taste.

**Why a fixed content projection.** It matched the trained one (0.0347 against 0.0345 on validation) and removes the most expensive block from every client update.

**Why the earlier content-only model failed.** Its design decision (ADR-019) assumed text embeddings were enough. On this dataset it ranked like MostPopular on test (180 archived runs). The rebuild document records that call as wrong.

**Numbers to remember.** 107,679 parameters; dimension 16 (dimension 32 gave 0.0348 for twice the parameters); temperature 20; `use_ids=False` is kept as the content-only ablation.

**What it does not do.** It does not use ratings, review text, time, or location. The user vector is built on the device and never leaves it. It cannot recommend an unseen business whose ID has never been trained (no cold start for new items beyond the content base).

**Likely questions.**
- *Why not a bigger model?* Noise grows with the square root of the parameter count, and dimension 32 gained only 0.0003 NDCG@10.
- *Where is the user embedding?* There is none. Users are computed from their own history each time, so no per-user parameters need protecting or sending.
- *Is the content projection a privacy leak?* No. It depends only on public business metadata, never on any user's interactions.

---

## 5. The federated round loop

**What it is.** The training procedure. In "federated" training the data stays on each user's device (here, simulated); the server only receives model updates.

**Why it is there.** It is the setting in which user-level differential privacy is applied, and where the attacks and defences plug in.

**How it works.** `fl/server.py: train`. One round:
1. **Sample** a cohort (group of users for this round): each eligible user joins independently with probability q (`fl/sampling.py: poisson_cohort`).
2. **Compute updates:** each client hides half of its history, takes one gradient step on predicting the hidden half, and returns the change in parameters (`fl/client.py`).
3. **Clip** each update to L2 norm C (`fl/aggregate.py: clip_rows`).
4. **Aggregate** by summing (or by a robust rule, section 16).
5. **Add noise** once to the sum, divide by the expected cohort size (`noisy_mean`).
6. **Server step:** Adam or momentum SGD on the noisy average. This only uses the noisy value, so it is post-processing and does not affect the guarantee.
7. In `experiments/runner.py: run_one`, the gate is asked before the round, and a receipt is written after it.

**Numbers to remember (frozen, `experiments/frozen.json`).** Two regimes. `large`: q = 0.5, 40 rounds. `small`: q = 0.05, 400 rounds. Clip norm C = 5.0 in both. Expected cohorts: about 4,957 and 496 users. Private runs use Adam rate 0.02 (`large`) and momentum SGD rate 0.05 (`small`). Epsilons: 1, 2, 4, 8, 16, plus non-private. 10 seeds.

**What it does not do.** A "regime" is a sampling regime, not a trust model. With clipping and noise on the sum, "central" and "federated" training are the same mechanism and differ only in rate and rounds. It is one process; there are no network faults, stragglers or real devices.

**Likely questions.**
- *Why two regimes?* The first audit found "central versus federated" was really "40 rounds versus 400 rounds". Reporting named regimes avoids confusing the two.
- *Does the server optimiser leak?* No. It sees only the already-noised average.
- *What is the non-private reference?* The same regime without clipping or noise. It is the denominator for retention.

---

## 6. Per-user clipping and the fast clipped-sum path

**What it is.** Clipping scales a user's whole update down so its length (L2 norm, the square root of the sum of squares of all its numbers) is at most C. The fast path is a quicker way to compute the sum of clipped updates.

**Why it is there.** Clipping is what bounds one user's influence. Without it, one unusual user could shift the sum by any amount and no noise level would protect them.

**How it works.** `fl/aggregate.py: clip_rows` multiplies each update by min(1, C / norm). Rows with NaN or infinity become zero and are counted. After clipping, adding or removing one user changes the sum by at most C.

The general path builds every user's full update (users x 107,679 numbers per chunk). `fl/fast.py: clipped_sum_fast` avoids that when each client takes one local step:
1. One forward pass gives every user's loss.
2. Each user's gradient norm is computed in closed form from quantities already in that forward pass (the derivation is in the module docstring).
3. The clipped sum is the gradient of a weighted sum of losses, with weight min(1, C / norm) per user. This is one ordinary backward pass.

**Why computing the norm in closed form is safe, in words.** Step 3 is exact automatic differentiation. Only step 2 is derived by hand, and a wrong norm would mean a wrong clip, which would silently break the privacy guarantee. So it is checked two ways: `tests/test_fl_fast.py` compares it with automatic differentiation, and `fl/server.py: _self_check` repeats the comparison on 8 users at the start of every run with a 1% tolerance. If they disagree, the run refuses to start. A real-data run fell from 171 s to 29 s with an identical result.

**Numbers to remember.** C = 5.0. Fast path applies only for one local step, honest clients and plain sum; otherwise the full path runs.

**What it does not do.** Clipping adds bias: users whose updates are larger than C are shrunk, so their signal is under-weighted. C was chosen on validation data and that choice is not covered by epsilon.

**Likely questions.**
- *How do you know a user cannot exceed C?* Clipping is applied to the whole update vector (not per coordinate). A property test checks that one user's presence changes the clipped sum by at most C.
- *What if the closed form is wrong in an edge case?* The self-check guards the start of each run, and tests cover users with empty visible or target sets.
- *Why not clip per layer?* One norm over the whole update is the simplest bound that matches the accountants' assumption.

---

## 7. Gaussian noise, and why empty rounds are still noised

**What it is.** Random numbers from a bell-curve (Gaussian) distribution added to the summed update. The noise's standard deviation is z x C, where z is the "noise multiplier".

**Why it is there.** Noise hides any single user's contribution. Because clipping bounds that contribution by C, noise of size z x C makes the result almost the same with or without that user.

**How it works.** `fl/aggregate.py: noisy_mean` adds N(0, (zC)^2) to every coordinate of the sum once per round, then divides by `expected_cohort` (q x number of eligible users), a public constant. `experiments/calibration.py` and `privacy/accounting.py: calibrate_noise` find the smallest z that gives a target epsilon and cache it.

**Why empty rounds are still noised.** With Poisson sampling a round can, by chance, have zero users. The old code skipped such rounds. Whether a round was skipped depends on who was sampled, so skipping would itself leak information. The loop therefore always adds the noise, and the accountant counts every round.

**Why divide by the expected size, not the real size.** The realised cohort size depends on who took part; dividing by it would leak that. The expected size is fixed and public.

**Numbers to remember.** Known answer used in the tests: q = 0.01, z = 0.534, T = 400 rounds, n = 9,913 gives epsilon 7.771 (PRV) and 7.761 (PLD), RDP 9.27.

**What it does not do.** The noise is floating-point Gaussian from a seeded NumPy generator, chosen so runs are reproducible. A real deployment needs a hardened sampler (operating-system randomness and a discrete mechanism) because floating-point noise can be attacked.

**Likely questions.**
- *Why Gaussian and not Laplace?* The Gaussian mechanism pairs with L2 clipping and has good composition behaviour across many rounds.
- *Is a seeded generator private?* No. It is reproducible, which is the point for a study; the limitation is printed on every receipt.
- *What happens if z is large?* The signal is swamped. With 9,913 users, epsilon 8 needs noise that is large relative to the update. This is the core finding on cost.

---

## 8. Poisson sampling and amplification

**What it is.** Each user joins a round independently with the same probability q, so cohort size varies from round to round. "Amplification by subsampling" is the fact that if a user is only sometimes included, the privacy loss per round is smaller than if they were always included.

**Why it is there.** It makes the reported epsilon much smaller for the same noise. The accountants assume exactly this sampling scheme.

**How it works.** `fl/sampling.py: poisson_cohort` draws one uniform number per eligible user and includes those below q (times an availability factor, section 17). Exactly one draw per user is consumed whatever happens, so the sampling stream stays aligned between runs that differ only in rate.

**Numbers to remember.** q = 0.5 (`large`) and 0.05 (`small`). Epsilon is also reported without amplification (`unamplified` in the privacy block), which is what holds if clients are not truly Poisson-sampled.

**What it does not do.** Real devices cannot guarantee independent random inclusion: availability depends on the phone being charging, idle and online. Epsilon assumes ideal sampling and says so. Production systems avoid relying on this assumption for that reason.

**Likely questions.**
- *Why not sample a fixed number of users?* The accountants' proofs are for Poisson sampling; fixed-size sampling is a different mechanism.
- *What is the epsilon if sampling is not ideal?* Use the `unamplified` figure as the conservative bound.
- *Does amplification apply to gossip?* No. Every node releases an update every round.

---

## 9. The three accountants and the gate

**What it is.** An "accountant" is a method for adding up the privacy loss over many rounds. Three independent ones are used, with a check that they agree.

**Why it is there.** The first version had two decision records that contradicted each other about which accountant was authoritative. A wrong accountant means a wrong epsilon, so we check one against another written by a different team.

**How it works.** `privacy/accounting.py`.
- **PRV** (Opacus `PRVAccountant`): numerical, tight.
- **PLD** (Google `dp_accounting`, independent code): privacy-loss distribution accountant, also tight.
- **RDP** (Opacus `RDPAccountant`): an older method that gives a looser (larger) bound.
- `check_gate`: PRV and PLD must agree within max(5%, 0.05) and RDP must be no smaller than either, less 0.01. Otherwise the run is recorded as `accounting_inconsistent` and left out of every table.
- The epsilon of record is the larger of PRV and PLD, so it never understates.
- `epsilon_report` also gives epsilon at delta = 1/n^2 and the unamplified epsilon.
- `max_rounds_within` finds how many rounds fit a budget (searching with PLD, then confirming with all three).

**Numbers to remember.** Gate tolerance 5% or 0.05 absolute. delta = 1/(10 n). Every epsilon is labelled "excluding hyperparameter selection".

**What it does not do.** Agreement between libraries shows consistency, not that the underlying assumptions hold (ideal Poisson sampling, ideal Gaussian noise). `dp-accounting` is tested upstream on Linux; we checked it on this PC.

**Likely questions.**
- *Why three?* Two checks each other; the third (RDP) is a mathematically different method that must come out at least as large. If it comes out smaller, something is wrong.
- *Which epsilon do you report?* The larger of PRV and PLD.
- *What if the accountants disagree?* The run fails by design and is investigated, never reported with one accountant's number.

---

## 10. Delta, and why two values are reported

**What it is.** Differential privacy has two numbers: epsilon (how much any one person's data can change the output's probabilities) and delta (the small probability that the epsilon promise fails). Both are needed to state the guarantee.

**Why two values.** Delta should be much smaller than 1/n, where n is the number of users. NIST SP 800-226 treats delta above about 10^-5 with suspicion. Our headline delta = 1/(10 n) is about 1.0 x 10^-5 for n = 9,913, which is at that boundary. So we also report epsilon at delta = 1/n^2 (about 1.0 x 10^-8) next to it.

**How it works.** `privacy/accounting.py: delta_for` and `epsilon_report` compute both. Calibration, the gate and the headline all use 1/(10 n).

**What it does not do.** A smaller delta gives a larger epsilon for the same noise, so the stricter column is always the bigger number.

**Likely questions.**
- *Why is delta not zero?* The Gaussian mechanism cannot give pure epsilon-DP; delta absorbs the rare event.
- *Why 1/(10 n)?* It is the roadmap's convention; it ensures delta is below 1/n so that the guarantee is not "leak one record in n".
- *Which should I quote?* The headline, with the 1/n^2 value alongside.

---

## 11. The secure-sum simulation and its limits

**What it is.** A simulation of "secure aggregation", a protocol where the server can compute the sum of users' updates but cannot see any single update.

**Why it is there.** It lets us measure what the server can and cannot see (RQ3) and what it costs in bytes. It also shows why robust aggregation (RQ4) is hard when updates are hidden.

**How it works.** `fl/secagg.py`.
1. Each client has an X25519 key pair (a standard key-agreement scheme). Every pair of clients derives a shared secret, then a 32-byte seed with HKDF-SHA256 (a key-derivation function).
2. The seed drives a ChaCha20 stream that expands into a long random mask of 64-bit words.
3. Updates are converted to fixed-point integers (scale 2^32 / C) and arithmetic is done modulo 2^64. Client i adds the mask for peer j if i < j and subtracts it otherwise.
4. The server (`SecAggServer`) only accepts masked vectors and sums them. The masks cancel in the sum.
5. If a client drops before sending, each surviving partner reveals its seed with the dropped client and the server removes those masks (`unmask`).

**Numbers to remember.** Modulus 2^64; supports cohorts up to 2^20 clients; one masked vector alone passes a uniformity test (Kolmogorov-Smirnov p > 0.001, correlation with the plaintext under 0.05).

**What it does NOT do.** There is no secret sharing of keys, no real network, no authenticated channels and no double masking. A client that sends its masked update and then drops would be exposed when survivors reveal seeds, because the server could strip its masks; real protocols prevent that with a second mask. It models the arithmetic and byte cost, not security. There is no security proof.

**Likely questions.**
- *Is this secure aggregation?* It is a functional simulation of the core idea built from library primitives. It shows what the aggregator sees; it is not a deployable protocol.
- *Why does the sum come out right?* Every mask is added by one client and subtracted by the other, so they cancel. Tests check it for random cohorts and dropouts.
- *Does secure aggregation give differential privacy?* No. It hides individual updates from the server, but the sum itself still depends on each user. Noise is still needed.

---

## 12. Gossip between friends and local privacy

**What it is.** Gossip training removes the server. Each user keeps a model and periodically averages it with the models of a few friends. "Local" differential privacy means each user adds the noise themselves before anything leaves their device.

**Why it is there.** It answers RQ2: what does removing the trusted server cost in quality? It also fits a social platform, where friends already know each other.

**How it works.** `fl/gossip.py: gossip_train`, driven by `experiments/gossip.py`. In each synchronous round, every node:
1. takes one gradient step on its hidden-history loss using its own model;
2. clips that update to C and adds Gaussian noise N(0, (zC)^2) (`privatise_updates`);
3. applies its own noisy update;
4. replaces its model with the mean of its own and its peers' models (`mix_into`). Peers are real friends where a node has them, random users otherwise; the share of real friends is reported.

Evaluation (`evaluate_nodes`) scores each node with its own model on its own history and targets, and the federated model is scored on exactly the same users.

**Numbers to remember.** Default 3,000 nodes (sampled from users with at least one friend), 100 rounds, degree 4, epsilon none and 8, 3 seeds. The reported run used 2,500 users and 3 seeds, because 3,000 users did not fit in this PC's memory beside the other experiments. Each node sends 4 x 107,679 x 4 bytes, about 1.7 MB, per round. H2 (pre-registered): gossip at epsilon 8 has lower NDCG@10 than server-based central DP at epsilon 8, with a 95% bootstrap interval of the per-user difference excluding 0. Result: [see report].

**What it does not do.** Local DP adds noise at every node, so the total noise is much larger than a central sum gets for the same epsilon. There is no sampling amplification, so epsilon composes over all rounds. Rounds are synchronous, only a sample of users is simulated, and the local learning rate was tuned on synthetic data only.

**Likely questions.**
- *Why is local DP so much worse?* In central DP one noise draw protects a sum of thousands of users; in local DP every user adds a full noise draw to their own update, and averaging with only 4 peers cannot cancel it.
- *What is the trade?* No trusted server, at a large cost in quality and bytes.
- *Is it fair to compare them?* They use the same epsilon, node population, metric and MostPopular floor; a control requires that non-private gossip beat MostPopular, or the gap is not interpretable.

---

## 13. History inversion

**What it is.** An attack in which a curious server looks at one user's model update and guesses which businesses that user visited.

**Why it is there.** It shows concretely what an update reveals, and it is what secure aggregation and noise are supposed to stop (RQ3).

**How it works.** `attacks/inversion.py: history_scores`. One local step leaves two traces: an item the client tried to predict gets a positive bias change; every item used as visible history gets an extra embedding-row change (because the user vector is their average). The score of an item is the z-score (distance from average in standard deviations) of its bias change plus the z-score of the norm of its embedding-row change. Blocks are taken by name from the layout. `recovery_metrics` reports AUC and precision@10 and compares them with a popularity-only prior.

**Numbers to remember.** Controls (`experiments/update_leakage.py`): on the raw update, AUC must be at least 0.80 and precision@10 at least 5 times the prior; on an individually masked update, AUC must be within 0.5 +/- 0.05. If a control fails, the result file is marked INVALID. Settings: raw, local noise z in {0.5, 1, 2, 5}, secure sums over cohorts of 10 and 100, sum plus central noise. 300 target users. Results: [see report].

**What it does not do.** It assumes an honest-but-curious server seeing a single user's update at one model state, not a whole training run. For secure sums of many users the traces mix, so recovery is expected to drop toward the prior. The local-noise epsilon is for one release of one update.

**Likely questions.**
- *Why did the earlier version fail?* It read the wrong slice of the parameter vector (cosine 0.04 as coded, 1.0 with the right offset) and the tests passed while the code was wrong. Layout by name fixes that.
- *What is AUC here?* The chance that a real history item scores higher than a random other item. 0.5 is a coin flip.
- *Why compare with popularity?* Popular items are likely guesses for anyone. The attack is only meaningful if it beats that prior.

---

## 14. Friendship-link inference

**What it is.** An attack that guesses who is friends with whom from the similarity of users' model updates.

**Why it is there.** Friends tend to like similar places, so updates may carry the social graph with them. This is a social-media-specific risk.

**How it works.** `attacks/links.py: link_inference` computes the cosine similarity (the angle between two vectors) of pairs of users' update vectors and reports the AUC of separating real friend pairs from random non-friend pairs (`graph.sample_pairs` supplies up to 100,000 pairs). It is run for raw updates, with local noise, and under secure aggregation. A "reference histories" row gives the ceiling set by how alike friends' tastes are, which is not an attack on updates.

**Numbers to remember.** AUC 0.5 means no information. Results: [see report]. The pre-registered expectation: the attack works on raw updates and is impossible under secure aggregation, because the server then holds no per-user vector.

**What it does not do.** It uses only pairs among the target users. Similar taste is not friendship, so even a perfect score on updates cannot exceed what the shared taste allows.

**Likely questions.**
- *Why can masked updates not be compared?* One masked vector looks uniformly random (that is tested), so any similarity between two masked vectors is chance.
- *Does a high AUC prove the server learns the friend list?* It shows friend pairs score higher on average. Turning that into an exact graph needs more.
- *Can noise defend this?* Noise lowers the AUC, at a cost that [see report].

---

## 15. Membership inference with reference models, and why controls are needed

**What it is.** An attack that tries to tell whether a given user's data was used to train the released model. It is the empirical check on the privacy guarantee.

**Why it is there.** A formal epsilon is a promise on paper. Membership inference tests it from the attacker's side.

**How it works.** `experiments/membership.py` and `attacks/membership.py`.
1. Users are randomly split into halves A (members) and B (non-members). The target model trains only on A, with noise calibrated for |A| users, so the epsilon tested is the epsilon claimed.
2. 4 reference models are trained without privacy (the attacker is not bound by DP), each on a different random half.
3. A user's score = mean loss of the reference models that did not train on them, minus the target's loss on a fixed hidden half of the user's history (`fixed_hidden`, depends only on a seed and the user). Members should have a lower target loss than expected.
4. `summarise_scores` reports AUC, TPR at 1% and 0.1% false positive rate (the share of members caught when only 1% or 0.1% of non-members are wrongly flagged), and an empirical epsilon lower bound, ln((TPR_low - delta) / FPR_high) with 95% Clopper-Pearson bounds, floored at 0.

**Why controls are needed.** An attack that always says "not a member" looks safe. Two controls make a low score mean something: a deliberately overfit non-private model (5 times the rounds) must be attackable (TPR at 1% FPR at least 0.02 and AUC at least 0.55), and a model trained on a half independent of the labels must sit at chance (AUC within 0.5 +/- 0.03). If either fails, the result is INVALID.

**Numbers to remember.** Defaults: privacy levels none, 8 and 1; 3 seeds (9 target models); 4 reference models; 1 overfit and 1 independent control. H3 (pre-registered): at epsilon 8, TPR at 1% FPR at most 2%. The 0.1% FPR figure is flagged low resolution (only about 5 non-members set the threshold). Results: [see report].

**What it does not do.** It is a loss-threshold test, not the strongest possible attack; a low result bounds this attack only. The empirical epsilon bound is statistical and can only detect large violations. Reference models share the architecture and data distribution, which favours the attacker. The tested model is the half-population model.

**Likely questions.**
- *If the attack fails at epsilon 8, are we safe?* We have shown this attack does not succeed, not that none can.
- *Why a lower bound on epsilon?* An attack's success implies epsilon is at least some value; it can show a guarantee is violated but never prove it holds.
- *Why train on half the users?* You need real non-members who were never trained on.

---

## 16. The poisoning attack: fake accounts promoting a business

**What it is.** An attacker controls a fraction of accounts and uses them to push one unpopular business into everyone's top-10 recommendations.

**Why it is there.** Open platforms have fake accounts, and learning from user updates gives them a lever (RQ4).

**How it works.** `attacks/poisoning.py`. `choose_target_item` picks a target from the least popular third; `choose_malicious` picks the accounts (sets nest as the fraction grows); `make_promotion_hook` replaces each attacker's update with a crafted one: one honest-style step on "this account's history is visible and the target is the only hidden positive", rescaled to norm exactly C. The attacker knows the current global model and its own accounts' histories, nothing else. `target_exposure` measures the share of other users with the target in their top-10.

**Numbers to remember.** Attacker fractions 0, 10, 20 and 30% (headline 20%); 3 seeds by default. Positive control: no defence at 30% must raise exposure to at least 10 times the clean rate. Pre-registered H4: trimmed-mean exposure is lower than secure-sum exposure at every share, and the gap grows with the share. Result: [see report].

**What it does not do.** One strategy only; attackers do not adapt to the aggregator, so an adaptive attacker could do better. Intervals are min and max over seeds, not confidence intervals.

**Likely questions.**
- *Why does the update have norm exactly C?* The server clips anyway; the strongest legal update uses the whole budget.
- *Why can you not defend a secure sum?* The server only sees the sum, so the only defence is the norm bound.
- *Does DP stop poisoning?* No. DP protects the people in the data, not the model from bad contributors.

The three aggregation modes (`fl/aggregate.py: robust_total`, `experiments/poisoning.py`):
1. `secure_sum_norm_bound`: the server sees only the sum of clipped updates, so it cannot filter anything.
2. `plaintext_trimmed_mean`: the server sees every update and drops the largest and smallest values in each coordinate before averaging (default trim 0.35).
3. `plaintext_median`: the coordinate-wise median.

Modes 2 and 3 need to see individual updates, so they cannot be combined with secure aggregation, and they run without DP noise.

Two more modes were added on the evening of 17 November 2026 (CHANGE-024): `committee_median_size4` and `committee_median_size20`, where the server sees only committee sums and takes their median (section 25). The same attack harness is also used for free-riding (section 24).

---

## 17. Availability and participation bias (RQ5)

**What it is.** On a phone, a training round includes only devices that are charging, idle and online. That is not random: heavy users and well-connected users may be online more. The question is whether this makes the recommender serve other users worse.

**How it works.** `fl/availability.py: availability_vector` gives each user a probability a_u <= 1, so a user joins with probability q x a_u (`poisson_cohort`). Four synthetic scenarios: `always`, `independent`, `activity` (correlated with history length) and `social` (correlated with friend count). The mean is 0.5 and the floor 0.05. `experiments/participation.py` trains with each, groups per-user NDCG@10 by activity terciles and friend-count bands (0, 1 to 5, more than 5), and compares the top-minus-bottom gap with the independent scenario seed by seed.

**Why epsilon is only nominal.** Noise is calibrated at the maximum rate q and divided by the expected cohort. That guarantee holds only if availability is independent of the user's data. The `activity` and `social` scenarios violate that on purpose, so the formal guarantee does not cover what the participation pattern itself reveals.

**Numbers to remember.** 5 seeds; with 5 seeds the smallest possible two-sided Wilcoxon p is 0.0625, so the sign pattern (5 of 5) is the evidence and the test is reported as underpowered. H5: correlated availability gives a larger gap than independent. Result: [see report].

**What it does not do.** The four scenarios above are synthetic and rank-based. Three further scenarios use a real device trace (section 26), though the devices are not linked to real users.

**Likely questions.**
- *Why is the epsilon "nominal"?* Because the assumption behind it is deliberately broken in two of the four scenarios.
- *Is the gap caused by privacy?* The comparison against independent availability isolates the effect of who participates.
- *Why only 5 seeds?* Time. We say the test is underpowered instead of hiding it.

---

## 18. The ledger: Merkle tree, receipts, checkpoints, inclusion proofs

**What it is.** An append-only log of facts about training: one signed receipt per round, a release receipt, and signed summaries (checkpoints).

**Why it is there.** To make the privacy accounting auditable: anyone with the public key can check that the recorded budget was not changed after the fact (RQ6).

**How it works.** `ledger/`.
- **Receipts** (`receipts.py`): each is a JSON record of public, data-independent values (round number, configuration hash, sampling rate, noise multiplier, clip norm, privacy spent). It is turned into one exact byte sequence with RFC 8785 canonical JSON, so the same content always gives the same bytes.
- **Merkle tree** (`merkle.py`, RFC 6962 hashing with SHA-256): each receipt is a leaf (hash of 0x00 + bytes); two hashes are combined into a node (0x01 + left + right). The single top hash, the **Merkle root**, changes if any leaf changes.
- **Checkpoint** (`log.py: Ledger.checkpoint`): the tree size and root, signed with an Ed25519 key, in the three-line C2SP checkpoint format.
- **Inclusion proof** (`merkle.py: inclusion_proof`, `verify_inclusion`; `log.py: prove_inclusion`): a short list of hashes that lets someone check one receipt is in the tree with that root, without the others.
- **`verify_ledger`** re-reads the file strictly, rebuilds every root and checks every signature, order and coverage.
- The file is JSON lines, each write flushed and synced.

**Numbers to remember.** SHA-256 for hashes, Ed25519 signatures, receipts contain no user ids, no realised cohort sizes. `prism ledger` flips single bytes of a copy (default 300 flips) and every flip must be detected. The audit also measures time per append, bytes per round, proof size and verification time. Results: [see report].

**What a log proves.** That these records existed in this order and were not changed afterwards, and who signed them. It does NOT prove that the recorded training really happened as described, and it gives no confidentiality. The signing key sits in `keys/` (git-ignored); anyone with the key can write a new consistent ledger.

**Likely questions.**
- *Why a Merkle tree?* One small root commits to every receipt, and you can prove a single receipt with a short path.
- *Could someone delete the last receipts?* Truncating after a checkpoint gives a shorter verified size, and leaves are written before the checkpoint covering them; an auditor holding an earlier checkpoint can detect rollback with a consistency proof.
- *Why keep realised cohort sizes out of it?* They depend on who took part and would leak; they live only in run diagnostics.

---

## 19. The release gate

**What it is.** A check that blocks training or release if the privacy budget would be exceeded or a receipt is missing.

**Why it is there.** A budget is only real if something stops you from overspending it.

**How it works.** `ledger/gate.py: ReleaseGate`, wired in `experiments/runner.py: run_one`.
- Before training, `max_rounds_within` finds how many rounds the budget allows, confirmed with PRV and PLD.
- Before each round `authorise_round(round, epsilon_after)` returns False and writes a refusal receipt if epsilon would exceed the budget.
- After each round `record_round` writes a receipt.
- At the end `release(...)` is refused (and the refusal logged) if epsilon spent exceeds the budget or the receipts are not exactly rounds 1 to N; otherwise it logs the release and a signed checkpoint.

**Numbers to remember.** Demonstration: a run configured with 20% more rounds than its noise supports is halted by the gate and the refusal is logged. `prism demo-small` and `prism ledger` both show this. Single-accountant checks once allowed one round too many, so the number of rounds is confirmed with both accountants.

**What it does not do.** Tuning runs are separate lineages; their epsilon is not composed with the final run's, and the report says so. The gate trusts the accountant and the code that calls it.

**Likely questions.**
- *What does the gate do on a failure?* It stops training before the over-budget round, logs a refusal and no model is released.
- *Why check twice?* Once to plan the maximum rounds, once per round.
- *What if I delete the refusal receipt?* Verification fails: leaf order and roots change.

---

## 20. The control gate that marks results INVALID

**What it is.** A rule in the attack experiments: every attack has a positive control (a case where it must succeed) and a negative control (a case where it must fail). If a control misbehaves, the result file is written with status INVALID and the reason.

**Why it is there.** The first inversion result was committed although the attack was broken, because nothing checked that it could work. A low attack score is only meaningful if the same attack scores high where protection is absent.

**How it works.** `experiments/update_leakage.py: _controls`, `membership.py: evaluate_controls`, `poisoning.py`, `gossip.py` (non-private gossip must beat MostPopular by a margin, factor 1.1). The report generator shows a result's status as the experiment wrote it.

**Numbers to remember.** Inversion: AUC at least 0.80 raw, within 0.5 +/- 0.05 masked. Membership: overfit TPR at least 0.02 and AUC at least 0.55; independent AUC within 0.5 +/- 0.03. Poisoning: exposure at least 10 times the clean rate with no defence.

**What it does not do.** The thresholds are our choices, written down in advance, and a passed control does not prove the attack is optimal.

**Likely questions.**
- *Why not just report whatever you get?* Because a broken harness and a strong defence look the same.
- *Who sets the thresholds?* They were set in the design document before the runs.
- *Can a result be both valid and surprising?* Yes. Valid means the harness was shown to detect leakage.

---

## 21. Reproducibility: seeds, atomic writes, config hash

**What it is.** The practices that make a run repeatable and a file trustworthy.

**How it works.**
- **Seeds** (`seeding.py`): every run seed gives independent named streams (`init`, `sampling`, `masking`, `noise`, `attack`) through NumPy `SeedSequence`, keyed by the stream name. Changing how one stream is used never shifts another (a test checks this).
- **Atomic writes** (`io.py`): each file is written to a temporary file in the same folder, flushed and synced, then moved over the target with `os.replace`. A reader never sees a half-written result.
- **Config hash** (`config.py: config_hash`): SHA-256 of the RFC 8785 canonical JSON of the run configuration. It is stored in every record and every ledger receipt. `runner.py: _finished` skips a run only if status is `ok` and the hash matches, so changing a setting re-runs it.
- **Resume and failure:** a failed run is recorded as `failed` and retried next time, never mistaken for done. Other statuses are `accounting_inconsistent`, `ledger_invalid`, `refused_before_first_round`.
- **Record contents:** model SHA-256, thread count, torch version, git commit and `uv.lock` hash (`environment.py`), and a hash of the engine source files (section 28). A record made by different engine code is flagged `stale_code` on resume, and `PRISM_STRICT_RESUME=1` reruns it.

**Numbers to remember.** Same seed and lockfile give identical run records on this PC; across machines, floating-point differences can appear. The Yelp data cannot be shared, so third parties reproduce on synthetic data with `prism demo-small`.

**Likely questions.**
- *Is this reproducible by someone else?* The pipeline yes, with their own copy of Yelp data; the numbers may differ slightly by hardware.
- *Why independent streams?* Otherwise a change in sampling would change the noise too, and results could not be compared.
- *Why atomic writes?* Parallel workers and interrupted runs would otherwise leave half-written results that code treats as finished.

---

## 22. Sensitivity analyses: k-core and 4 stars

**What it is.** Three extra versions of the dataset and a reduced rerun of the privacy-utility experiment (RQ1) on each. `k10` keeps users and businesses with at least 10 interactions, `k20` at least 20, and `stars4` keeps only reviews of 4 stars or more and then applies k = 15. The main dataset is k = 15 with every review counted.

**Why it is there.** The pre-registration promised it. The k = 15 choice and the habit of counting every review as a positive were our decisions, and the headline result (privacy costs a lot at 9,913 users) should not be a side effect of them.

**How it works.**
1. `data/variants.py: VARIANTS` defines the three variants. `select_interactions` applies the star filter, then `filtering.iterative_kcore`. `build_variant` then does the same steps as the main build: the per-user chronological 70/10/20 split (`chronological_split`, leakage check), integer ids, pooled user vectors from train only, and the friend graph restricted to the variant's users.
2. Item text embeddings are not recomputed when avoidable: `_item_vectors` reuses the main build's vectors by business, but only after re-encoding a sample of 64 businesses and checking that the cosine with the stored vector is at least 0.999. That proves the embedded text and model are unchanged.
3. Files go to `data/processed_<name>` (git-ignored). The aggregate card (counts only, no identifiers) goes to `results/sensitivity/<name>/dataset_card.json`.
4. `experiments/sensitivity.py: run` rebuilds each variant if needed, then for each regime and seed trains the non-private reference and one model per epsilon (default epsilon 8 and 1, seeds 0 to 2). The noise multiplier is recalibrated for each variant's user count, so epsilon means the same everywhere. MostPopular and item-item ridge are recomputed on each variant.
5. `conclusion_stable` compares each variant with the main dataset (row "k15", rebuilt from the main run records when they exist): is the H1 verdict at epsilon 8 the same, and does personalisation retained keep its sign?
6. Control: the non-private model must reach at least 1.1 times MostPopular's NDCG@10, otherwise the retention numbers are not interpretable and the file is INVALID.
7. `prism sensitivity --build-only` builds the datasets and trains nothing.

**Numbers to remember.** Users, businesses, interactions: k = 10 has 19,141, 9,950 and 557,772; k = 20 has 6,001, 4,284 and 311,935; 4 stars or more has 5,551, 3,759 and 209,961; the main dataset (k = 15) has 9,913, 6,319 and 410,193. Hyperparameters stayed frozen at the main-dataset values. H1 fails on every variant, so the conclusion does not depend on the filter. The retention figures themselves: see results/report/report.html.

**What it does not do.** No re-tuning on any variant, so a variant of a different size may be favoured or hurt by the frozen settings. Fewer seeds and privacy levels than the main grid, and no clip-only or what-if runs. All variants come from the same Philadelphia sample, so this tests sensitivity to preprocessing, not to another city or platform. The reference row can lack NDCG@20 when it has to be taken from the summary file instead of run records.

**Likely questions.**
- *Why not re-tune on each variant?* Then differences would mix an effect of the data with an effect of tuning. We kept the settings fixed and say that a variant may be favoured or hurt by them.
- *Does a 4-star filter mean "the user liked it"?* It is a rough proxy for positive feedback. The main dataset counts every review as an interaction.
- *What if H1 had passed on a variant?* It would show the conclusion depends on the filter. It failed everywhere, so the claim is stable across these three choices.

---

## 23. The list-length readout

**What it is.** The retention at epsilon 8 and 1, computed from NDCG@20, HR@10 and HR@20 as well as NDCG@10, inside the sensitivity result.

**Why it is there.** An examiner can ask whether the answer depends on looking at a list of 10. This shows retention at two list lengths and with a second metric.

**How it works.** `experiments/sensitivity.py: list_length_readout` takes, per regime and epsilon, the mean private metric over the mean non-private metric across the seeds that both runs share. A missing metric or no shared seed gives `None`, not zero. The values appear per variant as `retention_ndcg@20`, `retention_hr@10` and `retention_hr@20`.

**Numbers to remember.** Retention measured at list length 20 is one to three points lower than at list length 10. The conclusion does not change.

**What it does not do.** It is a readout on the sensitivity runs, not a second hypothesis test, and it has no confidence interval.

**Likely questions.**
- *Why is retention lower at 20?* We measured it and did not test an explanation. The size of the difference (one to three points) is what matters: it does not move any verdict.
- *Is NDCG@10 a cherry-picked cut?* It was fixed in the pre-registration; the readout shows the choice does not change the verdict.

---

## 24. Free-riding clients

**What it is.** A free-rider is a client that takes part in training but does not do the work: it wants the trained model without paying for the computation. We simulate two behaviours. `zero` sends an all-zero update. `noise` sends Gaussian noise rescaled to the mean L2 norm of the honest updates in the same chunk, so its length does not give it away.

**Why it is there.** It was a Should item in the roadmap and a known weakness of open training. It also shows a conflict: the server can only detect a free-rider if it sees individual updates, which secure aggregation prevents.

**How it works.** `attacks/free_riding.py` and `experiments/free_riding.py`.
- `choose_free_riders` picks a prefix of one random permutation, so the sets nest as the fraction grows (it reuses `poisoning.choose_malicious`). `make_free_rider_hook` replaces those clients' updates before clipping.
- All runs are clip-only (no noise) with the plain sum, regime `small`, sampling rate 0.02, 200 rounds, free-rider fractions 0, 0.1 and 0.3, three seeds.
- **Cost:** `_cell` reports the relative drop in overall NDCG@10 against the 0% run.
- **Gain:** the mean NDCG@10 of free-riders minus that of contributors under the same final model, with a bootstrap interval per seed (`bootstrap_difference`). Free-riders still get recommendations from their own history at serving time.
- **Detection:** `detection_scores` gives, for every client-round, the update norm and the cosine similarity to the mean of the other updates in the same chunk, computed on the clipped updates the server would receive. `DetectionCollector` keeps them (with the free-rider label, never user ids) for the last 20 rounds, and `detection_aucs` turns them into the AUC of separating free-riders from contributors (low norm and low cosine are suspicious).
- **Secure aggregation:** the detection result is recorded as `not_applicable`. The server sees only the sum, and one masked vector looks uniformly random (section 11), so there are no per-client norms or cosines to compute. A zero-update client also changes the sum exactly as if it had stayed away.
- **Controls:** the `zero` behaviour must be caught by the norm score (AUC at least 0.95), and the fraction-0 model must reach at least 1.1 times MostPopular. A failure marks the file INVALID. Whether `noise` evades the norm score (AUC within 0.1 of 0.5) and is caught by the cosine score (AUC at least 0.8) is a readout (`noise_readout`), not a control.

**Numbers to remember.** Fractions 0, 10, 30%; 200 rounds at rate 0.02; detection over the last 20 rounds. Cost, gain and AUC values: see results/report/report.html.

**What it does not do.** Only two simple behaviours, and free-riders do not adapt; an adaptive one could imitate honest updates. Clip-only runs have no DP noise, so no privacy guarantee applies. The experiment illustrates a conflict and does not propose a detector. Intervals are min and max over three seeds. The AUCs cover only the last 20 rounds.

**Likely questions.**
- *Why does the noise behaviour use the honest norm?* A zero update is trivially caught by its norm. Matching the norm removes that signal, so we test the next-simplest score, the direction of the update.
- *So can a server defend against free-riding?* Only when it sees individual updates. With secure aggregation it cannot, whatever the score.
- *Is a free-rider hurt by not contributing?* We measure that directly as the gain (free-riders against contributors on the same model); the sign is in the report.

---

## 25. Committee-median aggregation

**What it is.** A middle way between the two earlier robust options (ADR-025, mode c). The cohort is split at random into committees. Each committee's updates are summed, as under secure aggregation, so the server sees only the committee sums. The server then takes the coordinate-wise median of those sums and multiplies it by the number of committees, so the result is on the scale of a plain sum.

**Why it is there.** The coordinate-wise median and the trimmed mean (section 16) need to see every update, so they cannot be used with secure aggregation. A committee hides each update among the others in its committee and still lets the server filter whole committees that look wrong.

**How it works.** `attacks/poisoning.py: make_committee_median` builds a custom aggregator function that `fl/server.py: train` accepts in place of the built-in names, so the engine itself is unchanged. With `committee_size` the number of committees is round(cohort / size); with fewer than two committees it falls back to the plain sum. `clean_committee_share(f, size)` is (1 - f) to the power size: the chance that a committee of random accounts has no attacker when a share f of accounts is attacker-controlled. `experiments/poisoning.py` adds two modes, `committee_median_size4` and `committee_median_size20`, and `committee_tradeoff` collects clean quality, exposure and the clean share per size.

**Numbers to remember.** Chance a committee has no attacker: at 10% attackers 66% for size 4 and 12% for size 20; at 20% attackers 41% and 1.2%; at 30% 24% and 0.08% (plain arithmetic). With the default rate 0.02 a round has about 198 clients, so roughly 50 committees of 4 or 10 committees of 20. The median is robust only while most committees are clean. Measured exposure and quality: see results/report/report.html.

**The trade-off.** A small committee protects an update poorly (hidden among only 3 others) but most committees stay clean, so the median can discard the attacker. A large committee hides each update well (among 19 others) but almost every committee contains an attacker, so the median has little to discard. Neither size gives both.

**What it does not do.** Committees are simulated: the sums are computed in the clear and no secure aggregation protocol runs. There is no DP noise, so no privacy guarantee applies to these modes. Attackers are not adaptive. The server assigns accounts to committees at random; a real deployment would need that assignment to be unpredictable to attackers, or they could cluster in one committee. The median of sums scaled by the committee count is a biased estimate of the true sum.

**Likely questions.**
- *Is this secure aggregation plus robustness?* It combines the two ideas in a simulation. Only the committee sums are visible to the server, but no protocol is run and no noise is added.
- *Why two sizes?* To show the trade-off. One size would hide it.
- *Why is a size-4 committee weak?* An honest-but-curious server that knows 3 members could recover the fourth update by subtraction.

---

## 26. Trace-based availability

**What it is.** The synthetic availability scenarios of section 17 are joined by three that use a real device trace: the FedScale `client_behave_trace`. It lists, for 107,749 devices, the time intervals when each was available. The mean share of time a device is available is 0.21. The file is 25.6 MB.

**Why it is there.** It replaces a hand-made assumption ("availability follows activity") with measured availability patterns, and checks the RQ5 result against it.

**How it works.** `data/traces.py` and `experiments/participation.py`, `fl/availability.py`.
- `trace`: devices are assigned to users at random (`assign_devices`, without replacement because there are more devices than users). A user's join probability is `sample_rate` times the device's active share, floored at 0.05 (`trace_static`).
- `trace_activity`: the same devices, but rank-matched to history length so the most active users get the most available devices (`match_devices_by_rank`).
- `trace_replay`: availability replayed round by round (`trace_schedule`, `availability_schedule`). Each user gets a random device and a random time offset; in round r the user is available if the device is active at offset + r x 1800 seconds (time wraps around the trace length). `replay_hook` zeroes the update of every client that is unavailable. For the SGD server optimiser the rate is multiplied by 1 / (mean availability), a constant that does not depend on user data (`server_lr_factor`); Adam is left alone.
- `trace_readout` compares overall NDCG@10 of the trace scenarios with `independent` and `always`. It is not a control and not part of the H5 verdict.
- The trace file goes at `data/external/fedscale/client_behave_trace`. It is optional: without it the three scenarios are skipped, with a note in the result.

**Why epsilon is exact for random assignment and replay.** The device assignment, the offsets and the schedule are fixed without looking at any user's data. Selection is still Poisson at the nominal rate, and a zero update (from an unavailable client) is within the clipping norm. So the accountant's assumptions hold. **Why it is only nominal for rank-matching.** `trace_activity` gives each user a device by a rank over all users' history lengths. Adding or removing one user shifts other users' ranks and so their devices and probabilities, which the add-or-remove analysis does not allow for. This is the same reason `activity` and `social` are nominal.

**The 30-minute assumption.** One round is taken as 30 minutes, so 400 rounds span about 8.3 days. The real timing of a round is not measured; it is a modelling choice.

**Why a restricted loader.** The trace is a Python pickle from the internet, and loading a pickle can run any code it contains. `RestrictedUnpickler.find_class` allows exactly one global, `collections.OrderedDict`, and refuses everything else. `load_device_traces` also checks the structure (lists of integer intervals, sorted and non-overlapping), keeps only intervals and trace length per device, and drops the device model string. It is never read with `pickle.load`.

**What it does not do.** The devices are not linked to real Yelp users: they come from another population and are assigned by chance (or rank). Devices are sampled without regard to model, region or trace length. The trace is for research use only (the FedScale repository is Apache-2.0, its dataset notes say research use); it lives under `data/`, is git-ignored and is not redistributed. Results: see results/report/report.html.

**Likely questions.**
- *Is this real user behaviour?* Real device behaviour, assigned to Yelp users by us. It shows what measured availability looks like, not what these users do.
- *Why is a zero update allowed in the exactness argument?* Clipping bounds every update by C, and zero is inside that bound, so an unavailable client does not break sensitivity.
- *What if the 30 minutes were 10?* The pattern of who is available per round would change; we did not run that.

---

## 27. Flower parity

**What it is.** A one-off check that the same federated algorithm, run through the Flower framework, gives the same model as our in-process reference. The script is `scripts/flower_parity.py`, the write-up `docs/flower-parity.md`, the result `results/flower_parity.json`.

**Why it is there.** The main experiments use our own engine. A reader may ask whether that engine behaves like a standard framework. Flower is the best-known one.

**How it works.** Flower 1.43.0, simulation runtime, on Windows. Synthetic data (400 users, 300 items, dimension 8), 5 rounds, fixed cohorts precomputed with the engine's own sampling stream, and a fixed per-client history split seeded by (seed, round, client id) on both sides. A custom Flower strategy selects exactly those clients, clips their updates, sums, divides by the expected cohort and takes an SGD step. The reference does the same with prism's own functions (`make_delta_fn`, `clip_rows`, `noisy_mean`). Optionally Gaussian noise is added once per round from the same seeded stream on both sides.

**Numbers to remember.** After five rounds the largest parameter difference between the Flower run and the reference is about 6e-08, with and without noise. That is float32 rounding level, not bit-identical.

**What it does not show.** Nothing about scale: it is a small synthetic problem and five rounds. Not that the client mathematics is right, because the same prism client function runs on both sides. Not equivalence to `prism.fl.server.train` itself (only its aggregation step is checked directly). Nothing about Flower's own differential-privacy wrappers, as clipping and noise are in a custom strategy. Not that cohort selection and splits are equivalent under Flower's own random selection; they were fixed on purpose.

**Why a separate environment.** The project environment is not touched. Flower and its simulation backend are heavy and Ray on Windows is documented as experimental. The script is never imported by `prism` and is not a dependency (ADR-055 still stands). See `docs/flower-parity.md` for the commands.

**Likely questions.**
- *So are you running on Flower?* No. The main results use the in-process engine. Flower is a check of plumbing.
- *Why are the numbers not identical?* Floating-point addition order differs; the gap is about one unit in the last place.
- *Does this validate the privacy accounting?* No. It checks that clipping, summing and the server step agree; the accountants are checked in section 9.

---

## 28. Provenance: the engine hash, stale records and strict resume

**What it is.** A way to tell which code produced a result, independent of git.

**Why it is there.** The independent review (design section 9.5) found that run records did not identify the code that made them, and that a resumed run could silently reuse a record from older code. The records of 17 November also came from code that had not yet been committed, so a git commit alone does not identify them.

**How it works.** `experiments/runner.py`.
- `ENGINE_FILES` lists 21 source files a training run depends on: configuration, seeding, data bundle, model, the round loop and its parts, the accountants, the ledger, metrics, calibration and the runner. `code_sha256` hashes their relative paths and contents (line endings normalised) with SHA-256. It can be recomputed at any commit.
- Experiment, attack and report modules are deliberately not in it, so adding an experiment does not make existing runs stale. Result files carry `payload_provenance`: `engine_sha256`, a `module_sha256` for the experiment module and its helpers, the git commit and a dirty flag.
- Every run record stores `provenance.code_sha256`. `_finished` reuses a record only if its status is ok and its configuration hash matches. It adds `stale_code`, true when the stored engine hash differs from the current one, and also true for records that predate the hash.
- `PRISM_STRICT_RESUME=1` makes `_finished` refuse a stale record, so it is rerun instead of reused.

**Numbers to remember.** 21 engine files. The clean rerun reproduced the earlier numbers exactly; every run record now carries the hash.

**What it does not do.** It is not a signature and proves nothing about who ran the code. It does not cover the data, the lockfile (a separate hash is stored with the environment report) or the experiment modules (their hash is `module_sha256`). A stale flag says the engine changed, not that the results would differ.

**Likely questions.**
- *Why not just the git commit?* The first runs were made before the code was committed, and a dirty working tree has no commit. A content hash works either way.
- *Why leave experiment files out?* A new experiment should not invalidate old runs of other experiments.
- *When would you set strict resume?* Before a final rerun, to be sure nothing is reused from different engine code.

---

## 29. What was cut, and why

Updated on the evening of 17 November 2026 (CHANGE-024): the first group below was cut in the morning and is now built and run.

**Built later the same day (sections 22 to 28):**
- Committee-median robustness mode (ADR-025 mode c).
- The k in {10, 20} sensitivity sweep and the analysis of ratings of 4 stars or more.
- Trace-based availability and the free-riding analysis.
- The Flower parity check, as a separate script and environment.
- Engine provenance hash with stale-record flag and strict resume.

**Still not done:**
- **The dataset provider's pre-publication review.** It stays with the owners and blocks any public use of results.
- **Flower, Ray, RecBole, DVC, MLflow, Streamlit, PyG as dependencies**: listed in the old stack but never installed. Flower's Ray runtime is experimental on Windows and its DP support is a preview; the in-process engine is simpler and testable. Flower is used only in the parity script (section 27).
- **A real secure aggregation protocol**: no secret sharing, no network, no double masking.
- **A hosted dashboard, pushing to GitHub**: the Yelp terms and the project budget (zero) rule them out. The report is a static HTML file.
- **Conference and journal papers**: excluded from all research by the owners' decision on 17 November 2026. The literature review uses standards, agency reports, official documentation, vendor write-ups and repositories only. Because of this, some questions (measured attack rates, formal secure aggregation proofs) are not answered from literature.

**Likely questions.**
- *What would you do next?* Build the real protocol with double masking, test a stronger membership attack, test adaptive attackers and adaptive free-riders, link devices to users with a real deployment's data, and submit the findings to the dataset provider for review.
- *Was committee-median cut?* It was cut in the morning and built in the evening. Poisoning now compares secure sum, trimmed mean, median and two committee sizes (section 25).
- *What is still open?* The dataset provider's pre-publication review, which the owners must arrange. Nothing may be presented or published before it.

---

## If you remember only ten things

1. **The unit of privacy is one user.** Epsilon is about the user's whole history, not one review.
2. **Three lines give the guarantee:** clip every update to norm C, add Gaussian noise once on the sum (z x C), divide by the expected cohort size.
3. **Empty rounds are noised too**, because skipping them would leak who was sampled.
4. **Epsilon assumes ideal Poisson sampling** and excludes hyperparameter tuning, floating-point noise and the participation pattern.
5. **Three accountants must agree;** the value of record is the larger of PRV and PLD at delta = 1/(10 n) (about 1e-5), with delta = 1/n^2 reported too.
6. **The model has 107,679 parameters:** ID embeddings (dimension 16) on a fixed public content base. The earlier content-only model could not personalise.
7. **Privacy has a real cost with 9,913 users.** The pre-registered H1 (at least 90% of non-private quality at epsilon 8) was expected to fail (validation retention about 0.70 and 0.61); the final value is [see report].
8. **Without secure aggregation the server can read histories and friendships from raw updates, and can also spot free-riders and filter attackers;** secure aggregation removes per-user vectors, so it takes all of that away together. Our implementation is a simulation, not a deployable protocol. Committees of clients are a middle way, with a size trade-off.
9. **Every attack has controls.** If the positive control fails, the result is INVALID, so a low score means something.
10. **The ledger proves a record was not altered,** not that training happened as recorded; the gate blocks over-budget rounds and logs the refusal.

---

## Glossary

- **Epsilon (epsilon).** The privacy-loss parameter. Smaller means stronger privacy: the output's probabilities change by at most a factor of e^epsilon when one user is added or removed (except with probability delta).
- **Delta (delta).** The small probability that the epsilon guarantee does not hold. Here 1/(10 n), about 1e-5.
- **Clipping norm (C).** The cap on the L2 length of one user's update. Here 5.0.
- **Noise multiplier (z).** The ratio of the noise's standard deviation to C. The noise on the sum has standard deviation z x C.
- **Cohort.** The users who take part in one round.
- **Sampling rate (q).** The probability that each user joins a round. Here 0.5 (`large`) or 0.05 (`small`).
- **User-level privacy.** The protected unit is a whole user, not one record.
- **Secure aggregation.** A protocol that lets a server compute the sum of updates without seeing any single one.
- **Local versus central privacy.** In local privacy, each user adds noise before sending (no trusted server needed). In central privacy a trusted aggregator adds the noise once to the sum, which gives much better accuracy for the same epsilon.
- **NDCG@10.** Normalised discounted cumulative gain of the top-10 list: higher when the held-out items appear near the top. 1 is perfect, 0 is nothing found.
- **AUC.** Area under the ROC curve: the chance a random positive scores higher than a random negative. 0.5 is chance, 1 is perfect.
- **TPR at 1% FPR.** Of all true members, the share caught when the threshold is set so that only 1% of non-members are wrongly flagged.
- **Merkle root.** The single hash at the top of a Merkle tree; it changes if any leaf changes.
- **Inclusion proof.** A short list of hashes proving that one record is in a Merkle tree with a given root.
- **Retention.** Private NDCG@10 divided by non-private NDCG@10 for the same regime and seed.
- **Personalisation retained.** (private - MostPopular) / (non-private - MostPopular): how much of the gain over the same-list-for-everyone floor survives.
- **Accountant.** A method that adds up privacy loss across rounds. We use PRV, PLD and RDP.
- **Poisson sampling.** Each user joins independently with the same probability.
- **Amplification.** The smaller privacy loss per round that comes from only sometimes including each user.
- **Lineage.** One training run as a chain of rounds under one budget.
- **k-core.** The part of the data left after repeatedly removing users and businesses with fewer than k interactions.
- **Sensitivity analysis.** Repeating an experiment with one choice changed (here k or the star filter) to see whether the conclusion moves.
- **Free-rider.** A client that takes part in training and receives the model but sends an update that costs nothing (zeros, or noise of honest size).
- **Committee.** A random group of clients whose updates are summed together; the server sees only the group sum. The median of committee sums is the robust aggregate.
- **Provenance hash.** A SHA-256 of the engine source files, stored in each run record, that identifies the code that produced it independent of git.
- **Stale record.** A stored run made by engine code that differs from the current code; flagged as `stale_code` and rerun under `PRISM_STRICT_RESUME=1`.
- **Restricted unpickler.** A pickle reader that refuses every global except one named class, so a malicious file cannot run code.
- **Parity check.** A comparison showing two implementations of one algorithm give the same output within floating-point rounding.
