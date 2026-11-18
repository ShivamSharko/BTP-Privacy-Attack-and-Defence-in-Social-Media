import { gaussian, rng, shuffle } from "../../sim/random";

/**
 * Users drawn on the title slide. The real graph has 9,913 users; a thousand lights is enough
 * to show its shape and leaves the frame rate alone.
 */
export const GRAPH_N = 1000;

/** Half-extents of the box every scene object must stay inside: 10 wide, 8 tall, 10 deep. */
export const SCENE_BOX: readonly [number, number, number] = [5, 4, 5];

/** The ground the city of lights stands on before it assembles. */
export const CITY_Y = -2.2;

export interface GraphTargets {
  /** Users to draw. */
  n: number;
  meanDegree: number;
  medianDegree: number;
  /** Share of users with no friends at all. */
  isolatedShare: number;
  /** Most friends any one user may have. */
  maxDegree: number;
}

export interface MeasuredGraph {
  users: number;
  meanDegree: number;
  medianDegree: number;
  isolatedShare: number;
  maxDegree: number;
}

/**
 * Targets for drawing `n` users instead of the real number. Mean degree, median degree and the
 * isolated share are per-user figures that do not depend on how many users there are, so they
 * are kept. The largest degree is a share of the population (the biggest hub knows about 30% of
 * everyone), so it is scaled in proportion.
 */
export function scaledTargets(real: MeasuredGraph, n: number): GraphTargets {
  return {
    n,
    meanDegree: real.meanDegree,
    medianDegree: real.medianDegree,
    isolatedShare: real.isolatedShare,
    maxDegree: Math.round((real.maxDegree / Math.max(1, real.users)) * n),
  };
}

export interface FriendGraph {
  /** Two user indices per friendship. */
  edges: Uint32Array;
  degree: Uint32Array;
  /** xyz per user. */
  positions: Float32Array;
  /** Community of each user; isolated users get the value `communities`. */
  community: Uint16Array;
  communities: number;
}

export interface DegreeStats {
  mean: number;
  median: number;
  max: number;
  isolatedShare: number;
}

export function degreeStats(degree: ArrayLike<number>): DegreeStats {
  const n = degree.length;
  if (n === 0) return { mean: 0, median: 0, max: 0, isolatedShare: 0 };
  const sorted = Array.from(degree).sort((a, b) => a - b);
  let total = 0;
  let isolated = 0;
  for (const d of sorted) {
    total += d;
    if (d === 0) isolated++;
  }
  const median = n % 2 === 1 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
  return { mean: total / n, median, max: sorted[n - 1], isolatedShare: isolated / n };
}

const finite = (x: number, fallback: number) => (Number.isFinite(x) ? x : fallback);

/**
 * A degree for each of `k` users who have friends, heavy-tailed: d = c (1 - u)^(-1/alpha) at
 * evenly spaced quantiles u. c is fixed so the overall median lands on the target, and alpha is
 * searched so the total matches the target mean.
 */
function targetDegrees(k: number, n0: number, n: number, mean: number, median: number, cap: number): number[] {
  if (k <= 1 || cap < 1) return new Array<number>(k).fill(0);
  const anchorRank = Math.max(0, Math.min(k - 1, Math.ceil((n - 1) / 2) - n0));
  const anchorU = (anchorRank + 0.5) / k;
  const anchor = Math.max(1, Math.min(cap, Math.round(median)));
  const want = mean * n;
  const degreesFor = (alpha: number) => {
    const c = anchor * (1 - anchorU) ** (1 / alpha);
    const out = new Array<number>(k);
    for (let j = 0; j < k; j++) {
      const u = (j + 0.5) / k;
      out[j] = Math.max(1, Math.min(cap, Math.round(c * (1 - u) ** (-1 / alpha))));
    }
    return out;
  };
  let best = degreesFor(1);
  let bestError = Infinity;
  for (let a = 0.5; a <= 8; a += 0.025) {
    const seq = degreesFor(a);
    let sum = 0;
    for (const d of seq) sum += d;
    const error = Math.abs(sum - want);
    if (error < bestError) {
      bestError = error;
      best = seq;
    }
  }
  return best;
}

