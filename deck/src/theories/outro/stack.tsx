import { useState } from "react";
import { fact } from "../../data";
import { H, Note, P, StackList } from "../../ui";

/* ---------------------------------------------------------------- 14.4 the stack */

export function StackPanel() {
  return (
    <>
      <H>A small, ordinary stack, chosen so that every number can be rerun.</H>
      <P>
        Everything runs on one CPU in one Python process: the federation is simulated in memory, so a seed reproduces a
        run exactly. Each library does one job, listed on the right, and the lock file fixes every version.
      </P>
      <P>
        Privacy accounting deliberately uses two independent code bases, Opacus and Google's dp-accounting, and a run
        whose accountants disagree is excluded.
      </P>
      <Note>
        Flower was used once, to check that the engine does what a standard framework does. It lives in its own
        environment and is not a dependency.
      </Note>
      <P>
        This deck: React 19 and TypeScript, three.js through React Three Fiber, GSAP and zustand, d3-scale, KaTeX, built
        by Vite and tested with Vitest and Playwright.
      </P>
    </>
  );
}

export function StackStage() {
  const tests = fact("tests.count").value;
  return (
    <StackList
      items={[
        { name: "Python 3.12, uv", role: "The language, pinned to 3.12; uv installs the locked environment and runs every command." },
        { name: "PyTorch", role: "The hybrid model, each user's local step and the per-user update norms." },
        { name: "Opacus", role: "Two of the three privacy accountants, PRV and RDP." },
        { name: "dp-accounting", role: "The third accountant, privacy loss distributions, from a separate code base." },
        { name: "cryptography", role: "X25519 and ChaCha20 for the secure-sum masks; Ed25519 ledger signatures." },
        { name: "rfc8785", role: "Canonical JSON (RFC 8785), so a receipt always hashes the same." },
        { name: "NumPy, SciPy", role: "Seeded noise and sampling, sparse friend graphs, statistical tests." },
        { name: "pandas, pandera, pydantic", role: "Data loading with checked contracts; typed run configurations." },
        { name: "sentence-transformers", role: "Item text embeddings; scikit-learn gives the TF-IDF ablation." },
        { name: "matplotlib", role: "The figures of the results report." },
        { name: "Flower", role: "The parity check only, in a separate environment." },
        { name: "pytest, Hypothesis", role: `${tests} tests, some of them property-based.` },
        { name: "ruff, mypy, pip-audit", role: "Lint, strict types, known vulnerabilities; pip-licenses gates licences." },
        { name: "GitHub Actions", role: "Runs every check, a secret scan and the synthetic demonstration on each push." },
      ]}
    />
  );
}

/* ---------------------------------------------------------------- 14.5 package dependencies */

interface Box {
  id: string;
  x: number;
  y: number;
  note: string;
  shared?: boolean;
}

const BOXES: Box[] = [
  { id: "cli", x: 400, y: 36, note: "one entry point; loads each command by name" },
  { id: "report", x: 400, y: 104, note: "reads the result files, writes the report" },
  { id: "experiments", x: 400, y: 172, note: "one module per experiment, writes results/*.json" },
  { id: "attacks", x: 230, y: 244, note: "inversion, links, membership, poisoning, free-riding" },
  { id: "privacy", x: 520, y: 244, note: "clipping, noise calibration, three accountants" },
  { id: "ledger", x: 680, y: 244, note: "receipts, Merkle log, release gate" },
  { id: "fl", x: 230, y: 316, note: "sampling, clients, secure sum, aggregation, gossip" },
  { id: "eval", x: 130, y: 388, note: "ranking metrics, baselines, statistics" },
  { id: "models", x: 330, y: 388, note: "the hybrid recommender" },
  { id: "data", x: 130, y: 460, note: "dataset, splits, features, friend graph" },
  { id: "config", x: 190, y: 540, note: "shared module", shared: true },
  { id: "io", x: 340, y: 540, note: "shared module", shared: true },
  { id: "seeding", x: 490, y: 540, note: "shared module", shared: true },
  { id: "environment", x: 645, y: 540, note: "shared module", shared: true },
];

/** Imports between packages, read from src/prism: [importer, imported, loaded by name]. */
export const EDGES: [string, string, boolean?][] = [
  ["cli", "report", true],
  ["cli", "experiments", true],
  ["report", "experiments"],
  ["report", "io"],
  ["report", "environment"],
  ["experiments", "attacks"],
  ["experiments", "privacy"],
  ["experiments", "ledger"],
  ["experiments", "fl"],
  ["experiments", "eval"],
  ["experiments", "models"],
  ["experiments", "data"],
  ["experiments", "config"],
  ["experiments", "io"],
  ["experiments", "seeding"],
  ["experiments", "environment"],
  ["attacks", "fl"],
  ["attacks", "eval"],
  ["attacks", "models"],
  ["attacks", "data"],
  ["attacks", "config"],
  ["attacks", "seeding"],
  ["fl", "eval"],
  ["fl", "models"],
  ["fl", "data"],
  ["fl", "config"],
  ["fl", "seeding"],
  ["eval", "data"],
  ["models", "config"],
  ["data", "io"],
];

