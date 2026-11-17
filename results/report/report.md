# PRISM-Rec: privacy attack and defence measurements for a social-media recommender

Generated 2026-11-17 17:38:25 UTC. Git commit be247fd303f116f1d464fd5bac397e5d7f28d11d. uv.lock sha256 4a11483b5839e22468be078a16640ae2ab9947e89047bf09060accf22a77c466.

## What was measured

PRISM-Rec is a recommender for a social review platform (users, businesses and a friend network). It is trained in a simulated federated setting with user-level differential privacy, and every result below is an aggregate over users. The project measures what privacy costs in accuracy (RQ1), how a gossip design between friends compares (RQ2), what attackers learn from updates and from the trained model (RQ3), how fake accounts can promote an item (RQ4), how uneven availability affects different users (RQ5), and whether a signed ledger can show that privacy budgets were respected (RQ6). Each attack and defence has controls; a failed control marks the whole result INVALID.

### Dataset and friend graph

| Fact | Value |
| --- | --- |
| Users | 9,913 |
| Items (businesses) | 6,319 |
| Interactions | 410,193 |
| Friendships | 70,691 |
| Users with at least one friend | 7,645 |
| Share of users with friends | 0.771 |
| Mean friends per user | 14.3 |

## Hypothesis verdicts

| Hypothesis | Statement | Decisive numbers | Verdict |
| --- | --- | --- | --- |
| H1 | The model at epsilon = 8 retains at least 90% of the non-private NDCG@10 of the same regime. | large: retention 0.778 (threshold 0.90); small: retention 0.645 (threshold 0.90) | not supported |
| H2 | Gossip with local DP has lower NDCG@10 than federated training with central DP at epsilon = 8 (95% interval of the per-user gap excludes 0). | gap 0.0161, 95% interval [0.0133, 0.0190], relative gap 0.737 | supported |
| H3 | At epsilon = 8 membership inference has TPR at 1% FPR of at most 2%, and a server seeing only secure sums of 100 users recovers a history no better than the popularity prior plus 0.05 AUC. | membership TPR@1%FPR 0.0130; secure sum of 100 users: history AUC 0.848 vs prior 0.771 (+0.05 allowed) | not supported |
| H4 | Plaintext trimmed-mean aggregation gives lower target exposure than the secure-sum mode at every attacker share, and the gap is largest at the largest share (30%). | trimmed mean lower at every share: yes; gap largest at the largest share: no | not supported |
| H5 | Availability correlated with activity (or friend count) gives a larger NDCG@10 gap between the top and bottom groups than independent availability, in every seed. | activity: 2 of 5 seeds wider at non-private, 4 of 5 seeds wider at epsilon 8; social: 3 of 5 seeds wider at non-private, 5 of 5 seeds wider at epsilon 8 (sign pattern decides; Wilcoxon is underpowered) | supported |

## Baselines

Status: **VALID**

Reference recommenders that need no training. MostPopular is the floor every model must beat and is also the non-profiling mode; item-item ridge is a collaborative ceiling. Full-catalogue ranking, history items masked.

### Baseline accuracy and variety

| Split | Baseline | NDCG@10 | NDCG@10 95% interval | HR@10 | Recall@20 | Distinct items in top-10 lists |
| --- | --- | --- | --- | --- | --- | --- |
| validation | MostPopular | 0.0181 | [0.0166, 0.0197] | 0.0767 | 0.0438 | 32 |
| validation | ItemKNN | 0.0321 | [0.0302, 0.0342] | 0.1260 | 0.0813 | 3,239 |
| validation | item-item ridge | 0.0358 | [0.0336, 0.0381] | 0.1384 | 0.0911 | 1,334 |
| validation | friends | 0.0185 | [0.0169, 0.0201] | 0.0768 | 0.0466 | 2,348 |
| test | MostPopular | 0.0261 | [0.0247, 0.0276] | 0.1493 | 0.0417 | 33 |
| test | ItemKNN | 0.0402 | [0.0383, 0.0420] | 0.2136 | 0.0708 | 2,902 |
| test | item-item ridge | 0.0452 | [0.0433, 0.0473] | 0.2349 | 0.0784 | 1,418 |
| test | friends | 0.0241 | [0.0226, 0.0255] | 0.1364 | 0.0399 | 2,317 |

Reading: NDCG@10 and HR@10 reward putting held-out items near the top of a list of ten; 'distinct items' counts how many different items appear in anyone's top ten (MostPopular shows the same few to everybody).

Figure: NDCG@10 of each baseline. NDCG@10 per baseline on the validation and test splits; whiskers are 95% bootstrap intervals over users. The value axis starts at zero. (see report.html)

### Limitations

- Rank metrics are computed over the filtered catalogue, so absolute values are higher than they would be over the raw catalogue.

## RQ1: privacy-utility trade-off

Status: **VALID**

A recommender trained with user-level differential privacy at several epsilon levels, in two sampling regimes (sampling rate and rounds), compared with the non-private model of the same regime. Evaluated on the test split, 158 runs.

### Utility at each privacy level

