# PRISM-Rec Explained: interactive 3D slide deck — design

Date: 18 November 2026. Status: **approved by the owner on 18 November 2026 and built
on 19 November 2026**. As built the deck had 88 slides, not 65: the builders added a
slide wherever a panel would otherwise have been crammed, as section 6 requires. Four more
(introduction, problem statement, the data, thank you) were added on the owner's request
the same day, so it now has 92. On the same request every scroller was removed (sizes scale
with the window) and the counter shows the slide number inside its topic only. On
22 November 2026 a short edition was added, "PRISM-Rec in Brief": 30 of the same slides,
selected by a list of ids in `deck/src/deck/editions.ts`, with no code slides. The
slide list as built is in `deck/README.md`; the storyboard in section 7 is the brief it
was built from.

## 1. Intent

A slide-based web application that explains, one concept at a time, how PRISM-Rec
("Privacy Attack and Defence in Social Media") works, what each concept measurably did
in our experiments, and where it lives in the code. It is meant to be presented from a
laptop (project review, viva) and also read alone by someone who was not in the room.

Why: the report (`results/report/report.html`) holds every number but explains nothing
visually. A reviewer should be able to *see* a clipped update, a cancelled mask, a
Merkle proof, and then see the measured consequence and the function that does it.

## 2. Goals, non-goals, anti-goals

Goals

- Every core concept gets its own sequence: theory slides with a live 3D scene, then
  impact slides with measured numbers and interactive charts, then code slides.
- Every number on an impact slide is read from the project's result files at build
  time. Every code reference is extracted from the real source with its real line
  numbers.
- Smooth on this laptop: 60 frames per second target in every scene, camera flights
  between slides, keyboard-first navigation.
- Works with no internet (fonts, maths rendering and data are bundled).

Non-goals

- No public hosting. The repository is private and the dataset provider's
  pre-publication review is still open; the deck runs locally (`npm run dev`, or the
  static `dist/` folder).
- No training in the browser on real data. Browser simulations are small toy models.
- No phone layout. Target is a laptop or projector, 1280×720 and up.

Anti-goals (these would make it a failure even if it runs)

- A number on a slide that cannot be traced to a result file.
- A toy simulation that looks like a measured result. Every panel carries one of
  three badges: **Measured** (a number from the project's experiments, with its
  source file), **Computed** (produced at export time by the project's own code, for
  example the accounting surface) or **Illustration** (a toy model running in the
  browser). Theory slides are Illustration unless section 7 says otherwise. Code
  slides carry a fourth badge, **Project source**: the code shown is copied from
  `src/prism` at build time with its real line numbers (added during the build,
  because "Measured" is the wrong word for code).
- Hiding the negative results. H1 and H4 failed; the deck says so as plainly as the
  report does.
- Citing conference or journal papers, or framing the project by department. Sources
  named on slides are standards (RFC 6962, RFC 8785), library documentation and the
  project's own files.
- Any row of the dataset, any user or business identifier, or the device trace in the
  deck. Only aggregates already committed under `results/` are used.

## 3. Approaches considered

| | Approach | Trade-off | Verdict |
|---|---|---|---|
| A | One persistent 3D canvas behind HTML slides; scenes sit at "stations" in one continuous world; the camera flies between stations | Real camera transitions, one WebGL context, shared lighting and look. Needs discipline about what is mounted | **Chosen** |
| B | A separate canvas per slide | Simple isolation, but a hitch on every slide change, no camera continuity, browsers cap the number of WebGL contexts | Rejected |
| C | One long scroll-driven page | Cinematic, but poor for presenting slide by slide and it hijacks scrolling | Rejected: the request is slide-based |
| D | A deck library (reveal.js, Spectacle) with canvases embedded | Deck features for free, but its slide transitions fight a shared 3D camera | Rejected |

The owner asked for a modern 3D stack and left the choice to me; A is my call.

## 4. Stack (my calls)

- **Location:** `deck/` at the repository root, its own `package.json`.
- **Build:** Vite, React 19, TypeScript (strict).
- **3D:** three, @react-three/fiber 9, @react-three/drei 10.
- **Motion:** GSAP with `@gsap/react` (`useGSAP`) owns everything inside the 3D world
  (camera flights, scene timelines). Motion (`motion/react`) owns HTML (slide text
  enter and exit, panels, shared-element transitions). One owner per property.
