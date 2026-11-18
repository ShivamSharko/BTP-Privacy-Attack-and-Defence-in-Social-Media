import { m } from "../../data";
import { gaussian, rng, shuffle } from "../../sim/random";

/**
 * A toy of serverless gossip learning. It illustrates the mechanism (averaging with a few peers,
 * friends first and random contacts after, clipping, Adam with gossiped moments, local noise);
 * it does not reproduce the project's measurements, which come from results/gossip.json.
 */

export const N_NODES = 80;
export const N_COMMUNITIES = 4;
/** The slider's top end. The project's runs use 4 peers per round. */
export const MAX_DEGREE = 8;
export const DEFAULT_DEGREE = 4;
const GRAPH_SEED = 3;
const PEER_SEED = 11;

/* ---------------------------------------------------------------- the friend graph */

export interface Graph {
  n: number;
  community: number[];
  /** Friends of each node, sorted, no self loops. */
  adj: number[][];
  /** xyz per node, inside the 10 by 8 by 10 scene box. */
  pos: Float32Array;
}

/**
 * A stochastic block model: nodes in the same community are friends with probability pIn,
 * nodes in different communities with probability pOut. Communities sit at separate places
 * around a ring so that they are visible as clusters.
 */
export function communityGraph(n: number, k: number, seed: number, pIn = 0.15, pOut = 0.008): Graph {
  const r = rng(seed);
  const count = Math.max(0, Math.floor(n));
  const groups = Math.max(1, Math.min(Math.floor(k), Math.max(count, 1)));
  const community = Array.from({ length: count }, (_, i) => Math.min(groups - 1, Math.floor((i * groups) / count)));
  const adj: number[][] = Array.from({ length: count }, () => []);
  for (let i = 0; i < count; i++) {
    for (let j = i + 1; j < count; j++) {
      if (r() < (community[i] === community[j] ? pIn : pOut)) {
        adj[i].push(j);
        adj[j].push(i);
      }
    }
  }
  adj.forEach((row) => row.sort((a, b) => a - b));

  const pos = new Float32Array(count * 3);
  const centre = (c: number): [number, number, number] => {
    if (groups === 1) return [0, 0, 0];
    const angle = (c / groups) * Math.PI * 2 + Math.PI / 4;
    return [Math.cos(angle) * 3.5, (c % 2 === 0 ? 0.7 : -0.7) + (c === 0 ? 0.2 : 0), Math.sin(angle) * 3.5];
  };
  const placed: number[] = [];
  for (let i = 0; i < count; i++) {
    const [cx, cy, cz] = centre(community[i]);
    let best: [number, number, number] = [cx, cy, cz];
    let bestGap = -1;
    for (let attempt = 0; attempt < 12; attempt++) {
      const p: [number, number, number] = [
        clampTo(cx + gaussian(r) * 0.72, 4.6),
        clampTo(cy + gaussian(r) * 0.6, 3.4),
        clampTo(cz + gaussian(r) * 0.72, 4.6),
      ];
      let gap = Infinity;
      for (const j of placed) gap = Math.min(gap, Math.hypot(p[0] - pos[j * 3], p[1] - pos[j * 3 + 1], p[2] - pos[j * 3 + 2]));
      if (gap > bestGap) {
        bestGap = gap;
        best = p;
      }
      if (gap > 0.5) break;
    }
    pos[i * 3] = best[0];
    pos[i * 3 + 1] = best[1];
    pos[i * 3 + 2] = best[2];
    placed.push(i);
  }
  return { n: count, community, adj, pos };
}

function clampTo(x: number, limit: number): number {
  return Math.max(-limit, Math.min(limit, x));
}

/* ---------------------------------------------------------------- the peer table */

export interface PeerTable {
  /** peers[i]: the nodes that node i averages with this round. */
  peers: number[][];
  /** isFriend[i][c]: whether that peer is a real friend (otherwise a random contact). */
  isFriend: boolean[][];
}