| Regime | Privacy level | Seeds | Epsilon of record | Epsilon at delta 1/n^2 | Epsilon without amplification | NDCG@10 mean | NDCG@10 95% interval | Retention | Personalisation retained | Holm decision |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| large | non-private | 10 | n/a | n/a | n/a | 0.0365 | [0.0363, 0.0367] | n/a | n/a | n/a |
| large | clip only (not private) | 10 | n/a | n/a | n/a | 0.0331 | [0.0329, 0.0334] | 0.908 | 0.677 | n/a |
| large | epsilon 1 | 10 | 1.00 | 1.38 | 2.10 | 0.0181 | [0.0177, 0.0185] | 0.495 | -0.766 | differs from non-private |
| large | epsilon 2 | 10 | 2.00 | 2.72 | 4.24 | 0.0230 | [0.0225, 0.0235] | 0.631 | -0.293 | differs from non-private |
| large | epsilon 4 | 10 | 3.99 | 5.36 | 8.55 | 0.0260 | [0.0256, 0.0265] | 0.714 | -0.002 | differs from non-private |
| large | epsilon 8 | 10 | 7.98 | 10.54 | 17.08 | 0.0284 | [0.0281, 0.0286] | 0.778 | 0.224 | differs from non-private |
| large | epsilon 16 | 10 | 15.97 | 20.72 | 33.46 | 0.0301 | [0.0297, 0.0304] | 0.824 | 0.385 | differs from non-private |
| large | what-if: noise divided by 2 | 3 | n/a | n/a | n/a | 0.0307 | [0.0300, 0.0310] | 0.840 | 0.441 | n/a |
| large | what-if: noise divided by 5 | 3 | n/a | n/a | n/a | 0.0324 | [0.0316, 0.0329] | 0.889 | 0.610 | n/a |
| large | what-if: noise divided by 10 | 3 | n/a | n/a | n/a | 0.0330 | [0.0324, 0.0333] | 0.903 | 0.661 | n/a |
| small | non-private | 10 | n/a | n/a | n/a | 0.0392 | [0.0389, 0.0395] | n/a | n/a | n/a |
| small | clip only (not private) | 10 | n/a | n/a | n/a | 0.0305 | [0.0302, 0.0308] | 0.778 | 0.336 | n/a |
| small | epsilon 1 | 10 | 1.00 | 1.39 | 34.19 | 0.0179 | [0.0169, 0.0188] | 0.455 | -0.625 | differs from non-private |
| small | epsilon 2 | 10 | 2.00 | 2.75 | 79.44 | 0.0214 | [0.0207, 0.0221] | 0.545 | -0.358 | differs from non-private |
| small | epsilon 4 | 10 | 3.99 | 5.47 | 173.35 | 0.0233 | [0.0226, 0.0240] | 0.594 | -0.212 | differs from non-private |
| small | epsilon 8 | 10 | 7.98 | 10.99 | 329.86 | 0.0253 | [0.0247, 0.0259] | 0.645 | -0.059 | differs from non-private |
| small | epsilon 16 | 10 | 15.95 | 21.80 | 561.41 | 0.0269 | [0.0264, 0.0275] | 0.687 | 0.066 | differs from non-private |
| small | what-if: noise divided by 2 | 3 | n/a | n/a | n/a | 0.0279 | [0.0274, 0.0287] | 0.706 | 0.135 | n/a |
| small | what-if: noise divided by 5 | 3 | n/a | n/a | n/a | 0.0295 | [0.0294, 0.0297] | 0.749 | 0.260 | n/a |
| small | what-if: noise divided by 10 | 3 | n/a | n/a | n/a | 0.0299 | [0.0297, 0.0301] | 0.759 | 0.290 | n/a |

Retention is private NDCG@10 divided by non-private NDCG@10 of the same regime. Personalisation retained is (private minus MostPopular) divided by (non-private minus MostPopular): how much of the gain over the same list for everyone survives. The Holm decision compares each level with the non-private model across seeds, adjusted for several comparisons.

Figure: NDCG@10 against epsilon. NDCG@10 of the private model at each epsilon of record, with 95% intervals over seeds. Dotted lines: the non-private model of each regime. Dashed and dash-dotted lines: MostPopular and the item-item ridge baseline. (see report.html)

### Limitations

- A regime is a sampling regime (rate and rounds), not a trust model; central and federated training are the same mechanism under user-level DP.
- The clip-only level is a diagnostic and is not private.
- What-if levels divide the epsilon-8 noise by k to simulate a population about k times larger; they claim no epsilon on this population and are not a guarantee.
- Hyperparameters were tuned on the validation split of the same users without accounting for the privacy cost of tuning.

## RQ2: gossip between friends versus federated training

Status: **VALID**

Training by gossip between friends with local noise on each device, compared with server-based federated training with central noise, on the same users and at the same epsilon. 2,500 nodes, 3 seeds; share of gossip peers who are real friends: 0.517.

### Controls

| Control | What was measured | Measured | Threshold | Result |
| --- | --- | --- | --- | --- |
| gossip beats untrained | non-private gossip NDCG@10 over the untrained starting model, same nodes | gating = yes; gossip_ndcg10 = 0.02214; ratio = 3.776; untrained_ndcg10 = 0.005864 | 1.1 | pass |
| gossip learns | non-private gossip NDCG@10 over MostPopular NDCG@10, same nodes | gating = no; gossip_ndcg10 = 0.02214; most_popular_ndcg10 = 0.02749; ratio = 0.8056; reason = on a few thousand users even the federated model can be below MostPopular, so this comparison measures population size, not whether gossip works | 1.1 | FAIL |
| gossip share of federated | non-private gossip NDCG@10 as a share of the non-private federated model, same nodes | federated_ndcg10 = 0.0282; gating = no; gossip_ndcg10 = 0.02214; ratio = 0.7851; reason = reference only: how much of the server-based quality gossip recovers | n/a | n/a |

### Gossip versus federated training

| Setting | Gossip NDCG@10 | Federated NDCG@10 | MostPopular NDCG@10 | Gap (federated minus gossip) | Gap 95% interval (over users) | Epsilon claimed, gossip (local, add-or-remove) | Epsilon, gossip (local, replace adjacency, sensitivity 2C) | Epsilon of record, federated | Bytes: gossip over federated |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| non-private | 0.0221 | 0.0282 | 0.0275 | 0.0080 | [0.0049, 0.0114] | n/a | n/a | n/a | 60.000 |
| epsilon 8.0 | 0.0054 | 0.0204 | 0.0275 | 0.0161 | [0.0133, 0.0190] | 7.97 | 19.41 | 7.99 | 60.000 |

