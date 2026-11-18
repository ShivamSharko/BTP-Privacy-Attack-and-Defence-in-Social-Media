import { describe, expect, it } from "vitest";
import {
  aucScore,
  cosine,
  inversionScores,
  itemPopularity,
  linkAuc,
  linkGuesses,
  makeNetwork,
  N_ITEMS,
  N_PEOPLE,
  precisionAtK,
  rankItems,
  recover,
  spillNoise,
  unitPair,
  updateVector,
  userHistory,
  historyMask,
} from "./sim";

const popularity = itemPopularity();

describe("history inversion on the toy update", () => {
  it("recovers the history perfectly when nothing spills into the other items", () => {
    for (let user = 0; user < 4; user++) {
      for (const size of [3, 8, 12, 25]) {
        const mask = historyMask(userHistory(user, size));
        const r = recover(updateVector(mask, 0, user), mask, popularity, Math.min(10, size));
        expect(r.auc).toBe(1);
        expect(r.precision).toBe(1);
      }
    }
  });

  it("still ranks the history first with the default small spill-over", () => {
    const mask = historyMask(userHistory(1, 10));
    const r = recover(updateVector(mask, 0.12, 1), mask, popularity, 10);
    expect(r.auc).toBeGreaterThan(0.99);
    expect(r.precision).toBeGreaterThan(0.9);
  });

  it("degrades towards chance as spill-over grows", () => {
    const mask = historyMask(userHistory(2, 10));
    const low = recover(updateVector(mask, 0.1, 2), mask, popularity, 10).auc;
    const high = recover(updateVector(mask, 40, 2), mask, popularity, 10).auc;
    expect(high).toBeLessThan(low);
  });

  it("gives finite numbers for an empty history and for a history covering every item", () => {
    for (const size of [0, N_ITEMS]) {
      const mask = historyMask(userHistory(0, size));
      for (const spill of [0, 0.3]) {
        const r = recover(updateVector(mask, spill, 0), mask, popularity, 10);
        for (const v of [r.auc, r.precision, r.priorAuc, r.priorPrecision]) expect(Number.isFinite(v)).toBe(true);
      }
    }
    expect(Number.isFinite(precisionAtK([], [], 10))).toBe(true);
    expect(aucScore([], [1, 2])).toBe(0.5);
    expect(aucScore([1, 2], [])).toBe(0.5);
  });

  it("scores ties as half a win and counts a tied cut as shared", () => {
    expect(aucScore([1, 1], [1, 1])).toBe(0.5);
    expect(aucScore([3, 4], [1, 2])).toBe(1);
    expect(aucScore([1, 2], [3, 4])).toBe(0);
    // two history items share a tie at the cut with two others: expected hits are one half each
    expect(precisionAtK([5, 5, 5, 5], [true, true, false, false], 2)).toBe(0.5);
  });

  it("is deterministic for a seed and different for another", () => {
    const mask = historyMask(userHistory(3, 9));
    expect(updateVector(mask, 0.2, 5)).toEqual(updateVector(mask, 0.2, 5));
    expect(updateVector(mask, 0.2, 5)).not.toEqual(updateVector(mask, 0.2, 6));
    expect(userHistory(3, 9)).toEqual(userHistory(3, 9));
    expect(Array.from(spillNoise(1))).toEqual(Array.from(spillNoise(1)));
  });

  it("grows the history by adding items, never reshuffling", () => {
    const small = userHistory(2, 5);
    const large = userHistory(2, 15);
    for (const item of small) expect(large).toContain(item);
    expect(userHistory(2, 999)).toHaveLength(N_ITEMS);
    expect(userHistory(2, -3)).toEqual([]);
  });

  it("ranks by score, ties in index order", () => {
    expect(rankItems([0.1, 0.9, 0.9, 0.2])).toEqual([1, 2, 3, 0]);
    expect(inversionScores([-2, 1, 0])).toEqual([2, 1, 0]);
  });

  it("makes popular items likelier to be in a history", () => {
    let top = 0;
    let bottom = 0;
    const order = popularity.map((p, i) => [p, i]).sort((a, b) => b[0] - a[0]);
    const topSet = new Set(order.slice(0, 15).map((x) => x[1]));
    const bottomSet = new Set(order.slice(-15).map((x) => x[1]));
    for (let u = 0; u < 40; u++) {
      for (const item of userHistory(u, 10)) {
        if (topSet.has(item)) top++;
        if (bottomSet.has(item)) bottom++;
      }
    }
    expect(top).toBeGreaterThan(bottom);
  });
});

describe("cosine as a link score", () => {
  it("is 1 for identical vectors, -1 for opposite ones, 0 for a zero vector", () => {
    expect(cosine([1, 2, 3], [1, 2, 3])).toBe(1);
    expect(cosine([1, 2, 3], [-1, -2, -3])).toBe(-1);
    expect(cosine([0, 0], [1, 2])).toBe(0);
    expect(cosine([], [])).toBe(0);
  });

  it("stays inside [-1, 1] for any pair", () => {
    for (let deg = 0; deg <= 180; deg += 7) {
      const [a, b] = unitPair(deg);
      const c = cosine(a, b);
      expect(c).toBeGreaterThanOrEqual(-1);
      expect(c).toBeLessThanOrEqual(1);
      expect(c).toBeCloseTo(Math.cos((deg * Math.PI) / 180), 10);
    }
    const net = makeNetwork(1);
    for (const p of net.pairs) {
      expect(p.cos).toBeGreaterThanOrEqual(-1);
      expect(p.cos).toBeLessThanOrEqual(1);
    }
  });

  it("clamps rounding error so a pair of parallel vectors is exactly 1", () => {
    const v = [0.1, 0.7, 0.3, 0.9, 0.123456789];
    expect(cosine(v, v.map((x) => x * 3))).toBe(1);
  });
});

describe("the toy friend network", () => {
  it("has about 14 people, every pair scored once, and is deterministic", () => {
    const net = makeNetwork(3);
    expect(net.people).toBe(N_PEOPLE);
    expect(net.pairs).toHaveLength((N_PEOPLE * (N_PEOPLE - 1)) / 2);
    expect(net.pairs.filter((p) => p.friend).length).toBeGreaterThan(8);
    expect(makeNetwork(3).pairs).toEqual(net.pairs);
    expect(makeNetwork(4).pairs).not.toEqual(net.pairs);
  });

  it("scores friends higher than strangers on average, so the link score carries signal", () => {
    for (const seed of [0, 1, 2, 3]) {
      const net = makeNetwork(seed);
      expect(linkAuc(net)).toBeGreaterThan(0.6);
    }
  });

  it("never guesses more links when the threshold rises", () => {
    for (const seed of [0, 1, 2]) {
      const net = makeNetwork(seed);
      let last = Infinity;
      for (let t = -1.2; t <= 1.2; t += 0.05) {
        const g = linkGuesses(net, t);
        expect(g.guessed).toBeLessThanOrEqual(last);
        last = g.guessed;
        expect(g.hits + g.falseAlarms).toBe(g.guessed);
        expect(g.hits + g.missed).toBe(net.pairs.filter((p) => p.friend).length);
        expect(Number.isFinite(g.precision)).toBe(true);
        expect(Number.isFinite(g.recall)).toBe(true);
      }
    }
  });

  it("guesses everything at the lowest threshold and nothing above 1", () => {
    const net = makeNetwork(0);
    expect(linkGuesses(net, -1).guessed).toBe(net.pairs.length);
    expect(linkGuesses(net, 1.01).guessed).toBe(0);
    expect(linkGuesses(net, 1.01).precision).toBe(0);
  });
});