- **State:** zustand (`{ create }`), selectors only. Animation values live in refs,
  never in React state.
- **Charts:** hand-built SVG components with d3-scale and d3-shape, so charts match
  the look and respond to hover, toggles and sliders. No chart library.
- **Maths:** KaTeX. **Code:** a small highlighter with the Python grammar only.
- **Fonts:** bundled through @fontsource. Display: Bricolage Grotesque. Text: Atkinson
  Hyperlegible (drawn for legibility, which suits a projector). Code: JetBrains Mono
  with ligatures off. (Changed during the build from Fraunces and IBM Plex: a serif
  display face on a pale panel is the look every generated page reaches for, and this
  deck should not be mistaken for one.)
- **Tests:** pytest (data export), Vitest and React Testing Library (logic and
  components), Playwright driving the installed Microsoft Edge (end to end).
- Versions are the current stable releases at install time, pinned by the lock file.

Design skills. Six skills from `freshtechbro/claudedesignskills` are installed as
project skills in `.claude/skills/` (threejs-webgl, react-three-fiber,
gsap-scrolltrigger, motion-framer, web3d-integration-patterns, modern-web-design); the
full repository is in `_workspace/vendor/`. Their generator scripts are not run. Rules
taken from them and applied here: single canvas with HTML overlay; refs not state for
per-frame values; no `setState` in `useFrame`; one library per animated property; kill
GSAP timelines on unmount; instanced meshes for crowds; memoised geometry and
materials; capped pixel ratio; reduced-motion support; visible focus rings; transform
and opacity only for HTML animation; motion timings 150 / 250 / 400 ms. Where the
skill files are out of date, current APIs are used instead: `motion/react` not
`framer-motion`, zustand's named `create`, and no `framer-motion-3d`. The skills are
reference material, not a contract: where one conflicts with a current library
version or with this document, the library documentation and this document win.

## 5. Architecture

```
deck/
  scripts/export_data.py     reads results/*.json and src/prism/**/*.py, writes src/data/
  src/
    data/                    results.json, code.json, accounting_grid.json (generated, committed)
    deck/                    slide registry, navigation store, keyboard, hash routing
    world/                   Canvas, camera rig, stations, lighting, shared materials
    ui/                      slide frame, text panel, controls, badges, charts, code view
    sim/                     pure TypeScript simulations (no React, no three)
    theories/<id>/           slides.tsx, Scene.tsx, charts, one folder per concept
  e2e/                       Playwright walk-through
```

- **Slide registry.** Each slide is data: id, theory, kind (`theory` | `impact` |
  `code` | `extra`), camera pose, scene state, panel content. The shell renders
  whatever the registry holds; a test enforces the per-theory order
  theory → impact → code.
- **World and camera.** Each theory owns a station at a fixed position in one world.
  A slide change tweens camera position and look-at target with GSAP (about 1.2 s,
  `power3.inOut`); within a theory the camera makes small moves, between theories it
  flies. The current station and its neighbours are mounted; stations further away
  are unmounted and their GPU resources disposed. Orbit by drag is allowed inside a
  slide and eases back to the slide's pose on the next slide change.
- **Simulations.** Everything a scene animates is computed by a pure function in
  `sim/` with a seeded random generator, so it is testable without a browser and the
  same on every run.
- **Data export.** `uv run python deck/scripts/export_data.py` produces three files:
  `results.json` (the measured numbers, each with its source file and key),
  `code.json` (function source and exact line range, found with Python's `ast`, so
  references cannot go stale), and `accounting_grid.json` (epsilon over a grid of
  noise multiplier and rounds for both sampling rates, computed with the project's
  own `pld_epsilon`; labelled on the slide as the PLD accountant, not the value of
  record). The three files are committed so the deck builds without Python.
  - *Where numbers may come from.* `results/*.json` first. Counts over
    `results/runs/` (records, code hashes) are computed by the script. The few numbers
    that live only in documents (171 s → 29 s in `docs/adr/ADR-045-fast-clipped-sum.md`;
    test count and coverage in `README.md`) are listed in
    `deck/scripts/documented_facts.json` with the file and the exact sentence they are
    quoted from; a test fails if that sentence is no longer in that file. Nothing is
    typed into a slide by hand.
  - *Slide to source.* The builder derives the mapping from section 7 and records it
    in the registry: every Measured value names its file and key. Seed counts differ
    by experiment (10 for the privacy–utility grid, 3 to 5 elsewhere); each chart
    prints the seed count read from its own result file.
  - *Code keys* are `path::qualified name`, for example
    `privacy/accounting.py::calibrate_noise` (the function of that name in
    `privacy/dp.py` is the older helper and is not the one shown on slide 7.4).
  - *Scenes and real data.* No dataset rows reach the deck. The friend graph on slide
    0.1 is generated in the browser to match the summary statistics in
    `results/social_graph.json` and is badged Illustration, with the measured
    statistics captioned. The surface on 7.1 is Computed. The activity bands on 11.2
    use the measured per-group accuracy in `results/participation.json` and are
    badged Measured.
