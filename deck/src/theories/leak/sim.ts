import { gaussian, rng } from "../../sim/random";

/*
 * A toy of the two attacks, small enough to watch. Nothing here is measured: the real attacks
 * run on a 107,679-number update (src/prism/attacks); the toy keeps the idea and drops the size.
 */

/** Items on the grid: 10 columns by 6 rows. */
export const COLS = 10;
export const ROWS = 6;
export const N_ITEMS = COLS * ROWS;
/** Users in the friendship toy. */
export const N_PEOPLE = 14;
/** The history inversion slide offers four users to pick from. */
export const N_USERS = 4;
/** How many top guesses the attacker's list shows at most. */
export const TOP_K = 10;

/* ------------------------------------------------------------------ history inversion */

/** Chance weight of each item being in a history: a few items are popular, most are not. */
function popularityWeights(): number[] {
  const r = rng(11);
  const order = Array.from({ length: N_ITEMS }, (_, i) => ({ i, key: r() })).sort((a, b) => a.key - b.key);
  const w = new Array<number>(N_ITEMS).fill(0);
  order.forEach(({ i }, rank) => {
    w[i] = 1 / (1 + rank) ** 0.9;
  });
  return w;
}

const WEIGHTS = popularityWeights();

/** The popularity prior: how often each item appears, as a count out of 1000 users. */
export function itemPopularity(): number[] {
  return WEIGHTS.map((w) => Math.round(w * 400));
}

/**
 * The first `size` items of a user's personal order, sorted by item number. Each user has a fixed
 * order drawn with popularity weights (Gumbel top-k), so a longer history only adds items.
 */
export function userHistory(user: number, size: number): number[] {
  const n = Math.max(0, Math.min(N_ITEMS, Math.round(size)));
  const r = rng(1000 + user * 7919);
  const keyed = WEIGHTS.map((w, item) => ({ item, key: Math.log(w) - Math.log(-Math.log(Math.max(r(), 1e-12))) }));
  keyed.sort((a, b) => b.key - a.key || a.item - b.item);
  return keyed
    .slice(0, n)
    .map((k) => k.item)
    .sort((a, b) => a - b);
}

export function historyMask(history: readonly number[]): boolean[] {
  const mask = new Array<boolean>(N_ITEMS).fill(false);
  for (const item of history) if (item >= 0 && item < N_ITEMS) mask[item] = true;
  return mask;
}

/** One fixed draw of spill-over per item, so moving a slider rescales it instead of redrawing it. */
export function spillNoise(seed: number): Float64Array {
  const r = rng(5000 + seed * 31);
  const out = new Float64Array(N_ITEMS);
  for (let i = 0; i < N_ITEMS; i++) out[i] = gaussian(r);
  return out;
}

/**
 * The update of a user whose history is `mask`: a large entry for every item the user touched,
 * and `spill` times a small random wobble everywhere else (and a little on the touched items).
 */
export function updateVector(mask: readonly boolean[], spill: number, seed: number): number[] {
  const r = rng(9000 + seed * 17);
  const noise = spillNoise(seed);
  const s = Math.max(0, spill);
  return Array.from({ length: N_ITEMS }, (_, i) => (mask[i] ? 0.7 + 0.6 * r() : 0) + s * noise[i]);
}

/** What the attacker computes from the update: the size of the change at each item. */
export function inversionScores(update: readonly number[]): number[] {
  return update.map((v) => Math.abs(v));
}

/** Item numbers from the highest score to the lowest; equal scores keep item order. */
export function rankItems(scores: readonly number[]): number[] {
  return scores
    .map((score, item) => ({ score, item }))
    .sort((a, b) => b.score - a.score || a.item - b.item)
    .map((x) => x.item);
}

/**
 * Chance that a random history item scores above a random other item, ties counting half.
 * With no history items or no other items there is nothing to separate, and the answer is 0.5
 * (the Python returns NaN there; the toy has to keep drawing).
 */
export function aucScore(positives: readonly number[], negatives: readonly number[]): number {
  if (positives.length === 0 || negatives.length === 0) return 0.5;
  let wins = 0;
  for (const p of positives) {
    for (const q of negatives) wins += p > q ? 1 : p === q ? 0.5 : 0;
  }
  return wins / (positives.length * negatives.length);
}

/** Share of the k top-scored items that are in the history; a tie at the cut is split evenly. */
export function precisionAtK(scores: readonly number[], isHistory: readonly boolean[], k: number): number {
  const kk = Math.min(Math.round(k), scores.length);
  if (kk <= 0) return 0;
  const cut = [...scores].sort((a, b) => b - a)[kk - 1];
  let above = 0;
  let aboveHits = 0;
  let tied = 0;
  let tiedHits = 0;
  scores.forEach((s, i) => {
    if (s > cut) {
      above++;
      if (isHistory[i]) aboveHits++;
    } else if (s === cut) {
      tied++;
      if (isHistory[i]) tiedHits++;
    }
  });
  return (aboveHits + (kk - above) * (tiedHits / tied)) / kk;
}

export interface Recovery {
  auc: number;
  precision: number;
  priorAuc: number;
  priorPrecision: number;
  /** Items from the attacker's best guess down. */
  ranking: number[];
}

