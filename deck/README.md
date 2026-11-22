# PRISM-Rec Explained

An interactive 3D slide deck that explains the project one concept at a time. Each concept
runs in the same order: the theory with a live 3D scene you can manipulate, then the
measured impact with interactive charts, then the code that implements it.

92 slides: an opening with the introduction and problem statement, thirteen concepts, and a
closing with a live sandbox and a thank-you slide.

| # | Concept | Slides |
|---|---|---|
| | Opening: title, introduction, problem statement, what leaks, the data, the system, what we found | 7 |
| 1 | The hybrid recommender | 5 |
| 2 | A federated round | 4 |
| 3 | Attack: what one update reveals | 5 |
| 4 | Defence: secure sum | 6 |
| 5 | Attack: membership inference | 6 |
| 6 | Defence: differential privacy | 8 |
| 7 | Privacy accounting | 5 |
| 8 | Poisoning and robust aggregation | 7 |
| 9 | Free-riding | 5 |
| 10 | Gossip learning without a server | 6 |
| 11 | Who actually takes part | 7 |
| 12 | The transparency ledger | 6 |
| 13 | How we know: the method | 5 |
| | Closing: sandbox, trade-offs, failure modes, stack, limits, reproduce, thank you | 10 |

## Run it

Node.js 20 or newer. From this folder:

```
npm install
npm run dev
```

Open http://localhost:5173. For a copy that needs no development server:

```
npm run build
npm run preview
```

and open http://localhost:4173. The deck needs no internet connection once installed:
fonts, formulas, data and code excerpts are all bundled.

**Public since 19 November 2026.** The owners made the repository public and hosted the deck
at https://prism-rec-deck.vercel.app to share it with the guide. The deck contains no row of the dataset, only
aggregate results already under `results/`, and the source of every function in `src/prism`
(the code slides read it from `src/data/code.json`). The dataset provider's pre-publication
review had not been done when this was decided; see CHANGE-025 in `PROJECT_ROADMAP.md`.

## Hosting (Vercel)

Two Vercel projects build the `deck` folder of the `main` branch on every push:
`prism-rec-deck` (the full deck) and `prism-rec-brief` (the short version; the same build with
the environment variable `VITE_EDITION=brief`). `vercel.json` gives the build command (`npm run build`) and the output folder (`dist`),
and `package.json` pins Node 24. Every page carries a no-index header, so search engines are
asked not to list it; the address itself is open to anyone who has it.

To take a deck offline again, open that project's **Settings, Deployment Protection** on
Vercel, turn on **Vercel Authentication** and set the scope to **All Deployments** (free on
every plan): every address then asks for a Vercel login.

## The short version: PRISM-Rec in Brief

Hosted copy: https://prism-rec-brief.vercel.app

The same deck with 30 of its 92 slides, for a talk of about fifteen minutes. It is not a
second deck: `src/deck/editions.ts` lists the slide ids the short version keeps, and
everything else (the scenes, the numbers, the checks) is the full deck's own. It has no code
slides, and leaves out free-riding, participation and the method whole.

| Topic | Slides kept | |
|---|---|---|
| Privacy attack and defence in social media | Privacy attack and defence in social media; Problem statement; What a recommender learns, and what leaks; The data; What we found | 5 |
| The hybrid recommender | How well it ranks, without privacy noise | 1 |
| A federated round | One round, step by step; Poisson sampling and the empty cohort | 2 |
| Attack: what one update reveals | History inversion; Friendship links from update angles; Raw updates leak the history | 3 |
| Defence: secure sum | Pairwise masks cancel in the sum; The defence ladder | 2 |
| Attack: membership inference | Was this user in the training set?; How well the attack works | 2 |
| Defence: differential privacy | The promise; Clipping bounds one user's influence; Noise, added once; The privacy-utility curve | 4 |
| Privacy accounting | Epsilon as a surface | 1 |
| Poisoning and robust aggregation | Target-item promotion; Robust aggregation needs plaintext; How far each defence holds; What defence costs, and H4 | 4 |
| Gossip learning without a server | Averaging with a few peers; Accuracy without a server | 2 |
| The transparency ledger | Every ledger verifies; every tamper is caught | 1 |
| Putting it together | The trade-offs in one picture; What is not claimed; Thank you | 3 |

To open it:

- on any copy of the deck, add `?edition=brief` to the address (`http://localhost:5173/?edition=brief`);
  `?edition=full` goes back;
- or build it as the default: `VITE_EDITION=brief npm run build` (PowerShell:
  `$env:VITE_EDITION="brief"; npm run build; Remove-Item Env:VITE_EDITION`, so the variable does
  not stay set for the next command). The second Vercel project does exactly this.