- **Navigation.** Right / Space / PageDown next, Left / PageUp back, Home and End,
  `O` overview grid, `F` fullscreen, `T` light or dark theme (light for projectors),
  `R` reset the current scene. The address bar holds the slide (`#/dp/2`), so a
  reload or a shared link lands on the same slide. A rail along the bottom shows the
  theories and the position inside the current one.
- **Fallbacks.** With reduced motion requested, camera moves cut instead of fly and
  scenes show their end state with step buttons. Without WebGL, the scene area shows
  one hand-drawn SVG schematic per station (13 in all, not a picture per slide) and
  all text, charts and code still work.

## 6. Look

A city at dusk seen from above: users are points of light, the model is a structure
the lights feed. Deep indigo background shading to plum at the horizon, text set
directly on it in a column on the left third (no card), the scene filling the rest.
Colour carries meaning and is the same everywhere: sodium amber for honest users,
aqua for protected or private signals, pink-red for attackers, lavender grey for
noise, receipt green for the ledger, pale lilac for the shared model. A light theme (key `T`)
keeps the same roles for washed-out projectors. Text contrast at least 7:1.

```
+------------------------------------------------------------------+
| 06 Differential privacy              Theory 2 of 3  [Illustration]|
| +------------------------+                                        |
| | Headline               |                                        |
| | Up to ~130 words,      |        live 3D scene, full bleed       |
| | formulas, edge cases   |        drag to orbit, hover to inspect |
| | ---------------------- |                                        |
| | clip C   o-------  5.0 |                                        |
| | noise z  ---o----  0.92|        [ step ]  [ play ]  [ reset ]   |
| +------------------------+                                        |
| o o o o o O o o o o o o o   theories            <  31 / 62  >     |
+------------------------------------------------------------------+
```

A panel holds about 130 words at most. More explanation means another slide, never
smaller type.

## 7. Storyboard

Kinds: **T** theory with live 3D, **I** impact, **C** code, **X** extra. Numbers shown
here are the measured values the slides will load from `results/`.

### Opening (4 slides, X)

| # | Slide | Scene and interaction |
|---|---|---|
| 0.1 | Title: Privacy Attack and Defence in Social Media | The city of lights assembles into a friend graph with the measured shape (9,913 users, mean degree 14.3, median 3, 23% with no friends). Drag to orbit |
| 0.2 | The problem: what a recommender learns about you, and what leaks | One user's light sends its history to a server; three leak paths light up in red (the update, the model, the friends) |
| 0.3 | The system end to end | Data-flow walk-through: device → local update → clip → mask → secure sum → noise → model → ledger → release. Each stage is clickable and jumps to its theory |
| 0.4 | What we found | Scoreboard of H1–H5 with verdicts (H1 not supported, H2 supported, H3 split, H4 not supported as stated, H5 weakly supported). Click a row to jump to the evidence |

### 1. The hybrid recommender (4 slides)

| # | Kind | Content | Scene and interaction |
|---|---|---|---|
| 1.1 | T | Item vector = fixed text projection + trainable ID embedding; user vector = normalised mean of history item vectors; score = 20 × cosine + item bias | Items as a 3D point cloud. Click items to add or remove them from a user's history; the user arrow moves and the top-10 lights up |
| 1.2 | T | Training: hide a random half of the history, softmax over the whole catalogue with visible items masked; why content alone collapsed to popularity | Half the history dims (hidden), the model pulls the arrow toward the hidden items. Slider: temperature. Toggle: content only / IDs only / hybrid |
| 1.3 | I | Test NDCG@10: MostPopular 0.0261, friends 0.0241, ItemKNN 0.0402, item ridge 0.0452, federated non-private 0.0365 (large) and 0.0392 (small). The archived content-only version for contrast | Bar chart with confidence intervals; toggle NDCG@10 / NDCG@20 / HR@20 |
| 1.4 | C | `models/hybrid.py`: `Layout`, `item_vectors`, `user_loss`, `score_matrix`. 107,679 parameters split 101,104 / 256 / 6,319 | Code view with the parameter vector drawn as three labelled blocks |