Figure: Gossip against federated training. NDCG@10 of gossip and federated training at the same epsilon, with MostPopular for scale. The value axis starts at zero. (see report.html)

### Limitations

- Rounds are synchronous: every node updates and mixes at the same time, with no stragglers.
- Only a random sample of users is simulated, not the whole population, so each node has fewer real friends than on the full platform.
- Peer tables use real friends where a node has them and random users otherwise; the share of real friends is reported.
- The local epsilon composes one Gaussian release per round over all rounds, with no amplification by sampling; it is per node and for the node's own data.
- Adjacency: 'gossip_local' uses the project's add-or-remove unit (the neighbouring input is the same node with no data), so the sensitivity is the clipping norm C. 'gossip_local_replace_adjacency' uses the stricter local-DP convention in which any two inputs of one device are neighbours (replace one dataset by another), so the sensitivity is 2C and the same noise gives a larger epsilon. The federated epsilon is add-or-remove.
- Each node is evaluated with its own model on its own history and targets, and the federated model is scored on exactly those users.
- The optimiser and learning rate were chosen on validation data; the clipping norm is the federated regime's, and neither choice is covered by epsilon.
- Adam moments are post-processing of the noisy clipped gradient, so they do not change the local epsilon.
- Moments are gossiped together with the model, tripling the bytes sent.
- Only the non-private comparison with the untrained model gates the result; the comparison with MostPopular is reported but does not gate, because it depends on population size.
- Few seeds: intervals over nodes describe sampling of users, not variation across runs.
- Run records are reused when the configuration matches; records produced on 17 November 2026 predate the commit of the code that produced them.

## RQ3: what update leakage and membership inference reveal

Status: **VALID**

Two attacks on what a trained model or its updates reveal about a user. History recovery and friendship inference try to read a user's own update; membership inference asks whether a user took part in training at all.

### Controls

| Control | What was measured | Measured | Threshold | Result |
| --- | --- | --- | --- | --- |
| masked is chance | mean history AUC from one masked secure-aggregation payload | auc = 0.4991 | auc_within = 0.45, 0.55 | pass |
| raw recovers history | mean history AUC and precision@10 when the server sees the raw clipped update | auc = 0.9999; precision_at_10 = 0.9995; prior_precision_at_10 = 0.0931 | min_auc = 0.8; min_precision_at_10_over_prior = 5 | pass |
| negative independent | attack on a model trained on an independent random half (not the labelled members) | auc = 0.5015 | auc_target = 0.5; tolerance = 0.03 | pass |
| positive overfit | attack on a non-private model trained for many more rounds on A_0 | auc = 0.8553; tpr_at_1pct_fpr = 0.3339 | auc_min = 0.55; tpr_at_1pct_fpr_min = 0.02 | pass |

### History recovery and friendship inference from updates

| Setting | History AUC | History AUC 95% interval | Precision@10 | Popularity prior precision@10 | Popularity prior AUC | Friendship-link AUC | Note |
| --- | --- | --- | --- | --- | --- | --- | --- |
| raw clipped update | 0.9999 | [0.9999, 1.0000] | 0.9995 | 0.0931 | 0.7705 | 0.5798 |  |
| local noise, z = 0.5 | 0.5079 | [0.5042, 0.5116] | 0.0060 | 0.0931 | 0.7705 | 0.4800 |  |
| local noise, z = 1 | 0.5029 | [0.4991, 0.5070] | 0.0055 | 0.0931 | 0.7705 | 0.4869 |  |
| local noise, z = 2 | 0.5013 | [0.4970, 0.5053] | 0.0056 | 0.0931 | 0.7705 | 0.4955 |  |
| local noise, z = 5 | 0.5016 | [0.4977, 0.5054] | 0.0040 | 0.0931 | 0.7705 | 0.5180 |  |
| one masked secure-aggregation payload | 0.4991 | [0.4951, 0.5028] | 0.0046 | 0.0931 | 0.7705 | 0.5135 |  |
| secure sum of 10 users | 0.9679 | [0.9653, 0.9705] | 0.1260 | 0.0931 | 0.7705 | not applicable under secure aggregation |  |
| secure sum of 100 users | 0.8485 | [0.8441, 0.8531] | 0.0557 | 0.0931 | 0.7705 | not applicable under secure aggregation |  |
| secure sum of 100 users plus central DP noise | 0.4992 | [0.4953, 0.5031] | 0.0060 | 0.0931 | 0.7705 | not applicable under secure aggregation |  |
| true histories (reference for the link attack) | n/a | n/a | n/a | n/a | n/a | 0.7512 |  |

### Membership inference

| Privacy level | Claimed epsilon | AUC (mean over seeds) | TPR at 1% FPR | Empirical epsilon lower bound (max over seeds) | Bound within claim |
| --- | --- | --- | --- | --- | --- |
| non-private | n/a | 0.8140 | 0.2498 | 3.02 | yes |
| epsilon 1 | 1.00 | 0.5179 | 0.0122 | 0.07 | yes |
| epsilon 8 | 7.97 | 0.5306 | 0.0130 | 0.00 | yes |

Figure: History recovery against the popularity prior. How well an attacker ranks a user's true items, using the update (solid) versus only item popularity (hatched). The value axis starts at zero. (see report.html)

Figure: Measured leakage against claimed epsilon. The attack's empirical epsilon lower bound (what it provably showed) next to the epsilon the training claims. A bound above the claim would indicate a broken implementation. The value axis starts at zero. (see report.html)

### Limitations

