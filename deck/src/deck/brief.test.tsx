import { render } from "@testing-library/react";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { longPanels, renderAllSlides } from "../test/renderTheory";
import { type Cut, cutRegistry, EDITIONS, topicNumber } from "./editions";
import { resolveHash } from "./hash";
import { loadRegistry, type Registry } from "./registry";
import { useDeck } from "./store";

/**
 * The brief edition has thirty slides, each remade to carry the main points of its topic. These
 * tests read it as its audience does: only its own slides, in order, with nothing from the full
 * deck's slides in between.
 */
let full: Registry;
let brief: Cut;
let briefText = "";
let fullText = "";

/** The slides that are the same in both editions: the title and the thank-you. */
const SAME_IN_BOTH = ["intro/1", "outro/10"];
/** A brief panel is read from the back of a room during a short talk. */
const BRIEF_WORDS = 130;

function textOf(registry: Registry): string {
  return registry.theories.map((theory) => renderAllSlides(theory)).join("\n");
}

beforeAll(async () => {
  full = await loadRegistry();
  brief = cutRegistry(full, EDITIONS.brief);
  useDeck.setState({ edition: "full", fullCount: full.slides.length, count: full.slides.length });
  fullText = textOf(full);
  useDeck.setState({ edition: "brief", count: brief.slides.length });
  briefText = textOf(brief);
}, 120_000);

afterAll(() => {
  useDeck.setState({ edition: "full", fullCount: 0, count: 0 });
});

describe("the brief edition, read on its own", () => {
  it("renders every one of its slides, panel and figure, with no error", () => {
    for (const id of brief.ids) expect(briefText).toContain(`[${id}]`);
    expect(briefText).not.toContain("[model/5]");
  });

  it("covers every topic of the deck", () => {
    expect(brief.theories.map((theory) => theory.id)).toEqual(full.theories.map((theory) => theory.id));
  });

  it("remakes every slide but the title and the thank-you", () => {
    const hosts = new Map(full.slides.map((s) => [s.slide.id, s.slide]));
    const unchanged = brief.ids.filter((id) => !hosts.get(id)?.brief);
    for (const id of unchanged) expect(SAME_IN_BOTH, `${id} has no brief variant`).toContain(id);
    // A remade slide has its own headline, so its text is not the host slide's text.
    for (const { slide } of brief.slides) {
      const host = hosts.get(slide.id);
      if (!host?.brief) continue;
      expect(slide.Panel, `${slide.id} shows the host's panel`).not.toBe(host.Panel);
      expect(slide.title.trim().length, `${slide.id} has no title`).toBeGreaterThan(0);
    }
  });

  it("gives every slide one headline", () => {
    for (const { slide } of brief.slides) {
      const Panel = slide.Panel;
      const view = render(<Panel />);
      expect(view.container.querySelectorAll("h1").length, `${slide.id} headlines`).toBe(1);
      view.unmount();
    }
  });

  it("keeps every panel short enough to read from the back of a room", () => {
    expect(brief.theories.flatMap((theory) => longPanels(theory, BRIEF_WORDS))).toEqual([]);
  });

  it("badges a slide that shows results as measured or computed, with its sources", () => {
    for (const { slide } of brief.slides) {
      if (slide.badge === "illustration") continue;
      expect(slide.sources?.length ?? 0, `${slide.id} lists no sources`).toBeGreaterThan(0);
    }
    // Every result slide of the full deck that the edition keeps is still a result slide.
    expect(brief.slides.filter((s) => s.slide.kind === "impact").every((s) => s.slide.badge !== "illustration")).toBe(true);
  });

  it("never points at a slide it does not have", () => {
    // "The next slide" is true only if the slide that follows here is the one that follows in the full deck.
    const texts = briefText.split("\n").filter((line) => line.startsWith("["));
    brief.ids.forEach((id, i) => {
      const text = texts.find((line) => line.startsWith(`[${id}] `)) ?? "";
      const at = full.ids.indexOf(id);
      if (/next slide/i.test(text)) expect(brief.ids[i + 1], `${id} says "next slide"`).toBe(full.ids[at + 1]);
      if (/previous slide|slide before/i.test(text)) expect(brief.ids[i - 1], `${id} says "previous slide"`).toBe(full.ids[at - 1]);
    });
    expect(briefText).not.toMatch(/in the code\b/);
    expect(briefText).not.toMatch(/theory \d|concept \d|slide \d/i);
    expect(briefText).not.toContain("The live sandbox");
  });

  it("uses plain words", () => {
    for (const word of ["crucial", "seamless", "leverage", "landscape", "showcase", "delve"]) {
      expect(briefText.toLowerCase(), word).not.toContain(word);
    }
    // No dash used as punctuation.
    expect(briefText).not.toMatch(/\s[–—]\s|\s--\s/);
  });

  it("says the same about the hypotheses as the project's results", () => {
    // The closing slide names all five, and the main result is on its own slide.
    for (const h of ["H1", "H2", "H3", "H4", "H5"]) expect(briefText, h).toContain(h);
  });

  it("opens one of its slides from every topic link", () => {
    // Links inside slides name the first slide of a topic; the edition may show another slide of it.
    for (const theory of full.theories) expect(resolveHash(`#/${theory.id}/1`, brief.ids), theory.id).not.toBeNull();
  });

  it("leaves the full deck with all its slides, code included", () => {
    expect(full.slides.length).toBeGreaterThan(brief.slides.length);
    expect(fullText).toContain("[model/5]");
  });
});

describe("topic numbers in the brief edition", () => {
  it("run from 1 with no gap, and the full deck keeps each topic's own number", () => {
    const shown = brief.theories.map((theory) => topicNumber(brief, theory, EDITIONS.brief)).filter((n) => n !== null);
    expect(shown).toEqual(shown.map((_, i) => i + 1));
    for (const theory of full.theories) {
      expect(topicNumber(full, theory, EDITIONS.full)).toBe(theory.number >= 1 && theory.number <= 13 ? theory.number : null);
    }
  });
});
