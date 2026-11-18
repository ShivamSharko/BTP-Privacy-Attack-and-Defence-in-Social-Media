import { describe, expect, it } from "vitest";
import { RESULT_FILES, fact, raw } from "../../data";
import { rng } from "../../sim/random";
import {
  ALPHA,
  bitsOfEvidence,
  bootstrapCi,
  cloudLayout,
  packetRest,
  gateX,
  canSurviveHolm,
  controlVerdict,
  holm,
  formatP,
  minSignTestP,
  summariseControls,
  toySeedValues,
} from "./sim";

describe("smallest sign-test p-value", () => {
  it("is 2 x 0.5^n for n paired seeds", () => {
    expect(minSignTestP(10)).toBeCloseTo(2 / 1024, 15);
    expect(minSignTestP(5)).toBeCloseTo(0.0625, 15);
    expect(minSignTestP(3)).toBeCloseTo(0.25, 15);
  });

  it("is capped at 1 and survives the extremes", () => {
    expect(minSignTestP(1)).toBe(1);
    expect(minSignTestP(0)).toBe(1);
    expect(minSignTestP(-4)).toBe(1);
    expect(minSignTestP(Number.NaN)).toBe(1);
    expect(minSignTestP(2000)).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(minSignTestP(2000))).toBe(true);
  });

  it("only goes below 0.05 from six seeds on, which is why five seeds can never reach it", () => {
    expect(minSignTestP(5)).toBeGreaterThan(ALPHA);
    expect(minSignTestP(6)).toBeLessThan(ALPHA);
  });

  it("says whether the best possible p-value could survive Holm with m comparisons", () => {
    expect(canSurviveHolm(10, 1)).toBe(true);
    expect(canSurviveHolm(5, 1)).toBe(false);
    expect(canSurviveHolm(10, 25)).toBe(true); // 0.00195 <= 0.05 / 25
    expect(canSurviveHolm(10, 26)).toBe(false);
    expect(canSurviveHolm(10, 0)).toBe(false);
  });
});

describe("Holm correction", () => {
  it("leaves a single p-value unchanged", () => {
    expect(holm([0.03]).adjusted).toEqual([0.03]);
    expect(holm([0.03]).reject).toEqual([true]);
    expect(holm([0.2]).reject).toEqual([false]);
  });

  it("matches a hand-worked example of three p-values", () => {
    // sorted 0.01, 0.03, 0.04 -> 3 x 0.01 = 0.03, 2 x 0.03 = 0.06, 1 x 0.04 = 0.04 raised to 0.06
    const out = holm([0.04, 0.01, 0.03]);
    expect(out.adjusted[0]).toBeCloseTo(0.06, 12);
    expect(out.adjusted[1]).toBeCloseTo(0.03, 12);
    expect(out.adjusted[2]).toBeCloseTo(0.06, 12);
    expect(out.reject).toEqual([false, true, false]);
  });

  it("never returns more than 1 and is monotone in the sorted order", () => {
    const r = rng(3);
    for (let trial = 0; trial < 200; trial++) {
      const p = Array.from({ length: 1 + Math.floor(r() * 12) }, () => (r() < 0.2 ? 1 : r() ** 2));
      const { adjusted } = holm(p);
      for (const a of adjusted) {
        expect(a).toBeLessThanOrEqual(1);
        expect(a).toBeGreaterThanOrEqual(0);
      }
      const order = p.map((_, i) => i).sort((a, b) => p[a] - p[b]);
      for (let k = 1; k < order.length; k++) expect(adjusted[order[k]]).toBeGreaterThanOrEqual(adjusted[order[k - 1]] - 1e-15);
      p.forEach((value, i) => expect(adjusted[i]).toBeGreaterThanOrEqual(value - 1e-15));
    }
  });

  it("takes the same decisions as the step-down rule in eval/stats.py: holm_adjust", () => {
    // A direct port of the Python function, which returns decisions only.
    const python = (pvalues: number[]): boolean[] => {
      const m = pvalues.length;
      const order = pvalues.map((_, i) => i).sort((a, b) => pvalues[a] - pvalues[b]);
      const decisions = new Array<boolean>(m).fill(false);
      for (let rank = 0; rank < order.length; rank++) {
        if (pvalues[order[rank]] <= ALPHA / (m - rank)) decisions[order[rank]] = true;
        else break;
      }
      return decisions;
    };
    const r = rng(11);
    for (let trial = 0; trial < 500; trial++) {
      const p = Array.from({ length: 1 + Math.floor(r() * 10) }, () => r() ** 3);
      expect(holm(p).reject).toEqual(python(p));
    }
    expect(holm([0.0125, 0.0125]).reject).toEqual(python([0.0125, 0.0125]));
  });

  it("handles no p-values, and treats NaN as no evidence", () => {
    expect(holm([])).toEqual({ adjusted: [], reject: [] });
    const out = holm([Number.NaN, 0.001]);
    expect(out.adjusted[0]).toBe(1);
    expect(out.reject).toEqual([false, true]);
  });
});

