import { gaussian, rng } from "../../sim/random";
import { sortedMedian, sortedTrimmedMean } from "./robust";

/*
 * The closing sandbox: a complete toy federation small enough to train in the browser.
 *
 * 60 users in four taste groups pick from 40 items. The shared model is one small vector per
 * item; a user's taste is the average of the vectors of the items in their history, and an
 * item's score for that user is the dot product. Each round: Poisson sampling, one local
 * gradient step on each sampled device, per-user clipping, an aggregator (sum, trimmed mean or
 * median), Gaussian noise on the total, division by the public expected cohort, one server step.
 * Fake accounts push one target item that nobody has chosen. Everything is seeded.
 *
 * It is a toy: its numbers say nothing about the project's results.
 */

export const N_USERS = 60;
export const N_ITEMS = 40;
export const DIM = 6;
/** Values per item in the model: DIM taste coordinates and one popularity bias. */
export const ROW = DIM + 1;
/** The item the attackers promote. No honest user has it in their history. */
export const TARGET = N_ITEMS - 1;
/** Users per taste group; they sum to N_USERS. */
export const GROUP_SIZES = [22, 16, 13, 9] as const;
export const N_GROUPS = GROUP_SIZES.length;
/** Items 0-9 belong to group 0, 10-19 to group 1, and so on; group 3 has 30-38. */
export const ITEMS_PER_GROUP = 10;
export const HISTORY = 8;
export const HELD_OUT = 2;
export const TOP_K = 5;
/** Largest attacker share the slider allows: as many fake accounts as real users. */
export const MAX_SHARE = 0.5;
export const MAX_FAKES = N_USERS;
/** Clipping norm C for one user's whole update. */
export const CLIP = 1;
const LOCAL_LR = 2;
const SERVER_LR = 1.2;

export type Aggregator = "sum" | "trimmed" | "median";

export interface Settings {
  /** Noise multiplier z: the noise on the total has standard deviation z times C. */
  noise: number;
  /** Share of all accounts that are fake, 0 to MAX_SHARE. */
  share: number;
  /** Sampling rate: every account joins a round with this probability. */
  q: number;
  aggregator: Aggregator;
  /** Fraction cut from each end by the trimmed mean. */
  trim: number;
}

export interface ToyUser {
  group: number;
  train: number[];
  test: number[];
}

export interface World {
  users: ToyUser[];
  /** How many training histories hold each item. */
  popularity: Float64Array;
  /** Each fake account's cover history: the most popular item of every group. */
  fakes: number[][];
}

export interface Sandbox {
  world: World;
  dim: number;
  /** Item rows, N_ITEMS rows of ROW: taste vector, then bias. Mutated in place by runRound. */
  V: Float64Array;
  rand: () => number;
  round: number;
  /** Scratch space, allocated once. */
  updates: Float64Array;
  column: Float64Array;
  total: Float64Array;
  profile: Float64Array;
  scores: Float64Array;
  grad: Float64Array;
  back: Float64Array;
}

export interface RoundInfo {
  /** Indices of the sampled accounts: 0 to 59 are real users, 60 and up are fake. */
  cohort: number[];
  attackers: number;
}

const clamp = (x: number, lo: number, hi: number) => (Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : lo);

function groupItems(g: number): number[] {
  const out: number[] = [];
  for (let j = g * ITEMS_PER_GROUP; j < (g + 1) * ITEMS_PER_GROUP && j < N_ITEMS; j++) if (j !== TARGET) out.push(j);
  return out;
}

/** Draws one item from a list with weights falling by rank, skipping those already taken. */
function pickWeighted(items: number[], taken: Set<number>, r: () => number): number {
  const free = items.filter((j) => !taken.has(j));
  if (free.length === 0) return -1;
  let total = 0;
  const w = free.map((_, k) => {
    const v = 1 / (k + 1) ** 0.6;
    total += v;
    return v;
  });
  let u = r() * total;
  for (let k = 0; k < free.length; k++) {
    u -= w[k];
    if (u <= 0) return free[k];
  }
  return free[free.length - 1];
}

export function makeWorld(seed: number): World {
  const r = rng(seed);
  const users: ToyUser[] = [];
  GROUP_SIZES.forEach((size, g) => {
    const own = groupItems(g);
    for (let k = 0; k < size; k++) {
      const taken = new Set<number>();
      const order: number[] = [];
      while (order.length < HISTORY) {
        const stray = r() < 0.15;
        const pool = stray ? groupItems((g + 1 + Math.floor(r() * (N_GROUPS - 1))) % N_GROUPS) : own;
        const j = pickWeighted(pool, taken, r);
        if (j < 0) continue;
        taken.add(j);
        order.push(j);
      }
      // Hold out two items at random; the rest is the training history.
      for (let i = order.length - 1; i > 0; i--) {
        const s = Math.floor(r() * (i + 1));
        [order[i], order[s]] = [order[s], order[i]];
      }
      users.push({ group: g, train: order.slice(HELD_OUT), test: order.slice(0, HELD_OUT) });
    }
  });
  const popularity = new Float64Array(N_ITEMS);
  for (const u of users) for (const j of u.train) popularity[j] += 1;
  const fakes: number[][] = [];
  for (let f = 0; f < MAX_FAKES; f++) {
    const g = f % N_GROUPS;
    fakes.push(Array.from({ length: N_GROUPS }, (_, k) => groupItems((g + k) % N_GROUPS)[0]));
  }
  return { users, popularity, fakes };
}