- Updates are single local steps taken at one model state, not a whole training run.
- The server is honest-but-curious: it follows the protocol and only inspects what it receives.
- The secure sum is a simulation of the arithmetic, not a deployable protocol.
- The local-noise epsilon is for one release of one update, not for a whole training run.
- Adjacency: 'single_release_epsilon' uses the project's add-or-remove unit (the neighbouring input is the same user with no data), so the sensitivity is the clipping norm C. 'single_release_epsilon_replace_adjacency' uses the stricter local-DP convention in which any two inputs of one device are neighbours (replace one update by another), so the sensitivity is 2C and the same noise gives a larger epsilon.
- Targets are users with at least two history items; link results use pairs among targets only.
- The attack is a loss-threshold test calibrated with reference models, not the strongest attack possible; a negative result bounds this attack only.
- Training on half the users halves n, so the noise is calibrated for n/2 users; the epsilon tested is that of the half-population model, not of the full-population one.
- Only a few target seeds are used, so per-level spreads are rough.
- The empirical epsilon lower bound joins two one-sided 95% Clopper-Pearson bounds, so its joint confidence is about 90%, not 95%. It is checked on several seeds and levels without correction for multiple looks, and members are an exact half of the users rather than independent draws. It is a sanity check that can detect only large violations of the claimed guarantee, not a 95% statement.
- Reference models are non-private and trained on the same architecture and data distribution, which is generous to the attacker.

## RQ4: fake-account promotion against aggregation modes

Status: **VALID**

Fake accounts try to push one target item into other users' recommendations. Target exposure is measured against the share of fake accounts, for each way the server combines updates.

### Controls

| Control | What was measured | Measured | Threshold | Result |
| --- | --- | --- | --- | --- |
| positive promotion | mean target exposure at fraction 0.3 over the clean mean (floor 1/9913 users) in secure_sum_norm_bound | 8743 | 10 | pass |
| negative clean | largest target exposure at fraction 0 over all modes and seeds | 0.000101 | 0.05 | pass |

### Target exposure and utility by aggregation mode

| Aggregation mode | Attacker share | Target exposure (mean) | Exposure min over seeds | Exposure max over seeds | NDCG@10 | Utility drop vs clean | Exposure over clean |
| --- | --- | --- | --- | --- | --- | --- | --- |
| committee median size20 | 0% | 0.0000 | 0.0000 | 0.0000 | 0.0220 | 0.000 | 0.000 |
| committee median size20 | 10% | 0.8475 | 0.8354 | 0.8613 | 0.0179 | 0.187 | 8401.544 |
| committee median size20 | 20% | 0.9042 | 0.8914 | 0.9194 | 0.0178 | 0.193 | 8963.663 |
| committee median size20 | 30% | 0.9479 | 0.9368 | 0.9605 | 0.0167 | 0.244 | 9396.506 |
| committee median size4 | 0% | 0.0000 | 0.0000 | 0.0000 | 0.0040 | 0.000 | 0.000 |
| committee median size4 | 10% | 0.0003 | 0.0000 | 0.0008 | 0.0032 | 0.198 | 2.597 |
| committee median size4 | 20% | 0.9427 | 0.9309 | 0.9532 | 0.0035 | 0.131 | 9344.642 |
| committee median size4 | 30% | 0.9436 | 0.9418 | 0.9455 | 0.0041 | -0.020 | 9354.061 |
| plaintext median | 0% | 0.0000 | 0.0000 | 0.0001 | 0.0049 | 0.000 | 0.334 |
| plaintext median | 10% | 0.0043 | 0.0000 | 0.0128 | 0.0046 | 0.067 | 42.663 |
| plaintext median | 20% | 0.0486 | 0.0000 | 0.1454 | 0.0039 | 0.200 | 481.290 |
| plaintext median | 30% | 0.1620 | 0.0029 | 0.4740 | 0.0030 | 0.384 | 1605.866 |
| plaintext trimmed mean | 0% | 0.0000 | 0.0000 | 0.0000 | 0.0047 | 0.000 | 0.000 |
| plaintext trimmed mean | 10% | 0.0011 | 0.0000 | 0.0033 | 0.0043 | 0.083 | 11.129 |
| plaintext trimmed mean | 20% | 0.0027 | 0.0000 | 0.0081 | 0.0037 | 0.209 | 27.132 |
| plaintext trimmed mean | 30% | 0.0597 | 0.0033 | 0.1720 | 0.0029 | 0.386 | 592.056 |
| secure sum norm bound | 0% | 0.0000 | 0.0000 | 0.0001 | 0.0279 | 0.000 | 0.334 |
| secure sum norm bound | 10% | 0.9459 | 0.9442 | 0.9490 | 0.0217 | 0.222 | 9377.030 |
| secure sum norm bound | 20% | 0.9537 | 0.9525 | 0.9548 | 0.0212 | 0.238 | 9454.385 |
| secure sum norm bound | 30% | 0.8819 | 0.8166 | 0.9512 | 0.0168 | 0.397 | 8742.661 |

### Committee trade-off

| Committee size | Attacker share | Share of attacker-free committees | Target exposure | Clean NDCG@10 (no attackers) |
| --- | --- | --- | --- | --- |
| 4 | 0% | 1.000 | 0.0000 | 0.0040 |
| 4 | 10% | 0.656 | 0.0003 | 0.0040 |
| 4 | 20% | 0.410 | 0.9427 | 0.0040 |
| 4 | 30% | 0.240 | 0.9436 | 0.0040 |
| 20 | 0% | 1.000 | 0.0000 | 0.0220 |
| 20 | 10% | 0.122 | 0.8475 | 0.0220 |
| 20 | 20% | 0.012 | 0.9042 | 0.0220 |
| 20 | 30% | 0.001 | 0.9479 | 0.0220 |

### Free-riding clients

