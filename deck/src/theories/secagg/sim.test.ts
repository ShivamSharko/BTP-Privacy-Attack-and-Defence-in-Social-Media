import { describe, expect, it } from "vitest";
import {
  buildCohortTable,
  CLIP,
  cohortView,
  decodeWord,
  encodeValue,
  GRID_ITEMS,
  hex64,
  hexLow,
  makeToy,
  MAX_COHORT,
  maskedUpdate,
  MOD,
  N_USERS,
  OTHER_ITEMS,
  pairMask,
  secureSum,
  TARGET_ITEMS,
} from "./sim";

const TOL = (n: number) => (n * CLIP) / 2 ** 32 + 1e-9;

describe("fixed-point encoding", () => {
  it("round-trips positive and negative values within one step", () => {
    for (const x of [0, 1.25, -1.25, 4.99, -4.99, 0.01, -0.01, CLIP, -CLIP]) {
      expect(Math.abs(decodeWord(encodeValue(x)) - x)).toBeLessThanOrEqual(TOL(1));
    }
  });

  it("stores a negative value as two's complement modulo 2^64", () => {
    expect(encodeValue(-1.25)).toBe(MOD - encodeValue(1.25));
    expect(encodeValue(0)).toBe(0n);
    expect(encodeValue(-0.01) >= 1n << 63n).toBe(true);
  });

  it("refuses values it cannot represent", () => {
    expect(() => encodeValue(Number.NaN)).toThrow();
    expect(() => encodeValue(Number.POSITIVE_INFINITY)).toThrow();
    expect(() => encodeValue(CLIP * 1.5)).toThrow();
  });
});

describe("pairwise masks", () => {
  it("are the same for both users of a pair and different for other pairs", () => {
    expect(pairMask(3, 1, 0, 4, 3)).toEqual(pairMask(3, 1, 4, 0, 3));
    expect(pairMask(3, 1, 0, 4, 3)).not.toEqual(pairMask(3, 1, 0, 5, 3));
    expect(pairMask(3, 1, 0, 4, 3)).not.toEqual(pairMask(3, 2, 0, 4, 3));
    expect(pairMask(3, 1, 0, 4, 3)).not.toEqual(pairMask(4, 1, 0, 4, 3));
  });

  it("are deterministic and made of 64-bit words", () => {
    const a = pairMask(9, 1, 1, 2, 5);
    expect(pairMask(9, 1, 1, 2, 5)).toEqual(a);
    expect(a).toHaveLength(5);
    for (const w of a) {
      expect(w >= 0n && w < MOD).toBe(true);
    }
  });

  it("has length zero for an empty vector", () => {
    expect(pairMask(1, 1, 0, 1, 0)).toEqual([]);
  });
});

