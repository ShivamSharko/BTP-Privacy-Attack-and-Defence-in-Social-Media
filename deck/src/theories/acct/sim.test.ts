import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { grid, m, raw } from "../../data";
import {
  bisectTrace,
  CALIBRATION_HIGH,
  CALIBRATION_LOW,
  CALIBRATION_TOLERANCE,
  contour,
  epsilonAt,
  gate,
  GATE_ABSOLUTE,
  GATE_RELATIVE,
  gridRange,
  heightOf,
  movedNeedles,
  refine,
  RDP_SLACK,
  surfacePoint,
} from "./sim";

const SMALL = grid.rates.indexOf(m("privacy_utility", "frozen/regimes/small/sample_rate"));
const LARGE = grid.rates.indexOf(m("privacy_utility", "frozen/regimes/large/sample_rate"));

describe("interpolating the accounting grid", () => {
  it("returns the stored value at every node", () => {
    for (let r = 0; r < grid.rates.length; r++)
      for (let t = 0; t < grid.rounds.length; t++)
        for (let z = 0; z < grid.noise.length; z++) {
          expect(epsilonAt(grid, r, grid.noise[z], grid.rounds[t])).toBeCloseTo(grid.epsilon[r][t][z] as number, 9);
        }
  });

  it("falls as noise grows and rises with rounds, along the grid", () => {
    for (let r = 0; r < grid.rates.length; r++) {
      for (let t = 0; t < grid.rounds.length; t++)
        for (let z = 1; z < grid.noise.length; z++)
          expect(grid.epsilon[r][t][z] as number).toBeLessThan(grid.epsilon[r][t][z - 1] as number);
      for (let z = 0; z < grid.noise.length; z++)
        for (let t = 1; t < grid.rounds.length; t++)
          expect(grid.epsilon[r][t][z] as number).toBeGreaterThan(grid.epsilon[r][t - 1][z] as number);
    }
    // and the same between nodes
    expect(epsilonAt(grid, SMALL, 1.1, 100)).toBeLessThan(epsilonAt(grid, SMALL, 0.9, 100));
    expect(epsilonAt(grid, SMALL, 1.1, 100)).toBeLessThan(epsilonAt(grid, SMALL, 1.1, 200));
  });

  it("stays between its neighbours inside a cell", () => {
    const a = grid.epsilon[SMALL][2][3] as number;
    const b = grid.epsilon[SMALL][2][4] as number;
    const mid = epsilonAt(grid, SMALL, Math.sqrt(grid.noise[3] * grid.noise[4]), grid.rounds[2]);
    expect(mid).toBeLessThan(a);
    expect(mid).toBeGreaterThan(b);
  });

  it("clamps outside the grid and never returns NaN", () => {
    const corner = epsilonAt(grid, SMALL, grid.noise[0], grid.rounds[0]);
    expect(epsilonAt(grid, SMALL, 1e-9, 1e-9)).toBeCloseTo(corner, 9);
    const far = epsilonAt(grid, SMALL, 1e9, 1e9);
    expect(far).toBeCloseTo(grid.epsilon[SMALL][grid.rounds.length - 1][grid.noise.length - 1] as number, 9);
    for (const v of [epsilonAt(grid, SMALL, 0, 0), epsilonAt(grid, SMALL, -3, -3), epsilonAt(grid, 99, 1, 100), epsilonAt(grid, -4, 1, 100)])
      expect(Number.isFinite(v)).toBe(true);
    expect(Number.isFinite(epsilonAt(grid, SMALL, Number.NaN, Number.NaN))).toBe(true);
  });

  it("skips null cells instead of poisoning the cell", () => {
    const holey = { ...grid, epsilon: grid.epsilon.map((a) => a.map((b) => b.slice())) };
    holey.epsilon[0][1][2] = null;
    const v = epsilonAt(holey, 0, (grid.noise[2] + grid.noise[3]) / 2, (grid.rounds[1] + grid.rounds[2]) / 2);
    expect(Number.isFinite(v)).toBe(true);
    const atHole = epsilonAt(holey, 0, grid.noise[2], grid.rounds[1]);
    expect(Number.isFinite(atHole)).toBe(true);
    expect(atHole).toBeLessThan(grid.epsilon[0][1][1] as number);
    expect(atHole).toBeGreaterThan(grid.epsilon[0][1][3] as number);
  });
});

