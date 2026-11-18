import { describe, expect, it } from "vitest";
import { RESULT_FILES, code, fact, fmt, grid, m, raw } from "./index";

describe("data access", () => {
  it("has every result file", () => {
    for (const file of RESULT_FILES) expect(() => raw(file, "")).not.toThrow();
  });

  it("reads a measured number by path", () => {
    const retention = m("privacy_utility", "summary/large/h1/retention");
    expect(retention).toBeGreaterThan(0.7);
    expect(retention).toBeLessThan(0.85);
  });

  it("reads keys that contain dots", () => {
    expect(m("poisoning", "results/secure_sum_norm_bound/0.1/exposure/mean")).toBeGreaterThan(0.9);
  });

  it("throws on a missing key instead of returning undefined", () => {
    expect(() => m("privacy_utility", "summary/large/h1/retentionn")).toThrow(/has no/);
    expect(() => raw("privacy_utility", "summary/nowhere/else")).toThrow(/has no/);
  });

  it("throws when a measured value is not a number", () => {
    expect(() => m("privacy_utility", "status")).toThrow(/not a finite number/);
    expect(() => m("privacy_utility", "summary")).toThrow(/not a finite number/);
  });

  it("serves code with real line numbers", () => {
    const entry = code("models/hybrid.py::user_loss");
    expect(entry.file).toBe("src/prism/models/hybrid.py");
    expect(entry.source.startsWith("def user_loss")).toBe(true);
    expect(entry.end).toBeGreaterThan(entry.start);
    expect(() => code("models/hybrid.py::nope")).toThrow(/No code entry/);
  });

  it("serves facts with their source and throws on unknown ids", () => {
    expect(Number(fact("runs.records").value)).toBeGreaterThan(300);
    expect(fact("speed.before_s").source).toMatch(/ADR-045/);
    expect(() => fact("made.up")).toThrow(/No fact/);
  });

  it("serves the accounting grid in the declared shape", () => {
    expect(grid.epsilon.length).toBe(grid.rates.length);
    expect(grid.epsilon[0].length).toBe(grid.rounds.length);
    expect(grid.epsilon[0][0].length).toBe(grid.noise.length);
  });

  it("formats numbers for slides", () => {
    expect(fmt.pct(0.946)).toBe("94.6%");
    expect(fmt.ndcg(0.02841)).toBe("0.0284");
    expect(fmt.int(9913)).toBe("9,913");
    expect(fmt.n(0.7782)).toBe("0.778");
  });
});
