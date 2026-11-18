import { gaussian, rng, shuffle } from "../../sim/random";

/**
 * A toy of targeted promotion, in three dimensions so that it can be drawn.
 * Coordinate 0 is the push on the target business; coordinates 1 and 2 stand for two other
 * businesses. An update is a vector of three numbers. Every aggregate here is on the scale of a
 * per-user mean (the real code returns the sum-equivalent, which is n times larger).
 */
export const DIM = 3;
export const TARGET = 0;
/** Users in the toy. Small enough to draw one arrow each. */
export const N_USERS = 60;
/** The norm bound every update must satisfy. Attackers use all of it. */
export const CLIP = 1.5;
/** Chance that an honest user touches a given business at all: most coordinates are zero. */
export const P_TOUCH = 0.45;
/** Seed of the population the scenes draw. */
export const SEED = 11;
/** The share of the cohort cut from each end by the trimmed mean, as in results/poisoning.json. */
export const TRIM_FRACTION_DEFAULT = 0.35;

export interface Population {
  n: number;
  /** n updates, DIM numbers each: the honest ones, with attackers' rows replaced by the crafted push. */
  updates: Float64Array;
  /** The same users with nobody attacking: the reference an aggregator should recover. */
  honest: Float64Array;
  isAttacker: boolean[];
  nAttackers: number;
}

/** Attacker accounts for a share of the cohort, rounded as the Python does. */
export function attackerCount(n: number, share: number): number {
  return Math.max(0, Math.min(n, Math.round(share * n)));
}

/** The crafted update: the whole norm bound, pointing at the target. */
export function attackerUpdate(): number[] {
  const v = new Array<number>(DIM).fill(0);
  v[TARGET] = CLIP;
  return v;
}

/**
 * Honest users are generated first and never depend on the share. Attackers are the first k
 * users of a seeded permutation, so the attacker sets nest as the share grows.
 */
export function makePopulation(n: number, share: number, seed: number = SEED): Population {
  const size = Math.max(0, Math.floor(n));
  const r = rng(seed);
  const honest = new Float64Array(size * DIM);
  for (let u = 0; u < size; u++) {
    for (let d = 0; d < DIM; d++) {
      const touches = r() < P_TOUCH;
      const g = gaussian(r);
      let value: number;
      if (d === TARGET) value = Math.max(-0.6, Math.min(0.6, 0.25 * g));
      else value = Math.max(0.2, Math.min(0.9, 0.5 + 0.15 * g));
      honest[u * DIM + d] = touches ? value : 0;
    }
  }
  const order = shuffle(Array.from({ length: size }, (_, i) => i), rng(seed * 104729 + 7));
  const k = attackerCount(size, share);
  const isAttacker = new Array<boolean>(size).fill(false);
  for (let i = 0; i < k; i++) isAttacker[order[i]] = true;
  const updates = honest.slice();
  const push = attackerUpdate();
  for (let u = 0; u < size; u++) if (isAttacker[u]) for (let d = 0; d < DIM; d++) updates[u * DIM + d] = push[d];
  return { n: size, updates, honest, isAttacker, nAttackers: k };
}

function column(updates: Float64Array, n: number, d: number): number[] {
  const out = new Array<number>(n);
  for (let u = 0; u < n; u++) out[u] = updates[u * DIM + d];
  return out;
}

function ascending(xs: number[]): number[] {
  return xs.slice().sort((a, b) => a - b);
}

function meanOf(xs: number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((s, x) => s + x, 0) / xs.length;
}

/** The plain average of every update, what a secure sum delivers (divided by the cohort size). */
export function sumMean(pop: Population): Float64Array {
  const out = new Float64Array(DIM);
  for (let d = 0; d < DIM; d++) out[d] = meanOf(column(pop.updates, pop.n, d));
  return out;
}

/** The cut used by the Python: floor of the fraction times the cohort, never past the middle. */
export function trimCount(n: number, trim: number): number {
  const t = Math.max(0, Math.min(0.4999, Number.isFinite(trim) ? trim : 0));
  return Math.floor(t * n);
}

/** Per coordinate: sort, cut the lowest and highest, average the rest. Needs every update in plaintext. */
export function trimmedMean(pop: Population, trim: number): Float64Array {
  const out = new Float64Array(DIM);
  const cut = trimCount(pop.n, trim);
  for (let d = 0; d < DIM; d++) {
    const sorted = ascending(column(pop.updates, pop.n, d));
    out[d] = meanOf(sorted.slice(cut, pop.n - cut));
  }
  return out;
}

/** Per coordinate, the middle value; for an even cohort the lower of the two, as torch.median does. */
export function coordinateMedian(pop: Population): Float64Array {
  const out = new Float64Array(DIM);
  if (pop.n === 0) return out;
  for (let d = 0; d < DIM; d++) out[d] = ascending(column(pop.updates, pop.n, d))[(pop.n - 1) >> 1];
  return out;
}

export interface Deal {
  /** Number of committees. */
  count: number;
  /** Committee of every user. */
  of: Int32Array;
}