| Behaviour | Free-rider share | Overall NDCG@10 | Drop vs 0% free-riders | Free-riders minus contributors NDCG@10 | Range over seeds of the 95% interval | Detection AUC by update norm (server sees updates) | Detection AUC by cosine (server sees updates) | Detection under secure aggregation |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| noise | 10% | 0.0294 | 0.021 | -0.0016 | [-0.0088, 0.0075] | 0.988 | 0.508 | not applicable under secure aggregation |
| noise | 30% | 0.0290 | 0.037 | -0.0016 | [-0.0059, 0.0029] | 0.991 | 0.507 | not applicable under secure aggregation |
| zero | 10% | 0.0294 | 0.022 | -0.0017 | [-0.0090, 0.0076] | 1.000 | 0.507 | not applicable under secure aggregation |
| zero | 30% | 0.0291 | 0.033 | -0.0016 | [-0.0061, 0.0031] | 1.000 | 0.503 | not applicable under secure aggregation |

### Free-riding controls

| Control | What was measured | Measured | Threshold | Result |
| --- | --- | --- | --- | --- |
| positive zero detection | lowest norm-based detection AUC of the 'zero' behaviour over fractions and seeds (plaintext updates) | 1 | 0.95 | pass |
| sanity beats most popular | overall NDCG@10 at fraction 0 over MostPopular's NDCG@10 (test split) | 1.153 | 1.1 | pass |

H4 readout: trimmed mean lower at every share: yes; gap largest at the largest share: no.

Free-riding clients send an update that costs nothing (zeros, or noise with the honest norm). NDCG@10 with no free-riders: 0.0301.

Figure: Target exposure against attacker share. Mean target exposure per aggregation mode as the share of fake accounts grows; whiskers span the smallest and largest value over seeds. (see report.html)

### Limitations

- One attack strategy: norm-bounded targeted promotion of a single item.
- Attackers do not adapt to the aggregator; an adaptive attacker could do better against the trimmed mean and the median.
- The robust modes run without DP noise, so no privacy guarantee applies to them.
- Coordinate-wise robust aggregators need the server to see each individual update, which secure aggregation prevents; the robust modes are therefore not compatible with it.
- A committee of 4 hides an individual update among only 3 others, so the committee modes give much weaker secure-aggregation protection than the secure-sum mode.
- Committees are simulated: the committee sums are computed in the clear in this simulation, no secure-aggregation protocol runs.
- The committee modes add no DP noise, so no privacy guarantee applies to them.
- Three seeds by default; min and max over seeds are reported, not confidence intervals.
- Run records are reused when the configuration matches; records produced on 17 November 2026 predate the commit of the code that produced them.
- Exposure is the share of other users whose top-10 contains the target, on one target item per seed drawn from the least popular third.
- Two simple free-riding behaviours (all zeros; noise with the honest mean norm).
- Free-riders do not adapt to detection; an adaptive free-rider could imitate honest updates.
- Detection needs the server to see individual updates, so it is unavailable under secure aggregation; this is the conflict the experiment illustrates, not a detector proposal.
- Detection scores are computed on the clipped updates a server would receive, over the last 20 rounds only.
- Clip-only runs with the plain sum: no DP noise, so no privacy guarantee applies.
- Three seeds by default; min and max over seeds are reported, per-seed bootstrap intervals treat users as independent draws.
- Run records are reused when the configuration matches; records produced on 17 November 2026 predate the commit of the code that produced them.

## RQ5: availability and participation bias

Status: **VALID**

Clients are not always available. When availability follows activity or friend count, does the model serve the less available groups worse? Groups are thirds of history length (activity) and bands of friend count (degree).

### Controls

| Control | What was measured | Measured | Threshold | Result |
| --- | --- | --- | --- | --- |
| baseline | non-private 'always' NDCG@10 over MostPopular NDCG@10, test split | model = 0.03942; most_popular = 0.02606; ratio = 1.512 | at least 1.2x | pass |
| sampling | realised mean cohort / (sample_rate x sum of availability), seed 0 | 14 cells, ratio 0.995 to 1 | within 15% of 1 | pass |

### NDCG@10 by group and scenario

