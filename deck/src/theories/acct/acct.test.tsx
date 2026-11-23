import { describe, expect, it } from "vitest";
import { grid, m } from "../../data";
import { checkTheory } from "../../deck/checkTheory";
import { briefOf, longPanels, renderAllSlides } from "../../test/renderTheory";
import { theory } from "./index";

describe("theory 7: privacy accounting", () => {
  it("follows the deck rules", () => {
    expect(checkTheory(theory)).toEqual([]);
    expect(theory.slides.length).toBeGreaterThanOrEqual(4);
  });

  it("renders every slide and shows the measured figures", () => {
    const text = renderAllSlides(theory);
    expect(text).toContain(m("privacy_utility", "summary/small/levels/eps8/epsilon_unamplified").toFixed(0));
    expect(text).toContain(m("privacy_utility", "summary/small/levels/eps8/noise_multiplier").toFixed(3));
    expect(text).toContain(m("privacy_utility", "summary/large/levels/eps8/epsilon_at_delta_n2").toFixed(1));
    expect(text).toContain(grid.users.toLocaleString("en-US"));
    expect(text).toContain("src/prism/privacy/accounting.py");
    expect(text).toContain("dp-accounting");
    expect(text).toContain("Opacus");
  });

  it("keeps every panel short enough to read from the back of a room", () => {
    expect(longPanels(theory)).toEqual([]);
  });

  it("shows the brief slide with its figures", () => {
    const brief = briefOf(theory);
    expect(brief.slides.map((s) => s.id)).toEqual(["acct/1"]);
    const text = renderAllSlides(brief);
    const level = (regime: string, key: string) => m("privacy_utility", `summary/${regime}/levels/eps8/${key}`);
    expect(text).toContain(level("small", "epsilon_at_delta_n2").toFixed(2));
    expect(text).toContain(level("small", "epsilon_unamplified").toFixed(0));
    expect(text).toContain(level("small", "noise_multiplier").toFixed(3));
    expect(text).toContain(grid.users.toLocaleString("en-US"));
    expect(text).toContain("dp-accounting");
    expect(text).toContain("Opacus");
  });

  it("keeps the brief panel within 130 words", () => {
    expect(longPanels(briefOf(theory), 130)).toEqual([]);
  });
});