### 2. A federated round (4 slides)

| # | Kind | Content | Scene and interaction |
|---|---|---|---|
| 2.1 | T | Data stays on the device; each round a Poisson sample of users computes an update; the server averages and steps | Devices orbit a central model. Step through one round: sample, compute, send, aggregate, apply. Slider: sampling rate q |
| 2.2 | T | Why Poisson and not a fixed-size cohort; the divisor is the expected cohort (a public constant); the empty-cohort case; the two frozen regimes | Run 50 rounds: cohort size histogram builds live. Toggle regime: large (q 0.5, 40 rounds) / small (q 0.05, 400 rounds) |
| 2.3 | I | Closed-form clipped sum: 171 s → 29 s per run. Parity with Flower: largest difference 5.96e-08. Both regimes' non-private accuracy | Before / after bars; parity as a per-round overlay |
| 2.4 | C | `fl/sampling.py: poisson_cohort`, `fl/client.py: make_delta_fn`, `fl/fast.py: clipped_sum_fast`, `fl/server.py: train` | Call-flow diagram of one round, each box opens its code |

### 3. Attack: what one update reveals (4 slides)

| # | Kind | Content | Scene and interaction |
|---|---|---|---|
| 3.1 | T | History inversion: an update moves exactly the items the user touched, so the server can read the history back | A single update drawn as columns over the item grid; the touched items stand out. Attacker's ranked guess versus the truth |
| 3.2 | T | Friendship-link inference: friends' updates point the same way; cosine similarity as a link score. Why this is the social-media leak | Two users' update arrows; drag one to see the cosine and the link guess. Graph edges recolour as guessed / missed |
| 3.3 | I | Raw update: AUC 1.000, precision@10 1.000 (prior 0.771 / 0.093). Links: AUC 0.58 from updates, 0.751 from histories | Defence ladder chart, first rung only (raw); the next theory adds rungs |
| 3.4 | C | `attacks/inversion.py: history_scores, recovery_metrics`, `attacks/links.py: pair_cosine, link_inference`, `experiments/update_leakage.py` | Code view |

### 4. Defence: secure sum (5 slides)

| # | Kind | Content | Scene and interaction |
|---|---|---|---|
| 4.1 | T | Pairwise masks: each pair of users shares a secret; one adds the mask, the other subtracts it; the masks cancel only in the sum | Ring of 6 users with mask threads between pairs. Real arithmetic modulo 2^64 shown live. Toggle "server's view" to see only noise-like values |
| 4.2 | T | Key agreement (X25519), key derivation (HKDF), mask stream (ChaCha20), fixed-point encoding; what happens when a user drops out | Knock a user out mid-round: the others reveal that user's seeds and the sum still closes |
| 4.3 | T | What a secure sum does not hide: the sum itself. Small cohorts still leak | Slider: cohort size 1 → 100; the one user's columns from 3.1 fade into the sum, but not fully |
| 4.4 | I | Masked single update: AUC ≈ 0.50. Sum of 10: 0.968. Sum of 100: 0.848 (H3 allowed 0.821, so this part of H3 fails). Sum of 100 with noise: 0.499 | Defence ladder, all rungs, with the H3 threshold line |
| 4.5 | C | `fl/secagg.py: FixedPoint, SecAggClient.masked_update, SecAggServer.unmask, secure_sum`; the `cryptography` library | Code view. States plainly: a simulation of the protocol in one process, not a network deployment |

### 5. Attack: membership inference (4 slides)

