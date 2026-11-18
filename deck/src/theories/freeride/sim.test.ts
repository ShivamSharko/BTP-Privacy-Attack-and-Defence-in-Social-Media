import { describe, expect, it } from "vitest";
import {
  aggregateAlignment,
  cosineToAggregate,
  detectionAuc,
  detectorAucs,
  deviceRing,
  flaggedByCosine,
  flaggedByNorm,
  freeRiderCount,
  N_DEVICES,
  norms,
  simulateRound,
} from "./sim";

const SEEDS = Array.from({ length: 40 }, (_, i) => i + 1);
const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

describe("what a free-rider sends", () => {
  it("sends exactly zero when it sends zeros", () => {
    const r = simulateRound(0.25, "zero", 3);
    r.updates.forEach((u, i) => {
      if (r.isRider[i]) expect(u.every((x) => x === 0)).toBe(true);
      else expect(u.some((x) => x !== 0)).toBe(true);
    });
  });

  it("sends noise with the mean honest norm when it sends noise", () => {
    const r = simulateRound(0.25, "noise", 3);
    const honest = norms(r.updates.filter((_, i) => !r.isRider[i]));
    const target = mean(honest);
    const riderNorms = norms(r.updates.filter((_, i) => r.isRider[i]));
    expect(riderNorms.length).toBe(freeRiderCount(0.25));
    for (const n of riderNorms) expect(n).toBeCloseTo(target, 9);
  });

  it("leaves the honest updates alone whatever the share and behaviour", () => {
    const base = simulateRound(0, "zero", 7);
    const other = simulateRound(0.5, "noise", 7);
    other.updates.forEach((u, i) => {
      if (!other.isRider[i]) expect(u).toEqual(base.updates[i]);
    });
  });

  it("makes the free-rider sets nest as the share grows", () => {
    const small = simulateRound(0.2, "zero", 4).isRider;
    const large = simulateRound(0.5, "zero", 4).isRider;
    small.forEach((rider, i) => {
      if (rider) expect(large[i]).toBe(true);
    });
  });
});

describe("the two detectors", () => {
  it("separates zero senders perfectly by norm", () => {
    for (const seed of SEEDS) {
      const r = simulateRound(0.3, "zero", seed);
      expect(detectorAucs(r).norm).toBe(1);
    }
  });

  it("does not separate norm-matched noise by norm: the mean AUC over seeds is near 0.5", () => {
    // One draw has about 34 honest devices, so the AUC (the share of honest norms above the
    // fake norm) has a standard deviation near 0.09. The mean of 40 seeds has about 0.015, so
    // a band of 0.08 is more than five standard deviations wide and the check never flakes.
    const aucs = SEEDS.map((seed) => detectorAucs(simulateRound(0.3, "noise", seed)).norm);
    expect(Math.abs(mean(aucs) - 0.5)).toBeLessThan(0.08);
  });

  it("catches norm-matched noise by cosine to the aggregate in the toy", () => {
    const aucs = SEEDS.map((seed) => detectorAucs(simulateRound(0.3, "noise", seed)).cosine);
    expect(Math.min(...aucs)).toBeGreaterThan(0.95);
  });

  it("gives a zero row cosine 0 and a lone row cosine 0", () => {
    expect(cosineToAggregate([[1, 0], [0, 0]])[1]).toBe(0);
    expect(cosineToAggregate([[3, 4]])).toEqual([0]);
    expect(cosineToAggregate([])).toEqual([]);
  });

  it("compares each row with the mean of the others", () => {
    const c = cosineToAggregate([[1, 0], [1, 0], [0, 1]]);
    expect(c[0]).toBeCloseTo(Math.SQRT1_2, 9); // others mean (0.5, 0.5)
    expect(c[2]).toBeCloseTo(0, 9); // others mean (1, 0)
  });

  it("flags zeros by norm and noise by cosine, and honest devices rarely", () => {
    const z = simulateRound(0.25, "zero", 9);
    const byNorm = flaggedByNorm(norms(z.updates));
    z.isRider.forEach((rider, i) => expect(byNorm[i]).toBe(rider));
    const n = simulateRound(0.25, "noise", 9);
    expect(flaggedByNorm(norms(n.updates)).some(Boolean)).toBe(false);
    const byCos = flaggedByCosine(cosineToAggregate(n.updates));
    n.isRider.forEach((rider, i) => expect(byCos[i]).toBe(rider));
  });
});