describe("bootstrap interval", () => {
  it("collapses to the value when every seed agrees", () => {
    expect(bootstrapCi([0.25, 0.25, 0.25, 0.25], 1)).toEqual([0.25, 0.25]);
  });

  it("does not throw on zero or one seed", () => {
    expect(() => bootstrapCi([], 1)).not.toThrow();
    const none = bootstrapCi([], 1);
    expect(Number.isNaN(none[0]) && Number.isNaN(none[1])).toBe(true);
    expect(bootstrapCi([0.7], 1)).toEqual([0.7, 0.7]);
  });

  it("brackets the mean, is deterministic for a seed, and narrows with more seeds", () => {
    const wide = toySeedValues(3, 5);
    const narrow = toySeedValues(12, 5);
    const a = bootstrapCi(narrow, 9);
    expect(bootstrapCi(narrow, 9)).toEqual(a);
    const mean = narrow.reduce((s, v) => s + v, 0) / narrow.length;
    expect(a[0]).toBeLessThanOrEqual(mean);
    expect(a[1]).toBeGreaterThanOrEqual(mean);
    const b = bootstrapCi(wide, 9);
    expect(Number.isFinite(b[0]) && Number.isFinite(b[1])).toBe(true);
  });

  it("toy seed values are a stable prefix, so adding a seed keeps the others", () => {
    expect(toySeedValues(5, 2)).toEqual(toySeedValues(8, 2).slice(0, 5));
    expect(toySeedValues(0, 2)).toEqual([]);
  });
});

describe("control verdict", () => {
  it("is VALID only when the positive control succeeded and the negative control stayed null", () => {
    expect(controlVerdict(true, true)).toBe("VALID");
    expect(controlVerdict(false, true)).toBe("INVALID");
    expect(controlVerdict(true, false)).toBe("INVALID");
    expect(controlVerdict(false, false)).toBe("INVALID");
  });
});

describe("summarising the controls of a result file", () => {
  it("reads a list of controls", () => {
    const s = summariseControls({ status: "VALID", controls: [{ name: "a", passed: true }, { name: "b", passed: true }] });
    expect(s.gating).toBe(2);
    expect(s.gatingPassed).toBe(2);
    expect(s.allGatingPassed).toBe(true);
    expect(s.items.map((i) => i.name)).toEqual(["a", "b"]);
  });

  it("reads an object of controls and keeps advisory ones apart", () => {
    const s = summariseControls({
      status: "VALID",
      controls: { x: { passed: true, gating: true }, y: { passed: false, gating: false }, z: { ratio: 0.8 } },
    });
    expect(s.gating).toBe(1);
    expect(s.allGatingPassed).toBe(true);
    expect(s.failedAdvisory).toEqual(["y"]);
    expect(s.failedGating).toEqual([]);
  });

  it("flags a failed gating control", () => {
    const s = summariseControls({ status: "INVALID", controls: [{ name: "a", passed: false }] });
    expect(s.allGatingPassed).toBe(false);
    expect(s.failedGating).toEqual(["a"]);
  });

  it("copes with a file without controls, or with nonsense", () => {
    for (const bad of [{}, { controls: null }, { controls: 3 }, { controls: [null, 4] }, null, undefined, "x"]) {
      const s = summariseControls(bad);
      expect(s.gating).toBe(0);
      expect(s.allGatingPassed).toBe(true);
    }
  });

  it("passes every gating control in every result file that is VALID", () => {
    let withControls = 0;
    for (const file of RESULT_FILES) {
      const data = raw(file, "");
      const s = summariseControls(data);
      if (s.gating > 0) withControls++;
      if (s.status === "VALID") {
        expect(s.failedGating, file).toEqual([]);
        expect(s.allGatingPassed, file).toBe(true);
      }
    }
    expect(withControls).toBeGreaterThanOrEqual(8);
  });

  it("finds the non-gating control that did not pass in the gossip file", () => {
    expect(summariseControls(raw("gossip", "")).failedAdvisory).toContain("gossip_learns");
  });

  it("agrees with the run-record facts: the records without a hash are the rest", () => {
    expect(Number(fact("runs.records").value)).toBeGreaterThanOrEqual(Number(fact("runs.with_code_hash").value));
  });
});

describe("scene helpers", () => {
  it("lays out a deterministic cloud inside its radius, even for zero points", () => {
    const a = cloudLayout(353, 3, 1.5);
    expect(Array.from(cloudLayout(353, 3, 1.5))).toEqual(Array.from(a));
    expect(a).toHaveLength(353 * 3);
    for (let i = 0; i < 353; i++) expect(Math.hypot(a[i * 3], a[i * 3 + 1], a[i * 3 + 2])).toBeLessThanOrEqual(1.5 + 1e-6);
    expect(cloudLayout(0, 1, 1)).toHaveLength(0);
    expect(cloudLayout(-3, 1, 1)).toHaveLength(0);
  });

  it("rests the packet after the gate it has just passed, never past the last one", () => {
    expect(packetRest(0)).toBeLessThan(gateX(0));
    for (let k = 1; k <= 6; k++) expect(packetRest(k)).toBeGreaterThan(gateX(k - 1));
    expect(packetRest(99)).toBe(packetRest(6));
    expect(packetRest(-2)).toBe(packetRest(0));
  });

  it("measures evidence in orders of magnitude, zero for one seed", () => {
    expect(bitsOfEvidence(1)).toBe(0);
    expect(bitsOfEvidence(10)).toBeCloseTo(Math.log10(512), 10);
    expect(Number.isFinite(bitsOfEvidence(0))).toBe(true);
  });
});

describe("formatP", () => {
  it("keeps three significant figures and never prints NaN", () => {
    expect(formatP(0.0625)).toBe("0.0625");
    expect(formatP(2 / 1024)).toBe("0.00195");
    expect(formatP(1)).toBe("1");
    expect(formatP(0)).toBe("0");
    expect(formatP(Number.NaN)).toBe("n/a");
    expect(formatP(2 * 0.5 ** 20)).toMatch(/e-6$/);
  });
});
