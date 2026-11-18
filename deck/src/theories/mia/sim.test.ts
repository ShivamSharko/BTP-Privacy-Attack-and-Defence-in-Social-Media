import { describe, expect, it } from "vitest";
import {
  aucFromSeparation,
  DIFFICULTY_SD,
  epsilonPoint,
  GAP_MAX,
  gapForControl,
  gapForPrivacy,
  makePopulation,
  normalCdf,
  normalInv,
  normalPdf,
  populationLoss,
  rates,
  rocCurve,
  sigmaFor,
  thresholdForFpr,
  tprAtFpr,
} from "./sim";

const thresholds = Array.from({ length: 81 }, (_, i) => -8 + i * 0.2);

describe("normal distribution helpers", () => {
  it("has the right values at known points", () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 6);
    expect(normalCdf(1.96)).toBeCloseTo(0.975, 4);
    expect(normalCdf(-2.326)).toBeCloseTo(0.01, 4);
    expect(normalInv(0.5)).toBeCloseTo(0, 6);
    expect(normalInv(0.975)).toBeCloseTo(1.96, 3);
    expect(normalPdf(0, 0, 1)).toBeCloseTo(0.39894, 4);
  });

  it("stays finite at the extremes", () => {
    for (const x of [-1e9, -50, 50, 1e9, Infinity, -Infinity]) {
      const p = normalCdf(x);
      expect(Number.isFinite(p)).toBe(true);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    }
    expect(Number.isFinite(normalInv(0))).toBe(true);
    expect(Number.isFinite(normalInv(1))).toBe(true);
    expect(Number.isFinite(normalPdf(5, 0, 0))).toBe(true);
  });
});

describe("the loss-threshold attack", () => {
  it("with no separation, catches exactly as many as it wrongly accuses", () => {
    for (const t of thresholds) {
      const { tpr, fpr } = rates(t, 0);
      expect(tpr).toBe(fpr);
    }
    expect(aucFromSeparation(0)).toBeCloseTo(0.5, 12);
  });

  it("raises both rates when the threshold rises, and keeps them in [0, 1]", () => {
    for (const gap of [0, 0.5, 2, 6]) {
      let last = { tpr: 0, fpr: 0 };
      for (const t of thresholds) {
        const r = rates(t, gap, 1.5);
        expect(r.tpr).toBeGreaterThanOrEqual(last.tpr);
        expect(r.fpr).toBeGreaterThanOrEqual(last.fpr);
        for (const v of [r.tpr, r.fpr]) {
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(1);
        }
        last = r;
      }
    }
  });

  it("flags nobody at a very low threshold and everybody at a very high one", () => {
    expect(rates(-60, 2)).toEqual({ tpr: 0, fpr: 0 });
    expect(rates(60, 2)).toEqual({ tpr: 1, fpr: 1 });
    expect(rates(-Infinity, 2)).toEqual({ tpr: 0, fpr: 0 });
    expect(rates(Infinity, 2)).toEqual({ tpr: 1, fpr: 1 });
  });

  it("catches more members than non-members whenever members have lower loss", () => {
    for (const t of [-1, 0, 1]) {
      const r = rates(t, 2);
      expect(r.tpr).toBeGreaterThan(r.fpr);
    }
  });

  it("gives a larger AUC and a larger TPR at 1% FPR for a larger separation", () => {
    const seps = [0, 0.25, 0.5, 1, 2, 4];
    for (let i = 1; i < seps.length; i++) {
      expect(aucFromSeparation(seps[i])).toBeGreaterThan(aucFromSeparation(seps[i - 1]));
      expect(tprAtFpr(0.01, seps[i])).toBeGreaterThan(tprAtFpr(0.01, seps[i - 1]));
    }
    expect(tprAtFpr(0.01, 0)).toBeCloseTo(0.01, 4);
  });

  it("finds the threshold that gives the requested false-positive rate", () => {
    for (const gap of [0, 1, 3]) {
      const t = thresholdForFpr(0.01, gap, 1.5);
      const r = rates(t, gap, 1.5);
      expect(r.fpr).toBeCloseTo(0.01, 4);
      expect(r.tpr).toBeCloseTo(tprAtFpr(0.01, gap / 1.5), 4);
    }
  });

  it("handles zero, huge and degenerate inputs without NaN", () => {
    for (const gap of [0, 1e-12, 1e6]) {
      for (const sigma of [0, 1, 1e-9]) {
        const r = rates(0.3, gap, sigma);
        expect(Number.isNaN(r.tpr)).toBe(false);
        expect(Number.isNaN(r.fpr)).toBe(false);
      }
      expect(Number.isNaN(aucFromSeparation(gap))).toBe(false);
      expect(Number.isNaN(tprAtFpr(0.01, gap))).toBe(false);
      expect(Number.isNaN(thresholdForFpr(0.01, gap, 1))).toBe(false);
    }
    expect(aucFromSeparation(1e6)).toBe(1);
    expect(tprAtFpr(0, 2)).toBe(0);
    expect(tprAtFpr(1, 2)).toBe(1);
  });
});