export function createSandbox(seed = 1): Sandbox {
  const world = makeWorld(seed);
  const init = rng(seed * 7919 + 17);
  const V = new Float64Array(N_ITEMS * ROW);
  for (let i = 0; i < V.length; i++) V[i] = i % ROW === DIM ? 0 : gaussian(init) * 0.1;
  const size = N_ITEMS * ROW;
  return {
    world,
    dim: ROW,
    V,
    rand: rng(seed * 104729 + 3),
    round: 0,
    updates: new Float64Array((N_USERS + MAX_FAKES) * size),
    column: new Float64Array(N_USERS + MAX_FAKES),
    total: new Float64Array(size),
    profile: new Float64Array(ROW),
    scores: new Float64Array(N_ITEMS),
    grad: new Float64Array(N_ITEMS),
    back: new Float64Array(DIM),
  };
}

/** Fake accounts for a share of all accounts: share = fakes / (real + fakes). */
export function fakeCount(share: number): number {
  const s = clamp(share, 0, MAX_SHARE);
  return Math.min(MAX_FAKES, Math.round((N_USERS * s) / (1 - s)));
}

/** Writes the user's taste (mean of their items' vectors, then a constant 1 for the bias) into sb.profile. */
function profileOf(sb: Sandbox, items: number[]): void {
  const p = sb.profile;
  p.fill(0);
  p[DIM] = 1;
  if (items.length === 0) return;
  for (const j of items) for (let d = 0; d < DIM; d++) p[d] += sb.V[j * ROW + d];
  for (let d = 0; d < DIM; d++) p[d] /= items.length;
}

/** Scores every item for the profile in sb.profile, into sb.scores. */
function scoreAll(sb: Sandbox): void {
  for (let i = 0; i < N_ITEMS; i++) {
    let s = 0;
    for (let d = 0; d < ROW; d++) s += sb.V[i * ROW + d] * sb.profile[d];
    sb.scores[i] = s;
  }
}

/**
 * One local step: the device hides part of its history, builds its taste from the visible
 * part and takes a softmax cross-entropy step towards ranking the hidden items first,
 * differentiated through the item vectors and the taste. Writes minus the gradient times the
 * local rate into `out` (N_ITEMS * ROW values from `offset`).
 */
function localUpdate(sb: Sandbox, visible: number[], hidden: number[], out: Float64Array, offset: number): void {
  const size = N_ITEMS * ROW;
  for (let k = 0; k < size; k++) out[offset + k] = 0;
  if (visible.length === 0 || hidden.length === 0) return;
  profileOf(sb, visible);
  scoreAll(sb);
  let max = -Infinity;
  for (let i = 0; i < N_ITEMS; i++) max = Math.max(max, sb.scores[i]);
  let z = 0;
  for (let i = 0; i < N_ITEMS; i++) {
    const e = Math.exp(sb.scores[i] - max);
    sb.grad[i] = e;
    z += e;
  }
  for (let i = 0; i < N_ITEMS; i++) sb.grad[i] /= z;
  for (const j of hidden) sb.grad[j] -= 1 / hidden.length;
  // dL/dV_i = g_i p, and every visible item also gets (1/|visible|) V^T g through the taste.
  const back = sb.back;
  back.fill(0);
  for (let i = 0; i < N_ITEMS; i++) {
    for (let d = 0; d < ROW; d++) out[offset + i * ROW + d] = -LOCAL_LR * sb.grad[i] * sb.profile[d];
    for (let d = 0; d < DIM; d++) back[d] += sb.V[i * ROW + d] * sb.grad[i];
  }
  for (const j of visible) for (let d = 0; d < DIM; d++) out[offset + j * ROW + d] -= (LOCAL_LR * back[d]) / visible.length;
}

/** A real user's update: a random half of the history is hidden, at least one item each way. */
function honestUpdate(sb: Sandbox, user: ToyUser, out: Float64Array, offset: number): void {
  const visible: number[] = [];
  const hidden: number[] = [];
  for (const j of user.train) (sb.rand() < 0.5 ? visible : hidden).push(j);
  if (visible.length === 0 && hidden.length > 1) visible.push(hidden.pop() as number);
  if (hidden.length === 0 && visible.length > 1) hidden.push(visible.pop() as number);
  localUpdate(sb, visible, hidden, out, offset);
  clip(out, offset, false);
}

