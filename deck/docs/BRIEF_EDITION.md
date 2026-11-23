# The brief edition: PRISM-Rec in Brief

The brief edition is the same deck cut to thirty slides for a talk of about fifteen minutes. It
is not a subset of the full deck's slides. Each brief slide sits at the place of one full slide
(its host) and reuses that topic's 3D scene, but it has its own headline, text and figure, written
to carry the main points of the whole topic or of the group of full slides named below.

Open it with `?edition=brief`, or build with `VITE_EDITION=brief`.

## How a brief slide is written

A slide of a theory folder may carry a `brief` variant (`BriefDef` in `src/deck/types.ts`):

```ts
{
  id: "dp/3", kind: "theory", title: "Clipping bounds one user's influence", ..., Panel: ClipPanel,
  brief: { title: "Clip each user, then add noise once", Panel: BriefMechanismPanel, step: 3 },
},
```

`title` and `Panel` are required. `Stage`, `layout`, `badge`, `sources`, `pose` and `step` are
optional and fall back to the host slide. A variant with a `Stage` uses the "stage" layout (text
left, figure card over the dimmed scene) unless it sets `layout`. The components live in
`brief.tsx` in the theory folder. The full deck never shows a variant, and the brief edition
never shows the host's own panel.

## Rules for every brief slide

1. One headline (`H`) that states the finding or the idea as a full sentence.
2. Text of 120 words at most (the test limit is 130): two short paragraphs, or one paragraph and a
   `List` of four items at most. At most one `Note`. A slide read from the back of a room has no
   space for more.
3. It carries the main points of the full slides named for it below. Leave out the detail; keep the
   idea, the number that settles it and the limit that matters.
4. It stands alone. Every term is explained in a few words where it first appears in the brief
   edition (the order of the thirty slides is the table below). No pointer to a slide the brief
   edition does not have. "The next slide" only when that slide follows in the table.
5. No number is typed. Every figure comes from `m()`, `raw()` or `fact()` in `src/data`, formatted
   with `fmt`. Take the accessors from the topic's existing panels.
6. A slide whose text or figure shows a measured or computed number has `badge: "measured"` or
   `"computed"` and lists its `sources`.
7. The figure (`Stage`) reuses the topic's chart components. Where two results are merged, show
   one figure and a `StatRow`, or two small figures side by side. Nothing may scroll, and text is
   never smaller than the ui kit makes it.
8. The scene: pick the `step` and `pose` that show the most telling state of the topic's scene.
   One control (`Choice` or `Slider`) is welcome where it makes the scene or the chart clearer.
9. Plain words. No "not X but Y", no dashes as punctuation, no closing one-liner that repeats the
   paragraph, none of: crucial, key (adjective), robust (figurative), seamless, leverage, landscape,
   highlight, showcase, delve.

## The thirty slides