| # | Kind | Content | Scene and interaction |
|---|---|---|---|
| 5.1 | T | Was this user in the training set? Members have lower loss. Threshold test at user level | Two loss distributions as 3D ridges (members, non-members). Drag the threshold plane: true and false positive rates update live |
| 5.2 | T | Calibrating with reference models; why the figure of merit is the true positive rate at 1% false positives, not AUC; the controls (over-fitted model must be caught, independent data must score chance); turning attack success into a lower bound on epsilon | Slider: privacy level; the two ridges slide together. Toggle raw / calibrated |
| 5.3 | I | Non-private: AUC 0.814, TPR at 1% FPR 25.0%. Epsilon 8: 0.531, 1.3%. Epsilon 1: 0.518, 1.2%. Controls: 33% / 0.855 and 0.5015 | Grouped bars with seed ranges; control row shown beside |
| 5.4 | C | `attacks/membership.py: losses_for_models, calibrate_scores, summarise_scores`, `eval/stats.py: clopper_pearson, epsilon_lower_bound` | Code view |

### 6. Defence: user-level differential privacy (6 slides)

| # | Kind | Content | Scene and interaction |
|---|---|---|---|
| 6.1 | T | The promise: the output looks almost the same with or without any one user's whole history. Epsilon and delta in words, then formally | Two worlds side by side, one missing a user; their output clouds overlap. Slider: epsilon |
| 6.2 | T | Clipping: scale each user's whole update to norm at most C = 5, which bounds one user's influence | Update arrows and a sphere of radius C; long arrows are pulled back to the surface. Slider: C. Shows the share of users clipped |
| 6.3 | T | Noise: Gaussian noise of scale z × C added once to the sum, then divide by the expected cohort. Edge cases: empty cohort still gets noise; the divisor is never the realised count; delta = 1/(10n) | The summed arrow jitters inside a noise cloud. Slider: z. Toggle "remove one user": the cloud barely moves |
| 6.4 | I | Privacy–utility curve, 10 seeds: large regime 0.0181 (ε 1), 0.0260 (ε 4), 0.0284 (ε 8), 0.0301 (ε 16) against 0.0365 non-private. Retention at ε 8: 0.778, below the 0.90 that H1 required. Small regime: 0.645 | Interactive curve with intervals; toggle regime; hover a point for noise multiplier and paired test |
| 6.5 | I | What would fix it: ten times the users gives retention 0.903 (noise simulation, no privacy claim). Sensitivity: k-core 10 / 15 / 20 and 4-star data; H1 fails in all | What-if slider (×1, ×2, ×5, ×10 users); small multiples for the sensitivity variants |
| 6.6 | C | `privacy/dp.py: clip_l2`, `fl/aggregate.py: clip_rows, noisy_mean`, `fl/fast.py: update_norms` | Code view with the three lines that are the mechanism highlighted |

### 7. Privacy accounting (4 slides)

| # | Kind | Content | Scene and interaction |
|---|---|---|---|
| 7.1 | T | Every round spends budget; sampling amplifies privacy; rounds compose. Epsilon as a function of noise, sampling rate and rounds | A 3D surface of epsilon over noise multiplier and rounds, from the exported grid. Sliders move a marker; the ε = 8 contour is drawn on the surface |
| 7.2 | T | Three accountants (PRV, RDP, PLD) and the agreement gate; the value of record is the larger of PRV and PLD; calibration by search | Three needles on one gauge; a gate that turns red if they disagree by more than the tolerance |
| 7.3 | I | The same run reported three ways: ε 8 at δ = 1/(10n); about 10.5–11.0 at δ = 1/n²; 17 (large) and 330 (small) without amplification. Calibrated noise multipliers per target | Table with a toggle for the δ convention; bar for the unamplified cost |
| 7.4 | C | `privacy/accounting.py: epsilon_report, check_gate, calibrate_noise, max_rounds_within`; Opacus and dp-accounting | Code view |

### 8. Attack and defence: poisoning (5 slides)

| # | Kind | Content | Scene and interaction |
|---|---|---|---|
| 8.1 | T | Target-item promotion: a few fake users push one item into everyone's top 10; under a secure sum the server cannot inspect them | Honest updates as a cloud, attackers as a red cluster pushing one direction. Slider: attacker share 0–30% |
| 8.2 | T | Robust aggregation: trimmed mean and coordinate-wise median; why they need plaintext updates, and why they erase a sparse signal | Aggregator selector (sum / trimmed mean / median): the aggregate arrow is recomputed live from the same cloud |
| 8.3 | T | Committee median: secure sum inside small committees, median across committees. The trade between committee size, clean-committee share and accuracy | Users are dealt into committees; a committee turns red if it holds an attacker. Slider: committee size 4–20 |
| 8.4 | I | Secure sum, 10% attackers: target in 94.6% of top-10 lists. Trimmed mean: 0.1% / 0.27% / 6%, but clean NDCG falls from 0.0279 to 0.0047. Committees of 4: 0.03% at 10% but 94% at 20% and above. H4 not supported as stated | Exposure against attacker share for five modes; a second axis for the accuracy each mode costs |
| 8.5 | C | `attacks/poisoning.py: make_promotion_hook, target_exposure, make_committee_median`, `fl/aggregate.py: robust_total` | Code view |

