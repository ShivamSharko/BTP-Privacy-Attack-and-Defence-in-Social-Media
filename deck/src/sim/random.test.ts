import { describe, expect, it } from "vitest";
import { bernoulliMask, gaussian, rng, shuffle } from "./random";

describe("seeded randomness", () => {
  it("repeats exactly for the same seed and differs for another", () => {
    const a = rng(1);
    const b = rng(1);
    const c = rng(2);
    const xs = Array.from({ length: 50 }, () => a());
    expect(Array.from({ length: 50 }, () => b())).toEqual(xs);
    expect(Array.from({ length: 50 }, () => c())).not.toEqual(xs);
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
  });

  it("draws standard normal values", () => {
    const r = rng(7);
    const xs = Array.from({ length: 20000 }, () => gaussian(r));
    const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
    const variance = xs.reduce((s, x) => s + (x - mean) ** 2, 0) / xs.length;
    expect(Math.abs(mean)).toBeLessThan(0.05);
    expect(Math.abs(variance - 1)).toBeLessThan(0.1);
    expect(xs.every(Number.isFinite)).toBe(true);
  });

  it("shuffles without losing or changing items, and leaves the input alone", () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    const out = shuffle(input, rng(3));
    expect(input).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect([...out].sort((x, y) => x - y)).toEqual(input);
    expect(shuffle([], rng(3))).toEqual([]);
  });

  it("samples a cohort with the requested rate, including the extremes", () => {
    const r = rng(11);
    const picked = bernoulliMask(20000, 0.05, r).filter(Boolean).length;
    expect(Math.abs(picked / 20000 - 0.05)).toBeLessThan(0.006);
    expect(bernoulliMask(100, 0, r).some(Boolean)).toBe(false);
    expect(bernoulliMask(100, 1, r).every(Boolean)).toBe(true);
    expect(bernoulliMask(0, 0.5, r)).toEqual([]);
  });
});
