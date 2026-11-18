import { describe, expect, it } from "vitest";
import { m } from "../../data";
import { checkTheory } from "../../deck/checkTheory";
import { longPanels, renderAllSlides } from "../../test/renderTheory";
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
});