/** The attack and the popularity-only prior, scored against the true history. */
export function recover(update: readonly number[], mask: readonly boolean[], popularity: readonly number[], k: number): Recovery {
  const scores = inversionScores(update);
  const split = (s: readonly number[]) => ({
    pos: s.filter((_, i) => mask[i]),
    neg: s.filter((_, i) => !mask[i]),
  });
  const a = split(scores);
  const p = split(popularity);
  return {
    auc: aucScore(a.pos, a.neg),
    precision: precisionAtK(scores, mask, k),
    priorAuc: aucScore(p.pos, p.neg),
    priorPrecision: precisionAtK(popularity, mask, k),
    ranking: rankItems(scores),
  };
}

/** Where item i stands on the grid, x across and z toward the viewer, centred on the origin. */
export function itemCell(i: number, spacing: number): { x: number; z: number } {
  const col = i % COLS;
  const row = Math.floor(i / COLS);
  return { x: (col - (COLS - 1) / 2) * spacing, z: (row - (ROWS - 1) / 2) * spacing };
}

/* ------------------------------------------------------------------ link inference */

/** Cosine of the angle between two vectors. A zero vector gives 0, as in the Python. */
export function cosine(a: readonly number[], b: readonly number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  if (!(denom > 0)) return 0;
  return Math.max(-1, Math.min(1, dot / denom));
}

/** Two unit vectors in a plane, `degrees` apart. */
export function unitPair(degrees: number): [number[], number[]] {
  const t = (degrees * Math.PI) / 180;
  return [[1, 0], [Math.cos(t), Math.sin(t)]];
}

export interface PairScore {
  a: number;
  b: number;
  cos: number;
  friend: boolean;
}

export interface Network {
  people: number;
  community: number[];
  /** xyz per person, on the ground plane. */
  layout: Float32Array;
  vectors: number[][];
  /** Every pair once, a < b. */
  pairs: PairScore[];
}

const COMMUNITIES = [5, 5, 4];
const UPDATE_DIM = 8;
const FRIEND_PULL = 0.8;

/**
 * Fourteen people in three circles of friends. Each person's update is their own random
 * direction plus a share of each friend's direction, so friends' updates lean the same way.
 */
export function makeNetwork(seed: number): Network {
  const r = rng(30000 + seed * 101);
  const community: number[] = [];
  COMMUNITIES.forEach((size, c) => {
    for (let k = 0; k < size; k++) community.push(c);
  });
  const n = community.length;

  const friends: boolean[][] = Array.from({ length: n }, () => new Array<boolean>(n).fill(false));
  for (let a = 0; a < n; a++) {
    for (let b = a + 1; b < n; b++) {
      const p = community[a] === community[b] ? 0.65 : 0.07;
      if (r() < p) {
        friends[a][b] = true;
        friends[b][a] = true;
      }
    }
  }

  const own = Array.from({ length: n }, () => Array.from({ length: UPDATE_DIM }, () => gaussian(r)));
  const vectors = own.map((v, a) => {
    const near = friends[a].reduce<number[]>((acc, f, b) => (f ? [...acc, b] : acc), []);
    const pull = FRIEND_PULL / Math.sqrt(Math.max(near.length, 1));
    return v.map((x, d) => x + pull * near.reduce((s, b) => s + own[b][d], 0));
  });

  const layout = new Float32Array(n * 3);
  const seen = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    const c = community[i];
    const centre = (Math.PI * 2 * c) / COMMUNITIES.length + Math.PI / 2;
    const around = (seen[c]++ / COMMUNITIES[c]) * Math.PI * 2 + (r() - 0.5) * 0.3;
    layout[i * 3] = Math.cos(centre) * 3.1 + Math.cos(around) * 1.05;
    layout[i * 3 + 1] = (r() - 0.5) * 0.5;
    layout[i * 3 + 2] = Math.sin(centre) * 2.3 + Math.sin(around) * 0.85;
  }

  const pairs: PairScore[] = [];
  for (let a = 0; a < n; a++) {
    for (let b = a + 1; b < n; b++) pairs.push({ a, b, cos: cosine(vectors[a], vectors[b]), friend: friends[a][b] });
  }
  return { people: n, community, layout, vectors, pairs };
}

/** AUC of the cosine at separating friend pairs from the others, as in prism.attacks.links. */
export function linkAuc(net: Network): number {
  return aucScore(
    net.pairs.filter((p) => p.friend).map((p) => p.cos),
    net.pairs.filter((p) => !p.friend).map((p) => p.cos),
  );
}

export interface Guesses {
  /** Pairs the attacker calls friends: cosine at or above the threshold. */
  guessed: number;
  hits: number;
  falseAlarms: number;
  missed: number;
  precision: number;
  recall: number;
}

export function linkGuesses(net: Network, threshold: number): Guesses {
  let hits = 0;
  let falseAlarms = 0;
  let missed = 0;
  for (const p of net.pairs) {
    const said = p.cos >= threshold;
    if (said && p.friend) hits++;
    else if (said) falseAlarms++;
    else if (p.friend) missed++;
  }
  const guessed = hits + falseAlarms;
  return {
    guessed,
    hits,
    falseAlarms,
    missed,
    precision: guessed === 0 ? 0 : hits / guessed,
    recall: hits + missed === 0 ? 0 : hits / (hits + missed),
  };
}