| Scenario | Privacy level | Epsilon of record | Overall NDCG@10 | Activity groups NDCG@10 (least / middle / most active) | Activity gap (most minus least) | Friend-count groups NDCG@10 (0 / 1 to 5 / more than 5) | Friend-count gap | Paired Wilcoxon p, activity gap vs independent (underpowered: min 0.0625 with 5 seeds) | Epsilon note |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| always | non-private | n/a | 0.0394 | 0.0333 / 0.0367 / 0.0483 | 0.0150 | 0.0319 / 0.0361 / 0.0469 | 0.0150 | 0.0625 | non-private run |
| always | epsilon 8 | 7.98 | 0.0250 | 0.0185 / 0.0226 / 0.0338 | 0.0153 | 0.0169 / 0.0224 / 0.0321 | 0.0152 | 0.3125 | epsilon 8 holds: availability is independent of user data |
| independent | non-private | n/a | 0.0372 | 0.0317 / 0.0345 / 0.0454 | 0.0137 | 0.0301 / 0.0342 / 0.0443 | 0.0141 | n/a | non-private run |
| independent | epsilon 8 | 7.98 | 0.0223 | 0.0161 / 0.0199 / 0.0309 | 0.0148 | 0.0159 / 0.0199 / 0.0283 | 0.0124 | n/a | epsilon 8 holds: availability is independent of user data |
| activity | non-private | n/a | 0.0385 | 0.0335 / 0.0349 / 0.0470 | 0.0135 | 0.0310 / 0.0353 / 0.0458 | 0.0149 | 1.0000 | non-private run |
| activity | epsilon 8 | 7.98 | 0.0222 | 0.0158 / 0.0195 / 0.0312 | 0.0154 | 0.0154 / 0.0199 / 0.0284 | 0.0130 | 0.1250 | epsilon 8 is NOMINAL: availability here is a rank over all users, so adding or removing one user shifts other users' inclusion probabilities and the add-or-remove analysis does not hold for anyone |
| social | non-private | n/a | 0.0367 | 0.0313 / 0.0338 / 0.0450 | 0.0137 | 0.0295 / 0.0323 / 0.0450 | 0.0154 | 1.0000 | non-private run |
| social | epsilon 8 | 7.98 | 0.0223 | 0.0165 / 0.0201 / 0.0304 | 0.0139 | 0.0154 / 0.0198 / 0.0287 | 0.0133 | 0.1875 | epsilon 8 is NOMINAL: availability here is a rank over all users, so adding or removing one user shifts other users' inclusion probabilities and the add-or-remove analysis does not hold for anyone |
| trace | non-private | n/a | 0.0325 | 0.0273 / 0.0294 / 0.0408 | 0.0135 | 0.0259 / 0.0295 / 0.0393 | 0.0133 | 1.0000 | non-private run |
| trace | epsilon 8 | 7.98 | 0.0168 | 0.0114 / 0.0145 / 0.0244 | 0.0129 | 0.0115 / 0.0148 / 0.0217 | 0.0102 | 0.3125 | epsilon 8 is EXACT: devices are assigned to users at random, independently of their data |
| trace_activity | non-private | n/a | 0.0353 | 0.0298 / 0.0317 / 0.0443 | 0.0145 | 0.0281 / 0.0320 / 0.0425 | 0.0144 | 0.4375 | non-private run |
| trace_activity | epsilon 8 | 7.98 | 0.0160 | 0.0107 / 0.0136 / 0.0237 | 0.0130 | 0.0104 / 0.0140 / 0.0213 | 0.0109 | 0.4375 | epsilon 8 is NOMINAL: availability here is a rank over all users, so adding or removing one user shifts other users' inclusion probabilities and the add-or-remove analysis does not hold for anyone |
| trace_replay | non-private | n/a | 0.0302 | 0.0257 / 0.0276 / 0.0374 | 0.0117 | 0.0232 / 0.0280 / 0.0364 | 0.0132 | 0.1250 | non-private run |
| trace_replay | epsilon 8 | 7.98 | 0.0160 | 0.0105 / 0.0141 / 0.0236 | 0.0131 | 0.0107 / 0.0138 / 0.0213 | 0.0106 | 0.3125 | epsilon 8 is EXACT: devices, offsets and schedule do not depend on user data, selection is Poisson at the nominal rate and a zero update is within the clipping norm |

### Mean availability by scenario

| Scenario | Mean availability | By activity group (least / middle / most active) | By friend-count group (0 / 1 to 5 / more than 5) |
| --- | --- | --- | --- |
| always | 1.000 | 1.000 / 1.000 / 1.000 | 1.000 / 1.000 / 1.000 |
| independent | 0.500 | 0.500 / 0.500 / 0.500 | 0.500 / 0.500 / 0.500 |
| activity | 0.500 | 0.201 / 0.499 / 0.800 | 0.352 / 0.434 / 0.649 |
| social | 0.500 | 0.372 / 0.453 / 0.675 | 0.153 / 0.425 / 0.772 |
| trace | 0.209 | 0.208 / 0.210 / 0.210 | 0.209 / 0.208 / 0.211 |
| trace_activity | 0.209 | 0.083 / 0.183 / 0.362 | 0.137 / 0.170 / 0.289 |
| trace_replay | 0.208 | 0.206 / 0.209 / 0.208 | 0.207 / 0.206 / 0.209 |

### Trace readout

| Privacy level | trace NDCG@10 | trace_replay NDCG@10 | independent NDCG@10 | always NDCG@10 | trace minus independent | trace_replay minus independent | Seeds where rank-matching widens the activity gap (trace_activity vs trace) | Mean change of the activity gap |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| non-private | 0.0325 | 0.0302 | 0.0372 | 0.0394 | -0.0047 | -0.0070 | 3 of 5 | 0.0010 |
| epsilon 8 | 0.0168 | 0.0160 | 0.0223 | 0.0250 | -0.0055 | -0.0063 | 3 of 5 | 0.0001 |

Device trace: 107,749 devices, mean active share 0.206; one training round is 1,800 seconds of trace time (an assumption). Epsilon is exact for trace and trace_replay and nominal for trace_activity.

H5 rule: Preregistration Amendment 1: 'Paired across seeds. With 5 seeds the two-sided Wilcoxon p cannot go below 0.0625, so the sign pattern (5 of 5) is reported as the evidence and the test is reported as underpowered.' Implemented as: H5 holds if, for at least one correlated scenario (activity with activity groups, social with friend-count groups) at either epsilon level, every seed's top-minus-bottom gap is larger than under independent availability.

H5 sign pattern: activity: 2 of 5 seeds wider at non-private, 4 of 5 seeds wider at epsilon 8; social: 3 of 5 seeds wider at non-private, 5 of 5 seeds wider at epsilon 8.

Figure: NDCG@10 by activity group (epsilon 8). NDCG@10 of the least, middle and most active thirds of users under each availability scenario. The value axis starts at zero. (see report.html)

### Limitations

