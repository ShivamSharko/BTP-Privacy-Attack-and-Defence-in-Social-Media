/**
 * Pure logic for the privacy-accounting scenes: interpolation of the exported epsilon grid,
 * the height of the surface, the epsilon = target contour, the toy agreement gate, and the
 * noise-calibration search. No React, no three.js.
 */
import type { AccountingGrid } from "../../data";

/* ------------------------------------------------------------------ geometry of the surface */

/** The surface occupies a box this wide (log noise), this deep (log rounds) and this tall (log epsilon). */
export const SURF_W = 9;
export const SURF_D = 6;
export const SURF_H = 4;

/** Position of a value between a low and a high end on a log scale, 0 to 1, clamped. Non-finite input gives 0. */
export function logT(x: number, lo: number, hi: number): number {
  if (!Number.isFinite(x) || x <= 0 || hi <= lo) return 0;
  const t = (Math.log(x) - Math.log(lo)) / (Math.log(hi) - Math.log(lo));
  return Math.min(1, Math.max(0, t));
}

/** Inverse of `logT`. */
export function fromLogT(t: number, lo: number, hi: number): number {
  return Math.exp(Math.log(lo) + Math.min(1, Math.max(0, t)) * (Math.log(hi) - Math.log(lo)));
}

/** Every grid value with `sub - 1` more spaced evenly on a log scale between each neighbouring pair. Node k sits at index k * sub. */
export function refine(axis: readonly number[], sub: number): number[] {
  const out: number[] = [];
  for (let k = 0; k < axis.length - 1; k++)
    for (let s = 0; s < sub; s++) out.push(Math.exp(Math.log(axis[k]) + ((Math.log(axis[k + 1]) - Math.log(axis[k])) * s) / sub));
  out.push(axis[axis.length - 1]);
  return out;
}

/* ------------------------------------------------------------------ interpolation */

function lowerIndex(axis: readonly number[], x: number): { i: number; f: number } {
  const last = axis.length - 1;
  if (!Number.isFinite(x) || x <= axis[0]) return { i: 0, f: 0 };
  if (x >= axis[last]) return { i: Math.max(0, last - 1), f: 1 };
  let i = 0;
  while (i < last - 1 && axis[i + 1] <= x) i++;
  return { i, f: (Math.log(x) - Math.log(axis[i])) / (Math.log(axis[i + 1]) - Math.log(axis[i])) };
}

/**
 * Epsilon at any noise multiplier and number of rounds for one sampling rate (an index into
 * `grid.rates`), by bilinear interpolation of log epsilon over log noise and log rounds.
 * Inputs outside the grid are clamped to its edge. A corner that is `null` is left out of the
 * average; if every corner of a cell is null the result is NaN (the exported grid has none).
 */
export function epsilonAt(g: AccountingGrid, rateIdx: number, noise: number, rounds: number): number {
  const table = g.epsilon[Math.min(g.rates.length - 1, Math.max(0, Math.round(Number.isFinite(rateIdx) ? rateIdx : 0)))];
  const z = lowerIndex(g.noise, noise);
  const t = lowerIndex(g.rounds, rounds);
  let sum = 0;
  let weight = 0;
  for (const [dt, wt] of [[0, 1 - t.f], [1, t.f]] as const) {
    for (const [dz, wz] of [[0, 1 - z.f], [1, z.f]] as const) {
      const w = wt * wz;
      const row = table[Math.min(g.rounds.length - 1, t.i + dt)];
      const v = row?.[Math.min(g.noise.length - 1, z.i + dz)];
      if (w <= 0 || v === null || v === undefined || !(v > 0)) continue;
      sum += w * Math.log(v);
      weight += w;
    }
  }
  if (weight > 0) return Math.exp(sum / weight);
  // The cell's weight sat entirely on null corners: use the cell's other corners.
  let fallback = 0;
  let count = 0;
  for (const dt of [0, 1])
    for (const dz of [0, 1]) {
      const v = table[Math.min(g.rounds.length - 1, t.i + dt)]?.[Math.min(g.noise.length - 1, z.i + dz)];
      if (v !== null && v !== undefined && v > 0) {
        fallback += Math.log(v);
        count++;
      }
    }
  return count > 0 ? Math.exp(fallback / count) : Number.NaN;
}

/** Smallest and largest finite epsilon in the grid. */
export function gridRange(g: AccountingGrid): { lo: number; hi: number } {
  let lo = Infinity;
  let hi = 0;
  for (const rate of g.epsilon)
    for (const row of rate)
      for (const v of row)
        if (v !== null && v > 0) {
          lo = Math.min(lo, v);
          hi = Math.max(hi, v);
        }
  return { lo, hi };
}

/** Height of the surface at an epsilon: log scale between the grid's smallest and largest value. */
export function heightOf(eps: number, range: { lo: number; hi: number }, height = SURF_H): number {
  if (Number.isNaN(eps)) return height;
  if (eps <= 0) return 0;
  const t = (Math.log(Math.min(eps, 1e300)) - Math.log(range.lo)) / (Math.log(range.hi) - Math.log(range.lo));
  return Math.min(1, Math.max(0, t)) * height;
}

