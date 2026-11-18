import { describe, expect, it } from "vitest";
import {
  buildCatalogue,
  distinctTopK,
  hiddenRanks,
  itemVector,
  MODES,
  N_ITEMS,
  sampleUsers,
  scores,
  splitHistory,
  softmaxLoss,
  topK,
  userVector,
} from "./sim";

const cat = buildCatalogue(7);
const norm = (v: readonly number[]) => Math.hypot(v[0], v[1], v[2]);
const dot = (a: readonly number[], b: readonly number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

describe("the toy catalogue", () => {
  it("has 40 to 60 items, deterministic for a seed, all finite", () => {
    expect(N_ITEMS).toBeGreaterThanOrEqual(40);
    expect(N_ITEMS).toBeLessThanOrEqual(60);
    expect(cat.n).toBe(N_ITEMS);
    expect(buildCatalogue(7)).toEqual(cat);
    for (const mode of MODES) for (let i = 0; i < cat.n; i++) expect(norm(itemVector(cat, i, mode))).toBeCloseTo(1, 9);
    for (const b of cat.bias) expect(Number.isFinite(b)).toBe(true);
  });
});

describe("user vector", () => {
  it("has unit length for any non-empty history", () => {
    for (const mode of MODES) {
      expect(norm(userVector(cat, [3], mode))).toBeCloseTo(1, 9);
      expect(norm(userVector(cat, [0, 5, 20, 41], mode))).toBeCloseTo(1, 9);
    }
  });

  it("does not produce NaN for an empty history, and scores stay finite", () => {
    const u = userVector(cat, [], "hybrid");
    expect(u.every(Number.isFinite)).toBe(true);
    expect(scores(cat, u, 20, "hybrid").every(Number.isFinite)).toBe(true);
    expect(topK(scores(cat, u, 20, "hybrid"), 10, [])).toHaveLength(10);
  });

  it("moves toward an item that is added to the history", () => {
    const before = userVector(cat, [0, 1], "hybrid");
    const target = 30;
    const after = userVector(cat, [0, 1, target], "hybrid");
    expect(dot(after, itemVector(cat, target, "hybrid"))).toBeGreaterThan(dot(before, itemVector(cat, target, "hybrid")));
  });

  it("ignores duplicate or out-of-range entries rather than throwing", () => {
    expect(userVector(cat, [2, 2, 999, -1], "hybrid").every(Number.isFinite)).toBe(true);
  });
});

describe("scores", () => {
  it("at temperature 0 the ranking is by the item bias (popularity) alone", () => {
    const u = userVector(cat, [4, 9], "hybrid");
    const s = scores(cat, u, 0, "hybrid");
    for (let i = 0; i < cat.n; i++) expect(s[i]).toBeCloseTo(cat.bias[i], 12);
    const byBias = [...cat.bias.keys()].sort((a, b) => cat.bias[b] - cat.bias[a] || a - b).slice(0, 10);
    expect(topK(s, 10, [])).toEqual(byBias);
  });

  it("is temperature times cosine plus bias", () => {
    const u = userVector(cat, [4, 9], "hybrid");
    const s = scores(cat, u, 12, "hybrid");
    expect(s[17]).toBeCloseTo(12 * dot(u, itemVector(cat, 17, "hybrid")) + cat.bias[17], 9);
  });

  it("topK leaves out excluded items and handles k larger than the catalogue", () => {
    const s = scores(cat, userVector(cat, [4, 9], "hybrid"), 20, "hybrid");
    const top = topK(s, 10, [4, 9]);
    expect(top).not.toContain(4);
    expect(top).not.toContain(9);
    expect(topK(s, 1000, [])).toHaveLength(cat.n);
  });
});

describe("hiding half of the history", () => {
  const history = [1, 4, 8, 15, 16, 23, 30];
  it("is deterministic for a seed and varies with the seed", () => {
    expect(splitHistory(history, 5)).toEqual(splitHistory(history, 5));
    const seen = new Set(Array.from({ length: 20 }, (_, s) => splitHistory(history, s).hidden.join(",")));
    expect(seen.size).toBeGreaterThan(3);
  });

  it("partitions the history and never hides everything when there are two or more items", () => {
    for (let seed = 0; seed < 200; seed++) {
      for (const h of [[3, 9], [3, 9, 12], history]) {
        const { visible, hidden } = splitHistory(h, seed);
        expect([...visible, ...hidden].sort((a, b) => a - b)).toEqual([...h].sort((a, b) => a - b));
        expect(visible.length).toBeGreaterThanOrEqual(1);
        expect(hidden.length).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it("copes with one item and with none", () => {
    expect(splitHistory([7], 1)).toEqual({ visible: [7], hidden: [] });
    expect(splitHistory([], 1)).toEqual({ visible: [], hidden: [] });
  });
});

describe("loss and rank of the hidden items", () => {
  it("is finite, positive, and ignores visible items in the softmax", () => {
    const { visible, hidden } = splitHistory([2, 5, 7, 40], 3);
    const l = softmaxLoss(cat, visible, hidden, 20, "hybrid");
    expect(Number.isFinite(l)).toBe(true);
    expect(l).toBeGreaterThan(0);
    expect(softmaxLoss(cat, visible, [], 20, "hybrid")).toBe(0);
    expect(softmaxLoss(cat, [], hidden, 20, "hybrid")).toBeGreaterThan(0);
  });

  it("ranks hidden items among the catalogue with the visible ones removed", () => {
    const { visible, hidden } = splitHistory([2, 5, 7, 40], 3);
    const ranks = hiddenRanks(cat, visible, hidden, 20, "hybrid");
    expect(ranks).toHaveLength(hidden.length);
    for (const r of ranks) {
      expect(r).toBeGreaterThanOrEqual(1);
      expect(r).toBeLessThanOrEqual(cat.n - visible.length);
    }
  });
});

describe("why content alone collapses to popular items", () => {
  const users = sampleUsers(cat);
  it("has a fixed set of sample users with real histories", () => {
    expect(users.length).toBeGreaterThanOrEqual(8);
    for (const h of users) expect(h.length).toBeGreaterThanOrEqual(3);
  });

  it("recommends fewer distinct items with content only than with the hybrid", () => {
    const content = distinctTopK(cat, 20, "content", 3);
    const hybrid = distinctTopK(cat, 20, "hybrid", 3);
    const ids = distinctTopK(cat, 20, "ids", 3);
    expect(content.distinct).toBeLessThan(hybrid.distinct);
    expect(content.distinct).toBeLessThan(ids.distinct);
    expect(content.counts).toHaveLength(cat.n);
  });

  it("at temperature 0 every mode recommends the same popular items to everyone", () => {
    for (const mode of MODES) expect(distinctTopK(cat, 0, mode, 3).distinct).toBeLessThanOrEqual(6);
  });
});
