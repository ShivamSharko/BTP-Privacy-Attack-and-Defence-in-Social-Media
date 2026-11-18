import { gaussian, rng, shuffle } from "../../sim/random";

/** Devices on the ring. Enough for the shares on the slider to give different counts. */
export const N_DEVICES = 36;
/** Length of an update vector in the toy. */
export const DIM = 32;
/** Radius of the ring in the scene. */
export const RING_RADIUS = 4;

export type Behaviour = "zero" | "noise";

/** How strongly every honest update points along the shared direction, against its own spread. */
const SHARED = 0.65;
const SPREAD = Math.sqrt(1 - SHARED * SHARED);

export interface Round {
  /** What each device sends: honest updates, with the free-riders' rows replaced. */
  updates: number[][];
  /** What each device would have sent if it had done the work. */
  honest: number[][];
  isRider: boolean[];
  /** The shared direction every honest update leans towards (unit length). */
  direction: number[];
  /** The server's step: the sum of all updates divided by the number of devices. */
  aggregate: number[];
  norms: number[];
  /** Cosine of each update to the mean of the others. */
  cosines: number[];
}

const dot = (a: readonly number[], b: readonly number[]) => a.reduce((s, x, i) => s + x * b[i], 0);
const norm = (a: readonly number[]) => Math.sqrt(dot(a, a));

export function norms(updates: readonly (readonly number[])[]): number[] {
  return updates.map(norm);
}

/**
 * Cosine of every update to the mean of the other updates: the aggregate as that device sees
 * it left out, as in `detection_scores` in the project's code. A zero update, or a round of
 * one device, has cosine 0.
 */
export function cosineToAggregate(updates: readonly (readonly number[])[]): number[] {
  const n = updates.length;
  if (n === 0) return [];
  if (n < 2) return [0];
  const dim = updates[0].length;
  const total = new Array<number>(dim).fill(0);
  for (const u of updates) for (let j = 0; j < dim; j++) total[j] += u[j];
  return updates.map((u) => {
    const others = total.map((t, j) => (t - u[j]) / (n - 1));
    const denominator = norm(u) * norm(others);
    return denominator > 0 ? dot(u, others) / denominator : 0;
  });
}

/**
 * Area under the ROC curve for separating free-riders from contributors. Higher score means
 * more suspicious. Ties count half. With nobody on one side the answer is 0.5: a coin flip.
 */
export function detectionAuc(scores: readonly number[], isFreeRider: readonly boolean[]): number {
  const pos: number[] = [];
  const neg: number[] = [];
  scores.forEach((s, i) => (isFreeRider[i] ? pos : neg).push(s));
  if (pos.length === 0 || neg.length === 0) return 0.5;
  let wins = 0;
  for (const p of pos) for (const q of neg) wins += p > q ? 1 : p === q ? 0.5 : 0;
  return wins / (pos.length * neg.length);
}

/** Both detectors on one round: low norm is suspicious, and so is low cosine. */
export function detectorAucs(round: Pick<Round, "norms" | "cosines" | "isRider">): { norm: number; cosine: number } {
  return {
    norm: detectionAuc(round.norms.map((x) => -x), round.isRider),
    cosine: detectionAuc(round.cosines.map((x) => -x), round.isRider),
  };
}

function median(xs: readonly number[]): number {
  if (xs.length === 0) return 0;
  const s = xs.slice().sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** The rule drawn in the scene: flag an update whose norm is under half the median norm. */
export function flaggedByNorm(normsOfRound: readonly number[]): boolean[] {
  const limit = 0.5 * median(normsOfRound);
  return normsOfRound.map((x) => x < limit);
}

/** Flag an update whose cosine is under half the median cosine (never below 0). */
export function flaggedByCosine(cosinesOfRound: readonly number[]): boolean[] {
  const limit = 0.5 * Math.max(0, median(cosinesOfRound));
  return cosinesOfRound.map((x) => x < limit);
}

export function freeRiderCount(share: number, n = N_DEVICES): number {
  if (!Number.isFinite(share)) return 0;
  return Math.round(Math.max(0, Math.min(1, share)) * n);
}

/**
 * One round of the toy. Every device first computes an honest update (a shared direction plus
 * its own spread, scaled by how much data it has); the free-riders then replace theirs. The
 * honest updates, and which devices are free-riders, do not depend on the share or the
 * behaviour, so moving the slider changes only what the free-riders send.
 */
export function simulateRound(share: number, behaviour: Behaviour, seed: number, n = N_DEVICES, dim = DIM): Round {
  const dr = rng(101);
  const direction = Array.from({ length: dim }, () => gaussian(dr));
  const len = norm(direction) || 1;
  for (let j = 0; j < dim; j++) direction[j] /= len;

  const honest = Array.from({ length: n }, (_, i) => {
    const r = rng(seed * 7919 + i * 104729 + 1);
    const size = 0.7 + 0.6 * r();
    return direction.map((d) => size * (SHARED * d + (SPREAD / Math.sqrt(dim)) * gaussian(r)));
  });

  const order = shuffle(Array.from({ length: n }, (_, i) => i), rng(seed * 31 + 17));
  const isRider = new Array<boolean>(n).fill(false);
  for (const i of order.slice(0, freeRiderCount(share, n))) isRider[i] = true;

  const reference = honest.filter((_, i) => !isRider[i]);
  const target = norms(reference.length > 0 ? reference : honest).reduce((s, x) => s + x, 0) / Math.max(1, reference.length || n);

  const updates = honest.map((u, i) => {
    if (!isRider[i]) return u;
    if (behaviour === "zero") return new Array<number>(dim).fill(0);
    const r = rng(seed * 6151 + i * 2713 + 5);
    const noise = Array.from({ length: dim }, () => gaussian(r));
    const scale = target / (norm(noise) || 1);
    return noise.map((x) => x * scale);
  });

  const aggregate = new Array<number>(dim).fill(0);
  for (const u of updates) for (let j = 0; j < dim; j++) aggregate[j] += u[j] / Math.max(1, n);

  return { updates, honest, isRider, direction, aggregate, norms: norms(updates), cosines: cosineToAggregate(updates) };
}

/**
 * Stand-in for usefulness. `useful` is the aggregate's component along the honest direction,
 * relative to the same round with no free-riders (1 means no loss). `offTarget` is the size of
 * the rest of the aggregate on the same scale.
 */
export function aggregateAlignment(round: Pick<Round, "aggregate" | "honest" | "direction">): { useful: number; offTarget: number } {
  const n = Math.max(1, round.honest.length);
  const dim = round.direction.length;
  const reference = new Array<number>(dim).fill(0);
  for (const u of round.honest) for (let j = 0; j < dim; j++) reference[j] += u[j] / n;
  const base = dot(reference, round.direction);
  if (!(base > 0)) return { useful: 0, offTarget: 0 };
  const along = dot(round.aggregate, round.direction);
  const rest = round.aggregate.map((x, j) => x - along * round.direction[j]);
  return { useful: along / base, offTarget: norm(rest) / base };
}

/** Devices on a flat ring, xyz per device. The device at index 0 is at the front-left. */
export function deviceRing(n: number, radius = RING_RADIUS): Float32Array {
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.PI * 0.5;
    out[i * 3] = Math.cos(a) * radius;
    out[i * 3 + 1] = 0;
    out[i * 3 + 2] = Math.sin(a) * radius;
  }
  return out;
}
