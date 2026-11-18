import { gaussian, rng, shuffle } from "../../sim/random";

/**
 * A toy of the real scoring in src/prism/models/hybrid.py, small enough to see.
 *
 * The real model works in 16 dimensions over thousands of items. Here every vector lives in
 * three dimensions, so that normalised item vectors sit on a sphere that fits on the screen.
 * The toy skips the d-by-d matrix applied to the user (it starts as the identity), and its
 * numbers are invented. Only the mechanism is real.
 */

export type V3 = [number, number, number];
export type Mode = "content" | "ids" | "hybrid";
export const MODES: readonly Mode[] = ["content", "ids", "hybrid"];

export const N_CLUSTERS = 4;
export const PER_CLUSTER = 14;
export const N_ITEMS = N_CLUSTERS * PER_CLUSTER;

/** Length of the recommendation list the scene lights up, and of the shorter list the comparison counts. */
export const TOP = 10;
export const COMPARE_TOP = 3;

/** How strongly popularity enters the score, in the same units as temperature times cosine. */
export const BIAS_SCALE = 3;

export interface Catalogue {
  n: number;
  /** Which cluster (kind of place) each item belongs to. */
  cluster: number[];
  /** Fixed content part of each item vector: it knows the kind of place, not the taste. */
  base: V3[];
  /** Trainable ID part: it has absorbed who likes what. */
  emb: V3[];
  /** Position inside its cluster along two taste directions (what the ID part learned). */
  taste: [number, number][];
  /** Popularity in (0, 1]. */
  pop: number[];
  /** Item bias: popularity on the score scale. */
  bias: number[];
  centres: V3[];
}

const norm = (v: readonly number[]): number => Math.hypot(v[0], v[1], v[2]);
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: readonly number[], b: readonly number[]): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a: V3): V3 => {
  const n = norm(a);
  return n > 1e-12 ? scale(a, 1 / n) : [0, 0, 0];
};

/** The four cluster centres: corners of a tetrahedron, as far apart on the sphere as four points can be. */
const CENTRES: V3[] = ([[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]] as V3[]).map(unit);