describe("axis refinement", () => {
  it("keeps every grid node at a multiple of the subdivision", () => {
    const r = refine(grid.noise, 4);
    expect(r).toHaveLength((grid.noise.length - 1) * 4 + 1);
    grid.noise.forEach((v, k) => expect(r[k * 4]).toBeCloseTo(v, 9));
    for (let i = 1; i < r.length; i++) expect(r[i]).toBeGreaterThan(r[i - 1]);
  });
});

describe("the surface height", () => {
  const range = gridRange(grid);
  it("is monotone in epsilon and bounded", () => {
    expect(heightOf(range.lo, range, 4)).toBeCloseTo(0, 9);
    expect(heightOf(range.hi, range, 4)).toBeCloseTo(4, 9);
    expect(heightOf(1, range, 4)).toBeLessThan(heightOf(8, range, 4));
    expect(heightOf(1e12, range, 4)).toBe(4);
    expect(heightOf(Number.NaN, range, 4)).toBe(4);
    expect(heightOf(-1, range, 4)).toBe(0);
  });
  it("places a point inside the box and finite", () => {
    const p = surfacePoint(grid, SMALL, 0.92, 400, range);
    for (const c of [p.x, p.y, p.z]) expect(Number.isFinite(c)).toBe(true);
  });
});

describe("the epsilon = 8 contour", () => {
  it("passes near noise 0.92 at 400 rounds for rate 0.05", () => {
    const line = contour(grid, SMALL, 8);
    const end = line.reduce((best, p) => (Math.abs(p.rounds - 400) < Math.abs(best.rounds - 400) ? p : best));
    expect(Math.abs(end.rounds - 400)).toBeLessThan(1);
    expect(end.noise).toBeGreaterThan(0.85);
    expect(end.noise).toBeLessThan(1.0);
  });
  it("is the level set of the interpolated surface", () => {
    for (const rate of [SMALL, LARGE])
      for (const p of contour(grid, rate, 8)) expect(epsilonAt(grid, rate, p.noise, p.rounds)).toBeCloseTo(8, 2);
  });
  it("needs more noise for more rounds", () => {
    const line = contour(grid, SMALL, 8);
    expect(line.length).toBeGreaterThan(10);
    for (let i = 1; i < line.length; i++) expect(line[i].noise).toBeGreaterThanOrEqual(line[i - 1].noise);
  });
  it("is empty when the target is outside the grid", () => {
    expect(contour(grid, SMALL, 1e6)).toEqual([]);
    expect(contour(grid, SMALL, 1e-6)).toEqual([]);
  });
});

