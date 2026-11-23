import { beforeAll, describe, expect, it } from "vitest";
import { checkTheory } from "./checkTheory";
import { BRIEF_LIMIT, briefSlide, cutRegistry, editionHref, EDITIONS, inEdition, pickEdition } from "./editions";
import { addressOf, followHash, fromHash, resolveHash } from "./hash";
import { buildRegistry, loadRegistry, type Registry } from "./registry";
import { DEFAULT_POSE, type SlideKind, type TheoryDef } from "./types";

const Nothing = () => null;

function theory(id: string, number: number, kinds: SlideKind[]): TheoryDef {
  return {
    id,
    number,
    title: `Theory ${id}`,
    short: id,
    slides: kinds.map((kind, i) => ({ id: `${id}/${i + 1}`, kind, title: `Slide ${id}/${i + 1}`, badge: "illustration", pose: DEFAULT_POSE, step: i, Panel: Nothing })),
    Scene: Nothing,
    Fallback: Nothing,
  };
}

const toy = buildRegistry([theory("intro", 0, ["extra", "extra"]), theory("fed", 2, ["theory", "impact", "code"]), theory("dp", 6, ["theory", "theory", "impact"])]);
const cutOf = (slides: string[]) => cutRegistry(toy, { ...EDITIONS.brief, slides });

describe("choosing the edition", () => {
  it("opens the full deck unless the build or the address says brief", () => {
    expect(pickEdition("http://localhost:5173/", undefined)).toBe("full");
    expect(pickEdition("http://localhost:5173/", "")).toBe("full");
    expect(pickEdition("http://localhost:5173/", "anything")).toBe("full");
    expect(pickEdition("http://localhost:5173/", "brief")).toBe("brief");
  });

  it("lets the address override the build, before or after the slide", () => {
    expect(pickEdition("http://localhost:5173/?edition=brief", undefined)).toBe("brief");
    expect(pickEdition("http://localhost:5173/?solo=1&edition=brief#/dp/1", undefined)).toBe("brief");
    expect(pickEdition("http://localhost:5173/#/dp/1?edition=brief", undefined)).toBe("brief");
    expect(pickEdition("https://example.test/?edition=full", "brief")).toBe("full");
  });

  it("ignores an edition it does not know", () => {
    expect(pickEdition("http://localhost:5173/?edition=briefing", undefined)).toBe("full");
    expect(pickEdition("http://localhost:5173/?edition=", "brief")).toBe("brief");
    expect(pickEdition("http://localhost:5173/?myedition=brief", undefined)).toBe("full");
  });
});

describe("cutting the deck to an edition", () => {
  it("keeps every slide in the full edition", () => {
    const cut = cutRegistry(toy, EDITIONS.full);
    expect(cut.ids).toEqual(toy.ids);
    expect(cut.missing).toEqual([]);
  });

  it("keeps the listed slides in deck order, whatever order the list is in", () => {
    expect(cutOf(["dp/3", "intro/1", "fed/2", "dp/1"]).ids).toEqual(["intro/1", "fed/2", "dp/1", "dp/3"]);
  });

  it("drops a topic left with no slide and counts each slide inside what is left of its topic", () => {
    const cut = cutOf(["intro/1", "dp/2", "dp/3"]);
    expect(cut.theories.map((t) => t.id)).toEqual(["intro", "dp"]);
    expect(cut.slides.map((s) => `${s.slide.id}:${s.local + 1}/${s.theory.slides.length}`)).toEqual(["intro/1:1/1", "dp/2:1/2", "dp/3:2/2"]);
    // The rail and the 3D world find a slide's topic by identity, so the cut must be self-consistent.
    for (const flat of cut.slides) expect(cut.theories).toContain(flat.theory);
  });

  it("does not change the registry it was given", () => {
    cutOf(["intro/1"]);
    expect(toy.theories.map((t) => t.slides.length)).toEqual([2, 3, 3]);
  });

  it("reports a listed slide that no folder has", () => {
    const cut = cutOf(["intro/1", "dp/9", "nope/1"]);
    expect(cut.ids).toEqual(["intro/1"]);
    expect(cut.missing).toEqual(["dp/9", "nope/1"]);
  });

  it("keeps the folders that failed to load", () => {
    expect(cutRegistry(buildRegistry([theory("intro", 0, ["extra"])], ["broken"]), { ...EDITIONS.brief, slides: ["intro/1"] }).failed).toEqual(["broken"]);
  });
});