/** Two unit vectors at right angles to a centre, to spread items sideways around it. */
function tangentBasis(c: V3): [V3, V3] {
  const ref: V3 = Math.abs(c[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const e1 = unit(cross(c, ref));
  return [e1, unit(cross(c, e1))];
}

export function buildCatalogue(seed = 7): Catalogue {
  const r = rng(seed);
  const cluster: number[] = [];
  const base: V3[] = [];
  const emb: V3[] = [];
  const taste: [number, number][] = [];
  for (let k = 0; k < N_CLUSTERS; k++) {
    const c = CENTRES[k];
    const [e1, e2] = tangentBasis(c);
    for (let j = 0; j < PER_CLUSTER; j++) {
      const a = gaussian(r);
      const b = gaussian(r);
      cluster.push(k);
      taste.push([a, b]);
      // Content: text says what kind of place it is, so items of a kind are nearly identical.
      base.push(scale(unit(add(c, [0.05 * gaussian(r), 0.05 * gaussian(r), 0.05 * gaussian(r)])), 0.6));
      // IDs: learned from who visits what, so they spread along taste directions as well.
      const spread = add(scale(e1, 0.7 * a), scale(e2, 0.7 * b));
      emb.push(add(add(scale(c, 0.35), spread), [0.03 * gaussian(r), 0.03 * gaussian(r), 0.03 * gaussian(r)]));
    }
  }
  // A heavy-tailed popularity: a few items are visited by almost everyone.
  const order = shuffle([...Array(N_ITEMS).keys()], r);
  const pop = new Array<number>(N_ITEMS).fill(0);
  order.forEach((item, rank) => {
    pop[item] = 1 / (rank + 1) ** 1.2;
  });
  return { n: N_ITEMS, cluster, base, emb, taste, pop, bias: pop.map((p) => BIAS_SCALE * p), centres: CENTRES };
}

export const CATALOGUE = buildCatalogue(7);

/** The unnormalised item vector: content part, ID part, or their sum. */
export function rawVector(cat: Catalogue, i: number, mode: Mode): V3 {
  if (mode === "content") return cat.base[i];
  if (mode === "ids") return cat.emb[i];
  return add(cat.base[i], cat.emb[i]);
}

/** The item vector the score uses: normalised, so only its direction matters. */
export function itemVector(cat: Catalogue, i: number, mode: Mode): V3 {
  return unit(rawVector(cat, i, mode));
}

/** Normalised mean of the history's unnormalised item vectors. A zero vector for an empty history. */
export function userVector(cat: Catalogue, history: readonly number[], mode: Mode): V3 {
  const sum: V3 = [0, 0, 0];
  let count = 0;
  const seen = new Set<number>();
  for (const i of history) {
    if (!Number.isInteger(i) || i < 0 || i >= cat.n || seen.has(i)) continue;
    seen.add(i);
    const v = rawVector(cat, i, mode);
    sum[0] += v[0];
    sum[1] += v[1];
    sum[2] += v[2];
    count++;
  }
  return count === 0 ? [0, 0, 0] : unit(scale(sum, 1 / count));
}

/** temperature times cosine plus item bias, for every item. */
export function scores(cat: Catalogue, user: V3, temperature: number, mode: Mode): number[] {
  const out = new Array<number>(cat.n);
  for (let i = 0; i < cat.n; i++) out[i] = temperature * dot(user, itemVector(cat, i, mode)) + cat.bias[i];
  return out;
}

/** The k best items by score (ties broken by index), skipping the excluded ones. */
export function topK(s: readonly number[], k: number, exclude: readonly number[]): number[] {
  const skip = new Set(exclude);
  return s
    .map((value, i) => ({ value, i }))
    .filter((x) => !skip.has(x.i))
    .sort((a, b) => b.value - a.value || a.i - b.i)
    .slice(0, Math.max(0, k))
    .map((x) => x.i);
}

/**
 * Hide about half of a history, as training does. The real code flips a fair coin per item, so
 * it can by chance hide everything; the toy adjusts such a draw so a history of two or more
 * items always keeps at least one visible and at least one hidden item.
 */
export function splitHistory(history: readonly number[], seed: number): { visible: number[]; hidden: number[] } {
  if (history.length < 2) return { visible: [...history], hidden: [] };
  const r = rng(seed * 7919 + 13);
  const isHidden = history.map(() => r() < 0.5);
  if (isHidden.every(Boolean)) isHidden[Math.floor(r() * history.length)] = false;
  else if (!isHidden.some(Boolean)) isHidden[Math.floor(r() * history.length)] = true;
  return { visible: history.filter((_, i) => !isHidden[i]), hidden: history.filter((_, i) => isHidden[i]) };
}

/** Training loss of one user: mean negative log softmax probability of the hidden items, visible items masked out. */
export function softmaxLoss(
  cat: Catalogue,
  visible: readonly number[],
  hidden: readonly number[],
  temperature: number,
  mode: Mode,
): number {
  if (hidden.length === 0) return 0;
  const s = scores(cat, userVector(cat, visible, mode), temperature, mode);
  const masked = new Set(visible);
  let peak = -Infinity;
  for (let i = 0; i < cat.n; i++) if (!masked.has(i)) peak = Math.max(peak, s[i]);
  let total = 0;
  for (let i = 0; i < cat.n; i++) if (!masked.has(i)) total += Math.exp(s[i] - peak);
  const logTotal = peak + Math.log(total);
  return hidden.reduce((acc, i) => acc + (logTotal - s[i]), 0) / hidden.length;
}

/** Rank (1 is best) of each hidden item among the items that are not visible. */
export function hiddenRanks(
  cat: Catalogue,
  visible: readonly number[],
  hidden: readonly number[],
  temperature: number,
  mode: Mode,
): number[] {
  const order = topK(scores(cat, userVector(cat, visible, mode), temperature, mode), cat.n, visible);
  return hidden.map((h) => order.indexOf(h) + 1);
}

/** Twelve fixed users, three per kind of place, each with the five places nearest their taste. */
export function sampleUsers(cat: Catalogue, seed = 21): number[][] {
  const r = rng(seed);
  const users: number[][] = [];
  for (let k = 0; k < N_CLUSTERS; k++) {
    for (let u = 0; u < 3; u++) {
      const t: [number, number] = [gaussian(r) * 0.9, gaussian(r) * 0.9];
      const members = [...Array(cat.n).keys()].filter((i) => cat.cluster[i] === k);
      const d = (i: number) => Math.hypot(cat.taste[i][0] - t[0], cat.taste[i][1] - t[1]);
      members.sort((a, b) => d(a) - d(b));
      users.push(members.slice(0, 5).sort((a, b) => a - b));
    }
  }
  return users;
}

/** How many different items appear in the top-k lists of the sample users, and how often each appears. */
export function distinctTopK(cat: Catalogue, temperature: number, mode: Mode, k = 10): { distinct: number; counts: number[] } {
  const counts = new Array<number>(cat.n).fill(0);
  for (const history of sampleUsers(cat)) {
    const list = topK(scores(cat, userVector(cat, history, mode), temperature, mode), k, history);
    for (const i of list) counts[i]++;
  }
  return { distinct: counts.filter((c) => c > 0).length, counts };
}
