import { gaussian, rng } from "../../sim/random";

/** The significance level the project uses everywhere (eval/stats.py: ALPHA). */
export const ALPHA = 0.05;

/* ------------------------------------------------------------------ sign test */

/**
 * The smallest two-sided p-value a sign test over n paired seeds can give: every seed moves the
 * same way, which has probability 0.5^n in each direction. Capped at 1 (one seed, or none).
 * Same rule as eval/stats.py: min_two_sided_sign_p.
 */
export function minSignTestP(seeds: number): number {
  if (!Number.isFinite(seeds) || seeds <= 0) return 1;
  return Math.min(1, 2 * 0.5 ** Math.floor(seeds));
}

/** Whether the best possible sign-test p-value over n seeds could still pass Holm with m comparisons. */
export function canSurviveHolm(seeds: number, comparisons: number): boolean {
  if (!Number.isFinite(comparisons) || comparisons < 1) return false;
  return minSignTestP(seeds) <= ALPHA / Math.floor(comparisons);
}

/** A p-value for display: three significant figures, an exponent below 0.0001. */
export function formatP(p: number): string {
  if (!Number.isFinite(p)) return "n/a";
  return p < 1e-4 && p !== 0 ? p.toExponential(2) : String(Number(p.toPrecision(3)));
}

/* ------------------------------------------------------------------ Holm */

export interface HolmResult {
  /** Holm-adjusted p-values in the input order, each at most 1. */
  adjusted: number[];
  /** Whether each hypothesis is rejected at ALPHA. */
  reject: boolean[];
}

/**
 * Holm-Bonferroni step-down. Sort ascending; the k-th smallest (counting from 0) is multiplied by
 * m - k, and an adjusted value is never smaller than the one before it. A hypothesis is rejected
 * when its adjusted value is at most alpha.
 *
 * Difference from eval/stats.py: holm_adjust, which returns the decisions only. The two take
 * the same decisions (the test replays the Python rule against this one); this function also
 * returns the adjusted values, which the slide draws.
 */
export function holm(pValues: readonly number[], alpha = ALPHA): HolmResult {
  const m = pValues.length;
  const p = pValues.map((v) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 1));
  const order = p.map((_, i) => i).sort((a, b) => p[a] - p[b] || a - b);
  const adjusted = new Array<number>(m).fill(1);
  let running = 0;
  order.forEach((index, rank) => {
    running = Math.max(running, Math.min(1, (m - rank) * p[index]));
    adjusted[index] = running;
  });
  return { adjusted, reject: adjusted.map((a) => a <= alpha) };
}

/* ------------------------------------------------------------------ bootstrap */

function percentile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return Number.NaN;
  const position = q * (sorted.length - 1);
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

/**
 * Percentile bootstrap interval (2.5% to 97.5%) for the mean over seeds, as in
 * eval/stats.py: bootstrap_ci but with fewer draws, because this one runs in a browser.
 * No values gives NaN; one value gives that value at both ends.
 */
export function bootstrapCi(values: readonly number[], seed: number, draws = 1000): [number, number] {
  const n = values.length;
  if (n === 0) return [Number.NaN, Number.NaN];
  if (values.every((v) => v === values[0])) return [values[0], values[0]];
  const r = rng(seed);
  const means = new Array<number>(draws);
  for (let d = 0; d < draws; d++) {
    let total = 0;
    for (let i = 0; i < n; i++) total += values[Math.floor(r() * n)];
    means[d] = total / n;
  }
  means.sort((a, b) => a - b);
  return [percentile(means, 0.025), percentile(means, 0.975)];
}

/** Invented per-seed scores for the toy on the statistics slide. The first n are the same for every n. */
export function toySeedValues(n: number, seed: number): number[] {
  const r = rng(seed);
  const out: number[] = [];
  for (let i = 0; i < Math.max(0, Math.floor(n)); i++) out.push(0.03 + 0.003 * gaussian(r));
  return out;
}

/* ------------------------------------------------------------------ controls */

export type Verdict = "VALID" | "INVALID";