/** Pairs up stubs at random, refusing self-loops and repeated pairs. Returns the stubs left over. */
function matchStubs(stubs: number[], r: () => number, n: number, seen: Set<number>, edges: number[], degree: Uint32Array): number[] {
  let pool = stubs;
  for (let round = 0; round < 8 && pool.length > 1; round++) {
    pool = shuffle(pool, r);
    const left: number[] = [];
    for (let i = 0; i + 1 < pool.length; i += 2) {
      const a = pool[i];
      const b = pool[i + 1];
      const key = Math.min(a, b) * n + Math.max(a, b);
      if (a === b || seen.has(key)) {
        left.push(a, b);
        continue;
      }
      seen.add(key);
      edges.push(a, b);
      degree[a]++;
      degree[b]++;
    }
    if (pool.length % 2 === 1) left.push(pool[pool.length - 1]);
    if (left.length === pool.length) return left;
    pool = left;
  }
  return pool;
}

/**
 * A friend graph with a given shape: a share of users with no friends, a median of a few
 * friends, and a heavy tail of hubs that pulls the mean far above the median. Users with
 * friends are dealt into communities and befriend inside them three times out of four. The
 * layout puts communities around the centre, hubs near it, and users with no friends on a ring
 * outside, all inside the scene box.
 */
export function friendGraph(targets: GraphTargets, seed: number): FriendGraph {
  const n = Math.max(0, Math.floor(finite(targets.n, 0)));
  const r = rng(seed);
  const share = Math.max(0, Math.min(1, finite(targets.isolatedShare, 0)));
  const n0 = n <= 1 ? n : Math.round(share * n);
  const k = n - n0;
  const cap = Math.min(k - 1, Math.max(1, Math.floor(finite(targets.maxDegree, k - 1))));
  const mean = Math.max(0, finite(targets.meanDegree, 0));
  const median = Math.max(0, finite(targets.medianDegree, 0));

  // Who has friends, and in which community. Communities are of unequal size.
  const order = shuffle(Array.from({ length: n }, (_, i) => i), r);
  const social = order.slice(0, k);
  const communities = k > 0 ? Math.max(1, Math.min(12, Math.round(Math.sqrt(k) / 3.2))) : 0;
  const community = new Uint16Array(n).fill(communities);
  const sizes = new Uint32Array(communities);
  const weights = Array.from({ length: communities }, (_, c) => 1 / (c + 1) ** 0.3);
  const totalWeight = weights.reduce((s, w) => s + w, 0);
  {
    let c = 0;
    let filled = 0;
    shuffle(social, r).forEach((user, j) => {
      while (c < communities - 1 && j >= filled + (weights[c] / totalWeight) * k) {
        filled += (weights[c] / totalWeight) * k;
        c++;
      }
      community[user] = c;
      sizes[c]++;
    });
  }

  // Repeated pairs are refused, which costs the hubs some friends; so the wanted mean is raised
  // until the graph that comes out has the target mean. Same seed each pass, so still deterministic.
  let boost = 1;
  let built = buildEdges(n, k, n0, social, community, sizes, mean, median, cap, seed);
  for (let pass = 0; pass < 5 && mean > 0 && built.edges.length > 0; pass++) {
    const realised = built.edges.length / n;
    if (Math.abs(realised - mean) / mean < 0.02) break;
    boost *= mean / realised;
    built = buildEdges(n, k, n0, social, community, sizes, mean * boost, median, cap, seed);
  }
  const { edges, degree } = built;

  const positions = graphLayout(n, edges, degree, community, communities, r);
  return { edges: Uint32Array.from(edges), degree, positions, community, communities };
}