describe("a slide's brief variant", () => {
  const Short = () => null;
  const Figure = () => null;
  const dp = theory("dp", 6, ["theory", "impact", "code"]);
  dp.slides[0].brief = { title: "The idea in one slide", Panel: Short, step: 7 };
  dp.slides[1].sources = ["privacy_utility"];
  dp.slides[1].badge = "measured";
  dp.slides[1].layout = "stage";
  dp.slides[1].Stage = Nothing;
  dp.slides[1].brief = { title: "The result in one slide", Panel: Short, Stage: Figure };
  dp.slides[2].badge = "source";
  const deck = buildRegistry([theory("intro", 0, ["extra"]), dp]);

  it("keeps the slide's place and takes the variant's headline, text, figure and scene step", () => {
    const shown = briefSlide(dp.slides[0]);
    expect(shown.id).toBe("dp/1");
    expect(shown.kind).toBe("theory");
    expect(shown.title).toBe("The idea in one slide");
    expect(shown.Panel).toBe(Short);
    expect(shown.step).toBe(7);
    expect(shown.pose).toBe(dp.slides[0].pose);
    expect(shown.layout).toBe("split");
    expect(shown.Stage).toBeUndefined();
  });

  it("uses the stage layout when the variant has a figure, and keeps the slide's sources", () => {
    const shown = briefSlide(dp.slides[1]);
    expect(shown.Stage).toBe(Figure);
    expect(shown.layout).toBe("stage");
    expect(shown.badge).toBe("measured");
    expect(shown.sources).toEqual(["privacy_utility"]);
  });

  it("never shows the host's own figure with the variant's text", () => {
    const host = { ...dp.slides[1], brief: { title: "Text only", Panel: Short } };
    const shown = briefSlide(host);
    expect(shown.Stage).toBeUndefined();
    expect(shown.layout).toBe("split");
  });

  it("returns a slide without a variant unchanged", () => {
    expect(briefSlide(dp.slides[2])).toBe(dp.slides[2]);
  });

  it("is shown by the brief edition and never by the full one", () => {
    const brief = cutRegistry(deck, { ...EDITIONS.brief, slides: ["intro/1", "dp/1", "dp/2"] });
    expect(brief.slides.map((s) => s.slide.title)).toEqual(["Slide intro/1", "The idea in one slide", "The result in one slide"]);
    const full = cutRegistry(deck, EDITIONS.full);
    expect(full.slides.map((s) => s.slide.title)).toEqual(["Slide intro/1", "Slide dp/1", "Slide dp/2", "Slide dp/3"]);
    expect(full.slides[1].slide.Panel).toBe(Nothing);
  });

  it("is checked by the deck rules", () => {
    expect(checkTheory(dp)).toEqual([]);
    const bad = theory("dp", 6, ["theory", "impact", "code"]);
    bad.slides[1].sources = ["privacy_utility"];
    bad.slides[1].badge = "measured";
    bad.slides[2].badge = "source";
    bad.slides[0].brief = { title: " ", Panel: Short, badge: "measured" };
    bad.slides[2].brief = { title: "Code", Panel: Short };
    const problems = checkTheory(bad).join(" | ");
    expect(problems).toContain("dp/1: brief variant has an empty title");
    expect(problems).toContain("dp/1: a brief variant badged measured must list its sources");
    expect(problems).toContain("dp/3: a code slide has no brief variant");
  });
});

describe("a link written for the full deck, opened in a shorter one", () => {
  const ids = cutOf(["intro/1", "fed/2", "dp/3"]).ids;

  it("opens the slide when the edition has it", () => {
    expect(fromHash("#/dp/3", ids)).toBe(2);
  });

  it("opens the first slide shown of the same topic when the edition left the slide out", () => {
    expect(fromHash("#/dp/1", ids)).toBe(2);
    expect(fromHash("#/fed/1?perf=1", ids)).toBe(1);
  });

  it("opens the first slide on load when the whole topic is left out or unknown", () => {
    expect(fromHash("#/mia/1", ids)).toBe(0);
    expect(fromHash("#/", ids)).toBe(0);
  });

  it("stays put for a topic this edition leaves out, and opens the first slide for an address nobody knows", () => {
    expect(followHash("#/dp/3", ids, toy.ids)).toBe(2);
    expect(followHash("#/dp/1", ids, toy.ids)).toBe(2);
    expect(followHash("#/fed/3", ids, toy.ids)).toBe(1);
    const withoutFed = cutOf(["intro/1", "dp/3"]).ids;
    expect(followHash("#/fed/1", withoutFed, toy.ids)).toBeNull();
    expect(followHash("#/no-such/9", withoutFed, toy.ids)).toBe(0);
    expect(followHash("", withoutFed, toy.ids)).toBe(0);
    expect(followHash("#/no-such/9", toy.ids, toy.ids)).toBe(0);
  });

  it("tells a click on such a link apart, so the deck can stay where it is", () => {
    expect(resolveHash("#/mia/1", ids)).toBeNull();
    expect(resolveHash("#/no-such/9", ids)).toBeNull();
    expect(resolveHash("", ids)).toBeNull();
    expect(resolveHash("#/dp/1", ids)).toBe(2);
  });
});