The first and last slide of each version link to the other, and the all-slides page does too.
Topics are numbered 1 to 10 with no gap, and the counter counts the slides the short version
shows of the topic. Where a kept slide uses a term that a left-out slide explains, the short
version adds one line of explanation (`<Without slide="...">`), and a pointer at a left-out
slide is hidden (`<With slide="...">`); a button for a topic that is left out is not drawn.
`src/deck/brief.test.tsx` reads the short version on its own and fails if any of that breaks.

To change which slides it keeps, edit `BRIEF_SLIDES` in `src/deck/editions.ts`; the tests hold
it to 30 slides, no code slide, the title first and the thank-you last.

## Presenting

| Key | Does |
|---|---|
| Right, Space, PageDown | next slide |
| Left, PageUp | previous slide |
| Home, End | first and last slide |
| O | all slides on one page; click one to jump |
| F | fullscreen |
| T | light theme (better on a washed-out projector) and back |
| R | reset the current scene |

The counter beside the arrows is the slide's number inside its topic ("3 / 6"). Nothing on
any slide scrolls: the whole layout scales with the window, a slide that is still too tall is
drawn slightly smaller, and a long code excerpt is shown a page at a time with "Earlier
lines" and "Later lines" buttons.

Drag the scene to look around it and use the wheel to zoom; the view returns on the next
slide. Sliders, choices and buttons are in the text column, and many scenes can be clicked
or dragged directly. The address bar holds the slide (`#/dp/3`), so a reload stays put.

Every slide carries a badge that says what you are looking at:

- **Measured**: a number from the project's experiments, with its result file.
- **Computed**: produced by the project's own code when the deck was built (the accounting surface).
- **Illustration**: a small model running in the browser. Not a result.
- **Project source**: code copied from `src/prism` with its real line numbers.

With reduced motion requested in the operating system, camera moves cut instead of fly.
Without WebGL, each scene is replaced by a still diagram and everything else still works.

## Where the numbers come from

Nothing is typed into a slide by hand. `scripts/export_data.py` writes `src/data/`:

| File | Content |
|---|---|
| `results.json` | the fourteen result files under `results/`, unchanged |
| `code.json` | every function, class and method of `src/prism` with its line range |
| `accounting_grid.json` | epsilon over noise multiplier and rounds, from the project's PLD accountant |
| `facts.json` | counts over `results/runs`, the test count, measured coverage, and a few figures quoted from documents (each with the sentence it is quoted from) |
| `merkle_vectors.json` | Merkle roots and proofs from the project's Python, used to test the browser port |

After a rerun of the experiments, regenerate from the repository root:

```
uv run python deck/scripts/export_data.py
```

(about five minutes, most of it the accounting grid; `--skip-grid` keeps the existing grid).
A slide that reads a key that no longer exists fails the tests instead of showing a blank.

## Checks

```
uv run pytest tests/test_deck_export.py     # from the repository root: the exported data
npm run typecheck                           # TypeScript, strict
npm test                                    # 457 unit and component tests
npm run build && npm run e2e                # walks all 92 slides and the short version in Edge: motion, reduced motion, no WebGL, no scrollers
npm run dev  (then)  npm run overflow       # no scroller and nothing cut off at six window sizes
npm run dev  (then)  node e2e/overflow.mjs --edition brief   # the same check on the short version
npm run preview  (then)  node e2e/frames.mjs  # frame times in a real window on this machine's GPU
```

The frame-time pass mark is a median of at most 16.7 ms and a 95th percentile of at most
25 ms on every slide at 1920×1080. The last measurement is in `e2e/frame-report.json`; it was taken when the deck
had 88 slides, before the introduction, problem statement, data and thank-you slides were added.

## Layout

```
scripts/export_data.py     results and source -> src/data/
src/data/                  generated data and the functions that read it (m, raw, fact, code, grid)
src/deck/                  slide types, registry, navigation, keyboard, the rules every concept keeps, the two editions
src/world/                 the one 3D canvas, the camera rig, stations, and the scene building blocks (kit/)
src/ui/                    slide frame, text, inputs, charts, code view
src/sim/                   seeded randomness shared by the simulations
src/theories/<id>/         one folder per concept: slides, scene, simulation, tests
e2e/                       smoke script, end-to-end walk, overflow check, frame-time check
docs/BUILDING_A_THEORY.md  how to add or change a concept
```

Stack: React 19, TypeScript, Vite, three.js through React Three Fiber and Drei, GSAP for the
3D world, Motion for the HTML, zustand, d3-scale and d3-shape, KaTeX, highlight.js,
@noble/hashes; Vitest, Testing Library and Playwright for the tests.

The design and the plan it was built from are in
`docs/superpowers/specs/2026-11-18-prism-deck-design.md` and
`docs/superpowers/plans/2026-11-18-prism-deck.md`.