- The epsilon shown for the 'activity' and 'social' scenarios is NOMINAL and the add-or-remove analysis does not hold for anyone in them. Availability there is a RANK over all users, so adding or removing one user shifts the ranks, and therefore the inclusion probabilities, of other users too; the noise was calibrated as if every inclusion probability were fixed.
- The per-run records and the signed ledger releases of these runs carry the epsilon without a 'nominal' marker; only this file marks it (records written after this change also carry privacy_note and availability_scenario).
- Availability in the 'always', 'independent', 'activity' and 'social' scenarios is synthetic (rank-based, deterministic), not measured from device traces.
- The 'trace_activity' epsilon is NOMINAL for the same reason as 'activity': devices are matched to users by a rank over all users' history lengths. The 'trace' and 'trace_replay' epsilons are exact: the assignment, the offsets and the schedule do not depend on user data, selection is still Poisson at the nominal rate, and a zero update is within the clipping norm.
- The device trace comes from a different population of devices: devices are assigned to Yelp users at random (or by rank), and there is no real link between a user and a device.
- One training round = 30 minutes (1800 s) in the 'trace_replay' scenario, so 400 rounds span about 8.3 days; this mapping is a modelling choice, not measured, and traces are read cyclically (time modulo the trace length).
- Devices are sampled from the 107,749 devices of the trace without regard to device model, region or trace length.
- In 'trace_replay' the server still divides by the full expected cohort. For runs whose server optimiser is SGD the rate is multiplied by 1 / (mean availability over the schedule), which exactly restores the step size; for Adam runs the rate is left alone because Adam rescales the average itself (its epsilon constant is then relatively larger). The factor used is stored in each run record as server_lr_factor.
- The trace is for research use only (the FedScale repository dataset notes; the repository licence is Apache-2.0); the file is under data/, is git-ignored and is never redistributed.
- Groups are terciles of history length or fixed friend-count bands (0, 1 to 5, more than 5).
- Five seeds: a two-sided Wilcoxon test over five seeds cannot go below p = 0.0625, so the decision rests on the sign pattern.
- Run records are reused when the configuration matches; records produced on 17 November 2026 predate the commit of the code that produced them.

## RQ6: signed ledger audit

Status: **VALID**

Every private run writes a signed, append-only ledger of its privacy receipts. The audit verifies every ledger, checks that each private run ended in a release receipt, flips single bytes to see whether tampering is detected, and measures what the log costs.

### Controls

| Control | What was measured | Measured | Threshold | Result |
| --- | --- | --- | --- | --- |
| all ledgers verify | n/a | n/a | n/a | pass |
| every tamper detected | n/a | rate = 1 | n/a | pass |
| over budget run is blocked | n/a | n/a | n/a | pass |
| receipt coverage is 100 percent | n/a | coverage = 1 | n/a | pass |

### Ledger audit

| Measurement | Value |
| --- | --- |
| Ledgers verified | 162 of 162 |
| Round receipts | 42,920 |
| Release receipts | 162 |
| Refusal receipts | 0 |
| Ledger bytes per round | 304.0 |
| Private runs | 162 |
| Private runs without a valid release receipt | 0 |
| Receipt coverage | 1.000 |
| Single-byte tampers tried | 300 |
| Tampers detected | 300 |
| Detection rate | 1.000 |
| Append time per receipt (ms) | 2.62 |
| Whole-ledger verification time (s) | 0.028 |
| Inclusion proof size (bytes) | 320 |
| Mean share of run time spent on receipts | 0.0055 |
| Blocked-release demo: rounds asked | 33 |
| Blocked-release demo: rounds allowed by budget | 27 |
| Blocked-release demo: rounds completed | 27 |
| Blocked-release demo: release blocked | yes |

Figure: Tamper detection. Single bytes flipped one at a time in a copy of one ledger; every flip should be detected. The value axis starts at zero. (see report.html)

### Limitations

- The log shows what was recorded and that it was not altered; it does not prove the training ran as recorded, and it provides no confidentiality.
- One signing key on one machine: an operator who holds the key can write a different log from scratch. Publishing checkpoints to an outside witness would close this.
- Tamper detection is tested with single-byte flips of one ledger file.
- The blocked-release demonstration runs on the synthetic dataset.

## Sensitivity: k-core and positive-feedback variants

Status: **VALID**

The privacy-utility result is repeated on variants of the dataset: the k-core filter at k = 10 and k = 20 (the main dataset uses k = 15) and a variant keeping only reviews of 4 stars or more. Hyperparameters stay frozen at the values tuned on the main dataset. The question is whether the epsilon 8 conclusion changes.

### Controls

| Control | What was measured | Measured | Threshold | Result |
| --- | --- | --- | --- | --- |
| k10 large | non-private NDCG@10 divided by MostPopular NDCG@10 | regime = large; value = 1.581; variant = k10 | 1.1 | pass |
| k10 small | non-private NDCG@10 divided by MostPopular NDCG@10 | regime = small; value = 1.666; variant = k10 | 1.1 | pass |
| k20 large | non-private NDCG@10 divided by MostPopular NDCG@10 | regime = large; value = 1.328; variant = k20 | 1.1 | pass |
| k20 small | non-private NDCG@10 divided by MostPopular NDCG@10 | regime = small; value = 1.379; variant = k20 | 1.1 | pass |
| stars4 large | non-private NDCG@10 divided by MostPopular NDCG@10 | regime = large; value = 1.26; variant = stars4 | 1.1 | pass |
| stars4 small | non-private NDCG@10 divided by MostPopular NDCG@10 | regime = small; value = 1.272; variant = stars4 | 1.1 | pass |

### Dataset variants at epsilon 8