describe("the address of a slide", () => {
  it("keeps the query before the hash", () => {
    expect(addressOf("dp/3", { pathname: "/", search: "?edition=brief", hash: "#/dp/1" })).toBe("/?edition=brief#/dp/3");
    expect(addressOf("dp/3", { pathname: "/index.html", search: "", hash: "" })).toBe("/index.html#/dp/3");
  });

  it("keeps a setting written after the slide, so it survives a slide change and a reload", () => {
    const next = addressOf("intro/3", { pathname: "/", search: "", hash: "#/intro/1?edition=brief" });
    expect(next).toBe("/#/intro/3?edition=brief");
    expect(pickEdition(`https://example.test${next}`, undefined)).toBe("brief");
    expect(fromHash("#/intro/3?edition=brief", ["intro/1", "intro/3"])).toBe(1);
  });
});

describe("the address of the other edition", () => {
  it("is the other hosted copy when this copy is a hosted one", () => {
    expect(editionHref(EDITIONS.brief, EDITIONS.full.url, "/")).toBe(EDITIONS.brief.url);
    expect(editionHref(EDITIONS.full, EDITIONS.brief.url, "/")).toBe(EDITIONS.full.url);
  });

  it("stays on the same page anywhere else, so it works offline", () => {
    expect(editionHref(EDITIONS.brief, "http://localhost:5173", "/")).toBe("/?edition=brief");
    expect(editionHref(EDITIONS.full, "http://localhost:4173", "/index.html")).toBe("/index.html?edition=full");
  });

  it("gives the two editions different names and addresses", () => {
    expect(EDITIONS.brief.name).not.toBe(EDITIONS.full.name);
    expect(EDITIONS.brief.url).not.toBe(EDITIONS.full.url);
    for (const edition of Object.values(EDITIONS)) expect(edition.url).toMatch(/^https:\/\/[a-z0-9-]+\.vercel\.app$/);
  });
});

describe("the brief edition", () => {
  const listed = EDITIONS.brief.slides ?? [];
  // Loading every theory folder takes a while on a cold start, so it is done once.
  let everything: Registry;
  beforeAll(async () => {
    everything = await loadRegistry();
  }, 120_000);

  it("has at most thirty slides and lists none twice", () => {
    expect(BRIEF_LIMIT).toBe(30);
    expect(listed.length).toBeGreaterThan(0);
    expect(listed.length).toBeLessThanOrEqual(BRIEF_LIMIT);
    expect(new Set(listed).size).toBe(listed.length);
  });

  it("lists only slides the deck has, in deck order, from the title to the thank-you", () => {
    expect(everything.failed).toEqual([]);
    const cut = cutRegistry(everything, EDITIONS.brief);
    expect(cut.missing).toEqual([]);
    expect(cut.ids).toEqual(listed);
    expect(cut.ids[0]).toBe("intro/1");
    expect(cut.slides[cut.slides.length - 1].slide.title).toBe("Thank you");
    expect(everything.slides.length).toBeGreaterThan(cut.slides.length);
  });

  it("has no code slide: the code stays in the full deck", () => {
    const cut = cutRegistry(everything, EDITIONS.brief);
    expect(cut.slides.filter((s) => s.slide.kind === "code").map((s) => s.slide.id)).toEqual([]);
    expect(cut.slides.filter((s) => s.slide.badge === "source")).toEqual([]);
  });

  it("shows measured results, not only explanations", () => {
    const cut = cutRegistry(everything, EDITIONS.brief);
    expect(cut.slides.filter((s) => s.slide.kind === "impact").length).toBeGreaterThanOrEqual(6);
  });

  it("says which slides it keeps through inEdition", () => {
    expect(inEdition(EDITIONS.full, "anything/1")).toBe(true);
    expect(inEdition(EDITIONS.brief, "intro/1")).toBe(true);
    expect(inEdition(EDITIONS.brief, "no-such/1")).toBe(false);
  });
});