describe("detectionAuc", () => {
  it("is 1 for perfect separation, 0 for the reverse and 0.5 for ties", () => {
    expect(detectionAuc([0.9, 0.8, 0.1, 0.2], [true, true, false, false])).toBe(1);
    expect(detectionAuc([0.1, 0.2, 0.9, 0.8], [true, true, false, false])).toBe(0);
    expect(detectionAuc([1, 1, 1, 1], [true, true, false, false])).toBe(0.5);
  });

  it("falls back to 0.5 when there is nobody to compare", () => {
    expect(detectionAuc([1, 2, 3], [false, false, false])).toBe(0.5);
    expect(detectionAuc([1, 2, 3], [true, true, true])).toBe(0.5);
    expect(detectionAuc([], [])).toBe(0.5);
  });
});

describe("the extremes of the share slider", () => {
  it("has no free-riders at share 0 and a finite AUC", () => {
    for (const behaviour of ["zero", "noise"] as const) {
      const r = simulateRound(0, behaviour, 2);
      expect(r.isRider.some(Boolean)).toBe(false);
      const a = detectorAucs(r);
      expect(a.norm).toBe(0.5);
      expect(a.cosine).toBe(0.5);
      expect(aggregateAlignment(r).useful).toBeCloseTo(1, 9);
    }
  });

  it("does not divide by zero at share 1", () => {
    for (const behaviour of ["zero", "noise"] as const) {
      const r = simulateRound(1, behaviour, 2);
      expect(r.isRider.every(Boolean)).toBe(true);
      const all = [...r.updates.flat(), ...r.aggregate, ...r.norms, ...r.cosines];
      expect(all.every(Number.isFinite)).toBe(true);
      const a = detectorAucs(r);
      expect(a.norm).toBe(0.5);
      expect(a.cosine).toBe(0.5);
      const al = aggregateAlignment(r);
      expect(Number.isFinite(al.useful) && Number.isFinite(al.offTarget)).toBe(true);
      if (behaviour === "zero") expect(al.useful).toBe(0);
    }
  });

  it("clamps shares outside 0 to 1", () => {
    expect(freeRiderCount(-1)).toBe(0);
    expect(freeRiderCount(7)).toBe(N_DEVICES);
    expect(freeRiderCount(Number.NaN)).toBe(0);
  });
});

describe("what the free-riders cost", () => {
  it("lowers the useful step as the share rises, for both behaviours", () => {
    for (const behaviour of ["zero", "noise"] as const) {
      const steps = [0, 0.25, 0.5, 0.75, 1].map((share) =>
        mean(SEEDS.map((seed) => aggregateAlignment(simulateRound(share, behaviour, seed)).useful)),
      );
      for (let i = 1; i < steps.length; i++) expect(steps[i]).toBeLessThan(steps[i - 1]);
    }
  });

  it("is close to 1 minus the share for zero senders", () => {
    const r = simulateRound(0.5, "zero", 1);
    expect(aggregateAlignment(r).useful).toBeGreaterThan(0.35);
    expect(aggregateAlignment(r).useful).toBeLessThan(0.65);
  });

  it("makes noise push the aggregate off course and zeros not", () => {
    const zero = mean(SEEDS.map((s) => aggregateAlignment(simulateRound(0.4, "zero", s)).offTarget));
    const noise = mean(SEEDS.map((s) => aggregateAlignment(simulateRound(0.4, "noise", s)).offTarget));
    expect(noise).toBeGreaterThan(zero);
  });
});

describe("determinism and layout", () => {
  it("repeats for a seed and differs for another", () => {
    expect(simulateRound(0.3, "noise", 5)).toEqual(simulateRound(0.3, "noise", 5));
    expect(simulateRound(0.3, "noise", 5).updates).not.toEqual(simulateRound(0.3, "noise", 6).updates);
  });

  it("places the devices on a ring inside the scene", () => {
    const ring = deviceRing(N_DEVICES);
    expect(ring).toHaveLength(N_DEVICES * 3);
    for (let i = 0; i < N_DEVICES; i++) {
      expect(Math.hypot(ring[i * 3], ring[i * 3 + 2])).toBeCloseTo(4, 6);
    }
  });
});