describe("ROC curve", () => {
  it("runs from (0, 0) to (1, 1) and never falls", () => {
    for (const sep of [0, 1, 3, 1e6]) {
      const curve = rocCurve(sep);
      expect(curve[0]).toEqual({ fpr: 0, tpr: 0 });
      expect(curve[curve.length - 1]).toEqual({ fpr: 1, tpr: 1 });
      for (let i = 1; i < curve.length; i++) {
        expect(curve[i].fpr).toBeGreaterThanOrEqual(curve[i - 1].fpr);
        expect(curve[i].tpr).toBeGreaterThanOrEqual(curve[i - 1].tpr);
        expect(Number.isNaN(curve[i].tpr)).toBe(false);
      }
    }
  });

  it("lies on the diagonal for no separation and above it otherwise", () => {
    for (const p of rocCurve(0)) expect(p.tpr).toBeCloseTo(p.fpr, 9);
    for (const p of rocCurve(1.5).slice(1, -1)) expect(p.tpr).toBeGreaterThan(p.fpr);
  });
});

describe("privacy level and calibration", () => {
  it("shrinks the gap as privacy rises, to nothing at the top", () => {
    expect(gapForPrivacy(0)).toBe(GAP_MAX);
    expect(gapForPrivacy(1)).toBe(0);
    expect(gapForPrivacy(0.5)).toBeLessThan(gapForPrivacy(0.25));
    expect(gapForPrivacy(-3)).toBe(GAP_MAX);
    expect(gapForPrivacy(7)).toBe(0);
  });

  it("narrows the ridges when the per-user difficulty is taken out", () => {
    expect(sigmaFor(0)).toBe(1);
    expect(sigmaFor(1)).toBeCloseTo(Math.sqrt(1 + DIFFICULTY_SD * DIFFICULTY_SD), 12);
    expect(sigmaFor(1)).toBeGreaterThan(sigmaFor(0.5));
    // calibrating therefore raises the separation, the AUC and the TPR at 1% FPR
    expect(GAP_MAX / sigmaFor(0)).toBeGreaterThan(GAP_MAX / sigmaFor(1));
    expect(tprAtFpr(0.01, GAP_MAX / sigmaFor(0))).toBeGreaterThan(tprAtFpr(0.01, GAP_MAX / sigmaFor(1)));
  });
});

describe("the user population", () => {
  it("is deterministic for a seed and different for another", () => {
    const a = makePopulation(40, 7);
    const b = makePopulation(40, 7);
    const c = makePopulation(40, 8);
    expect(Array.from(a.noise)).toEqual(Array.from(b.noise));
    expect(Array.from(a.noise)).not.toEqual(Array.from(c.noise));
    expect(a.count).toBe(80);
  });

  it("puts members below non-members on average, and difficulty widens the spread", () => {
    const pop = makePopulation(400, 3);
    const mean = (from: number, to: number, mix: number) => {
      let s = 0;
      for (let i = from; i < to; i++) s += populationLoss(pop, i, 2, mix);
      return s / (to - from);
    };
    expect(mean(0, 400, 0)).toBeLessThan(mean(400, 800, 0));
    const spread = (mix: number) => {
      const xs = Array.from({ length: 400 }, (_, i) => populationLoss(pop, i, 2, mix) + 1);
      const mu = xs.reduce((s, x) => s + x, 0) / xs.length;
      return Math.sqrt(xs.reduce((s, x) => s + (x - mu) ** 2, 0) / xs.length);
    };
    expect(spread(1)).toBeGreaterThan(spread(0));
  });

  it("never produces NaN, even with no gap", () => {
    const pop = makePopulation(20, 1);
    for (let i = 0; i < pop.count; i++) {
      expect(Number.isFinite(populationLoss(pop, i, 0, 0))).toBe(true);
      expect(Number.isFinite(populationLoss(pop, i, 0, 1))).toBe(true);
    }
  });
});

describe("the controls and the epsilon bound", () => {
  it("makes the over-fitted model easier to attack and the independent data impossible", () => {
    for (const privacy of [0, 0.5, 1]) {
      expect(gapForControl("overfit", privacy)).toBeGreaterThan(GAP_MAX);
      expect(gapForControl("independent", privacy)).toBe(0);
      expect(gapForControl("released", privacy)).toBe(gapForPrivacy(privacy));
    }
  });

  it("gives no bound when the attack does no better than chance", () => {
    expect(epsilonPoint(0.01, 0.01)).toBe(0);
    expect(epsilonPoint(0.005, 0.01)).toBe(0);
    expect(epsilonPoint(0, 0)).toBe(0);
    expect(epsilonPoint(0.5, 0)).toBe(0);
  });

  it("grows with how much better than chance the attack does", () => {
    expect(epsilonPoint(0.25, 0.01)).toBeCloseTo(Math.log(25), 12);
    expect(epsilonPoint(0.5, 0.01)).toBeGreaterThan(epsilonPoint(0.25, 0.01));
    const weak = epsilonPoint(tprAtFpr(0.01, 0.5), 0.01);
    const strong = epsilonPoint(tprAtFpr(0.01, 2), 0.01);
    expect(strong).toBeGreaterThan(weak);
    expect(Number.isFinite(epsilonPoint(1, 1e-300))).toBe(true);
  });
});