describe("masked updates and the secure sum", () => {
  it("changes every update, for every user and several seeds", () => {
    for (let seed = 1; seed <= 12; seed++) {
      const toy = makeToy(N_USERS, 2, seed);
      const run = secureSum(toy);
      for (let i = 0; i < N_USERS; i++) {
        for (let k = 0; k < 2; k++) expect(run.masked[i][k]).not.toBe(run.encoded[i][k]);
      }
    }
  });

  it("matches maskedUpdate for one user", () => {
    const toy = makeToy(5, 3, 4);
    expect(secureSum(toy).masked[2]).toEqual(maskedUpdate(toy, 2));
  });

  it("makes the masked sum decode to the plain sum", () => {
    for (let seed = 1; seed <= 12; seed++) {
      const toy = makeToy(N_USERS, 4, seed);
      const run = secureSum(toy);
      run.decoded.forEach((v, k) => expect(Math.abs(v - run.truth[k])).toBeLessThanOrEqual(TOL(N_USERS)));
    }
  });

  it("closes after any one user drops out, once the survivors' masks with that user are removed", () => {
    const toy = makeToy(N_USERS, 3, 7);
    for (let d = 0; d < N_USERS; d++) {
      const run = secureSum(toy, [d]);
      expect(run.survivors).toEqual([0, 1, 2, 3, 4, 5].filter((i) => i !== d));
      expect(run.revealed).toHaveLength(N_USERS - 1);
      run.decoded.forEach((v, k) => expect(Math.abs(v - run.truth[k])).toBeLessThanOrEqual(TOL(N_USERS)));
      // Before the masks are removed the sum is garbage: far from the truth in at least one coordinate.
      expect(run.naive.some((v, k) => Math.abs(v - run.truth[k]) > 1)).toBe(true);
    }
  });

  it("closes after two users drop out", () => {
    const toy = makeToy(N_USERS, 2, 3);
    const run = secureSum(toy, [1, 4]);
    expect(run.survivors).toEqual([0, 2, 3, 5]);
    run.decoded.forEach((v, k) => expect(Math.abs(v - run.truth[k])).toBeLessThanOrEqual(TOL(N_USERS)));
  });

  it("works for a cohort of one (no masks) and of two", () => {
    const one = makeToy(1, 2, 5);
    const r1 = secureSum(one);
    expect(r1.masked[0]).toEqual(r1.encoded[0]);
    r1.decoded.forEach((v, k) => expect(Math.abs(v - one.updates[0][k])).toBeLessThanOrEqual(TOL(1)));

    const two = makeToy(2, 2, 5);
    const r2 = secureSum(two);
    expect(r2.masked[0]).not.toEqual(r2.encoded[0]);
    r2.decoded.forEach((v, k) => expect(Math.abs(v - r2.truth[k])).toBeLessThanOrEqual(TOL(2)));
    const r2d = secureSum(two, [0]);
    r2d.decoded.forEach((v, k) => expect(Math.abs(v - two.updates[1][k])).toBeLessThanOrEqual(TOL(2)));
  });

  it("sums negative updates correctly", () => {
    const toy = makeToy(4, 1, 2);
    toy.updates = [[-2.5], [-0.5], [1.25], [-1.0]];
    const run = secureSum(toy);
    expect(Math.abs(run.decoded[0] - -2.75)).toBeLessThanOrEqual(TOL(4));
  });

  it("is deterministic for a seed and varies with it", () => {
    expect(makeToy(6, 2, 5).updates).toEqual(makeToy(6, 2, 5).updates);
    expect(makeToy(6, 2, 5).updates).not.toEqual(makeToy(6, 2, 6).updates);
    expect(secureSum(makeToy(6, 2, 5)).masked).toEqual(secureSum(makeToy(6, 2, 5)).masked);
    expect(secureSum(makeToy(6, 2, 5)).masked).not.toEqual(secureSum(makeToy(6, 2, 6)).masked);
  });

  it("rejects an invalid dropout list", () => {
    const toy = makeToy(3, 1, 1);
    expect(() => secureSum(toy, [0, 1, 2])).toThrow();
    expect(() => secureSum(toy, [7])).toThrow();
  });

  it("keeps toy updates inside the clipping range", () => {
    const toy = makeToy(40, 5, 9);
    for (const u of toy.updates) for (const v of u) expect(Math.abs(v)).toBeLessThanOrEqual(CLIP);
  });
});

describe("hex helpers", () => {
  it("pads and truncates", () => {
    expect(hex64(255n)).toBe("00000000000000ff");
    expect(hexLow(0x1234abcdn, 4)).toBe("abcd");
    expect(hexLow(5n)).toBe("00000005");
    expect(hex64(MOD - 1n)).toBe("ffffffffffffffff");
  });
});

describe("cohort table", () => {
  const table = buildCohortTable(4);

  it("has the right shape and is deterministic", () => {
    expect(table.target).toHaveLength(TARGET_ITEMS);
    expect(new Set(table.target).size).toBe(TARGET_ITEMS);
    expect(buildCohortTable(4).target).toEqual(table.target);
    expect(buildCohortTable(5).target).not.toEqual(table.target);
    expect(cohortView(table, 10).total).toHaveLength(GRID_ITEMS);
  });

  it("is only the target when the cohort is one", () => {
    const v = cohortView(table, 1);
    expect(v.others.every((x) => x === 0)).toBe(true);
    expect(v.hits).toBe(TARGET_ITEMS);
    expect(v.share).toBe(1);
  });

  it("adds exactly OTHER_ITEMS per other user", () => {
    for (const n of [2, 10, 100]) {
      const v = cohortView(table, n);
      expect(v.others.reduce((s, x) => s + x, 0)).toBe((n - 1) * OTHER_ITEMS);
    }
  });

  it("grows the sum monotonically and shrinks the target's share without reaching zero", () => {
    for (let n = 2; n <= MAX_COHORT; n++) {
      const a = cohortView(table, n - 1);
      const b = cohortView(table, n);
      for (let i = 0; i < GRID_ITEMS; i++) expect(b.total[i]).toBeGreaterThanOrEqual(a.total[i]);
    }
    const s10 = cohortView(table, 10).share;
    const s100 = cohortView(table, 100).share;
    expect(s10).toBeLessThan(1);
    expect(s100).toBeLessThan(s10);
    expect(s100).toBeGreaterThan(0);
  });

  it("clamps the cohort size and never produces NaN", () => {
    for (const n of [-5, 0, 1, 50, 100, 1000, Number.NaN]) {
      const v = cohortView(table, n);
      expect(Number.isFinite(v.share)).toBe(true);
      expect(Number.isFinite(v.hits)).toBe(true);
      expect(v.total.every((x) => Number.isFinite(x))).toBe(true);
    }
    expect(cohortView(table, 0).total).toEqual(cohortView(table, 1).total);
    expect(cohortView(table, 1000).total).toEqual(cohortView(table, MAX_COHORT).total);
  });
});
