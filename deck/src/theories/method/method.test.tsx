import { describe, expect, it } from "vitest";
import { fact, hasFact, m } from "../../data";
import { checkTheory } from "../../deck/checkTheory";
import { briefOf, longPanels, renderAllSlides } from "../../test/renderTheory";
import { hypothesisOutcomes, provenance, seedCounts } from "./evidence";
import { theory } from "./index";
import { formatP, minSignTestP } from "./sim";

describe("theory 13: how we know", () => {
  it("follows the deck rules", () => {
    expect(checkTheory(theory)).toEqual([]);
    expect(theory.slides.length).toBeGreaterThanOrEqual(4);
  });

  it("renders every slide and shows the provenance figures", () => {
    const text = renderAllSlides(theory);
    expect(text).toContain(String(fact("runs.records").value));
    expect(text).toContain(String(fact("runs.with_code_hash").value));
    expect(text).toContain(String(fact("runs.engine_hash").value).slice(0, 8));
    expect(text).toContain(String(fact("tests.count").value));
    expect(text).toContain("VALID");
    expect(text).toContain("src/prism/experiments/runner.py");
    expect(text).toContain(m("membership", "controls/positive_overfit/values/auc").toFixed(3));
    expect(text).toContain(formatP(minSignTestP(5)));
  });

  it("shows coverage only when the facts exist", () => {
    const text = renderAllSlides(theory);
    expect(text.includes("coverage, overall")).toBe(hasFact("coverage.overall"));
  });

  it("has every result file with a status VALID and every record count consistent", () => {
    const p = provenance();
    expect(p.valid).toBe(p.files.length);
    expect(p.records).toBeGreaterThanOrEqual(p.hashed);
    expect(p.withSameHash).toBeGreaterThan(0);
  });

  it("keeps every panel short enough to read from the back of a room", () => {
    expect(longPanels(theory)).toEqual([]);
  });

  it("has a brief slide that carries the controls, the seeds and the provenance", () => {
    const brief = briefOf(theory);
    expect(brief.slides.length).toBe(1);
    const text = renderAllSlides(brief);
    const p = provenance();
    expect(text).toContain(`${p.valid} / ${p.files.length}`);
    expect(text).toContain(`${p.withSameHash} / ${p.files.length}`);
    expect(text).toContain(String(p.records));
    expect(text).toContain(String(p.tests));
    expect(text).toContain(String(fact("runs.engine_hash").value).slice(0, 8));
    expect(text).toContain(m("membership", "controls/positive_overfit/values/auc").toFixed(3));
    expect(text).toContain(m("membership", "controls/negative_independent/values/auc").toFixed(3));
    expect(text).toContain(String(seedCounts().main));
    expect(text).toContain(hypothesisOutcomes().failed.join(" and "));
    expect(text).toContain("INVALID");
    expect(longPanels(brief, 130)).toEqual([]);
  });
});
