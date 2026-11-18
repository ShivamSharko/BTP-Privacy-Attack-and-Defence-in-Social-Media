import { describe, expect, it } from "vitest";
import {
  availability,
  DEFAULT_CONFIG,
  groupGap,
  groupMeans,
  groupsByActivity,
  isOn,
  litShare,
  makeWorld,
  SCENARIOS,
  shareAvailable,
  wrapHour,
} from "./sim";

const world = makeWorld(3, 240);
const { floor, mean } = DEFAULT_CONFIG;

describe("availability", () => {
  it("stays inside [floor, 1] for every scenario, user and hour", () => {
    for (const s of SCENARIOS) {
      for (let h = 0; h <= 24; h += 1.5) {
        for (let u = 0; u < world.n; u++) {
          const a = availability(world, s, u, h);
          expect(Number.isFinite(a)).toBe(true);
          if (s === "always") expect(a).toBe(1);
          else {
            expect(a).toBeGreaterThanOrEqual(floor - 1e-12);
            expect(a).toBeLessThanOrEqual(1 + 1e-12);
          }
        }
      }
    }
  });

  it("is exactly 1 for 'always'", () => {
    expect(shareAvailable(world, "always", 7)).toBe(1);
  });

  it("has the configured mean for 'independent', at every hour", () => {
    for (const h of [0, 6.5, 13, 23.9]) expect(shareAvailable(world, "independent", h)).toBeCloseTo(mean, 12);
  });

  it("keeps the rank-based scenarios near the configured mean", () => {
    expect(shareAvailable(world, "activity", 12)).toBeCloseTo(mean, 2);
  });

  it("rises with activity in the activity-linked scenarios", () => {
    for (const s of ["activity", "trace_activity"] as const) {
      const order = Array.from({ length: world.n }, (_, i) => i).sort((a, b) => world.activity[a] - world.activity[b]);
      for (let k = 1; k < order.length; k++) {
        expect(availability(world, s, order[k], 5)).toBeGreaterThanOrEqual(availability(world, s, order[k - 1], 5) - 1e-12);
      }
    }
  });

  it("makes friends more alike in the social scenario than strangers", () => {
    const h = 20;
    let near = 0;
    for (const [a, b] of world.friends) near += Math.abs(availability(world, "social", a, h) - availability(world, "social", b, h));
    near /= world.friends.length;
    let far = 0;
    for (let i = 0; i < world.n; i++) far += Math.abs(availability(world, "social", i, h) - availability(world, "social", (i * 37 + 11) % world.n, h));
    far /= world.n;
    expect(near).toBeLessThan(far);
  });

  it("agrees at hour 0 and hour 24, and wraps negative hours", () => {
    for (const s of SCENARIOS) {
      for (let u = 0; u < world.n; u += 7) expect(availability(world, s, u, 0)).toBe(availability(world, s, u, 24));
      expect(isOn(world, s, 5, 0)).toBe(isOn(world, s, 5, 24));
    }
    expect(wrapHour(-1)).toBe(23);
    expect(wrapHour(49)).toBe(1);
  });

  it("varies over the day only in the scenarios that follow a clock", () => {
    const spread = (s: (typeof SCENARIOS)[number]) => {
      const xs = Array.from({ length: 24 }, (_, h) => shareAvailable(world, s, h));
      return Math.max(...xs) - Math.min(...xs);
    };
    expect(spread("always")).toBe(0);
    expect(spread("independent")).toBeLessThan(1e-12);
    expect(spread("trace_replay")).toBeGreaterThan(0.05);
  });

  it("is deterministic for a seed and differs between seeds", () => {
    const a = makeWorld(3, 240);
    expect(Array.from(a.activity)).toEqual(Array.from(world.activity));
    expect(a.friends).toEqual(world.friends);
    expect(availability(a, "trace_replay", 9, 14.2)).toBe(availability(world, "trace_replay", 9, 14.2));
    expect(Array.from(makeWorld(4, 240).activity)).not.toEqual(Array.from(world.activity));
  });

  it("copes with no users and with one user", () => {
    for (const n of [0, 1, 2]) {
      const w = makeWorld(1, n);
      for (const s of SCENARIOS) {
        expect(Number.isFinite(shareAvailable(w, s, 3))).toBe(true);
        expect(Number.isFinite(litShare(w, s, 3))).toBe(true);
      }
    }
  });
});

describe("lit lights", () => {
  it("light everyone for 'always' and track the probability otherwise", () => {
    expect(litShare(world, "always", 4)).toBe(1);
    expect(Math.abs(litShare(world, "independent", 4) - mean)).toBeLessThan(0.1);
  });
});

describe("groups", () => {
  it("splits users into three equal-ish terciles by activity", () => {
    const g = groupsByActivity(world.activity);
    const counts = [0, 0, 0];
    for (const x of g) counts[x] += 1;
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
    const low = world.activity.filter((_, i) => g[i] === 0);
    const high = world.activity.filter((_, i) => g[i] === 2);
    expect(Math.max(...low)).toBeLessThanOrEqual(Math.min(...high));
  });

  it("averages by group and gives a number, not NaN, for an empty group", () => {
    const means = groupMeans([1, 2, 3, 5], [0, 0, 2, 2]);
    expect(means).toEqual([1.5, 0, 4]);
    expect(groupMeans([], [], 3).every((x) => x === 0)).toBe(true);
    expect(groupGap([1, 2], [0, 0])).toBe(0 - 1.5);
    expect(Number.isNaN(groupGap([], []))).toBe(false);
  });

  it("measures the gap as top group minus bottom group", () => {
    expect(groupGap([1, 1, 4, 4, 9, 9], [0, 0, 1, 1, 2, 2])).toBe(8);
  });
});