| # | Host | Carries | What it must say and show |
|---|---|---|---|
| 1 | `intro/1` | title | Unchanged: title, authors, guide, the line that links to the full deck. |
| 2 | `intro/3` | `intro/2`, `intro/3` | The problem: a social recommender learns from what people do and whom they know. Collecting that centrally is the risk. Federated training keeps histories on the device, but updates, the released model and fake accounts each open an attack. The project measures six questions (name them in a few words each). |
| 3 | `intro/4` | `intro/4` | What leaks and to whom: a curious server reads updates, an outsider tests the released model, fake accounts and free-riders act from inside. Pair each with its defence (secure sum, differential privacy, robust aggregation). |
| 4 | `intro/5` | `intro/5` | The data: Yelp Open Dataset, Philadelphia area. Users, businesses, interactions, friendships. The 15-core filter and the split by time. Why a dataset with a friend network. |
| 5 | `intro/6` | `intro/6` | The system end to end: data, model, federated rounds with clipping and noise, three accountants, signed ledger with a release gate, then attacks and evaluation. Everything is a simulation on one PC. |
| 6 | `model/4` | `model/1` to `model/4` | The model: a user is the mean of the item vectors in their history; training hides half the history and predicts it; the model is small on purpose. Result: NDCG@10 without privacy against MostPopular, ItemKNN and item-item ridge; content alone fell back to popularity. Explain NDCG@10 in one clause. |
| 7 | `fed/1` | `fed/1` to `fed/3` | One federated round: sample users independently, each takes one local step, the update is clipped, the server sums and steps. Two regimes: large cohort (half the users, 40 rounds) and small cohort (5%, 400 rounds). An empty round still counts. |
| 8 | `leak/1` | `leak/1` to `leak/3` | What one update gives away. History inversion: the items of the history show in the bias and embedding rows of the update. Friendship links: friends' updates point the same way (cosine). |
| 9 | `leak/4` | `leak/4` | Measured: a raw update gives the history away (AUC and precision in the top 10), against the popularity prior. The link attack: AUC from updates and from full histories. Explain AUC in one clause. |
| 10 | `secagg/1` | `secagg/1` to `secagg/4` | Secure sum: every pair of users shares a mask that one adds and the other subtracts, so masks cancel in the sum and the server sees only the total. A dropped user is handled. What it does not hide: the sum itself. This is a simulation of the arithmetic. |
| 11 | `secagg/5` | `secagg/5` | The defence ladder, measured: one masked update at chance; a sum of 10 and a sum of 100 still leak (hypothesis H3's secure-sum part misses its threshold); a sum of 100 with noise at chance. The link attack cannot run under a secure sum. |
| 12 | `mia/1` | `mia/1` to `mia/3` | Membership inference: an outsider asks whether a user was in the training set by comparing the model's loss on that user with reference models. The figure that counts is the true-positive rate at 1% false positives. Two controls keep the attack honest. |
| 13 | `mia/4` | `mia/4`, `mia/5` | Measured: the attack against the non-private model, at epsilon 8 and at epsilon 1, against chance. H3's membership part holds. The empirical lower bound on epsilon stays under the claim. |
| 14 | `dp/1` | `dp/1`, `dp/2` | Differential privacy: with or without one user's whole history, the result looks almost the same. Epsilon bounds the change (smaller is more private), delta is the small chance the bound fails. The unit here is a whole user. |
| 15 | `dp/3` | `dp/3`, `dp/4`, `fed/2` | The mechanism: clip every user's update to length C, add Gaussian noise once to the sum, sample users independently each round. One user can move the sum by at most C. |
| 16 | `dp/5` | `dp/5` | Measured: the privacy and accuracy curve in both regimes. Retention at epsilon 8 against the 90% target of H1: not supported. Where the private model falls to the level of MostPopular. Clipping alone already costs accuracy. |
| 17 | `dp/6` | `dp/6`, `dp/7` | Why, and whether it is the data: dividing the noise by ten (about ten times more users per round) recovers the target in the large-cohort regime only; the verdict is the same on the dataset variants (k = 10, k = 20, 4 stars or more). The what-if runs are simulations, not guarantees. |
| 18 | `acct/1` | `acct/1` to `acct/4` | Accounting: epsilon is computed from the noise, the sampling rate and the number of rounds. Three accountants from two separate libraries must agree, and the larger of the two tight values is reported. The same run read at the stricter delta and without sampling amplification. |
| 19 | `poison/1` | `poison/1` to `poison/4` | Fake accounts push one business with norm-bounded updates. Robust aggregation (trimmed mean, median) needs to see every update, so it cannot run under a secure sum. A coordinate-wise median erases the sparse signal a recommender learns from. Committee median as the attempted compromise. |
| 20 | `poison/5` | `poison/5` | Measured: share of honest users shown the promoted business, by aggregation mode and attacker share. Secure sum with a norm bound gives no protection; trimmed mean and median hold it low; neither committee size holds. |
| 21 | `poison/6` | `poison/6` | What the defence costs: accuracy with no attackers under each mode. Trimmed mean and median leave an almost useless model. H4: lower at every share, but not largest at the largest share, so not supported as stated. |
| 22 | `freeride/3` | `freeride/1` to `freeride/4` | Free-riders take the model and send nothing useful (zeros, or noise of honest size). They cost the others little and lose almost nothing. A server that sees updates catches them by update size; under a secure sum it cannot. |
| 23 | `gossip/1` | `gossip/1` to `gossip/3` | Gossip: no server. Each user averages the model with a few peers, friends where possible. Every node adds its own noise before sending, and there is no sampling to reduce the privacy cost. |
| 24 | `gossip/4` | `gossip/4`, `gossip/5` | Measured on 2,500 users: gossip against server-based training, without privacy and at epsilon 8; about 60 times more bytes. H2 supported. Both private models are below MostPopular on these users. |
| 25 | `part/3` | `part/1` to `part/5` | Who takes part: availability from a device trace and from synthetic scenarios. Accuracy with everyone available, a random half, the trace and the trace replayed, without privacy and at epsilon 8. The gap between the most and least active users. H5: supported by the sign rule in one cell of four, weak evidence. |
| 26 | `ledger/5` | `ledger/1` to `ledger/5` | The ledger: a signed receipt for every round in an append-only Merkle log; the release gate stops training before the budget is exceeded. Audit: every ledger verifies, every single-byte change in a copy is caught, the cost per receipt, the over-budget run that was stopped. What a ledger does not prove. |
| 27 | `method/1` | `method/1` to `method/4` | Why the numbers can be trusted: hypotheses and thresholds written down before the reported model was evaluated on the test split; settings frozen on validation data; every attack has controls and a failed control marks a run INVALID; several seeds with intervals; every result records the code that made it, and a rerun gave the same numbers. |
| 28 | `outro/2` | `intro/7`, `outro/2` | What we found: the five hypotheses with their verdicts, read from the verdict data of the opening (H1 not supported, H2 supported, H3 split: the membership part held and the secure-sum part did not, H4 not supported as stated, H5 weakly supported), and the two trade-offs in one picture: privacy against accuracy, and hidden updates against filtering attackers. |
| 29 | `outro/7` | `outro/6`, `outro/7` | Limits and what is not claimed: a simulation in one process on one city of one dataset; the secure sum is simulated; each attack is one method; epsilon excludes tuning. The dataset provider's review has not been requested. |
| 30 | `outro/10` | thanks | Thank you, the guide, and the link to the full deck. No button to a slide the brief edition lacks. |

## Checks

- `src/deck/brief.test.tsx` reads the brief edition as its audience does: thirty slides at most,
  no code slide, every slide but the title and the thank-you has a brief variant, every panel is
  within the word limit, and no slide points at one the edition does not have.
- Each theory folder tests its own brief slides with `briefOf(theory)` from `src/test/renderTheory`.
- `e2e/brief.spec.ts` walks the edition in a browser, and `node e2e/overflow.mjs --edition brief`
  checks that nothing scrolls or is cut off at six window sizes.
