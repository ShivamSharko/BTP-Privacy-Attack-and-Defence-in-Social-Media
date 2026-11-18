import { bernoulliMask, rng } from "../../sim/random";

/** Devices drawn in the scene. Small enough to watch, large enough for a cohort to vary. */
export const N_DEVICES = 60;

/** Poisson sampling: every user flips an independent coin with probability q. Returns the chosen indices. */
export function sampleCohort(n: number, q: number, r: () => number): number[] {
  const mask = bernoulliMask(n, Math.max(0, Math.min(1, q)), r);
  const out: number[] = [];
  for (let i = 0; i < n; i++) if (mask[i]) out.push(i);
  return out;
}

/** The cohort size the server divides by: a public constant, not the size that happened. */
export function expectedCohort(n: number, q: number): number {
  return n * q;
}

/** Chance that nobody is sampled in a round. */
export function probabilityEmpty(n: number, q: number): number {
  return (1 - Math.max(0, Math.min(1, q))) ** n;
}

/** The cohort for a given round, the same every time the deck is opened. */
export function cohortForRound(round: number, q: number, n = N_DEVICES): number[] {
  return sampleCohort(n, q, rng(7919 * (round + 1) + Math.round(q * 1000)));
}

export interface Histogram {
  /** counts[size] = rounds whose cohort had that many users. */
  counts: number[];
  rounds: number;
  empty: number;
  total: number;
}

export function emptyHistogram(n = N_DEVICES): Histogram {
  return { counts: new Array<number>(n + 1).fill(0), rounds: 0, empty: 0, total: 0 };
}

export function addRound(h: Histogram, size: number): Histogram {
  const counts = h.counts.slice();
  const bin = Math.max(0, Math.min(counts.length - 1, Math.round(size)));
  counts[bin] += 1;
  return { counts, rounds: h.rounds + 1, empty: h.empty + (bin === 0 ? 1 : 0), total: h.total + bin };
}

export function meanSize(h: Histogram): number {
  return h.rounds === 0 ? 0 : h.total / h.rounds;
}

/** Devices on a tilted band around the model, xyz per device. */
export function deviceLayout(n: number, seed: number): Float32Array {
  const r = rng(seed);
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const angle = (i / n) * Math.PI * 2 + (r() - 0.5) * 0.06;
    const radius = 3.9 + (r() - 0.5) * 0.9;
    out[i * 3] = Math.cos(angle) * radius;
    out[i * 3 + 1] = (r() - 0.5) * 1.1 + Math.sin(angle * 2) * 0.35;
    out[i * 3 + 2] = Math.sin(angle) * radius;
  }
  return out;
}