export interface PeerOrder {
  /** For each node, every other node: friends first (shuffled), then everyone else (shuffled). */
  order: number[][];
  friendCount: number[];
}

/**
 * The order in which a node picks its peers, as in `SocialGraph.peer_table`: friends first, then
 * random contacts who are not friends. Taking the first d entries gives the table for d peers, so
 * a slider can add peers without reshuffling the ones already there.
 */
export function peerOrder(g: Graph, seed: number): PeerOrder {
  const r = rng(seed);
  const order: number[][] = [];
  const friendCount: number[] = [];
  for (let i = 0; i < g.n; i++) {
    const friends = shuffle(g.adj[i], r);
    const isFriend = new Set(g.adj[i]);
    const others: number[] = [];
    for (let j = 0; j < g.n; j++) if (j !== i && !isFriend.has(j)) others.push(j);
    order.push([...friends, ...shuffle(others, r)]);
    friendCount.push(friends.length);
  }
  return { order, friendCount };
}

export function takePeers(o: PeerOrder, degree: number): PeerTable {
  const d = Math.max(0, Math.floor(degree));
  const peers = o.order.map((row) => row.slice(0, d));
  const isFriend = peers.map((row, i) => row.map((_, c) => c < o.friendCount[i]));
  return { peers, isFriend };
}

export function peerTable(g: Graph, degree: number, seed: number): PeerTable {
  return takePeers(peerOrder(g, seed), degree);
}

/** The graph and peer order the scene draws. */
export const GRAPH = communityGraph(N_NODES, N_COMMUNITIES, GRAPH_SEED);
export const ORDER = peerOrder(GRAPH, PEER_SEED);

/* ---------------------------------------------------------------- averaging */

/** Each node replaces its value with the mean of its own value and its peers' values. */
export function gossipRound(values: number[], peers: number[][]): number[] {
  return values.map((own, i) => {
    const row = peers[i] ?? [];
    let sum = own;
    for (const p of row) sum += values[p];
    return sum / (row.length + 1);
  });
}

/** How far the nodes still disagree: the largest value minus the smallest. */
export function disagreement(values: number[]): number {
  if (values.length === 0) return 0;
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of values) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  return hi - lo;
}

/** Rounds until the disagreement falls to `tol` times where it started; `max` if it never does. */
export function roundsToAgree(values: number[], peers: number[][], tol: number, max: number): number {
  const start = disagreement(values);
  if (start === 0) return 0;
  let state = values;
  for (let round = 1; round <= max; round++) {
    state = gossipRound(state, peers);
    if (disagreement(state) <= tol * start) return round;
  }
  return max;
}

/** Each community starts with its own opinion, so the first picture has visible regions. */
export function initialValues(g: Graph, seed: number): number[] {
  const r = rng(seed);
  const groups = Math.max(1, Math.max(0, ...g.community) + 1);
  return g.community.map((c) => clamp01((c + 0.5) / groups + (r() - 0.5) * 0.16));
}

export function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

/* ---------------------------------------------------------------- local steps */

export type Optimiser = "plain" | "adam";

/** Two parameters per node: one with large gradients and one with small ones, as in a real model. */
export const TOY = {
  curvature: [1, 0.01],
  clip: 1,
  lrPlain: 0.1,
  lrAdam: 0.05,
  beta1: 0.9,
  beta2: 0.999,
  eps: 1e-8,
  /** The local noise multiplier of the project's epsilon 8 gossip runs. */
  noiseShown: m("gossip", "results/by_epsilon/8.0/local_noise_multiplier"),
};

export interface TrainState {
  theta: number[][];
  m: number[][];
  v: number[][];
  t: number;
}

export interface TrainConfig {
  optimiser: Optimiser;
  /** Noise multiplier z: each node adds N(0, (z C)^2) to its clipped gradient. 0 is no noise. */
  noise: number;
}

export function initTrain(n: number): TrainState {
  const zeros = () => Array.from({ length: n }, () => [0, 0]);
  return { theta: zeros(), m: zeros(), v: zeros(), t: 0 };
}