/** Where a (noise, rounds) setting sits in the surface's own coordinates, centred on x and z, base at y = 0. */
export function surfacePoint(
  g: AccountingGrid,
  rateIdx: number,
  noise: number,
  rounds: number,
  range = gridRange(g),
): { x: number; y: number; z: number; epsilon: number } {
  const epsilon = epsilonAt(g, rateIdx, noise, rounds);
  return {
    x: (logT(noise, g.noise[0], g.noise[g.noise.length - 1]) - 0.5) * SURF_W,
    y: heightOf(epsilon, range),
    z: (logT(rounds, g.rounds[0], g.rounds[g.rounds.length - 1]) - 0.5) * SURF_D,
    epsilon,
  };
}

/* ------------------------------------------------------------------ contour */

export interface ContourPoint {
  noise: number;
  rounds: number;
}

/**
 * The line where epsilon equals `target`, as noise multipliers for rounds spread evenly on a
 * log scale. For each number of rounds the noise is found by bisection (epsilon falls as noise
 * grows). Rounds for which the target lies outside the grid's noise range are left out.
 */
export function contour(g: AccountingGrid, rateIdx: number, target: number, steps = 48): ContourPoint[] {
  const out: ContourPoint[] = [];
  const zLo = g.noise[0];
  const zHi = g.noise[g.noise.length - 1];
  const tLo = g.rounds[0];
  const tHi = g.rounds[g.rounds.length - 1];
  for (let k = 0; k < steps; k++) {
    const rounds = fromLogT(steps === 1 ? 0 : k / (steps - 1), tLo, tHi);
    if (epsilonAt(g, rateIdx, zLo, rounds) < target || epsilonAt(g, rateIdx, zHi, rounds) > target) continue;
    let lo = zLo;
    let hi = zHi;
    for (let i = 0; i < 60; i++) {
      const mid = Math.sqrt(lo * hi);
      if (epsilonAt(g, rateIdx, mid, rounds) > target) lo = mid;
      else hi = mid;
    }
    out.push({ noise: Math.sqrt(lo * hi), rounds });
  }
  return out;
}

/* ------------------------------------------------------------------ the agreement gate */

/** The constants of `check_gate` in src/prism/privacy/accounting.py (a test compares them with the file). */
export const GATE_RELATIVE = 0.05;
export const GATE_ABSOLUTE = 0.05;
export const RDP_SLACK = 0.01;

export type GateReason = "ok" | "non-finite" | "prv-pld" | "rdp";

export interface GateResult {
  ok: boolean;
  reason: GateReason;
  /** Allowed gap between PRV and PLD: the larger of 5% of the larger one and 0.05. */
  tolerance: number;
  /** The actual gap between PRV and PLD (NaN if either is not finite). */
  gap: number;
  /** The value of record: the larger of PRV and PLD (NaN when the gate fails). */
  ofRecord: number;
}

/** The same rule as `check_gate(prv, pld, rdp)`. */
export function gate(prv: number, pld: number, rdp: number): GateResult {
  const gap = Math.abs(prv - pld);
  const bigger = Math.max(prv, pld);
  const tolerance = Number.isFinite(bigger) ? Math.max(GATE_RELATIVE * bigger, GATE_ABSOLUTE) : GATE_ABSOLUTE;
  const fail = (reason: GateReason): GateResult => ({ ok: false, reason, tolerance, gap, ofRecord: Number.NaN });
  if (![prv, pld, rdp].every((v) => Number.isFinite(v) && v >= 0)) return fail("non-finite");
  if (gap > tolerance) return fail("prv-pld");
  if (rdp < bigger - RDP_SLACK) return fail("rdp");
  return { ok: true, reason: "ok", tolerance, gap, ofRecord: bigger };
}

/* ------------------------------------------------------------------ calibration search */

/** The search range and tolerance of `calibrate_noise` in accounting.py (a test compares them with the file). */
export const CALIBRATION_LOW = 0.2;
export const CALIBRATION_HIGH = 200;
export const CALIBRATION_TOLERANCE = 0.01;

export interface Bracket {
  lo: number;
  hi: number;
  /** The noise tried at this step (geometric middle of the bracket before the step). */
  probe: number;
  /** Epsilon at the probe. */
  eps: number;
}

/**
 * The search in `calibrate_noise`: keep a bracket [lo, hi] with epsilon(hi) at most the target,
 * try the geometric middle, keep the half that still straddles the target, and stop once
 * hi / lo is within a quarter of the tolerance. Returns every step; `reachable` is false (and
 * `steps` empty) when even the largest noise does not reach the target.
 */
export function bisectTrace(
  f: (noise: number) => number,
  low: number,
  high: number,
  target: number,
  tolerance = 0.01,
): { reachable: boolean; steps: Bracket[] } {
  if (!(f(high) <= target)) return { reachable: false, steps: [] };
  const steps: Bracket[] = [];
  let lo = low;
  let hi = high;
  while (hi / lo > 1 + tolerance / 4 && steps.length < 200) {
    const probe = Math.sqrt(lo * hi);
    const eps = f(probe);
    if (eps <= target) hi = probe;
    else lo = probe;
    steps.push({ lo, hi, probe, eps });
  }
  return { reachable: true, steps };
}

export interface Needles {
  prv: number;
  pld: number;
  rdp: number;
}

/** The three accountants' epsilons after one of them is moved by a share of its value (0.05 is plus five per cent). */
export function movedNeedles(base: Needles, moved: keyof Needles, shift: number): Needles {
  const out = { ...base };
  out[moved] = Math.max(0, base[moved] * (1 + (Number.isFinite(shift) ? shift : 0)));
  return out;
}