function buildEdges(
  n: number,
  k: number,
  n0: number,
  social: number[],
  community: Uint16Array,
  sizes: Uint32Array,
  mean: number,
  median: number,
  cap: number,
  seed: number,
): { edges: number[]; degree: Uint32Array } {
  const r = rng(seed * 7919 + 17);
  const wanted = targetDegrees(k, n0, n, mean, median, cap);
  const want = new Uint32Array(n);
  social.forEach((user, j) => {
    want[user] = wanted[j];
  });

  // Stubs: up to three in four of each user's friendships are kept inside the community, never
  // more than a third of the community, so hubs reach out across the whole graph.
  const edges: number[] = [];
  const degree = new Uint32Array(n);
  const seen = new Set<number>();
  const inside: number[][] = Array.from({ length: sizes.length }, () => []);
  let outside: number[] = [];
  for (const user of social) {
    const local = Math.min(Math.round(want[user] * 0.75), Math.floor(sizes[community[user]] / 3));
    for (let s = 0; s < want[user]; s++) (s < local ? inside[community[user]] : outside).push(user);
  }
  for (const stubs of inside) outside = outside.concat(matchStubs(stubs, r, n, seen, edges, degree));
  matchStubs(outside, r, n, seen, edges, degree);

  // Anyone meant to have friends who ended with none befriends someone, preferring hubs.
  if (k > 1) {
    const byDegree = social.slice().sort((a, b) => want[b] - want[a]);
    const top = byDegree.slice(0, Math.max(2, Math.ceil(k * 0.05)));
    for (const user of social) {
      if (degree[user] > 0) continue;
      for (let attempt = 0; attempt < 40; attempt++) {
        const other = attempt < 20 ? top[Math.floor(r() * top.length)] : social[Math.floor(r() * k)];
        const key = Math.min(user, other) * n + Math.max(user, other);
        if (other === user || seen.has(key)) continue;
        seen.add(key);
        edges.push(user, other);
        degree[user]++;
        degree[other]++;
        break;
      }
    }
  }
  return { edges, degree };
}

function clampToBox(p: Float32Array, i: number) {
  for (let a = 0; a < 3; a++) {
    const limit = SCENE_BOX[a] - 0.05;
    p[i * 3 + a] = Math.max(-limit, Math.min(limit, finite(p[i * 3 + a], 0)));
  }
}

function graphLayout(n: number, edges: number[], degree: Uint32Array, community: Uint16Array, communities: number, r: () => number): Float32Array {
  const init = new Float32Array(n * 3);
  let maxDegree = 1;
  for (let i = 0; i < n; i++) maxDegree = Math.max(maxDegree, degree[i]);
  const golden = Math.PI * (3 - Math.sqrt(5));
  const isolated: number[] = [];

  for (let i = 0; i < n; i++) {
    const c = community[i];
    if (c >= communities || degree[i] === 0) {
      isolated.push(i);
      continue;
    }
    const angle = (c / Math.max(1, communities)) * Math.PI * 2 + 0.4 + 0.25 * Math.sin(c * golden);
    const radius = communities === 1 ? 0 : 2.5 + 0.4 * ((c % 3) - 1);
    const cx = Math.cos(angle) * radius;
    const cz = Math.sin(angle) * radius;
    const cy = 0.95 * Math.sin(c * 2.1);
    const pull = (Math.log1p(degree[i]) / Math.log1p(maxDegree)) ** 1.6;
    init[i * 3] = (cx + gaussian(r) * 0.38) * (1 - 0.9 * pull);
    init[i * 3 + 1] = (cy + gaussian(r) * 0.3) * (1 - 0.8 * pull);
    init[i * 3 + 2] = (cz + gaussian(r) * 0.38) * (1 - 0.9 * pull);
  }

  // Pull each user part of the way towards the middle of their friends.
  const pos = init.slice();
  const sum = new Float32Array(n * 3);
  for (let iteration = 0; iteration < 3; iteration++) {
    sum.fill(0);
    for (let e = 0; e < edges.length; e += 2) {
      const a = edges[e];
      const b = edges[e + 1];
      for (let d = 0; d < 3; d++) {
        sum[a * 3 + d] += pos[b * 3 + d];
        sum[b * 3 + d] += pos[a * 3 + d];
      }
    }
    for (let i = 0; i < n; i++) {
      if (degree[i] === 0) continue;
      for (let d = 0; d < 3; d++) pos[i * 3 + d] = 0.75 * init[i * 3 + d] + 0.25 * (sum[i * 3 + d] / degree[i]);
    }
  }

  // Keep the friend graph inside a disc, with room outside it for the ring.
  for (let i = 0; i < n; i++) {
    if (degree[i] === 0) continue;
    const radius = Math.hypot(pos[i * 3], pos[i * 3 + 2]);
    if (radius > 3.4) {
      pos[i * 3] *= 3.4 / radius;
      pos[i * 3 + 2] *= 3.4 / radius;
    }
    pos[i * 3 + 1] = Math.max(-1.6, Math.min(1.6, pos[i * 3 + 1]));
  }

  // Users with no friends on a slightly wavy ring.
  isolated.forEach((user, j) => {
    const angle = (j / Math.max(1, isolated.length)) * Math.PI * 2 + (r() - 0.5) * 0.05;
    const radius = Math.max(3.8, Math.min(4.6, 4.2 + gaussian(r) * 0.13));
    pos[user * 3] = Math.cos(angle) * radius;
    pos[user * 3 + 1] = -0.3 + 0.14 * Math.sin(angle * 3) + gaussian(r) * 0.06;
    pos[user * 3 + 2] = Math.sin(angle) * radius;
  });

  for (let i = 0; i < n; i++) clampToBox(pos, i);
  return pos;
}