/** Scales the update at `offset` to norm at most C (exactly C when `exact`). */
function clip(out: Float64Array, offset: number, exact: boolean): void {
  const size = N_ITEMS * ROW;
  let sq = 0;
  for (let k = 0; k < size; k++) sq += out[offset + k] ** 2;
  const norm = Math.sqrt(sq);
  if (!(norm > 0)) return;
  const factor = exact ? CLIP / norm : Math.min(1, CLIP / norm);
  for (let k = 0; k < size; k++) out[offset + k] *= factor;
}

/**
 * A fake account's update: the step an honest device would take if its visible history were
 * the cover items and the hidden item the target. Only the target's row is kept, scaled to
 * norm exactly C, the largest change clipping allows.
 */
function attackerUpdate(sb: Sandbox, fake: number, out: Float64Array, offset: number): void {
  localUpdate(sb, sb.world.fakes[fake], TARGET_ONLY, out, offset);
  const size = N_ITEMS * ROW;
  for (let k = 0; k < size; k++) if (Math.floor(k / ROW) !== TARGET) out[offset + k] = 0;
  clip(out, offset, true);
}
const TARGET_ONLY = [TARGET];

/**
 * One federated round, in place: sample, compute, clip, aggregate, add noise, divide by the
 * public expected cohort, step. The robust aggregators are scaled by the cohort size so that
 * all three are on the scale of a sum.
 */
export function runRound(sb: Sandbox, settings: Settings): RoundInfo {
  const fakes = fakeCount(settings.share);
  const accounts = N_USERS + fakes;
  const q = clamp(settings.q, 0, 1);
  const size = N_ITEMS * ROW;
  const cohort: number[] = [];
  for (let a = 0; a < accounts; a++) if (sb.rand() < q) cohort.push(a);

  let attackers = 0;
  cohort.forEach((a, m) => {
    if (a < N_USERS) {
      honestUpdate(sb, sb.world.users[a], sb.updates, m * size);
    } else {
      attackers++;
      attackerUpdate(sb, a - N_USERS, sb.updates, m * size);
    }
  });

  const n = cohort.length;
  const total = sb.total;
  for (let k = 0; k < size; k++) {
    if (n === 0) {
      total[k] = 0;
      continue;
    }
    if (settings.aggregator === "sum") {
      let s = 0;
      for (let m = 0; m < n; m++) s += sb.updates[m * size + k];
      total[k] = s;
    } else {
      const column = sb.column.subarray(0, n);
      for (let m = 0; m < n; m++) column[m] = sb.updates[m * size + k];
      column.sort();
      total[k] = n * (settings.aggregator === "median" ? sortedMedian(column, n) : sortedTrimmedMean(column, n, settings.trim));
    }
  }

  const sigma = Math.max(0, Number.isFinite(settings.noise) ? settings.noise : 0) * CLIP;
  const divisor = Math.max(q * accounts, 1);
  for (let k = 0; k < size; k++) {
    const noisy = sigma > 0 ? total[k] + sigma * gaussian(sb.rand) : total[k];
    const next = sb.V[k] + (SERVER_LR * noisy) / divisor;
    sb.V[k] = Number.isFinite(next) ? next : sb.V[k];
  }
  sb.round += 1;
  return { cohort, attackers };
}

/** Indices of the k best items by score, skipping the excluded ones. */
function topK(scores: ArrayLike<number>, exclude: number[], k: number): number[] {
  const out: number[] = [];
  for (let pass = 0; pass < k; pass++) {
    let best = -1;
    let bestScore = -Infinity;
    for (let i = 0; i < scores.length; i++) {
      if (exclude.includes(i) || out.includes(i)) continue;
      const s = Number.isFinite(scores[i]) ? scores[i] : -Infinity;
      if (best < 0 || s > bestScore) {
        best = i;
        bestScore = s;
      }
    }
    if (best >= 0) out.push(best);
  }
  return out;
}

export interface Metrics {
  /** Share of held-out items that appear in their user's top 5. */
  accuracy: number;
  /** Share of real users whose top 5 holds the target item. */
  exposure: number;
}

export function evaluate(sb: Sandbox): Metrics {
  let hits = 0;
  let total = 0;
  let exposed = 0;
  for (const u of sb.world.users) {
    profileOf(sb, u.train);
    scoreAll(sb);
    const top = topK(sb.scores, u.train, TOP_K);
    for (const j of u.test) if (top.includes(j)) hits++;
    total += u.test.length;
    if (top.includes(TARGET)) exposed++;
  }
  return { accuracy: total ? hits / total : 0, exposure: exposed / N_USERS };
}

/** The same accuracy for a list ordered by how many histories hold each item. */
export function popularityAccuracy(world: World): number {
  let hits = 0;
  let total = 0;
  for (const u of world.users) {
    const top = topK(world.popularity, u.train, TOP_K);
    for (const j of u.test) if (top.includes(j)) hits++;
    total += u.test.length;
  }
  return total ? hits / total : 0;
}

// The trade-off point builder lives in its own file to keep this one short; it is part of the same pure logic.
export * from "./tradeoff";
export { median, trimmedMean } from "./robust";
