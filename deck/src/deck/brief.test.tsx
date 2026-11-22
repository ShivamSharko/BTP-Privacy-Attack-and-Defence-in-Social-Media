import { render } from "@testing-library/react";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { longPanels, renderAllSlides } from "../test/renderTheory";
import { type Cut, cutRegistry, EDITIONS, topicNumber } from "./editions";
import { resolveHash } from "./hash";
import { loadRegistry, type Registry } from "./registry";
import { useDeck } from "./store";

/**
 * The brief edition is the full deck's own slides with most left out. These tests read it as
 * its audience does: only the kept slides, in order, with nothing from the slides in between.
 */
let full: Registry;
let brief: Cut;
let briefText = "";
let fullText = "";

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
  it("renders every kept slide, panel and figure, with no error", () => {
    for (const id of brief.ids) expect(briefText).toContain(`[${id}]`);
    expect(briefText).not.toContain("[model/5]");
  });

  it("keeps every panel short enough to read from the back of a room", () => {
    expect(brief.theories.flatMap((theory) => longPanels(theory))).toEqual([]);
  });

  it("explains in one line each term whose own slide it leaves out", () => {
    for (const line of [
      "The model: every place is a direction",
      "the chance that a real friend pair scores above a non-friend pair",
      "the total still contains every member's update",
      "Calibrated: each user's loss is compared with reference models that never saw that user",
      "two accountants from separate code bases",
      "A committee median deals the users into small groups",
      "a committee with no attacker is clean",
      "This is user-level privacy",
      "The clip norm is the longest an update may be",
      "its members' places still stand out",
      "A secure sum shows the server only the total of the updates",
      "Evidence: in the full deck",
      "Everything here is a simulation in one process",
      "are simulated here, so these scores",
      "Honest updates are sparse",
      "every node must add its own noise",
      "A ledger is an append-only log",
      "epsilon, is the privacy budget",
    ]) {
      expect(briefText, line).toContain(line);
    }
  });

  it("shows none of those lines in the full deck, where the slide itself is there", () => {
    for (const line of [
      "The model: every place is a direction",
      "the chance that a real friend pair scores above",
      "Calibrated: each user's loss",
      "A committee median deals",
      "A ledger is an append-only log",
      "Evidence: in the full deck",
      "Everything here is a simulation in one process",
    ]) {
      expect(fullText, line).not.toContain(line);
    }
    expect(fullText).toContain("(next slide)");
    expect(fullText).toContain("blocked-release run");
    expect(fullText).toContain("The cost is small");
  });

  it("says in both editions what the defences do to the friendship attack", () => {
    for (const text of [fullText, briefText]) {
      expect(text).toContain("On masked updates its AUC is");
      expect(text).toContain("a sum leaves it no pair to compare");
      expect(text).toContain("Raw loss gives");
    }
  });

  it("never points at a slide it does not have", () => {
    // "The next slide" is true only if the slide that follows here is the one that follows in the full deck.
    const texts = briefText.split("\n").filter((line) => line.startsWith("["));
    brief.ids.forEach((id, i) => {
      const text = texts.find((line) => line.startsWith(`[${id}] `)) ?? "";
      const at = full.ids.indexOf(id);
      if (/next slide/.test(text)) expect(brief.ids[i + 1], `${id} says "next slide"`).toBe(full.ids[at + 1]);
      if (/previous slide|slide before/.test(text)) expect(brief.ids[i - 1], `${id} says "previous slide"`).toBe(full.ids[at - 1]);
    });
    expect(briefText).not.toMatch(/in the code\b/);
    expect(briefText).not.toContain("blocked-release run");
    expect(briefText).not.toMatch(/theory \d|concept \d/);
    expect(briefText).not.toContain("The live sandbox");
  });

  it("lists only the limits of what it shows", () => {
    expect(fullText).toContain("Free-riders do not adapt");
    expect(fullText).toContain("The what-if levels simulate");
    expect(briefText).not.toContain("Free-riders do not adapt");
    expect(briefText).not.toContain("The what-if levels simulate");
    // The scoreboard on intro/7 shows the H5 verdict, so the limit on that study's epsilon stays.
    expect(briefText).toMatch(/scenarios\), the epsilon shown is nominal/);
    expect(briefText).toContain("Attackers do not adapt");
    expect(briefText).toContain("pre-publication review");
    // No date typed by hand: the note says the deck is online without saying when.
    for (const text of [fullText, briefText]) expect(text).toContain("were put online to share them with the guide, before that review");
  });

  it("offers evidence buttons only for topics it shows", () => {
    const shown = new Set(brief.theories.map((theory) => theory.id));
    const { container, unmount } = render(<>{brief.slides.filter((s) => s.slide.Stage).map((s) => {
      const Stage = s.slide.Stage!;
      return <Stage key={s.slide.id} />;
    })}</>);
    const labels = Array.from(container.querySelectorAll("button[aria-label*='evidence: open']")).map((b) => b.getAttribute("aria-label") ?? "");
    unmount();
    expect(labels.length).toBeGreaterThan(3);
    expect(labels.some((label) => label.includes("Who takes part"))).toBe(shown.has("part"));
  });

  it("opens a kept slide from every topic link a kept slide can follow", () => {
    // Links inside slides name the first slide of a topic; in this edition that slide may be left out.
    for (const theory of brief.theories) expect(resolveHash(`#/${theory.id}/1`, brief.ids)).not.toBeNull();
    for (const gone of full.theories.filter((t) => !brief.theories.some((b) => b.id === t.id))) {
      expect(resolveHash(`#/${gone.id}/1`, brief.ids)).toBeNull();
    }
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