describe("the agreement gate", () => {
  it("passes identical values, and a looser RDP", () => {
    expect(gate(8, 8, 8).ok).toBe(true);
    expect(gate(7.98, 7.92, 9.1).ok).toBe(true);
  });
  it("fails when PRV and PLD disagree by a lot", () => {
    const g = gate(8, 10, 12);
    expect(g.ok).toBe(false);
    expect(g.reason).toBe("prv-pld");
  });
  it("uses the larger of a relative and an absolute tolerance", () => {
    expect(gate(8, 8 * (1 + GATE_RELATIVE * 0.99), 9).ok).toBe(true);
    expect(gate(8, 8 * (1 + GATE_RELATIVE * 1.2), 9).ok).toBe(false);
    // near zero the absolute floor wins
    expect(gate(0.1, 0.1 + GATE_ABSOLUTE * 0.9, 1).ok).toBe(true);
    expect(gate(0.1, 0.1 + GATE_ABSOLUTE * 1.2, 1).ok).toBe(false);
  });
  it("fails when RDP undercuts the tighter accountants, and on non-finite input", () => {
    expect(gate(8, 8, 8 - RDP_SLACK * 2).reason).toBe("rdp");
    expect(gate(8, 8, 8 - RDP_SLACK * 0.5).ok).toBe(true);
    expect(gate(Number.NaN, 8, 8).reason).toBe("non-finite");
    expect(gate(8, Number.POSITIVE_INFINITY, 8).ok).toBe(false);
    expect(gate(-1, 8, 8).ok).toBe(false);
  });
  it("uses the same constants as privacy/accounting.py", () => {
    const text = readFileSync(join(process.cwd(), "..", "src", "prism", "privacy", "accounting.py"), "utf8");
    expect(text).toContain(`GATE_RELATIVE: float = ${GATE_RELATIVE}`);
    expect(text).toContain(`GATE_ABSOLUTE: float = ${GATE_ABSOLUTE}`);
    expect(text).toContain(`RDP_SLACK: float = ${RDP_SLACK}`);
  });
});

describe("noise calibration by search", () => {
  it("uses the search range and tolerance of accounting.py", () => {
    const text = readFileSync(join(process.cwd(), "..", "src", "prism", "privacy", "accounting.py"), "utf8");
    expect(text).toContain(`CALIBRATION_LOW: float = ${CALIBRATION_LOW}`);
    expect(text).toContain(`CALIBRATION_HIGH: float = ${CALIBRATION_HIGH}.0`);
    expect(text).toContain(`tolerance: float = ${CALIBRATION_TOLERANCE}`);
  });
  const f = (z: number) => epsilonAt(grid, SMALL, z, 400);
  it("lands next to the project's calibrated value", () => {
    const trace = bisectTrace(f, grid.noise[0], grid.noise[grid.noise.length - 1], 8, 0.01);
    expect(trace.reachable).toBe(true);
    const last = trace.steps[trace.steps.length - 1];
    const calibrated = raw<Record<string, number>>("calibration", "")[`v1-max-prv-pld|q=0.05|T=400|n=${grid.users}|eps=8.0`];
    expect(Math.abs(last.hi - calibrated) / calibrated).toBeLessThan(0.03);
    expect(f(last.hi)).toBeLessThanOrEqual(8);
    expect(last.hi / last.lo).toBeLessThan(1.0026);
  });
  it("shrinks the bracket every step, and reports an unreachable target", () => {
    const trace = bisectTrace(f, 0.5, 12, 8, 0.01);
    for (let i = 1; i < trace.steps.length; i++) expect(trace.steps[i].hi / trace.steps[i].lo).toBeLessThan(trace.steps[i - 1].hi / trace.steps[i - 1].lo);
    expect(bisectTrace(f, 0.5, 12, 1e-6, 0.01).reachable).toBe(false);
    expect(bisectTrace(f, 0.5, 12, 1e-6, 0.01).steps).toEqual([]);
  });
});

describe("moving a needle", () => {
  const base = { prv: 8, pld: 7.9, rdp: 9 };
  it("moves only the chosen accountant and never below zero", () => {
    expect(movedNeedles(base, "pld", 0.1)).toEqual({ prv: 8, pld: 7.9 * 1.1, rdp: 9 });
    expect(movedNeedles(base, "rdp", -5).rdp).toBe(0);
    expect(movedNeedles(base, "prv", Number.NaN)).toEqual(base);
  });
  it("closes the gate once the move passes the tolerance", () => {
    const at = (shift: number) => movedNeedles(base, "pld", shift);
    const ok = at(0.02);
    expect(gate(ok.prv, ok.pld, ok.rdp).ok).toBe(true);
    const bad = at(0.15);
    expect(gate(bad.prv, bad.pld, bad.rdp).ok).toBe(false);
  });
});