const BW = 128;
const BH = 38;
const at = (id: string) => BOXES.find((b) => b.id === id) as Box;

export function DepsPanel() {
  return (
    <>
      <H>Experiments sit on top; privacy and the ledger depend on nothing else in the project.</H>
      <P>
        Each box is a package of <code>src/prism</code>; an arrow means "imports". The arrows only point down, so there
        are no cycles: data knows nothing of training, training knows nothing of attacks, and only the experiments
        bring everything together.
      </P>
      <P>
        The privacy and ledger packages import nothing from the rest of the project. They can be tested on their own, and CI holds
        them to a stricter coverage gate than the rest.
      </P>
      <Note>
        The command line loads each experiment by its module name when it is called, so starting <code>prism</code> does
        not import PyTorch. Point at a box to see its arrows.
      </Note>
    </>
  );
}

export function DepsStage() {
  const [focus, setFocus] = useState<string | null>(null);
  const live = (from: string, to: string) => focus === null || focus === from || focus === to;
  const box = focus ? at(focus) : null;
  return (
    <figure style={{ margin: 0 }}>
      <svg
        viewBox="0 0 800 590"
        role="img"
        aria-label="Package dependencies of src/prism, drawn top to bottom: cli, report, experiments, then attacks, privacy and ledger, then fl, eval and models, then data, then the shared modules config, io, seeding and environment."
        style={{ width: "100%", height: "auto", maxHeight: "calc(40 * var(--u))", display: "block" }}
      >
        <defs>
          <marker id="outro-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="var(--ink-soft)" />
          </marker>
        </defs>
        <rect x={105} y={515} width={625} height={52} rx={6} fill="none" stroke="var(--rule)" strokeDasharray="4 4" />
        {EDGES.map(([from, to, byName]) => {
          const a = at(from);
          const b = at(to);
          const x1 = a.x;
          const y1 = a.y + BH / 2;
          const x2 = b.x;
          const y2 = b.y - BH / 2 - 2;
          const mid = (y1 + y2) / 2;
          const on = live(from, to);
          return (
            <path
              key={`${from}-${to}`}
              d={`M${x1},${y1} C${x1},${mid} ${x2},${mid} ${x2},${y2}`}
              fill="none"
              stroke={focus && on ? "var(--protected)" : "var(--ink-soft)"}
              strokeOpacity={on ? (focus ? 0.95 : 0.4) : 0.08}
              strokeWidth={focus && on ? 2.2 : 1.3}
              strokeDasharray={byName ? "5 4" : undefined}
              markerEnd="url(#outro-arrow)"
            />
          );
        })}
        {BOXES.map((b) => {
          const isFocus = focus === b.id;
          const stroke = b.id === "privacy" ? "var(--protected)" : b.id === "ledger" ? "var(--ledger)" : b.id === "attacks" ? "var(--attacker)" : "var(--model)";
          return (
            <g
              key={b.id}
              tabIndex={0}
              role="button"
              aria-label={`${b.id}: ${b.note}`}
              onMouseEnter={() => setFocus(b.id)}
              onMouseLeave={() => setFocus(null)}
              onFocus={() => setFocus(b.id)}
              onBlur={() => setFocus(null)}
              style={{ cursor: "default", outline: "none" }}
            >
              <rect
                x={b.x - BW / 2}
                y={b.y - BH / 2}
                width={BW}
                height={BH}
                rx={5}
                fill="var(--dusk)"
                stroke={b.shared ? "var(--ink-soft)" : stroke}
                strokeWidth={isFocus ? 3 : 1.6}
              />
              <text x={b.x} y={b.y} dy="0.35em" textAnchor="middle" fontSize={17} fontWeight={700} fill="var(--ink)" fontFamily="var(--font-code)">
                {b.id}
              </text>
            </g>
          );
        })}
        <text x={400} y={584} textAnchor="middle" fontSize={14} fill="var(--ink-soft)">
          shared modules, imported by many packages
        </text>
      </svg>
      <p className="caption" aria-live="polite" style={{ minHeight: "1.6em" }}>
        {box ? `${box.id}: ${box.note}.` : "Solid arrow: an import. Dashed: loaded by name when the command runs."}
      </p>
    </figure>
  );
}
