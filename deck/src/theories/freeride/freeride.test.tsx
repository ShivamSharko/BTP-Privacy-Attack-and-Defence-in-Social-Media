import { describe, expect, it } from "vitest";
import { fmt, m } from "../../data";
import { checkTheory } from "../../deck/checkTheory";
import { briefOf, longPanels, renderAllSlides } from "../../test/renderTheory";
import { theory } from "./index";

describe("theory 9: free-riding", () => {
  it("follows the deck rules", () => {
    expect(checkTheory(theory)).toEqual([]);
    expect(theory.slides).toHaveLength(5);
  });

  it("renders every slide and shows the measured figures", () => {
    const text = renderAllSlides(theory);
    expect(text).toContain(fmt.ndcg(m("free_riding", "results/clean/ndcg/mean")));
    expect(text).toContain(fmt.pct(m("free_riding", "results/zero/0.1/cost_to_everyone/relative_ndcg_drop")));
    expect(text).toContain(fmt.pct(m("free_riding", "results/noise/0.3/cost_to_everyone/relative_ndcg_drop")));
    expect(text).toContain(fmt.n(m("free_riding", "results/noise/0.1/detection/norm_auc/mean")));
    expect(text).toContain(fmt.n(m("free_riding", "results/zero/0.1/detection/cosine_auc/mean")));
    expect(text).toContain("src/prism/attacks/free_riding.py");
  });

  it("reports the noise readout as the flags say, not as the hypothesis said", () => {
    const text = renderAllSlides(theory);
    expect(text).toMatch(/evade the norm score\?\s*no:/);
    expect(text).toMatch(/caught by the cosine score\?\s*no:/);
  });

  it("keeps every panel short enough to read from the back of a room", () => {
    expect(longPanels(theory)).toEqual([]);
  });

  it("has one brief slide that introduces free-riding and gives the result", () => {
    const brief = briefOf(theory);
    expect(brief.slides.map((s) => s.id)).toEqual(["freeride/3"]);
    const text = renderAllSlides(brief);
    expect(text).toContain(fmt.pct(m("free_riding", "results/zero/0.3/cost_to_everyone/relative_ndcg_drop")));
    expect(text).toContain(fmt.pct(m("free_riding", "results/noise/0.3/cost_to_everyone/relative_ndcg_drop")));
    expect(text).toContain(fmt.ndcg(m("free_riding", "results/clean/ndcg/mean")));
    expect(text).toContain(fmt.n(m("free_riding", "results/noise/0.1/detection/norm_auc/mean")));
    expect(longPanels(brief, 130)).toEqual([]);
  });
});