| Variant | Regime | Users | Items | Interactions | MostPopular NDCG@10 | Item-item ridge NDCG@10 | Non-private NDCG@10 | NDCG@10 at epsilon 8 | Retention at list length 10 | Retention at list length 20 | Personalisation retained | H1 verdict same as main dataset |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| k-core 10 | large | 19,141 | 9,950 | 537,666 | 0.0198 | 0.0376 | 0.0313 | 0.0238 | 0.762 | 0.758 | 0.352 | yes |
| k-core 10 | small | 19,141 | 9,950 | 537,666 | 0.0198 | 0.0376 | 0.0330 | 0.0212 | 0.643 | 0.623 | 0.106 | yes |
| k-core 15 (main dataset, reference) | large | 9,913 | 6,319 | 410,193 | 0.0261 | 0.0452 | 0.0365 | 0.0283 | 0.776 | 0.757 | 0.215 | n/a |
| k-core 15 (main dataset, reference) | small | 9,913 | 6,319 | 410,193 | 0.0261 | 0.0452 | 0.0395 | 0.0246 | 0.624 | 0.610 | -0.109 | n/a |
| k-core 20 | large | 6,001 | 4,284 | 299,332 | 0.0317 | 0.0522 | 0.0421 | 0.0338 | 0.802 | 0.774 | 0.199 | yes |
| k-core 20 | small | 6,001 | 4,284 | 299,332 | 0.0317 | 0.0522 | 0.0438 | 0.0298 | 0.682 | 0.648 | -0.157 | yes |
| 4 stars or more | large | 5,551 | 3,759 | 202,903 | 0.0302 | 0.0447 | 0.0380 | 0.0315 | 0.828 | 0.811 | 0.167 | yes |
| 4 stars or more | small | 5,551 | 3,759 | 202,903 | 0.0302 | 0.0447 | 0.0384 | 0.0273 | 0.713 | 0.707 | -0.344 | yes |

Figure: Retention at epsilon 8 by dataset variant. Private NDCG@10 divided by non-private NDCG@10 at epsilon 8 for each dataset variant and regime. The dashed line is the 0.90 target of H1. The value axis starts at zero. (see report.html)

### Limitations

- Hyperparameters (rounds, sample rate, learning rates, clip norm) stay frozen at the values tuned on the main dataset; no re-tuning was done on any variant, so a variant with different size or sparsity may be favoured or hurt by them.
- The reduced experiment uses fewer seeds and privacy levels than the main grid, and no clip-only or what-if runs.
- Noise is recalibrated for each variant's user count, so epsilon means the same on every dataset but the noise per user differs.
- The k-core and positive-feedback variants are subsets (or supersets) of the same Philadelphia Yelp sample; they test sensitivity to preprocessing, not to the city or the platform.
- The reference row k15 is the main dataset, taken from the main run records restricted to the seeds of this run when they exist, and may carry no NDCG@20.

## Framework parity

Status: **VALID**

The same federated rounds were run through the Flower framework (version 1.43.0, simulation runtime (flwr.simulation.run_simulation, Ray backend, message-based Strategy/ServerApp/ClientApp API)) and through the in-process reference, on a small synthetic problem (400 clients, 5 rounds). The check asks whether the final model parameters agree within a tolerance of atol 1e-06 and rtol 1e-05. The main experiments still use the in-process engine.

### Flower against the in-process reference

| Variant | Max absolute difference | Relative L2 difference | Within tolerance |
| --- | --- | --- | --- |
| engine step, noise multiplier 0 | 0.000000000 | n/a | yes |
| engine step, noise multiplier 1 | 0.000000000 | n/a | yes |
| gaussian | 0.000000060 | 0.000000048 | yes |
| noise free | 0.000000060 | 0.000000043 | yes |

### Limitations

- The problem is a small synthetic dataset (400 users, 300 items) and only five rounds.
- Server-side clipping and aggregation are implemented as a custom Flower strategy, not with Flower's built-in differential-privacy wrappers.
- Cohort selection and the client-side visible/hidden split are fixed to remove framework-controlled randomness, and the client update function is the same prism code on both sides, so the check covers the federated plumbing and the aggregation rule, not the client mathematics.
- The reference is not prism.fl.server.train itself, whose split uses one shared stream; its aggregation step is checked separately against noisy_mean and the engine's SGD step.
- The main experiments still use the in-process engine.

## Provenance

Status: **VALID**

Which code produced each result file, and whether the training runs match the current engine.

### Provenance of experiment results

| Experiment | Engine hash | Module hash | Commit | Working tree dirty |
| --- | --- | --- | --- | --- |
| privacy_utility | bd8c92813d7b | aa60ce2f2ca6 | be247fd3 | yes |
| gossip | bd8c92813d7b | 037e019c9ca9 | be247fd3 | yes |
| update_leakage | bd8c92813d7b | 95bd6ca0bd85 | be247fd3 | yes |
| membership | bd8c92813d7b | 53712760a764 | be247fd3 | yes |
| poisoning | bd8c92813d7b | cbc306947ffc | be247fd3 | yes |
| participation | bd8c92813d7b | 3bae8efe0d82 | be247fd3 | yes |
| ledger_audit | bd8c92813d7b | 576b21576254 | be247fd3 | yes |
| dataset_card | n/a | n/a | 8c621640 | yes |
| sensitivity | bd8c92813d7b | a99051dfd482 | be247fd3 | yes |
| free_riding | bd8c92813d7b | 49d99b8d337d | be247fd3 | yes |

324 of 353 run records carry a code hash; 324 of those 324 equal the current engine hash (bd8c92813d7b). A record's code hash is computed from the contents of the engine source files, so it can be recomputed at any commit.

## How to read the privacy numbers

The unit of privacy is one user: the guarantee hides whether one user's whole history was used in training, not a single review.

Delta is 1/(10 n) for n users in the training population. The epsilon of record is the larger of two independent accountants (a privacy-loss-distribution accountant and a Renyi accountant), so it is the more cautious of the two. 'Epsilon at delta 1/n^2' is the same mechanism at a much smaller delta, and 'without amplification' ignores the benefit of sampling users each round.

Not covered by epsilon: the choice of hyperparameters and clipping norm, which was made on the same users; floating-point effects of the noise generator; the assumption of ideal Poisson sampling of clients; and the diagnostics blocks, which a deployment would not release.

## Not done

- Pre-publication review by the dataset provider (owners' task, required before any publication).
