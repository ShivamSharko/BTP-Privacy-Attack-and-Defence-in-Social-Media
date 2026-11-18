# Building a theory folder

This is the working guide for adding one concept to the deck. The storyboard (what each
slide must say and show) is section 7 of
`docs/superpowers/specs/2026-11-18-prism-deck-design.md`. A finished example to copy from is
`deck/src/theories/fed/` — read all of its files before you start.

## What you produce

One folder, `deck/src/theories/<id>/`, and nothing outside it:

| File | Holds |
|---|---|
| `index.tsx` | `export const theory: TheoryDef` — the slides, with their panels and stages |
| `Scene.tsx` | the 3D scene (`export function Scene({ step, active }: SceneProps)`) |
| `Fallback.tsx` | a still SVG diagram, `viewBox="0 0 800 600"`, colours from CSS variables |
| `store.ts` | a zustand store for values shared by panel and scene (slider values, play state) |
| `sim.ts` | the pure logic the scene animates. No React, no three.js, seeded randomness |
| `sim.test.ts` | tests for `sim.ts`, written first |
| `<id>.test.tsx` | `checkTheory`, `renderAllSlides`, `longPanels` (copy `fed/fed.test.tsx`) |

Split a file when it passes about 350 lines (`Scene2.tsx`, `panels.tsx`, …). The registry
finds the folder by itself; do not edit any file outside your folder.

## The slide list

```ts
import type { TheoryDef } from "../../deck/types";
export const theory: TheoryDef = {
  id: "dp", number: 6, title: "User-level differential privacy", short: "Privacy",  // short: 14 characters at most
  Scene, Fallback,
  slides: [
    { id: "dp/1", kind: "theory", title: "…", badge: "illustration", pose: { position: [0, 2, 14], target: [0, 0, 0] }, step: 0, Panel: P1 },
    { id: "dp/4", kind: "impact", title: "…", badge: "measured", sources: ["privacy_utility"], pose: …, step: 0, layout: "stage", Panel: P4, Stage: S4 },
    { id: "dp/6", kind: "code", title: "…", badge: "source", pose: …, step: 0, layout: "stage", Panel: P6, Stage: S6 },
  ],
};
```

- Ids are `<id>/1`, `<id>/2`, … in order. Kinds go theory → impact → code.
- `badge`: `illustration` for a toy model in the browser, `measured` for numbers from
  `results/`, `computed` for the accounting grid, `source` for code slides (and only them).
  Impact slides are `measured` or `computed` and must list `sources`.
- `step` is handed to your `Scene`; use a different step for each visual state.
- `layout: "stage"` shows your `Stage` component on a card over a dimmed scene. Use it for
  impact and code slides. Theory slides use the default layout: text left, live scene right.
- `pose` is the camera in your scene's own coordinates. Change it between slides to move the
  camera (closer, to the side, higher); the shell animates the move.

## Text (the `Panel`)

Import from `../../ui`: `H` (one headline per slide), `P`, `Tex` (KaTeX; `block` for a
displayed formula; write LaTeX with `String.raw`), `Note` (`tone="warn" | "good"`), `Steps`,
`List`, `Caption`, `Table`, and the inputs `Controls`, `Slider`, `Choice`, `Button`, `Buttons`,
`Readout`, `Readouts`.

Writing rules:

- At most about 130 words of text per panel (`longPanels` fails above 150). If the
  explanation needs more, add a slide. The storyboard's slide counts are a minimum, not a cap.
- The headline is a full sentence that states the point of the slide.
- Plain words, sentence case, British spelling ("neighbour", "optimiser"). Explain a term
  the first time it appears. No all-caps labels, no "A · B · C" strings, no arrows in text.
- Complete technical detail: say what the mechanism is, why it works, and the edge cases.
  A formula appears where it earns its place, with every symbol named in the text.
- Say plainly when a result went against the hypothesis. Do not soften it.
- No number typed by hand. Every figure comes from `m()`, `raw()`, `fact()` or your own
  `sim.ts`. No conference or journal paper is cited; name standards (RFC 6962), libraries and
  project files instead. No mention of any university department.

