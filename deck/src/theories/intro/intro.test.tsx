import { describe, expect, it } from "vitest";
import { fact, fmt, m } from "../../data";
import { checkTheory } from "../../deck/checkTheory";
import { briefOf, longPanels, renderAllSlides } from "../../test/renderTheory";
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

  it("opens with a title, an introduction and a problem statement, in that order", () => {
    expect(theory.slides.slice(0, 3).map((s) => s.title)).toEqual([
      "Privacy attack and defence in social media",
      "Introduction",
      "Problem statement",
    ]);
    expect(theory.slides).toHaveLength(7);
    expect(theory.slides.at(-1)?.title).toBe("What we found");
    const text = renderAllSlides(theory);
    expect(text).toContain("Problem statement: train a social recommender without collecting its users' data");
    expect(text).toContain("Federated learning promises a way out");
  });

  it("names the presenters and the guide exactly as the pre-registration does", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const prereg = readFileSync(join(process.cwd(), "..", "PREREGISTRATION.md"), "utf8");
    const guide = String(fact("people.guide").value);
    expect(prereg).toContain(`**Guide:** ${guide}`);
    for (const name of String(fact("people.owners").value).split(" and ")) expect(prereg).toContain(name);
    const text = renderAllSlides(theory);
    expect(text).toContain(guide);
    expect(text).toContain(String(fact("people.owners").value));
    // Names only: no roll number and no department on any slide.
    expect(text).not.toMatch(/[0-9]{2}U[A-Z]{2}[0-9]{3}/);
    expect(text).not.toMatch(/department|electronics/i);
  });

  it("keeps every panel short enough to read from the back of a room", () => {
    expect(longPanels(theory)).toEqual([]);
  });

  it("has four brief slides that carry the opening's main points", () => {
    const brief = briefOf(theory);
    expect(brief.slides.map((s) => s.id)).toEqual(["intro/3", "intro/4", "intro/5", "intro/6"]);
    const text = renderAllSlides(brief);
    expect(text).toContain(fmt.int(m("dataset_card", "users")));
    expect(text).toContain(fmt.int(m("dataset_card", "items")));
    expect(text).toContain(fmt.int(m("dataset_card", "interactions")));
    expect(text).toContain(fmt.int(m("social_graph", "edges")));
    expect(text).toContain(`${m("dataset_card", "k_core")}-core`);
    expect(text).toContain("secure sum");
    expect(text).toContain("six questions");
  });

  it("keeps every brief panel within the word limit", () => {
    expect(longPanels(briefOf(theory), 130)).toEqual([]);
  });
});
