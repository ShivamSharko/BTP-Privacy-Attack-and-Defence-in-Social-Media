import { describe, expect, it } from "vitest";
import {
  attackerCount,
  CLIP,
  cleanCommitteeShare,
  committeeMedian,
  committeeSums,
  coordinateMedian,
  DIM,
  dealCommittees,
  honestMean,
  makePopulation,
  N_USERS,
  realisedCleanShare,
  signalKept,
  sumMean,
  TARGET,
  targetPush,
  trimmedMean,
} from "./sim";

const TRIM = 0.35;
const SHARES = [0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3];

describe("the toy population", () => {
  it("is deterministic for a seed and differs for another", () => {
    expect(Array.from(makePopulation(N_USERS, 0.2, 3).updates)).toEqual(Array.from(makePopulation(N_USERS, 0.2, 3).updates));
    expect(Array.from(makePopulation(N_USERS, 0.2, 3).updates)).not.toEqual(Array.from(makePopulation(N_USERS, 0.2, 4).updates));
  });

  it("makes honest updates sparse and attacker updates identical, along the target, within the norm bound", () => {
    const pop = makePopulation(200, 0.2, 1);
    expect(pop.nAttackers).toBe(attackerCount(200, 0.2));
    let zeros = 0;
    for (let u = 0; u < pop.n; u++) {
      const v = Array.from(pop.updates.slice(u * DIM, u * DIM + DIM));
      expect(Math.hypot(...v)).toBeLessThanOrEqual(CLIP + 1e-9);
      if (pop.isAttacker[u]) {
        expect(v[TARGET]).toBeCloseTo(CLIP, 9);
        for (let d = 1; d < DIM; d++) expect(v[d]).toBe(0);
      } else {
        for (const x of v) if (x === 0) zeros += 1;
      }
    }
    expect(zeros / ((pop.n - pop.nAttackers) * DIM)).toBeGreaterThan(0.45);
  });

  it("nests the attacker sets: raising the share only turns more users into attackers", () => {
    const a = makePopulation(N_USERS, 0.1, 5);
    const b = makePopulation(N_USERS, 0.3, 5);
    for (let u = 0; u < N_USERS; u++) if (a.isAttacker[u]) expect(b.isAttacker[u]).toBe(true);
    expect(Array.from(a.honest)).toEqual(Array.from(b.honest));
  });
});

describe("aggregators", () => {
  it("agree on the target direction with no attackers, within tolerance", () => {
    const pop = makePopulation(200, 0, 2);
    const reference = targetPush(sumMean(pop));
    for (const agg of [trimmedMean(pop, TRIM), coordinateMedian(pop), committeeMedian(pop, 5, 9)]) {
      expect(Math.abs(targetPush(agg) - reference)).toBeLessThan(0.05);
    }
    expect(Math.abs(reference)).toBeLessThan(0.05);
  });

  it("lets the plain mean be pushed further with every extra attacker", () => {
    let last = -Infinity;
    for (const share of SHARES) {
      const push = targetPush(sumMean(makePopulation(N_USERS, share, 6)));
      expect(push).toBeGreaterThan(last);
      last = push;
    }
    expect(last).toBeGreaterThan(0.3);
  });

  it("resists a minority of attackers with the median and the trimmed mean", () => {
    const pop = makePopulation(200, 0.3, 6);
    expect(targetPush(sumMean(pop))).toBeGreaterThan(0.4);
    expect(Math.abs(targetPush(coordinateMedian(pop)))).toBeLessThan(0.05);
    expect(Math.abs(targetPush(trimmedMean(pop, TRIM)))).toBeLessThan(0.5 * targetPush(sumMean(pop)));
  });

  it("returns zero from the median on sparse honest coordinates that the mean sees", () => {
    const pop = makePopulation(200, 0, 7);
    const mean = sumMean(pop);
    const median = coordinateMedian(pop);
    for (let d = 1; d < DIM; d++) {
      expect(mean[d]).toBeGreaterThan(0.1);
      expect(median[d]).toBe(0);
    }
    expect(signalKept(median, pop)).toBeCloseTo(0, 9);
    expect(signalKept(mean, pop)).toBeCloseTo(1, 9);
  });

  it("clamps an absurd trim and survives an empty population", () => {
    const pop = makePopulation(10, 0.2, 1);
    for (const t of [-1, 0.5, 0.9, 7]) for (const x of trimmedMean(pop, t)) expect(Number.isFinite(x)).toBe(true);
    const empty = makePopulation(0, 0.2, 1);
    for (const agg of [sumMean(empty), trimmedMean(empty, TRIM), coordinateMedian(empty), committeeMedian(empty, 5, 1)]) {
      expect(Array.from(agg)).toEqual([0, 0, 0]);
    }
  });

  it("gives finite values at attacker share 0, the slider maximum and 1", () => {
    for (const share of [0, 0.3, 1]) {
      const pop = makePopulation(N_USERS, share, 4);
      for (const agg of [sumMean(pop), trimmedMean(pop, TRIM), coordinateMedian(pop), committeeMedian(pop, 8, 2), honestMean(pop)]) {
        for (const x of agg) expect(Number.isFinite(x)).toBe(true);
      }
      expect(Number.isFinite(signalKept(sumMean(pop), pop))).toBe(true);
    }
  });
});