## Fitting the window: no scrollers

The deck has no scroller anywhere, at any window size. Three things keep it that way:

- Every size in `styles/base.css` is a multiple of `--u` (one hundredth of the widest 16:9 box
  that fits the window) or `--px` (one pixel of the 1920×1080 design). A slide is laid out the
  same in any window, only larger or smaller. In your own styles use `em`, `var(--t-small)`
  and the other tokens, or `calc(12 * var(--px))`. Do not use `vw`, `vh` or fixed pixels for
  anything that takes up room, and never set `overflow: auto` or `overflow: scroll`.
- The text column and the figure card are each wrapped in `Fit` (`ui/Fit.tsx`). Content that
  is still too tall is drawn smaller until it fits. That is a safety net, not a layout tool:
  if your slide is shrunk below about 90%, shorten it or split it.
- `CodeView` shows an excerpt of up to 26 lines whole. A longer one is shown 24 lines at a
  time with "Earlier lines" and "Later lines" buttons, opening on the page that holds the
  first highlighted line, and its type shrinks until the longest line fits the card.

`node e2e/overflow.mjs --only <id>` walks your slides at six window sizes and fails if any
element can scroll, if anything is cut off, or if a slide had to shrink below 72%.

## Numbers and code

```ts
import { m, raw, fact, code, grid, fmt } from "../../data";
m("privacy_utility", "summary/large/levels/eps8/ndcg@10_mean")   // a finite number, or it throws
raw<number[]>("membership", "settings/target_seeds")              // any JSON value
fact("speed.before_s")                                            // { value, source, quote }
fmt.ndcg(x)  fmt.pct(x)  fmt.n(x, digits)  fmt.int(x)
```

