import { describe, expect, it } from "vitest";
import { fmt, m } from "../../data";
import { checkTheory } from "../../deck/checkTheory";
import { longPanels, renderAllSlides } from "../../test/renderTheory";
import { theory } from "./index";

describe("theory 3: what one update reveals", () => {
  it("follows the deck rules", () => {
    expect(checkTheory(theory)).toEqual([]);
    expect(theory.slides.length).toBeGreaterThanOrEqual(4);
  });

  it("renders every slide and shows the measured figures", () => {
    const text = renderAllSlides(theory);
    expect(text).toContain(fmt.n(m("update_leakage", "results/raw/recovery/auc/mean"), 4));
    expect(text).toContain(fmt.n(m("update_leakage", "results/raw/recovery/precision_at_10/mean"), 4));
    expect(text).toContain(fmt.n(m("update_leakage", "results/raw/link/auc"), 3));
    expect(text).toContain(fmt.n(m("update_leakage", "results/reference_histories/link/auc"), 3));
    expect(text).toContain("src/prism/attacks/inversion.py");
  });

  it("keeps every panel short enough to read from the back of a room", () => {
    expect(longPanels(theory)).toEqual([]);
  });
});
