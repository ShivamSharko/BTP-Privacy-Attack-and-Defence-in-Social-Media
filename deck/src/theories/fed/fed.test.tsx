import { describe, expect, it } from "vitest";
import { fact, fmt, m } from "../../data";
import { checkTheory } from "../../deck/checkTheory";
import { briefOf, longPanels, renderAllSlides } from "../../test/renderTheory";
import { theory } from "./index";

describe("theory 2: a federated round", () => {
  it("follows the deck rules", () => {
    expect(checkTheory(theory)).toEqual([]);
    expect(theory.slides).toHaveLength(4);
  });

  it("renders every slide and shows the measured figures", () => {
    const text = renderAllSlides(theory);
    expect(text).toContain(m("flower_parity", "results/gaussian/final/max_abs_diff").toExponential(2));
    expect(text).toContain(String(fact("speed.before_s").value));
    expect(text).toContain("src/prism/fl/sampling.py");
  });

  it("renders the brief slide with both regimes", () => {
    const brief = briefOf(theory);
    expect(brief.slides).toHaveLength(1);
    const text = renderAllSlides(brief);
    for (const r of ["large", "small"]) {
      expect(text).toContain(String(m("privacy_utility", `frozen/regimes/${r}/rounds`)));
      expect(text).toContain(fmt.pct(m("privacy_utility", `frozen/regimes/${r}/sample_rate`), 0));
    }
    expect(longPanels(brief, 130)).toEqual([]);
    expect(checkTheory(theory)).toEqual([]);
  });

  it("keeps every panel short enough to read from the back of a room", () => {
    expect(longPanels(theory)).toEqual([]);
  });
});