Path segments are joined by `/` (keys may contain dots, such as `results/secure_sum_norm_bound/0.1/exposure/mean`).
To find the keys you need, read the real file: `results/<name>.json` at the repository root
(the deck's copy is `deck/src/data/results.json`). Read the `limitations` list in each result
file you use, and carry the ones that matter onto the impact slide.

Code slides use `<CodeView refs={[…]} highlight={{ [ref]: [[from, to]] }} />` with keys of the
form `"fl/secagg.py::SecAggClient.masked_update"` (path under `src/prism`, then `::`, then the
qualified name). Check that a key exists:
`node -e "const c=require('./src/data/code.json');console.log(Object.keys(c).filter(k=>k.startsWith('fl/secagg.py')))"`
(run from `deck/`). Read the real Python before you describe it; the panel must say what the
code actually does. The code panel also names the libraries involved.

Charts (`BarChart`, `LineChart`, `GroupedBars`, `StatRow`) are documented by their props in
`deck/src/ui/charts/*.tsx` and `StatRow.tsx`. Every chart needs a `summary` sentence. Colour a
series by role, and keep the role's meaning (see below). For a chart these do not cover, draw
your own SVG in your folder using the same CSS variables.

## The scene

Import from `../../world/kit`: `Crowd`, `Arrow`, `Links`, `Label`, `Ground`, `useRoles`,
`useStepTimeline`, `useActiveFrame`, `useOnReset`, `useDrag`. Read
`deck/src/world/kit/*.ts(x)`: the comments there are the reference.

- **Space.** y is up. The main content fits a box 10 wide, 8 tall and 10 deep around the
  origin; the default camera is at `[0, 2, 14]` looking at the origin with a 40° field of
  view, and the shell already shifts the view so the origin sits in the middle of the area to
  the right of the text. A light is about 0.085 in radius. `Ground` sits at y = −3.
- **Colour roles.** `honest` (amber) honest users and their data; `protected` (aqua) anything
  private, masked, clipped or within budget; `attacker` (pink-red) attackers and leaks; `noise`
  (lavender grey) random noise; `ledger` (green) receipts, hashes, proofs; `model` (pale lilac)
  the shared model; `muted` for inactive things. Get colours from `useRoles()` or pass
  `role="…"`. Never write a hex colour in your folder: the deck has a dark and a light theme.
- **Materials.** Lights and lines are unlit (`meshBasicMaterial` with `toneMapped={false}`);
  solid structures use `meshStandardMaterial`. The shell provides the lights; add none.
- **Animation.** GSAP only, through `useStepTimeline(step, (tl) => …)`; write each step with
  `.to(…)` towards that step's full state, because the previous timeline is killed where it
  stood. Continuous motion goes in `useActiveFrame(active, (state, delta) => …)`, which does
  nothing while your station is off screen. Per-frame values live in refs: never call
  `setState` or a store setter every frame. Timers (`setInterval`) that drive a simulation
  must be created only while `active` and cleared on cleanup (see `fed/Scene.tsx`).
- **No per-frame allocation.** Create vectors, colours and matrices once (`useMemo`) and
  reuse them. Many identical objects go in one `Crowd` or one `instancedMesh`, not one mesh
  each. Stay under about 2,000 instances.
- **Interaction.** Every theory slide has something to manipulate: a slider or choice in the
  panel, and where it suits the idea, direct manipulation in the scene (`onClick` on a mesh,
  or `useDrag` for dragging). Dragging empty space orbits the camera; that is built in.
- **Labels.** `<Label position={[x, y, z]} tone="protected" small>text</Label>` puts HTML text
  in the scene. Keep labels few and short.
- **Reduced motion.** `useStepTimeline` jumps to the end state for you; make sure the end
  state alone explains the slide.
- **Reset.** `useOnReset(() => useMyStore.getState().reset(), active)`.

Things that break the deck, so do not use them:

- `useFrame` with a priority argument (a positive priority switches off rendering for the
  whole canvas). Use `useActiveFrame`.
- drei `<Text>`, `<Text3D>`, `<Html>`, `<Environment>`, any loader of remote files, any CDN
  URL. The deck must work with no network. Other drei helpers (`Line`, `RoundedBox`,
  `Float`, `QuadraticBezierLine`, …) are fine.
- Post-processing, shadows, your own lights, your own `<Canvas>`, your own camera controls.
- `framer-motion` imports (the package is `motion`, imported as `motion/react`, and it is for
  HTML only), zustand's default import (use `import { create } from "zustand"`).
- New npm packages. Everything installed is listed in `deck/package.json`.

## Tests first

1. Write `sim.test.ts` before `sim.ts`: the mechanism the scene shows (for example "the masks
   cancel in the sum", "every clipped vector has norm at most C"), determinism for a seed, and
   the extremes of every slider (zero users, zero noise, attacker share 0 and maximum, a
   committee larger than the cohort): no `NaN`, no exception.
2. Write `<id>.test.tsx` (copy `fed/fed.test.tsx`): `checkTheory(theory)` is empty,
   `renderAllSlides(theory)` contains the key measured figures, `longPanels(theory)` is empty.
3. Run them and see them fail, then implement.

## Checking your work

From `deck/`:

```
npx vitest run src/theories/<id>
npx tsc --noEmit                      # other folders may show errors while they are being built; yours must show none
node e2e/smoke.mjs <id>               # dev server is already running on port 5173; do not start another
node e2e/overflow.mjs --only <id>     # no scroller, nothing cut off, at six window sizes
```

The smoke script saves a picture of each of your slides to `deck/e2e/shots/<id>-<n>.png` and
fails on console errors. **Open every picture and look at it.** Check: nothing overlaps or
runs off the screen, the scene is centred in the right-hand area and reads at a glance,
colours follow the roles, labels are legible, the chart fits its card. Run
`node e2e/smoke.mjs <id> --light` once and look at the light theme too. The pictures are taken
1.8 seconds after the slide opens; to see a later state, pass `--wait 6000`.

Never start a dev server, never run `npm install`, never make a git commit, and never edit a
file outside your folder. If something in the shell blocks you, say so in your report
instead of working around it in shared files.
