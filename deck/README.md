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

**Not public.** The repository is private and the dataset provider's pre-publication review
has not been done, so the deck must not be reachable by the public. It contains no row of the
dataset, only aggregate results already under `results/`, but it does contain the source of
every function in `src/prism` (the code slides read it from `src/data/code.json`).

## Sharing it with the guide (private Vercel deployment)

The deck can be hosted on Vercel for the guide without making it public, on the free plan:

1. Import this GitHub repository at vercel.com/new and set **Root Directory** to `deck`.
   `vercel.json` gives the build command (`npm run build`) and the output folder (`dist`);
   `package.json` pins Node 24.
2. Before sharing anything, open the project's **Settings, Deployment Protection**, turn on
   **Vercel Authentication** and set the scope to **All Deployments**. Every address of the
   deployment then asks for a Vercel login that has access to the project, so a stranger who
   finds the address sees a login page, not the slides.
3. Open the deployment, press **Share**, choose **Anyone with the link** and send that link to
   the guide. The free plan allows one such link per account. It needs no Vercel account to
   open, and switching it back to **Only people with access** revokes it.

The share link is a secret: whoever has it can open the deck, so send it directly and revoke
it after the review. Every page also carries a no-index header, so search engines do not list
it. Do not turn protection off and do not add a public custom domain before the dataset
provider's review is done.

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
npm test                                    # 418 unit and component tests
npm run build && npm run e2e                # walks all 92 slides in Edge: motion, reduced motion, no WebGL, no scrollers
npm run dev  (then)  npm run overflow       # no scroller and nothing cut off at six window sizes
npm run preview  (then)  node e2e/frames.mjs  # frame times in a real window on this machine's GPU
```

The frame-time pass mark is a median of at most 16.7 ms and a 95th percentile of at most
25 ms on every slide at 1920×1080. The last measurement is in `e2e/frame-report.json`; it was taken when the deck
had 88 slides, before the introduction, problem statement, data and thank-you slides were added.

## Layout

```
scripts/export_data.py     results and source -> src/data/
src/data/                  generated data and the functions that read it (m, raw, fact, code, grid)
src/deck/                  slide types, registry, navigation, keyboard, the rules every concept keeps
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
