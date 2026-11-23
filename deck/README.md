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

Thirty slides for a talk of about fifteen minutes. It is not a second deck, and it is not a
subset of the full deck's slides. Each short-version slide sits at the place of one full slide
and reuses that topic's 3D scene, numbers and checks, but it has its own headline, text and
figure, written to carry the main points of the whole topic. Every topic of the deck is in it,
and it has no code slides. What each of the thirty slides must say is in `docs/BRIEF_EDITION.md`.

| Topic | Slides | |
|---|---|---|
| Privacy attack and defence in social media | Privacy attack and defence in social media; The problem: collecting the data is the risk; What leaks, to whom, and the defence for each; The data; The system end to end | 5 |
| The hybrid recommender | The model and how well it ranks | 1 |
| A federated round | One federated round, and its two regimes | 1 |
| Attack: what one update reveals | What one update gives away; Measured: a raw update gives the history away | 2 |
| Defence: secure sum | Masks cancel, so the server sees only the sum; The defence ladder, measured | 2 |
| Attack: membership inference | An outsider can test whether a user was in training; The attack works without privacy and fails with it | 2 |
| Defence: differential privacy | With or without your history, the result looks the same; Clip each user, then add noise once; H1 is not supported; Less noise helps in one cohort, and the data is not the cause | 4 |
| Privacy accounting | Epsilon is computed, and three accountants must agree | 1 |
| Poisoning and robust aggregation | Fake accounts, and why robust defences cost privacy or accuracy; How far each defence holds; What defence costs, and H4 | 3 |
| Free-riding | Free-riders: cheap for others, caught by size | 1 |
| Gossip learning without a server | Gossip has no server: peers average, every node adds noise; Gossip against server-based training | 2 |
| Who actually takes part | Who takes part | 1 |
| The transparency ledger | Every round is signed into a log that can be checked | 1 |
| How we know: the method | The rules were fixed before the reported model was tested | 1 |
| Putting it together | What we found; Limits and what is not claimed; Thank you | 3 |

To open it:

- on any copy of the deck, add `?edition=brief` to the address (`http://localhost:5173/?edition=brief`);
  `?edition=full` goes back;
- or build it as the default: `VITE_EDITION=brief npm run build` (PowerShell:
  `$env:VITE_EDITION="brief"; npm run build; Remove-Item Env:VITE_EDITION`, so the variable does
  not stay set for the next command). The second Vercel project does exactly this.

The first and last slide of each version link to the other, and the all-slides page does too.
A short-version slide keeps the address of the full slide it stands for (`#/dp/5`), so a link
written for one version opens the same place in the other.

How it is built: a slide in a theory folder may carry a `brief` variant (its own `title`,
`Panel` and `Stage`, in the folder's `brief.tsx`). `src/deck/editions.ts` lists the thirty slide
ids, and the short version shows each of them in its variant. The full deck never shows a
variant. The title and the thank-you are the only slides that are the same in both.
`src/deck/brief.test.tsx` reads the short version on its own: thirty slides at most, no code
slide, every topic present, every slide but those two remade, one headline and at most 130 words
per panel, and no pointer at a slide it does not have. To change what a slide says, edit its
variant; to change which slides there are, edit `BRIEF_SLIDES` and `docs/BRIEF_EDITION.md`.

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
npm test                                    # 484 unit and component tests
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
