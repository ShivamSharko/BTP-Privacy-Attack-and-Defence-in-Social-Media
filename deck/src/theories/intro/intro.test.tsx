import { describe, expect, it } from "vitest";
import { fmt, m } from "../../data";
import { checkTheory } from "../../deck/checkTheory";
import { longPanels, renderAllSlides } from "../../test/renderTheory";
import { theory } from "./index";
import { HYPOTHESES } from "./verdicts";

describe("theory 0: the opening", () => {
  it("follows the deck rules", () => {
    expect(checkTheory(theory)).toEqual([]);
    expect(theory.slides.length).toBeGreaterThanOrEqual(4);
    expect(theory.slides.every((s) => s.kind === "extra")).toBe(true);
  });

  it("renders every slide with the measured shape and every hypothesis", () => {
    const text = renderAllSlides(theory);
    expect(text).toContain(fmt.int(m("social_graph", "users")));
    expect(text).toContain(fmt.int(m("dataset_card", "items")));
    expect(text).toContain(fmt.int(m("dataset_card", "interactions")));
    expect(text).toContain(fmt.int(m("social_graph", "edges")));
    for (const id of ["H1", "H2", "H3", "H4", "H5"]) expect(text).toContain(id);
  });

  it("derives the verdicts from the result files", () => {
    const byId = Object.fromEntries(HYPOTHESES.map((h) => [h.id, h]));
    expect(byId.H1.verdict).toBe("not supported");
    expect(byId.H2.verdict).toBe("supported");
    expect(byId.H3.verdict).toBe("split");
    expect(byId.H4.verdict).toBe("not supported as stated");
    expect(byId.H5.verdict).toBe("weakly supported");
    expect(HYPOTHESES.filter((h) => h.tone === "against")).toHaveLength(2);
  });

  it("keeps every panel short enough to read from the back of a room", () => {
    expect(longPanels(theory)).toEqual([]);
  });
});