/**
 * An experiment is VALID only if its positive control succeeded (the effect it must be able to
 * detect was detected) and its negative control stayed null (nothing was found where nothing
 * exists). Either failing makes the whole run INVALID, whatever the headline numbers say.
 */
export function controlVerdict(positivePassed: boolean, negativePassed: boolean): Verdict {
  return positivePassed && negativePassed ? "VALID" : "INVALID";
}

export interface ControlItem {
  name: string;
  /** null when the entry only reports a number and has no pass or fail. */
  passed: boolean | null;
  /** A gating control decides VALID or INVALID. Advisory ones are reported, not enforced. */
  gating: boolean;
}

export interface ControlsSummary {
  status: string | null;
  items: ControlItem[];
  /** Number of gating controls, and how many of them passed. */
  gating: number;
  gatingPassed: number;
  failedGating: string[];
  failedAdvisory: string[];
  allGatingPassed: boolean;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function entryName(entry: Record<string, unknown>, index: number): string {
  if (typeof entry.name === "string") return entry.name;
  const parts = [entry.variant, entry.regime].filter((p): p is string => typeof p === "string");
  return parts.length > 0 ? parts.join(" ") : `control ${index + 1}`;
}

function toItem(name: string, entry: unknown): ControlItem | null {
  if (!isRecord(entry)) return null;
  const passed = typeof entry.passed === "boolean" ? entry.passed : null;
  const gating = passed !== null && entry.gating !== false;
  return { name, passed, gating };
}

/**
 * Reads the `status` and `controls` of a result file. `controls` is a list of entries with a
 * name in some files and an object keyed by name in others; an entry may say `gating: false`
 * (reported, but it does not decide the verdict) or have no `passed` at all (a reference number).
 */
export function summariseControls(file: unknown): ControlsSummary {
  const status = isRecord(file) && typeof file.status === "string" ? file.status : null;
  const controls = isRecord(file) ? file.controls : undefined;
  const items: ControlItem[] = [];
  if (Array.isArray(controls)) {
    controls.forEach((entry, i) => {
      const item = isRecord(entry) ? toItem(entryName(entry, i), entry) : null;
      if (item) items.push(item);
    });
  } else if (isRecord(controls)) {
    for (const [name, entry] of Object.entries(controls)) {
      const item = toItem(name, entry);
      if (item) items.push(item);
    }
  }
  const gatingItems = items.filter((i) => i.gating);
  const failedGating = gatingItems.filter((i) => i.passed === false).map((i) => i.name);
  return {
    status,
    items,
    gating: gatingItems.length,
    gatingPassed: gatingItems.length - failedGating.length,
    failedGating,
    failedAdvisory: items.filter((i) => !i.gating && i.passed === false).map((i) => i.name),
    allGatingPassed: failedGating.length === 0,
  };
}

/* ------------------------------------------------------------------ layouts for the scene */

/** n points scattered through a ball of the given radius, xyz per point. Seeded. */
export function cloudLayout(n: number, seed: number, radius: number): Float32Array {
  const r = rng(seed);
  const count = Math.max(0, Math.floor(n));
  const out = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    // uniform in the ball: random direction, radius with a cube root
    const x = gaussian(r);
    const y = gaussian(r);
    const z = gaussian(r);
    const norm = Math.hypot(x, y, z) || 1;
    const rho = radius * Math.cbrt(r());
    out[i * 3] = (x / norm) * rho;
    out[i * 3 + 1] = (y / norm) * rho;
    out[i * 3 + 2] = (z / norm) * rho;
  }
  return out;
}

/** x of the k-th gate on the order-of-work slide, and where the result packet rests after k gates. */
export const GATE_X0 = -4.25;
export const GATE_DX = 1.7;
export const gateX = (k: number): number => GATE_X0 + GATE_DX * k;
export function packetRest(stage: number): number {
  return stage <= 0 ? gateX(0) - 1.15 : gateX(Math.min(5, stage - 1)) + 0.85;
}

/** Height of the sign-test bar for n seeds: minus log10 of the smallest p-value. */
export function bitsOfEvidence(seeds: number): number {
  return Math.max(0, -Math.log10(minSignTestP(seeds)));
}
