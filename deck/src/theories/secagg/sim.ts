import { rng } from "../../sim/random";

/**
 * The toy behind the secure-sum slides. The arithmetic is real: fixed-point words and masks
 * live in 64 bits and wrap modulo 2^64, exactly as in src/prism/fl/secagg.py. The one thing
 * that is a stand-in is where a pairwise mask comes from. The project derives it with X25519,
 * HKDF and ChaCha20; the toy uses a small seeded generator so that it runs in the browser.
 */

export const MOD = 1n << 64n;
const HALF = 1n << 63n;
/** Updates are clipped to [-CLIP, CLIP] before encoding, as in the project's settings. */
export const CLIP = 5;
export const SCALE_BITS = 32;
export const N_USERS = 6;

export function wrap(x: bigint): bigint {
  return ((x % MOD) + MOD) % MOD;
}

/** Fixed-point encoding: scale by 2^32 / clip, round, store as two's complement in 64 bits. */
export function encodeValue(x: number): bigint {
  if (!Number.isFinite(x)) throw new RangeError("update contains NaN or infinite values");
  if (Math.abs(x) > CLIP * (1 + 1e-6)) throw new RangeError("update coordinate exceeds the clip norm");
  return wrap(BigInt(Math.round(x * (2 ** SCALE_BITS / CLIP))));
}

/** Reads a 64-bit word as signed two's complement and scales it back to a real number. */
export function decodeWord(w: bigint): number {
  const signed = wrap(w) >= HALF ? wrap(w) - MOD : wrap(w);
  return Number(signed) * (CLIP / 2 ** SCALE_BITS);
}

export function hex64(w: bigint): string {
  return wrap(w).toString(16).padStart(16, "0");
}

/** The lowest `digits` hex digits of a word, for labels. */
export function hexLow(w: bigint, digits = 8): string {
  return hex64(w).slice(16 - digits);
}

/* ---------------------------------------------------------------- masks */

function mix(a: number, b: number): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x7f4a7c15, 0xc2b2ae35);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return h >>> 0;
}

/** One 32-bit seed per unordered pair and round: both users of a pair get the same one. */
export function pairSeed(seed: number, round: number, i: number, j: number): number {
  const lo = Math.min(i, j);
  const hi = Math.max(i, j);
  return mix(mix(mix(seed >>> 0, round >>> 0), lo), hi);
}

/** The mask of a pair, expanded to `length` 64-bit words. Symmetric in i and j. */
export function pairMask(seed: number, round: number, i: number, j: number, length: number): bigint[] {
  const r = rng(pairSeed(seed, round, i, j));
  const out: bigint[] = [];
  for (let k = 0; k < length; k++) {
    const hi = BigInt(Math.floor(r() * 4294967296));
    const lo = BigInt(Math.floor(r() * 4294967296));
    out.push((hi << 32n) | lo);
  }
  return out;
}

/* ---------------------------------------------------------------- the toy round */

export interface Toy {
  n: number;
  length: number;
  seed: number;
  round: number;
  /** Plain real-valued updates, one vector per user. */
  updates: number[][];
}

export function makeToy(n: number, length: number, seed: number, round = 1): Toy {
  const r = rng(seed * 7919 + 13);
  const updates: number[][] = [];
  for (let i = 0; i < n; i++) {
    const row: number[] = [];
    for (let k = 0; k < length; k++) row.push(Math.round((r() * 2 - 1) * 2.5 * 100) / 100);
    updates.push(row);
  }
  return { n, length, seed, round, updates };
}

function encodeRow(row: number[]): bigint[] {
  return row.map(encodeValue);
}

/** What user i sends: its encoded update, plus each higher peer's mask and minus each lower peer's. */
export function maskedUpdate(toy: Toy, i: number): bigint[] {
  const out = encodeRow(toy.updates[i]);
  for (let p = 0; p < toy.n; p++) {
    if (p === i) continue;
    const mask = pairMask(toy.seed, toy.round, i, p, toy.length);
    for (let k = 0; k < toy.length; k++) out[k] = wrap(i < p ? out[k] + mask[k] : out[k] - mask[k]);
  }
  return out;
}

export interface SecureSumRun {
  survivors: number[];
  /** Fixed-point updates of all users. */
  encoded: bigint[][];
  /** Masked updates of all users (a dropped user's is computed but never arrives). */
  masked: bigint[][];
  /** Modular sum of the survivors' masked updates, before any seed is revealed. */
  total: bigint[];
  /** The total with the dropped users' masks removed. */
  unmasked: bigint[];
  /** The total read as numbers without removing anything: noise when someone dropped. */
  naive: number[];
  /** The unmasked total read as numbers. */
  decoded: number[];
  /** The true sum of the survivors' plain updates. */
  truth: number[];
  /** Seeds the survivors reveal: one for each (survivor, dropped) pair. */
  revealed: { survivor: number; dropped: number }[];
}