/**
 * The city before it assembles: lights in blocks on the ground, with empty streets between.
 * Users are spread over the blocks in a random order.
 */
export function cityGrid(n: number, seed: number): Float32Array {
  const count = Math.max(0, Math.floor(n));
  const out = new Float32Array(count * 3);
  if (count === 0) return out;
  const r = rng(seed);
  let side = 1;
  const usable = (s: number) => (s - Math.floor(s / 6)) ** 2;
  while (usable(side) < count) side++;
  const cells: [number, number][] = [];
  for (let i = 0; i < side; i++) {
    if (i % 6 === 5) continue;
    for (let j = 0; j < side; j++) if (j % 6 !== 5) cells.push([i, j]);
  }
  const picked = shuffle(cells, r).slice(0, count);
  const half = 3.3;
  const step = side > 1 ? (2 * half) / (side - 1) : 0;
  picked.forEach(([i, j], u) => {
    out[u * 3] = side > 1 ? -half + i * step + (r() - 0.5) * step * 0.3 : 0;
    out[u * 3 + 1] = CITY_Y;
    out[u * 3 + 2] = side > 1 ? -half + j * step + (r() - 0.5) * step * 0.3 : 0;
    clampToBox(out, u);
  });
  return out;
}

/**
 * Stops of a pipeline laid out as a snake: the first row runs left to right, the next right to
 * left below it, and so on. Each row spreads over the same width and bows towards the viewer.
 * `perRow` of 0 or less puts everything in one row.
 */
export function pipelineLayout(count: number, perRow: number): Float32Array {
  const k = Math.max(0, Math.floor(count));
  const out = new Float32Array(k * 3);
  if (k === 0) return out;
  const per = perRow > 0 ? Math.floor(perRow) : k;
  const rows = Math.ceil(k / per);
  const width = 7.6;
  const rowGap = rows > 1 ? Math.min(2.6, 6 / (rows - 1)) : 0;
  for (let i = 0; i < k; i++) {
    const row = Math.floor(i / per);
    const inRow = Math.min(per, k - row * per);
    const j = i - row * per;
    const t = inRow > 1 ? j / (inRow - 1) : 0.5;
    const x = (row % 2 === 0 ? 1 : -1) * (t - 0.5) * width;
    out[i * 3] = x;
    out[i * 3 + 1] = ((rows - 1) / 2 - row) * rowGap;
    out[i * 3 + 2] = 0.9 * Math.cos((Math.PI * x) / width) - 0.4;
    clampToBox(out, i);
  }
  return out;
}

/** Where a packet is at progress `t` along the stops (t = 2 is the third stop). Writes into `out`. */
export function packetPosition(stops: Float32Array, t: number, out: [number, number, number]): void {
  const k = Math.floor(stops.length / 3);
  if (k === 0) {
    out[0] = 0;
    out[1] = 0;
    out[2] = 0;
    return;
  }
  const clamped = Math.max(0, Math.min(k - 1, finite(t, 0)));
  const i = Math.min(k - 1, Math.floor(clamped));
  const j = Math.min(k - 1, i + 1);
  const f = clamped - i;
  for (let d = 0; d < 3; d++) out[d] = stops[i * 3 + d] + (stops[j * 3 + d] - stops[i * 3 + d]) * f;
}
