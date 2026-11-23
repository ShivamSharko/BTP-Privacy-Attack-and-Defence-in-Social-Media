import { describe, expect, it } from "vitest";
import { fmt, m } from "../../data";
import { checkTheory } from "../../deck/checkTheory";
import { briefOf, longPanels, renderAllSlides } from "../../test/renderTheory";
import { theory } from "./index";

describe("theory 6: user-level differential privacy", () => {
  it("follows the deck rules", () => {
    expect(checkTheory(theory)).toEqual([]);
    expect(theory.slides.length).toBeGreaterThanOrEqual(6);
    expect(theory.short.length).toBeLessThanOrEqual(14);
  });

  it("renders every slide and shows the measured figures", () => {
    const text = renderAllSlides(theory);
    const level = (regime: string, key: string, field: string) => m("privacy_utility", `summary/${regime}/levels/${key}/${field}`);
    expect(text).toContain(fmt.n(m("privacy_utility", "summary/large/h1/retention")));
    expect(text).toContain(fmt.n(m("privacy_utility", "summary/small/h1/retention")));
    expect(text).toContain(fmt.ndcg(level("large", "eps8", "ndcg@10_mean")));
    expect(text).toContain(fmt.ndcg(level("large", "nondp", "ndcg@10_mean")));
    expect(text).toContain(fmt.n(level("large", "whatif-x10", "retention")));
    expect(text).toContain(fmt.n(m("sensitivity", "results/k20/large/epsilons/8/retention")));
    expect(text).toContain(fmt.n(m("sensitivity", "results/stars4/small/epsilons/8/retention")));
    expect(text).toContain("not supported");
    expect(text).toContain("src/prism/privacy/dp.py");
    expect(text).toContain("noisy_mean");
    expect(text).toContain("update_norms");
  });

  it("keeps every panel short enough to read from the back of a room", () => {
    expect(longPanels(theory)).toEqual([]);
  });

  it("shows the brief slides with their figures", () => {
    const brief = briefOf(theory);
    expect(brief.slides.map((s) => s.id)).toEqual(["dp/1", "dp/3", "dp/5", "dp/6"]);
    const text = renderAllSlides(brief);
    const pu = (path: string) => m("privacy_utility", path);
    expect(text).toContain(fmt.n(pu("summary/large/h1/retention")));
    expect(text).toContain(fmt.n(pu("summary/small/h1/retention")));
    expect(text).toContain(fmt.n(pu("summary/large/h1/threshold"), 2));
    expect(text).toContain(fmt.ndcg(pu("summary/large/levels/nondp/ndcg@10_mean")));
    expect(text).toContain(fmt.n(pu("summary/large/levels/cliponly/retention")));
    expect(text).toContain(fmt.n(pu("summary/large/levels/whatif-x10/retention")));
    expect(text).toContain(fmt.n(pu("summary/small/levels/whatif-x10/retention")));
    expect(text).toContain("H1 is not supported");
    expect(text).toContain("large cohort");
    expect(text).toContain("small cohort");
    expect(text).toContain(fmt.n(m("sensitivity", "results/k20/large/epsilons/8/retention"), 2));
  });

  it("keeps every brief panel within 130 words", () => {
    expect(longPanels(briefOf(theory), 130)).toEqual([]);
  });
});
