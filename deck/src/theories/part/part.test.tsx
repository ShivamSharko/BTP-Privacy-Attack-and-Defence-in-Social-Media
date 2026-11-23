import { describe, expect, it } from "vitest";
import { m } from "../../data";
import { checkTheory } from "../../deck/checkTheory";
import { briefOf, longPanels, renderAllSlides } from "../../test/renderTheory";
import { fmt } from "../../data";
import { theory } from "./index";

describe("theory 11: who actually takes part", () => {
  it("follows the deck rules", () => {
    expect(checkTheory(theory)).toEqual([]);
    expect(theory.slides.length).toBeGreaterThanOrEqual(4);
  });

  it("renders every slide and shows the measured figures", () => {
    const text = renderAllSlides(theory);
    expect(text).toContain(fmt.ndcg(m("participation", "results/trace_readout/overall_ndcg10/8/always")));
    expect(text).toContain(fmt.ndcg(m("participation", "results/trace_readout/overall_ndcg10/nondp/trace_replay")));
    expect(text).toContain("weakly supported");
    expect(text).toContain("nominal");
    expect(text).toContain("src/prism/data/traces.py");
    expect(text).toContain("find_class");
    expect(text).not.toContain("NaN");
  });

  it("keeps every panel short enough to read from the back of a room", () => {
    expect(longPanels(theory)).toEqual([]);
  });

  it("has one brief slide that introduces availability and gives the results", () => {
    const brief = briefOf(theory);
    expect(brief.slides.map((s) => s.id)).toEqual(["part/3"]);
    const text = renderAllSlides(brief);
    for (const level of ["8", "nondp"])
      for (const s of ["always", "trace", "trace_replay"])
        expect(text).toContain(fmt.ndcg(m("participation", `results/cells/${s}/${level}/overall_ndcg10/mean`)));
    const gaps = ["8", "nondp"].flatMap((l) =>
      ["always", "independent", "activity", "social", "trace", "trace_activity", "trace_replay"].map((s) =>
        m("participation", `results/cells/${s}/${l}/activity_gap/mean`),
      ),
    );
    expect(text).toContain(fmt.ndcg(Math.min(...gaps)));
    expect(text).toContain(fmt.ndcg(Math.max(...gaps)));
    expect(text).toContain(`${m("participation", "results/h5/social/8/seeds_improved")} of ${m("participation", "results/h5/social/8/seeds")}`);
    expect(text).toContain("weakly supported");
    expect(text).not.toContain("NaN");
    expect(longPanels(brief, 130)).toEqual([]);
  });
});
