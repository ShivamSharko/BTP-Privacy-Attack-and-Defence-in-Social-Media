import { m } from "../../data";
import { rng } from "../../sim/random";
import { cityGrid, degreeStats, type DegreeStats, type FriendGraph, friendGraph, GRAPH_N, type MeasuredGraph, pipelineLayout, scaledTargets } from "./sim";
import { STAGES } from "./store";

/** The measured shape of the real friend graph (results/social_graph.json). */
export const MEASURED: MeasuredGraph = {
  users: m("social_graph", "users"),
  meanDegree: m("social_graph", "mean_degree"),
  medianDegree: m("social_graph", "median_degree"),
  isolatedShare: m("social_graph", "isolated_share"),
  maxDegree: m("social_graph", "max_degree"),
};

export const TARGETS = scaledTargets(MEASURED, GRAPH_N);

export interface IntroGraph extends FriendGraph {
  stats: DegreeStats;
  city: Float32Array;
  /** 1 for the most-connected 1% of drawn users. */
  hub: Uint8Array;
  /** Assembly delay per user, 0 (first) to 1 (last). */
  delay: Float32Array;
  /** Twinkle phase and speed per user. */
  phase: Float32Array;
  speed: Float32Array;
  /** All friendships as line segments. */
  segments: Float32Array;
  /** The user the problem slide follows, and that user's friendships. */
  user: number;
  userSegments: Float32Array;
}

/** Share of drawn users marked as hubs. */
export const HUB_SHARE = 0.01;

let cached: IntroGraph | null = null;

/** The generated graph, built once and shared by the scene and the fallback. */
export function introGraph(): IntroGraph {
  if (cached) return cached;
  const g = friendGraph(TARGETS, 2026);
  const n = TARGETS.n;
  const r = rng(99);
  const stats = degreeStats(g.degree);

  const byDegree = Array.from({ length: n }, (_, i) => i).sort((a, b) => g.degree[b] - g.degree[a]);
  const hub = new Uint8Array(n);
  for (const i of byDegree.slice(0, Math.max(1, Math.round(n * HUB_SHARE)))) hub[i] = 1;

  const delay = new Float32Array(n);
  const phase = new Float32Array(n);
  const speed = new Float32Array(n);
  const top = Math.log1p(Math.max(1, stats.max));
  for (let i = 0; i < n; i++) {
    delay[i] = g.degree[i] === 0 ? 0.8 + r() * 0.2 : (1 - Math.log1p(g.degree[i]) / top) * 0.55 + r() * 0.25;
    phase[i] = r() * Math.PI * 2;
    speed[i] = 0.6 + r() * 1.4;
  }

  const segments = new Float32Array(g.edges.length * 3);
  for (let e = 0; e < g.edges.length; e++) {
    const u = g.edges[e];
    segments[e * 3] = g.positions[u * 3];
    segments[e * 3 + 1] = g.positions[u * 3 + 1];
    segments[e * 3 + 2] = g.positions[u * 3 + 2];
  }

  // A user with a handful of friends, far enough from the centre to be seen on their own.
  let user = byDegree[byDegree.length - 1] ?? 0;
  let best = -1;
  for (let i = 0; i < n; i++) {
    if (g.degree[i] < 5 || g.degree[i] > 9) continue;
    const radius = Math.hypot(g.positions[i * 3], g.positions[i * 3 + 2]);
    if (radius > best && radius < 3.2) {
      best = radius;
      user = i;
    }
  }
  const friends: number[] = [];
  for (let e = 0; e < g.edges.length; e += 2) {
    if (g.edges[e] === user) friends.push(g.edges[e + 1]);
    else if (g.edges[e + 1] === user) friends.push(g.edges[e]);
  }
  const userSegments = new Float32Array(friends.length * 6);
  friends.forEach((f, k) => {
    for (let d = 0; d < 3; d++) {
      userSegments[k * 6 + d] = g.positions[user * 3 + d];
      userSegments[k * 6 + 3 + d] = g.positions[f * 3 + d];
    }
  });

  cached = { ...g, stats, city: cityGrid(n, 7), hub, delay, phase, speed, segments, user, userSegments };
  return cached;
}

/** Where the pipeline's stops sit: five on the top row, the rest coming back below. */
export const STOPS = pipelineLayout(STAGES.length, 5);
