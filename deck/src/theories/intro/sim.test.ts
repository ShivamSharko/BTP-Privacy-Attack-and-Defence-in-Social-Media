import { describe, expect, it } from "vitest";
import {
  cityGrid,
  degreeStats,
  friendGraph,
  GRAPH_N,
  type GraphTargets,
  packetPosition,
  pipelineLayout,
  scaledTargets,
  SCENE_BOX,
} from "./sim";

/** The measured shape of the real friend graph, as in results/social_graph.json. */
const REAL = { users: 9913, meanDegree: 14.262281852113386, medianDegree: 3, isolatedShare: 0.2287904771512156, maxDegree: 2979 };

function inBox(p: Float32Array) {
  for (let i = 0; i < p.length; i += 3) {
    expect(Number.isFinite(p[i]) && Number.isFinite(p[i + 1]) && Number.isFinite(p[i + 2])).toBe(true);
    expect(Math.abs(p[i])).toBeLessThanOrEqual(SCENE_BOX[0]);
    expect(Math.abs(p[i + 1])).toBeLessThanOrEqual(SCENE_BOX[1]);
    expect(Math.abs(p[i + 2])).toBeLessThanOrEqual(SCENE_BOX[2]);
  }
}

describe("scaled targets", () => {
  it("keeps the per-user statistics and scales the largest degree with the population", () => {
    const t = scaledTargets(REAL, 1000);
    expect(t.n).toBe(1000);
    expect(t.meanDegree).toBe(REAL.meanDegree);
    expect(t.medianDegree).toBe(REAL.medianDegree);
    expect(t.isolatedShare).toBe(REAL.isolatedShare);
    expect(t.maxDegree).toBe(Math.round((REAL.maxDegree / REAL.users) * 1000));
  });
});

describe("friend graph generator", () => {
  const targets: GraphTargets = scaledTargets(REAL, GRAPH_N);
  const g = friendGraph(targets, 11);
  const stats = degreeStats(g.degree);

  it("matches the measured shape", () => {
    expect(Math.abs(stats.isolatedShare - targets.isolatedShare)).toBeLessThan(0.03);
    expect(Math.abs(stats.mean - targets.meanDegree) / targets.meanDegree).toBeLessThan(0.15);
    expect(Math.abs(stats.median - targets.medianDegree)).toBeLessThanOrEqual(1);
    // heavy tail: a few hubs far above the median
    expect(stats.max).toBeGreaterThan(10 * targets.medianDegree);
    expect(stats.max).toBeLessThanOrEqual(targets.maxDegree);
  });

  it("matches other shapes too", () => {
    for (const t of [
      { n: 600, meanDegree: 6, medianDegree: 2, isolatedShare: 0.1, maxDegree: 80 },
      { n: 1200, meanDegree: 20, medianDegree: 5, isolatedShare: 0.35, maxDegree: 400 },
    ]) {
      const s = degreeStats(friendGraph(t, 3).degree);
      expect(Math.abs(s.isolatedShare - t.isolatedShare)).toBeLessThan(0.03);
      expect(Math.abs(s.mean - t.meanDegree) / t.meanDegree).toBeLessThan(0.15);
      expect(Math.abs(s.median - t.medianDegree)).toBeLessThanOrEqual(1);
    }
  });

  it("has no self-loops or duplicate edges, and degrees agree with the edge list", () => {
    const seen = new Set<number>();
    const degree = new Uint32Array(targets.n);
    for (let e = 0; e < g.edges.length; e += 2) {
      const a = g.edges[e];
      const b = g.edges[e + 1];
      expect(a).not.toBe(b);
      expect(a).toBeLessThan(targets.n);
      expect(b).toBeLessThan(targets.n);
      const key = Math.min(a, b) * targets.n + Math.max(a, b);
      expect(seen.has(key)).toBe(false);
      seen.add(key);
      degree[a]++;
      degree[b]++;
    }
    expect(Array.from(degree)).toEqual(Array.from(g.degree));
  });

  it("lays every user out inside the scene box, isolated users on the outer ring", () => {
    expect(g.positions).toHaveLength(targets.n * 3);
    inBox(g.positions);
    let ringMin = Infinity;
    for (let i = 0; i < targets.n; i++) {
      const r = Math.hypot(g.positions[i * 3], g.positions[i * 3 + 2]);
      if (g.degree[i] === 0) ringMin = Math.min(ringMin, r);
    }
    expect(ringMin).toBeGreaterThan(3.6);
  });

  it("is deterministic for a seed and differs between seeds", () => {
    const again = friendGraph(targets, 11);
    expect(Array.from(again.edges)).toEqual(Array.from(g.edges));
    expect(Array.from(again.positions)).toEqual(Array.from(g.positions));
    expect(Array.from(friendGraph(targets, 12).edges)).not.toEqual(Array.from(g.edges));
  });

  it("survives tiny and extreme inputs", () => {
    for (const n of [0, 1, 2, 3]) {
      const t = { n, meanDegree: 14, medianDegree: 3, isolatedShare: 0.23, maxDegree: 300 };
      const tiny = friendGraph(t, 1);
      expect(tiny.positions).toHaveLength(n * 3);
      expect(tiny.degree).toHaveLength(n);
      inBox(tiny.positions);
    }
    const nobody = friendGraph({ n: 50, meanDegree: 0, medianDegree: 0, isolatedShare: 1, maxDegree: 0 }, 1);
    expect(nobody.edges).toHaveLength(0);
    inBox(nobody.positions);
    const everybody = friendGraph({ n: 50, meanDegree: 4, medianDegree: 3, isolatedShare: 0, maxDegree: 49 }, 1);
    expect(degreeStats(everybody.degree).isolatedShare).toBe(0);
    inBox(everybody.positions);
    const nan = friendGraph({ n: 40, meanDegree: Number.NaN, medianDegree: -2, isolatedShare: 7, maxDegree: -1 }, 1);
    inBox(nan.positions);
  });

  it("reports degree statistics of an empty graph without NaN", () => {
    expect(degreeStats(new Uint32Array(0))).toEqual({ mean: 0, median: 0, max: 0, isolatedShare: 0 });
  });
});