describe("committee median", () => {
  it("deals every user into exactly one committee, sizes differing by at most one", () => {
    const deal = dealCommittees(N_USERS, 8, 3);
    expect(deal.count).toBe(Math.round(N_USERS / 8));
    const sizes = new Array<number>(deal.count).fill(0);
    for (const c of deal.of) sizes[c] += 1;
    expect(sizes.reduce((s, x) => s + x, 0)).toBe(N_USERS);
    expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
    expect(Array.from(dealCommittees(N_USERS, 8, 3).of)).toEqual(Array.from(deal.of));
    expect(Array.from(dealCommittees(N_USERS, 8, 4).of)).not.toEqual(Array.from(deal.of));
  });

  it("treats a committee larger than the cohort as one committee that equals the plain mean", () => {
    const pop = makePopulation(N_USERS, 0.2, 1);
    expect(() => committeeMedian(pop, 1000, 1)).not.toThrow();
    expect(dealCommittees(N_USERS, 1000, 1).count).toBe(1);
    const one = committeeMedian(pop, 1000, 1);
    const mean = sumMean(pop);
    for (let d = 0; d < DIM; d++) expect(one[d]).toBeCloseTo(mean[d], 9);
    expect(() => committeeMedian(pop, 0, 1)).not.toThrow();
    expect(() => committeeMedian(pop, -3, 1)).not.toThrow();
  });

  it("sums inside each committee, so the committee sums add up to the total", () => {
    const pop = makePopulation(N_USERS, 0.2, 1);
    const deal = dealCommittees(N_USERS, 6, 2);
    const sums = committeeSums(pop, deal);
    for (let d = 0; d < DIM; d++) {
      let total = 0;
      for (let c = 0; c < deal.count; c++) total += sums[c * DIM + d];
      expect(total).toBeCloseTo(sumMean(pop)[d] * N_USERS, 9);
    }
  });

  it("is deterministic for a seed", () => {
    const pop = makePopulation(N_USERS, 0.2, 1);
    expect(Array.from(committeeMedian(pop, 6, 11))).toEqual(Array.from(committeeMedian(pop, 6, 11)));
  });

  it("holds back an attacker minority when most committees are clean, and fails when none is", () => {
    const small = makePopulation(200, 0.05, 2);
    expect(Math.abs(targetPush(committeeMedian(small, 4, 3)))).toBeLessThan(0.05);
    const big = makePopulation(200, 0.3, 2);
    expect(targetPush(committeeMedian(big, 20, 3))).toBeGreaterThan(0.3);
  });
});

describe("clean committee share", () => {
  it("is the exact chance that a random committee holds no attacker", () => {
    expect(cleanCommitteeShare(10, 1, 5)).toBeCloseTo(0.5, 12);
    expect(cleanCommitteeShare(60, 0, 20)).toBe(1);
    expect(cleanCommitteeShare(60, 6, 4)).toBeLessThan(1);
    expect(cleanCommitteeShare(60, 6, 4)).toBeGreaterThan(cleanCommitteeShare(60, 6, 20));
  });

  it("handles the extremes without NaN", () => {
    expect(cleanCommitteeShare(60, 60, 4)).toBe(0);
    expect(cleanCommitteeShare(60, 18, 500)).toBe(0);
    expect(cleanCommitteeShare(0, 0, 4)).toBe(1);
    expect(cleanCommitteeShare(60, 99, 4)).toBe(0);
    expect(cleanCommitteeShare(60, 6, 0)).toBe(1);
  });

  it("matches the realised share of a seeded deal on average", () => {
    const pop = makePopulation(N_USERS, 0.1, 1);
    let total = 0;
    const draws = 400;
    for (let s = 0; s < draws; s++) total += realisedCleanShare(pop, dealCommittees(N_USERS, 4, s));
    expect(Math.abs(total / draws - cleanCommitteeShare(N_USERS, pop.nAttackers, 4))).toBeLessThan(0.04);
  });
});