export function secureSum(toy: Toy, dropped: number[] = []): SecureSumRun {
  const drop = new Set(dropped);
  for (const d of drop) if (!Number.isInteger(d) || d < 0 || d >= toy.n) throw new RangeError("dropped contains an invalid user");
  const survivors = Array.from({ length: toy.n }, (_, i) => i).filter((i) => !drop.has(i));
  if (survivors.length === 0) throw new RangeError("no surviving users");

  const encoded = toy.updates.map(encodeRow);
  const masked = toy.updates.map((_, i) => maskedUpdate(toy, i));
  const total: bigint[] = new Array<bigint>(toy.length).fill(0n);
  for (const s of survivors) for (let k = 0; k < toy.length; k++) total[k] = wrap(total[k] + masked[s][k]);

  const unmasked = total.slice();
  const revealed: { survivor: number; dropped: number }[] = [];
  for (const s of survivors) {
    for (const d of drop) {
      revealed.push({ survivor: s, dropped: d });
      const mask = pairMask(toy.seed, toy.round, s, d, toy.length);
      // The survivor added this mask if it has the lower number, so the server takes it back out.
      for (let k = 0; k < toy.length; k++) unmasked[k] = wrap(s < d ? unmasked[k] - mask[k] : unmasked[k] + mask[k]);
    }
  }
  const truth = new Array<number>(toy.length).fill(0);
  for (const s of survivors) for (let k = 0; k < toy.length; k++) truth[k] += toy.updates[s][k];
  return { survivors, encoded, masked, total, unmasked, naive: total.map(decodeWord), decoded: unmasked.map(decodeWord), truth, revealed };
}

/** Which unordered pairs exist among n users, as [low, high], in a fixed order. */
export function pairsOf(n: number): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) out.push([i, j]);
  return out;
}

/* ---------------------------------------------------------------- the cohort toy (what a sum still shows) */

export const GRID_ITEMS = 48;
export const GRID_COLS = 8;
export const OTHER_ITEMS = 5;
export const TARGET_ITEMS = 6;
export const MAX_COHORT = 100;

export interface CohortTable {
  /** The items the one target user touched. */
  target: number[];
  /** How often an average other user touches each item (what the attacker is assumed to know). */
  popularity: Float64Array;
  /** cumulative[n] holds the item counts summed over the first n other users. */
  cumulative: Float32Array[];
}

export function buildCohortTable(seed: number): CohortTable {
  const r = rng(seed * 104729 + 7);
  // Popularity falls off with rank; which item has which rank is shuffled by the seed.
  const order = Array.from({ length: GRID_ITEMS }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const weight = new Float64Array(GRID_ITEMS);
  order.forEach((item, rank) => {
    weight[item] = 1 / (rank + 1) ** 0.85;
  });
  const weightSum = weight.reduce((s, w) => s + w, 0);
  const popularity = new Float64Array(GRID_ITEMS);
  for (let i = 0; i < GRID_ITEMS; i++) popularity[i] = (OTHER_ITEMS * weight[i]) / weightSum;

  // The target picks uniformly: it is nobody in particular.
  const pool = Array.from({ length: GRID_ITEMS }, (_, i) => i);
  const target: number[] = [];
  for (let k = 0; k < TARGET_ITEMS; k++) target.push(pool.splice(Math.floor(r() * pool.length), 1)[0]);
  target.sort((a, b) => a - b);

  const cumulative: Float32Array[] = [new Float32Array(GRID_ITEMS)];
  for (let u = 0; u < MAX_COHORT - 1; u++) {
    const next = Float32Array.from(cumulative[u]);
    const left = weight.slice();
    let leftSum = weightSum;
    for (let k = 0; k < OTHER_ITEMS; k++) {
      let x = r() * leftSum;
      let pick = GRID_ITEMS - 1;
      for (let i = 0; i < GRID_ITEMS; i++) {
        if (left[i] === 0) continue;
        x -= left[i];
        if (x <= 0) {
          pick = i;
          break;
        }
      }
      while (left[pick] === 0) pick = (pick + 1) % GRID_ITEMS;
      next[pick] += 1;
      leftSum -= left[pick];
      left[pick] = 0;
    }
    cumulative.push(next);
  }
  return { target, popularity, cumulative };
}

export interface CohortView {
  n: number;
  /** Item counts from the other users in the sum. */
  others: Float32Array;
  /** The target's own counts: 1 on the items it touched. */
  mine: Float32Array;
  total: Float32Array;
  /** Of the target's items, how many are in the attacker's top guesses after removing the popularity prior. */
  hits: number;
  /** Average over the target's items of the target's share of the bar. */
  share: number;
}

export function cohortView(table: CohortTable, cohort: number): CohortView {
  const n = Number.isFinite(cohort) ? Math.min(MAX_COHORT, Math.max(1, Math.round(cohort))) : 1;
  const others = table.cumulative[n - 1];
  const mine = new Float32Array(GRID_ITEMS);
  for (const i of table.target) mine[i] = 1;
  const total = new Float32Array(GRID_ITEMS);
  for (let i = 0; i < GRID_ITEMS; i++) total[i] = others[i] + mine[i];

  const scored = Array.from({ length: GRID_ITEMS }, (_, i) => ({ i, score: total[i] - (n - 1) * table.popularity[i] }));
  scored.sort((a, b) => b.score - a.score || a.i - b.i);
  const guess = new Set(scored.slice(0, TARGET_ITEMS).map((s) => s.i));
  const hits = table.target.filter((i) => guess.has(i)).length;
  const share = table.target.reduce((s, i) => s + 1 / total[i], 0) / table.target.length;
  return { n, others, mine, total, hits, share };
}

/** The items the attacker would name: the top scores after the popularity prior is removed. */
export function attackerGuess(table: CohortTable, view: CohortView): number[] {
  const scored = Array.from({ length: GRID_ITEMS }, (_, i) => ({ i, score: view.total[i] - (view.n - 1) * table.popularity[i] }));
  scored.sort((a, b) => b.score - a.score || a.i - b.i);
  return scored.slice(0, TARGET_ITEMS).map((s) => s.i);
}
