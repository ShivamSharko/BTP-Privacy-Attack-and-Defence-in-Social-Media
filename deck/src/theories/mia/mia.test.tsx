import { describe, expect, it } from "vitest";
import { fmt, m } from "../../data";
import { checkTheory } from "../../deck/checkTheory";
import { briefOf, longPanels, renderAllSlides } from "../../test/renderTheory";
import { theory } from "./index";

describe("theory 5: membership inference", () => {
  it("follows the deck rules", () => {
    expect(checkTheory(theory)).toEqual([]);
    expect(theory.id).toBe("mia");
    expect(theory.number).toBe(5);
    expect(theory.slides.length).toBeGreaterThanOrEqual(4);
  });

  it("renders every slide and shows the measured figures", () => {
    const text = renderAllSlides(theory);
    expect(text).toContain(fmt.n(m("membership", "results/levels/nondp/aggregate/auc/mean"), 3));
    expect(text).toContain(fmt.pct(m("membership", "results/levels/nondp/aggregate/tpr_at_1pct_fpr/mean"), 1));
    expect(text).toContain(fmt.n(m("membership", "results/levels/eps8/aggregate/auc/mean"), 3));
    expect(text).toContain(fmt.pct(m("membership", "results/levels/eps1/aggregate/tpr_at_1pct_fpr/mean"), 1));
    expect(text).toContain(fmt.pct(m("membership", "controls/positive_overfit/values/tpr_at_1pct_fpr"), 1));
    expect(text).toContain(fmt.n(m("membership", "controls/negative_independent/values/auc"), 4));
    expect(text).toContain(fmt.n(m("membership", "results/levels/nondp/aggregate/epsilon_lower_bound/mean"), 2));
    expect(text).toContain("src/prism/attacks/membership.py");
    expect(text).toContain("epsilon_lower_bound");
  });

  it("keeps every panel short enough to read from the back of a room", () => {
    expect(longPanels(theory)).toEqual([]);
  });

  it("has brief slides that show the result and the bound", () => {
    const brief = briefOf(theory);
    expect(brief.slides.map((s) => s.id)).toEqual(["mia/1", "mia/4"]);
    const text = renderAllSlides(brief);
    for (const k of ["nondp", "eps8", "eps1"]) {
      expect(text).toContain(fmt.n(m("membership", `results/levels/${k}/aggregate/auc/mean`), 3));
      expect(text).toContain(fmt.pct(m("membership", `results/levels/${k}/aggregate/tpr_at_1pct_fpr/mean`), 1));
    }
    expect(text).toContain(fmt.n(m("membership", "results/levels/eps8/aggregate/epsilon_lower_bound/mean"), 4));
    expect(text).toContain(fmt.n(m("membership", "results/levels/eps1/aggregate/epsilon_lower_bound/mean"), 3));
    expect(text).toContain("H3");
    expect(longPanels(brief, 130)).toEqual([]);
  });
});