/**
 * Users dealt at random into committees of about `size`, as make_committee_median does: the
 * count is the cohort over the size, rounded, at most one per user. Fewer than two means one
 * committee holding everybody. Sizes differ by at most one (numpy's array_split).
 */
export function dealCommittees(n: number, size: number, seed: number): Deal {
  const users = Math.max(0, Math.floor(n));
  const safeSize = Math.max(1, Number.isFinite(size) ? size : 1);
  let count = Math.min(Math.round(users / safeSize), users);
  if (count < 2) count = users > 0 ? 1 : 0;
  const of = new Int32Array(users);
  if (count <= 1) return { count, of };
  const order = shuffle(Array.from({ length: users }, (_, i) => i), rng(seed));
  const base = Math.floor(users / count);
  const extra = users % count;
  let at = 0;
  for (let c = 0; c < count; c++) {
    const len = base + (c < extra ? 1 : 0);
    for (let j = 0; j < len; j++) of[order[at++]] = c;
  }
  return { count, of };
}

/** The sum of every committee's updates: the only thing the server sees in this scheme. */
export function committeeSums(pop: Population, deal: Deal): Float64Array {
  const sums = new Float64Array(deal.count * DIM);
  for (let u = 0; u < pop.n; u++) for (let d = 0; d < DIM; d++) sums[deal.of[u] * DIM + d] += pop.updates[u * DIM + d];
  return sums;
}

/** Which committees hold at least one attacker. */
export function contaminated(pop: Population, deal: Deal): boolean[] {
  const out = new Array<boolean>(deal.count).fill(false);
  for (let u = 0; u < pop.n; u++) if (pop.isAttacker[u]) out[deal.of[u]] = true;
  return out;
}

/** The share of committees in one particular deal that hold no attacker (a seeded count). */
export function realisedCleanShare(pop: Population, deal: Deal): number {
  if (deal.count === 0) return 1;
  return contaminated(pop, deal).filter((bad) => !bad).length / deal.count;
}

/**
 * Secure sum inside each committee, then the coordinate-wise median of the committee sums,
 * times the number of committees, divided by the cohort. With fewer than two committees it is
 * the plain mean, as in the Python.
 */
export function committeeMedian(pop: Population, size: number, seed: number): Float64Array {
  const deal = dealCommittees(pop.n, size, seed);
  if (deal.count < 2) return sumMean(pop);
  const sums = committeeSums(pop, deal);
  const out = new Float64Array(DIM);
  const middle = deal.count >> 1;
  for (let d = 0; d < DIM; d++) {
    const sorted = ascending(column(sums, deal.count, d));
    const median = deal.count % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
    out[d] = (median * deal.count) / pop.n;
  }
  return out;
}

/**
 * The chance that a committee of `size` accounts drawn at random from `nUsers`, of which
 * `nAttackers` are attackers, holds none: the exact (hypergeometric) probability, a product of
 * (n minus a minus i) over (n minus i). The Python module uses the binomial approximation
 * (1 minus the share) to the power of the size; they agree closely for a large cohort. This is
 * a probability, not a count from a particular deal (see realisedCleanShare for that).
 */
export function cleanCommitteeShare(nUsers: number, nAttackers: number, size: number): number {
  const n = Math.max(0, Math.floor(nUsers));
  const a = Math.max(0, Math.min(n, Math.floor(nAttackers)));
  const s = Math.max(0, Math.min(n, Math.floor(size)));
  if (a === 0 || s === 0) return 1;
  if (n - a < s) return 0;
  let p = 1;
  for (let i = 0; i < s; i++) p *= (n - a - i) / (n - i);
  return p;
}

/** How far the aggregate pushes the target business: its coordinate 0. */
export function targetPush(aggregate: ArrayLike<number>): number {
  return aggregate[TARGET];
}

/** The mean of the honest updates alone: what the aggregate should be with nobody attacking. */
export function honestMean(pop: Population): Float64Array {
  return sumMean({ ...pop, updates: pop.honest });
}

/**
 * How much of the honest signal on the other businesses survives: the aggregate's projection on
 * the honest mean over those coordinates, as a fraction of it. 1 keeps all of it, 0 erases it.
 */
export function signalKept(aggregate: ArrayLike<number>, pop: Population): number {
  const h = honestMean(pop);
  let dot = 0;
  let norm = 0;
  for (let d = 0; d < DIM; d++) {
    if (d === TARGET) continue;
    dot += aggregate[d] * h[d];
    norm += h[d] * h[d];
  }
  return norm > 0 ? dot / norm : 0;
}

/** Euclidean length of a vector. */
export function norm(v: ArrayLike<number>): number {
  let s = 0;
  for (let d = 0; d < DIM; d++) s += v[d] * v[d];
  return Math.sqrt(s);
}

export type AggregatorKind = "sum" | "trimmed" | "median";

/** The aggregate of a population by the named aggregator. */
export function aggregate(pop: Population, kind: AggregatorKind, trim: number): Float64Array {
  if (kind === "trimmed") return trimmedMean(pop, trim);
  if (kind === "median") return coordinateMedian(pop);
  return sumMean(pop);
}
