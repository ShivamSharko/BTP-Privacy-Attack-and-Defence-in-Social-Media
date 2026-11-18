import { describe, expect, it } from "vitest";
import {
  type Aggregator,
  createSandbox,
  evaluate,
  fakeCount,
  MAX_SHARE,
  median,
  N_ITEMS,
  N_USERS,
  popularityAccuracy,
  runRound,
  type Settings,
  TARGET,
  tradeoffPoints,
  type TradeoffInput,
  trimmedMean,
} from "./sim";

const CLEAN: Settings = { noise: 0, share: 0, q: 0.3, aggregator: "sum", trim: 0.35 };

function train(settings: Settings, rounds: number, seed = 1) {
  const sb = createSandbox(seed);
  for (let i = 0; i < rounds; i++) runRound(sb, settings);
  return sb;
}

describe("the toy world", () => {
  it("has the stated size and a target item nobody has chosen", () => {
    const sb = createSandbox(1);
    expect(sb.world.users).toHaveLength(N_USERS);
    expect(sb.V).toHaveLength(N_ITEMS * sb.dim);
    for (const user of sb.world.users) {
      expect(user.train.length).toBeGreaterThan(0);
      expect(user.test.length).toBeGreaterThan(0);
      expect(user.train).not.toContain(TARGET);
      expect(user.test).not.toContain(TARGET);
    }
  });

  it("turns an attacker share into a number of fake accounts", () => {
    expect(fakeCount(0)).toBe(0);
    expect(fakeCount(0.5)).toBe(N_USERS);
    expect(fakeCount(-1)).toBe(0);
    expect(fakeCount(MAX_SHARE + 1)).toBe(fakeCount(MAX_SHARE));
  });
});

describe("federated training of the toy recommender", () => {
  it("beats the popularity baseline by a clear margin with no noise and no attackers", () => {
    const sb = train(CLEAN, 150);
    const { accuracy } = evaluate(sb);
    const popular = popularityAccuracy(sb.world);
    expect(accuracy).toBeGreaterThan(popular + 0.15);
  });

  it("lets 30% attackers push the target into many top-5 lists under the plain sum", () => {
    const clean = evaluate(train(CLEAN, 150)).exposure;
    const attacked = evaluate(train({ ...CLEAN, share: 0.3 }, 150)).exposure;
    expect(clean).toBeLessThan(0.05);
    expect(attacked).toBeGreaterThan(clean + 0.3);
  });

  it("loses its advantage over popularity under very large noise, without NaN", () => {
    const sb = train({ ...CLEAN, noise: 1e4 }, 150);
    const { accuracy, exposure } = evaluate(sb);
    expect(Number.isFinite(accuracy)).toBe(true);
    expect(Number.isFinite(exposure)).toBe(true);
    for (const v of sb.V) expect(Number.isFinite(v)).toBe(true);
    expect(accuracy).toBeLessThan(popularityAccuracy(sb.world) + 0.05);
  });

  it("leaves the model unchanged when nobody is sampled and there is no noise", () => {
    const sb = createSandbox(3);
    const before = Array.from(sb.V);
    const info = runRound(sb, { ...CLEAN, q: 0 });
    expect(info.cohort).toEqual([]);
    expect(Array.from(sb.V)).toEqual(before);
  });

  it("stays finite at every extreme of every control", () => {
    const aggregators: Aggregator[] = ["sum", "trimmed", "median"];
    for (const aggregator of aggregators) {
      for (const share of [0, MAX_SHARE]) {
        for (const q of [0, 0.05, 1]) {
          for (const noise of [0, 5]) {
            for (const trim of [0, 0.35, 0.5]) {
              const sb = train({ noise, share, q, aggregator, trim }, 12, 7);
              const { accuracy, exposure } = evaluate(sb);
              expect(Number.isFinite(accuracy)).toBe(true);
              expect(Number.isFinite(exposure)).toBe(true);
              for (const v of sb.V) expect(Number.isFinite(v)).toBe(true);
            }
          }
        }
      }
    }
  });

  it("is deterministic for a seed and differs between seeds", () => {
    const settings: Settings = { noise: 1, share: 0.2, q: 0.3, aggregator: "trimmed", trim: 0.35 };
    const a = train(settings, 40, 11);
    const b = train(settings, 40, 11);
    const c = train(settings, 40, 12);
    expect(Array.from(a.V)).toEqual(Array.from(b.V));
    expect(evaluate(a)).toEqual(evaluate(b));
    expect(Array.from(a.V)).not.toEqual(Array.from(c.V));
  });
});

describe("robust statistics", () => {
  it("trims each end and falls back to the median when the trim would remove everyone", () => {
    expect(trimmedMean([1, 2, 3, 4, 100], 0.2)).toBeCloseTo(3, 10);
    expect(trimmedMean([1, 2], 0.5)).toBeCloseTo(1.5, 10);
    expect(trimmedMean([5], 0.9)).toBe(5);
    expect(trimmedMean([], 0.3)).toBe(0);
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBe(0);
  });
});

describe("trade-off points", () => {
  const input: TradeoffInput = {
    levels: [
      { id: "large-nondp", label: "large, no noise", regime: "large", epsilon: null, ndcg: 0.036 },
      { id: "large-eps8", label: "large, eps 8", regime: "large", epsilon: 8, ndcg: 0.028 },
      { id: "small-eps1", label: "small, eps 1", regime: "small", epsilon: 1, ndcg: 0.018 },
    ],
    modes: [
      { id: "sum", label: "secure sum", ndcg: 0.022, exposure: 0.95 },
      { id: "median", label: "median", ndcg: 0.0046, exposure: 0.004 },
    ],
    gossip: { ndcg: 0.0054, epsilon: 8 },
  };

  it("returns finite coordinates for every point", () => {
    const points = tradeoffPoints(input);
    expect(points).toHaveLength(6);
    for (const p of points) {
      for (const v of [p.x, p.y, p.z, p.privacy, p.utility]) expect(Number.isFinite(v)).toBe(true);
    }
  });

  it("marks robustness as not measured instead of inventing a value", () => {
    const points = tradeoffPoints(input);
    const unmeasured = points.filter((p) => p.robustness === null);
    expect(unmeasured.map((p) => p.group).sort()).toEqual(["dp", "dp", "dp", "gossip"]);
    const plane = unmeasured[0].z;
    for (const p of unmeasured) expect(p.z).toBe(plane);
    for (const p of points.filter((q) => q.robustness !== null)) expect(p.z).toBeGreaterThan(plane);
    expect(points.find((p) => p.id === "median")?.robustness).toBeCloseTo(0.996, 6);
  });

  it("puts smaller epsilon further along the privacy axis and no noise at the open end", () => {
    const points = tradeoffPoints(input);
    const x = (id: string) => points.find((p) => p.id === id)?.x ?? NaN;
    expect(x("small-eps1")).toBeGreaterThan(x("large-eps8"));
    expect(x("large-eps8")).toBeGreaterThan(x("large-nondp"));
    expect(x("sum")).toBe(x("large-nondp"));
  });

  it("copes with an empty input and odd values", () => {
    expect(tradeoffPoints({ levels: [], modes: [], gossip: null })).toEqual([]);
    const odd = tradeoffPoints({
      levels: [{ id: "a", label: "a", regime: "large", epsilon: 0, ndcg: Number.NaN }],
      modes: [{ id: "b", label: "b", ndcg: 0, exposure: 2 }],
      gossip: null,
    });
    for (const p of odd) for (const v of [p.x, p.y, p.z]) expect(Number.isFinite(v)).toBe(true);
  });
});
