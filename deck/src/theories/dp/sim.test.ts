import { describe, expect, it } from "vitest";
import {
  clip,
  clippedShare,
  clippedSum,
  distanceFor,
  eventProbability,
  gaussianDelta,
  gaussianOffsets,
  N_UPDATES,
  noisySum,
  norm,
  normalCdf,
  overlap,
  targetDelta,
  toyUpdates,
  type Vec3,
} from "./sim";

const updates = toyUpdates(N_UPDATES, 11);

describe("clipping", () => {
  it("leaves every clipped vector with norm at most C, and vectors already inside unchanged", () => {
    for (const C of [0.5, 2, 5, 7.5, 12]) {
      for (const v of updates) {
        const c = clip(v, C);
        expect(norm(c)).toBeLessThanOrEqual(C + 1e-9);
        if (norm(v) <= C) expect(c).toEqual(v);
        else expect(norm(c)).toBeCloseTo(C, 9);
      }
    }
  });

  it("keeps the direction of a clipped vector", () => {
    const v: Vec3 = [3, 4, 12];
    const c = clip(v, 1);
    for (let k = 0; k < 3; k++) expect(c[k] / v[k]).toBeCloseTo(1 / 13, 12);
  });

  it("gives zero vectors for C = 0 (and below) without NaN", () => {
    for (const C of [0, -1]) {
      for (const v of updates) expect(clip(v, C)).toEqual([0, 0, 0]);
      expect(clippedSum(updates, C)).toEqual([0, 0, 0]);
    }
    expect(clip([0, 0, 0], 5)).toEqual([0, 0, 0]);
    expect(clip([0, 0, 0], 0).every(Number.isFinite)).toBe(true);
  });

  it("reports the share of users clipped, from none to all", () => {
    expect(clippedShare(updates, 1e9)).toBe(0);
    expect(clippedShare(updates, 0)).toBe(1);
    expect(clippedShare([], 5)).toBe(0);
    const mid = clippedShare(updates, 5);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
  });

  it("has toy updates with a real spread of lengths", () => {
    const lengths = updates.map(norm);
    expect(Math.min(...lengths)).toBeLessThan(3);
    expect(Math.max(...lengths)).toBeGreaterThan(8);
    expect(Math.max(...lengths)).toBeLessThan(12);
  });
});

describe("the noisy sum", () => {
  it("is the exact clipped sum when z = 0", () => {
    expect(noisySum(updates, 5, 0, 3)).toEqual(clippedSum(updates, 5));
  });

  it("changes by at most C, noiseless, when one user is removed", () => {
    for (const C of [0, 1, 5, 9]) {
      const all = clippedSum(updates, C);
      for (let k = 0; k < updates.length; k++) {
        const without = clippedSum(
          updates.filter((_, i) => i !== k),
          C,
        );
        const shift = norm([all[0] - without[0], all[1] - without[1], all[2] - without[2]]);
        expect(shift).toBeLessThanOrEqual(C + 1e-9);
      }
    }
  });

  it("is pure, finite noise for an empty cohort, and exactly zero with z = 0", () => {
    const pure = noisySum([], 5, 2, 9);
    expect(pure.every(Number.isFinite)).toBe(true);
    expect(norm(pure)).toBeGreaterThan(0);
    expect(noisySum([], 5, 0, 9)).toEqual([0, 0, 0]);
    expect(noisySum([], 0, 3, 9)).toEqual([0, 0, 0]);
  });

  it("has noise of standard deviation z times C", () => {
    const samples = 4000;
    let sq = 0;
    for (let s = 0; s < samples; s++) {
      const v = noisySum([], 2, 1.5, s + 1);
      sq += v[0] * v[0] + v[1] * v[1] + v[2] * v[2];
    }
    expect(Math.sqrt(sq / (3 * samples))).toBeCloseTo(3, 1);
  });

  it("is the same for the same seed and different for another", () => {
    expect(noisySum(updates, 5, 1, 42)).toEqual(noisySum(updates, 5, 1, 42));
    expect(noisySum(updates, 5, 1, 42)).not.toEqual(noisySum(updates, 5, 1, 43));
    expect(toyUpdates(N_UPDATES, 11)).toEqual(updates);
    expect(Array.from(gaussianOffsets(50, 4))).toEqual(Array.from(gaussianOffsets(50, 4)));
  });

  it("gives finite offsets", () => {
    const g = gaussianOffsets(300, 2);
    expect(g).toHaveLength(900);
    expect(Array.from(g).every(Number.isFinite)).toBe(true);
  });
});

describe("the two-world illustration", () => {
  it("has an overlap of 1 at zero distance that falls with distance", () => {
    expect(overlap(0)).toBeCloseTo(1, 6);
    let last = overlap(0);
    for (const d of [0.1, 0.5, 1, 2, 4, 8]) {
      const o = overlap(d);
      expect(o).toBeLessThan(last);
      expect(o).toBeGreaterThanOrEqual(0);
      last = o;
    }
    expect(overlap(-1)).toBeCloseTo(overlap(1), 12);
  });

  it("has an accurate normal distribution function", () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 7);
    expect(normalCdf(1.959964)).toBeCloseTo(0.975, 6);
    expect(normalCdf(-4)).toBeCloseTo(3.167e-5, 7);
    expect(normalCdf(40)).toBe(1);
    expect(normalCdf(-40)).toBe(0);
  });

  it("finds the distance whose delta matches, and it grows with epsilon", () => {
    const delta = targetDelta(9913);
    expect(delta).toBeCloseTo(1 / 99130, 12);
    let last = 0;
    for (const eps of [0.1, 0.5, 1, 2, 4, 8, 16]) {
      const d = distanceFor(eps, delta);
      expect(Number.isFinite(d)).toBe(true);
      expect(d).toBeGreaterThan(last);
      expect(gaussianDelta(eps, d) / delta).toBeCloseTo(1, 3);
      last = d;
    }
  });

  it("keeps the inequality for any window S, in both directions", () => {
    const delta = targetDelta(9913);
    for (const eps of [0.2, 1, 8]) {
      const d = distanceFor(eps, delta);
      for (let a = -6; a < 6; a += 0.37) {
        for (const w of [0.2, 1, 3]) {
          const pWith = eventProbability(-d / 2, a, a + w);
          const pWithout = eventProbability(d / 2, a, a + w);
          expect(pWith).toBeLessThanOrEqual(Math.exp(eps) * pWithout + delta + 1e-9);
          expect(pWithout).toBeLessThanOrEqual(Math.exp(eps) * pWith + delta + 1e-9);
        }
      }
    }
  });

  it("survives the extremes of the epsilon slider and bad input", () => {
    for (const eps of [0, 1e-6, 50]) expect(Number.isFinite(distanceFor(eps, 1e-5))).toBe(true);
    expect(distanceFor(0, 1e-5)).toBeGreaterThanOrEqual(0);
    expect(() => targetDelta(0)).toThrow();
  });
});
