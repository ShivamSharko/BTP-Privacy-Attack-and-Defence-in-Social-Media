import { describe, expect, it } from "vitest";
import { rng } from "../../sim/random";
import {
  addRound,
  cohortForRound,
  deviceLayout,
  emptyHistogram,
  expectedCohort,
  meanSize,
  N_DEVICES,
  probabilityEmpty,
  sampleCohort,
} from "./sim";

describe("Poisson cohort sampling", () => {
  it("has the expected mean size", () => {
    const r = rng(5);
    for (const q of [0.05, 0.5]) {
      let total = 0;
      for (let round = 0; round < 2000; round++) total += sampleCohort(N_DEVICES, q, r).length;
      const mean = total / 2000;
      expect(Math.abs(mean - expectedCohort(N_DEVICES, q)) / expectedCohort(N_DEVICES, q)).toBeLessThan(0.03);
    }
  });

  it("handles the extremes: nobody, everybody, out-of-range rates", () => {
    const r = rng(1);
    expect(sampleCohort(N_DEVICES, 0, r)).toEqual([]);
    expect(sampleCohort(N_DEVICES, 1, r)).toHaveLength(N_DEVICES);
    expect(sampleCohort(N_DEVICES, -3, r)).toEqual([]);
    expect(sampleCohort(N_DEVICES, 7, r)).toHaveLength(N_DEVICES);
    expect(sampleCohort(0, 0.5, r)).toEqual([]);
  });

  it("gives the same cohort for the same round and a different one for another", () => {
    expect(cohortForRound(3, 0.3)).toEqual(cohortForRound(3, 0.3));
    expect(cohortForRound(3, 0.3)).not.toEqual(cohortForRound(4, 0.3));
  });

  it("knows how often a cohort is empty", () => {
    expect(probabilityEmpty(60, 0.05)).toBeCloseTo(0.046, 3);
    expect(probabilityEmpty(60, 0)).toBe(1);
    expect(probabilityEmpty(60, 1)).toBe(0);
  });
});

describe("cohort size histogram", () => {
  it("counts rounds, empties and the mean", () => {
    let h = emptyHistogram(10);
    for (const size of [0, 3, 3, 4, 0]) h = addRound(h, size);
    expect(h.rounds).toBe(5);
    expect(h.empty).toBe(2);
    expect(h.counts[3]).toBe(2);
    expect(h.counts.reduce((s, c) => s + c, 0)).toBe(5);
    expect(meanSize(h)).toBe(2);
    expect(meanSize(emptyHistogram())).toBe(0);
  });

  it("clamps sizes outside the range instead of writing past the array", () => {
    let h = emptyHistogram(10);
    h = addRound(h, 99);
    h = addRound(h, -4);
    expect(h.counts).toHaveLength(11);
    expect(h.counts[10]).toBe(1);
    expect(h.counts[0]).toBe(1);
  });
});

describe("device layout", () => {
  it("is deterministic, finite and inside the scene", () => {
    const a = deviceLayout(N_DEVICES, 2);
    expect(Array.from(deviceLayout(N_DEVICES, 2))).toEqual(Array.from(a));
    expect(a).toHaveLength(N_DEVICES * 3);
    for (let i = 0; i < N_DEVICES; i++) {
      const radius = Math.hypot(a[i * 3], a[i * 3 + 1], a[i * 3 + 2]);
      expect(Number.isFinite(radius)).toBe(true);
      expect(radius).toBeLessThan(5.2);
      expect(radius).toBeGreaterThan(3.0);
    }
  });
});