### 9. Free-riding (3 slides)

| # | Kind | Content | Scene and interaction |
|---|---|---|---|
| 9.1 | T | Users who send nothing useful (zeros, or noise with an honest-looking norm) but keep the model; two detectors: update norm and cosine to the aggregate | A ring of devices; free-riders send hollow packets. Toggle zero / noise; a detector readout per device |
| 9.2 | I | 10% free-riders: NDCG 0.0301 → 0.0294 (−2.2%). 30%: about 0.0290. Norm detector AUC 1.000 (zero) and 0.99 (noise); cosine about 0.51 | Bars for accuracy; detector AUC dials |
| 9.3 | C | `attacks/free_riding.py: make_free_rider_hook, detection_scores, detection_aucs` | Code view |

### 10. No server at all: gossip learning (4 slides)

| # | Kind | Content | Scene and interaction |
|---|---|---|---|
| 10.1 | T | Each user keeps a model and averages with a few peers each round; peers come from the friend graph plus random contacts | The friend graph; model state as colour diffusing along edges until the graph agrees. Slider: peers per round. Step / play |
| 10.2 | T | Why plain gossip did not learn and what fixed it (decentralised Adam with gossiped moments); local noise at every node and why that costs far more privacy than central noise | Toggle the optimiser: colours converge or stall. Toggle local noise: the picture turns to static |
| 10.3 | I | 2,500 users, 3 seeds. Non-private 0.0221 against 0.0282 federated. At ε 8: 0.0054 against 0.0204; gap 0.0161 [0.0133, 0.0190]; 60 times the bytes. H2 supported | Paired bars with the interval; a bytes-on-the-wire comparison |
| 10.4 | C | `fl/gossip.py: gossip_train, mix_into, privatise_updates`, `data/social.py: SocialGraph.peer_table` | Code view |

### 11. Who actually takes part (4 slides)

| # | Kind | Content | Scene and interaction |
|---|---|---|---|
| 11.1 | T | Devices are not always available. Seven scenarios, from always-on to a replayed real device trace; availability tied to activity or to friendships | The city over a day: lights switch on and off by scenario. Scenario selector; a clock slider |
| 11.2 | T | The fairness question: do less active users get a worse model? How the gap is measured; what the privacy figure means when availability is uneven | Users sorted into activity bands; band height is accuracy. Switch scenario and watch the bands move |
| 11.3 | I | NDCG at ε 8: always 0.0250, independent 0.0223, trace 0.0168, trace replay 0.0160 (non-private 0.0394 / 0.0372 / 0.0325 / 0.0302). Gap between activity groups about 0.014. H5 weakly supported | Scenario bars with a private / non-private toggle; gap chart per seed |
| 11.4 | C | `fl/availability.py: availability_vector, match_devices_by_rank, group_gap`, `data/traces.py: load_device_traces` (restricted loader) | Code view |

### 12. The transparency ledger (5 slides)

| # | Kind | Content | Scene and interaction |
|---|---|---|---|
| 12.1 | T | Every round leaves a signed receipt in an append-only Merkle log (RFC 6962); the root commits to everything | A Merkle tree grows as receipts are appended. Real SHA-256 computed in the browser. Button: append |
| 12.2 | T | Inclusion and consistency proofs; canonical JSON (RFC 8785) and Ed25519 signatures; what a tamper looks like | Click a leaf: its proof path lights up and verifies. Button "flip one byte": the root no longer matches and the break is shown |
| 12.3 | T | The release gate: a round is authorised only if the budget allows it; a model is released only with a complete receipt chain. What the ledger cannot prove | A budget bar fills round by round; at round 27 of 33 the gate closes and a refusal receipt is written |
| 12.4 | I | 162 of 162 ledgers verify; receipt coverage 100%; 300 of 300 tampers detected; 2.6 ms per receipt; a proof is 10 hashes, 320 bytes | Four dials and a cost breakdown |
| 12.5 | C | `ledger/merkle.py: inclusion_proof, verify_consistency`, `ledger/receipts.py: canonical_bytes, sign`, `ledger/log.py: Ledger, verify_ledger`, `ledger/gate.py: ReleaseGate` | Code view |

