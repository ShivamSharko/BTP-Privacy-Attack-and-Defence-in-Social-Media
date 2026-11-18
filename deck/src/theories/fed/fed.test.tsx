import { describe, expect, it } from "vitest";
import { fact, m } from "../../data";
import { checkTheory } from "../../deck/checkTheory";
import { longPanels, renderAllSlides } from "../../test/renderTheory";
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

  it("keeps every panel short enough to read from the back of a room", () => {
    expect(longPanels(theory)).toEqual([]);
  });
});