describe("city grid", () => {
  it("puts every light on the ground, finite and inside the box", () => {
    const c = cityGrid(GRAPH_N, 4);
    expect(c).toHaveLength(GRAPH_N * 3);
    inBox(c);
    expect(cityGrid(0, 4)).toHaveLength(0);
    expect(cityGrid(1, 4)).toHaveLength(3);
  });
});

describe("pipeline layout", () => {
  const stages = pipelineLayout(9, 5);

  it("snakes through the box in two rows with distinct stops", () => {
    expect(stages).toHaveLength(27);
    inBox(stages);
    // the first row runs left to right above the second, which runs back
    expect(stages[0]).toBeLessThan(stages[4 * 3]);
    expect(stages[1]).toBeGreaterThan(stages[5 * 3 + 1]);
    expect(stages[5 * 3]).toBeGreaterThan(stages[8 * 3]);
    for (let i = 1; i < 9; i++) {
      const d = Math.hypot(stages[i * 3] - stages[i * 3 - 3], stages[i * 3 + 1] - stages[i * 3 - 2], stages[i * 3 + 2] - stages[i * 3 - 1]);
      expect(d).toBeGreaterThan(1);
    }
  });

  it("moves a packet along the stops and clamps past the ends", () => {
    const out: [number, number, number] = [0, 0, 0];
    packetPosition(stages, 2, out);
    expect(out).toEqual([stages[6], stages[7], stages[8]]);
    packetPosition(stages, 2.5, out);
    expect(out[0]).toBeCloseTo((stages[6] + stages[9]) / 2, 5);
    packetPosition(stages, -4, out);
    expect(out).toEqual([stages[0], stages[1], stages[2]]);
    packetPosition(stages, 99, out);
    expect(out).toEqual([stages[24], stages[25], stages[26]]);
    packetPosition(new Float32Array(0), 1, out);
    expect(out).toEqual([0, 0, 0]);
    expect(pipelineLayout(0, 5)).toHaveLength(0);
    inBox(pipelineLayout(1, 5));
    inBox(pipelineLayout(14, 0));
  });
});