### 13. How we know: the evaluation method (3 slides)

| # | Kind | Content | Scene and interaction |
|---|---|---|---|
| 13.1 | T | Hypotheses and decision rules written before the test split was touched; hyperparameters frozen on validation; controls that mark a run VALID or INVALID; 10 seeds for the main grid and 3 to 5 elsewhere, bootstrap intervals, Holm correction | A pipeline with gates; drop a failing control in and the result is stamped INVALID |
| 13.2 | I | 353 run records, 324 carrying the engine code hash; about 750 tests; coverage 86% overall and 95% on privacy-critical code; a clean rerun reproduced every number | Provenance chain from a number on a slide back to its run record and code hash |
| 13.3 | C | `experiments/runner.py: run_one, code_sha256, ENGINE_FILES`, `eval/stats.py: paired_tests, holm_adjust`, `PREREGISTRATION.md`, `experiments/frozen.json` | Code view |

### Closing (6 slides, X)

| # | Slide | Scene and interaction |
|---|---|---|
| 14.1 | Live sandbox | A complete toy federation in the browser (60 users, 40 items): sliders for noise, attacker share, aggregator and cohort size; accuracy, target exposure and epsilon update as it trains. Badge: Illustration |
| 14.2 | Trade-offs in one picture | Privacy, utility and robustness as three axes; every measured configuration is a point. Hover for the numbers, click to jump to its slide |
| 14.3 | Failure modes | Four short replays: small cohorts without amplification (ε 330), a robust aggregator that erases the model, gossip under local noise, a blocked release |
| 14.4 | The full stack | Python 3.12, PyTorch, Opacus, dp-accounting, cryptography, Flower (parity only), uv, pytest and Hypothesis, ruff, mypy; how the packages depend on each other |
| 14.5 | Limits and what is not claimed | The limitations lists from the result files, grouped; what is still open (the dataset provider's review) |
| 14.6 | Reproduce it | The commands, and where each result file comes from |

Total: 65 slides (4 opening, 55 across 13 theories, 6 closing), 13 stations, about 30
interactive scene states.

## 8. Quality bar

- **Performance.** The laptop is a Core i5-12500H with an RTX 3050 and Iris Xe
  graphics, 1920×1080. Pass mark, measured in a real browser window on this laptop
  at 1920×1080 with each scene animating: median frame time at most 16.7 ms and 95th
  percentile at most 25 ms on every slide. The browser may pick the integrated
  graphics, so the budget is set for that. Crowds are instanced (at most about 2,000
  instances); pixel ratio capped at 1.75; rendering pauses when nothing moves; no
  per-frame allocation; no post-processing unless it stays inside the pass mark. The
  headless end-to-end run also records frame times, as a report only.
- **Accessibility.** Everything reachable by keyboard; visible focus; reduced motion
  honoured; controls are real inputs with labels; charts carry a text summary.
- **Truthfulness.** Tests fail if a slide references a result key or a function that
  does not exist, or if an impact slide has no Measured badge.
- **Tests first.** Each simulation and each registry rule gets its test before its
  code. End to end: walk all 65 slides, no console errors, a canvas present, a
  screenshot per slide, and one pass with reduced motion.

## 9. Build order

1. Data export script and its tests.
2. Shell: registry, navigation, world, camera rig, panel, controls, charts, code
   view, with two placeholder stations to prove flights and fallbacks.
3. The thirteen theory folders, built in parallel by sub-agents against the shell
   (each folder is self-contained), then the opening and closing slides.
4. Integration, end-to-end run, frame-time pass, visual polish, README section.

The whole deck is delivered in one pass. Theories are built in the order of section 7,
so if anything has to slip it is the closing extras, never a theory's
theory → impact → code sequence.

## 10. Left to the builder

Exact camera poses and station positions; chart micro-interactions; the wording of
each panel (bounded by section 7 and the result files); the highlighter library;
whether a subtle bloom survives the frame-rate check.