/**
 * Each node's own target: close to a shared goal, but pulled towards its community's taste.
 * The nodes' own loss is minimised at their own target; the network wants the average.
 */
export function makeTargets(g: Graph, seed: number): number[][] {
  const r = rng(seed);
  const groups = Math.max(1, Math.max(0, ...g.community) + 1);
  return g.community.map((c) => {
    const taste = (c - (groups - 1) / 2) * 0.5;
    return [2 + taste + gaussian(r) * 0.3, 2 - taste + gaussian(r) * 0.3];
  });
}

export function goalOf(targets: number[][]): number[] {
  const n = Math.max(targets.length, 1);
  return [0, 1].map((k) => targets.reduce((s, t) => s + t[k], 0) / n);
}

/** What a node sends: its gradient clipped to norm `clip`, plus Gaussian noise of scale z times clip. */
export function privatise(grad: number[], clip: number, noise: number, r: () => number): number[] {
  const norm = Math.hypot(...grad);
  const scale = norm > clip ? clip / norm : 1;
  return grad.map((x) => x * scale + (noise > 0 ? gaussian(r) * noise * clip : 0));
}

function mixRows(rows: number[][], peers: number[][]): number[][] {
  return rows.map((own, i) => {
    const row = peers[i] ?? [];
    return own.map((x, k) => {
      let sum = x;
      for (const p of row) sum += rows[p][k];
      return sum / (row.length + 1);
    });
  });
}

/**
 * One synchronous round: every node takes a local step on its own loss, using the clipped and
 * noised gradient, then averages with its peers. With Adam the first and second moments are
 * averaged with the peers too ("decentralised Adam with gossiped moments").
 */
export function trainRound(s: TrainState, targets: number[][], peers: number[][], cfg: TrainConfig, r: () => number): TrainState {
  const t = s.t + 1;
  const adam = cfg.optimiser === "adam";
  const half: number[][] = [];
  const first: number[][] = [];
  const second: number[][] = [];
  s.theta.forEach((theta, i) => {
    const grad = theta.map((x, k) => TOY.curvature[k] * (x - targets[i][k]));
    const sent = privatise(grad, TOY.clip, cfg.noise, r);
    if (!adam) {
      half.push(theta.map((x, k) => x - TOY.lrPlain * sent[k]));
      return;
    }
    const m1 = s.m[i].map((x, k) => TOY.beta1 * x + (1 - TOY.beta1) * sent[k]);
    const m2 = s.v[i].map((x, k) => TOY.beta2 * x + (1 - TOY.beta2) * sent[k] * sent[k]);
    first.push(m1);
    second.push(m2);
    half.push(
      theta.map((x, k) => {
        const mHat = m1[k] / (1 - TOY.beta1 ** t);
        const vHat = m2[k] / (1 - TOY.beta2 ** t);
        return x - (TOY.lrAdam * mHat) / (Math.sqrt(vHat) + TOY.eps);
      }),
    );
  });
  return {
    theta: mixRows(half, peers),
    m: adam ? mixRows(first, peers) : s.m,
    v: adam ? mixRows(second, peers) : s.v,
    t,
  };
}

/** How close each node's model is to the goal, from 0 (as far as the start) to 1 (at it): the colour. */
export function closeness(s: TrainState, goal: number[]): number[] {
  const size = Math.hypot(...goal) || 1;
  return s.theta.map((theta) => clamp01(1 - Math.hypot(theta[0] - goal[0], theta[1] - goal[1]) / size));
}

/** Mean distance of the nodes' models from the goal, as a fraction of the goal's size. */
export function distanceToGoal(s: TrainState, goal: number[]): number {
  if (s.theta.length === 0) return 0;
  const size = Math.hypot(...goal) || 1;
  return s.theta.reduce((sum, theta) => sum + Math.hypot(theta[0] - goal[0], theta[1] - goal[1]), 0) / s.theta.length / size;
}
