import { describe, expect, it } from "vitest";
import { fmt, m } from "../../data";
import { checkTheory } from "../../deck/checkTheory";
import { briefOf, longPanels, renderAllSlides } from "../../test/renderTheory";
import { theory } from "./index";

describe("theory 4: defence, secure sum", () => {
  it("follows the deck rules", () => {
    expect(checkTheory(theory)).toEqual([]);
    expect(theory.slides.length).toBeGreaterThanOrEqual(5);
  });

  it("renders every slide and shows the measured ladder", () => {
    const text = renderAllSlides(theory);
    for (const rung of ["masked", "sum_10", "sum_100", "sum_100_dp"]) {
      expect(text).toContain(fmt.n(m("update_leakage", `results/${rung}/recovery/auc/mean`), 3));
    }
    const limit = m("update_leakage", "results/sum_100/recovery/prior_auc/mean") + 0.05;
    expect(text).toContain(fmt.n(limit, 3));
    expect(text).toContain("not met");
    expect(text).toContain("src/prism/fl/secagg.py");
    expect(text).toContain("simulation");
  });

  it("keeps every panel short enough to read from the back of a room", () => {
    expect(longPanels(theory)).toEqual([]);
  });

  it("has brief slides that carry the ladder and the secure sum", () => {
    const brief = briefOf(theory);
    expect(brief.slides.map((s) => s.id)).toEqual(["secagg/1", "secagg/5"]);
    const text = renderAllSlides(brief);
    for (const rung of ["masked", "sum_10", "sum_100", "sum_100_dp"]) {
      expect(text).toContain(fmt.n(m("update_leakage", `results/${rung}/recovery/auc/mean`), 3));
    }
    expect(text).toContain(fmt.n(m("update_leakage", "results/sum_100/recovery/prior_auc/mean") + 0.05, 3));
    expect(text).toContain(fmt.n(m("update_leakage", "results/masked/link/auc"), 3));
    expect(text).toContain("not met");
    expect(text).toContain("simulation");
    expect(longPanels(brief, 130)).toEqual([]);
  });
});
