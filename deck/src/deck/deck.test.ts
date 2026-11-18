import { beforeEach, describe, expect, it } from "vitest";
import { checkTheory } from "./checkTheory";
import { fromHash, toHash } from "./hash";
import { buildRegistry } from "./registry";
import { useDeck } from "./store";
import { DEFAULT_POSE, type SlideDef, type SlideKind, type TheoryDef } from "./types";

const Nothing = () => null;

function slide(id: string, kind: SlideKind, extra: Partial<SlideDef> = {}): SlideDef {
  return { id, kind, title: `Slide ${id}`, badge: kind === "impact" ? "measured" : kind === "code" ? "source" : "illustration", pose: DEFAULT_POSE, step: 0, Panel: Nothing, ...extra };
}

function theory(id: string, number: number, kinds: SlideKind[], patch: Partial<TheoryDef> = {}): TheoryDef {
  return {
    id,
    number,
    title: `Theory ${id}`,
    short: id,
    slides: kinds.map((kind, i) => slide(`${id}/${i + 1}`, kind, kind === "impact" ? { sources: ["privacy_utility"] } : {})),
    Scene: Nothing,
    Fallback: Nothing,
    ...patch,
  };
}

describe("deck store", () => {
  beforeEach(() => {
    useDeck.setState({ index: 0, count: 0, overview: false });
    useDeck.getState().setCount(30);
  });

  it("clamps navigation to the deck", () => {
    const s = useDeck.getState();
    s.prev();
    expect(useDeck.getState().index).toBe(0);
    s.go(999);
    expect(useDeck.getState().index).toBe(29);
    s.next();
    expect(useDeck.getState().index).toBe(29);
    s.go(-4);
    expect(useDeck.getState().index).toBe(0);
    s.go(Number.NaN);
    expect(useDeck.getState().index).toBe(0);
  });

  it("lands on slide 20 after twenty rapid presses", () => {
    for (let i = 0; i < 20; i++) useDeck.getState().next();
    expect(useDeck.getState().index).toBe(20);
  });

  it("keeps the index valid when the deck shrinks", () => {
    useDeck.getState().go(25);
    useDeck.getState().setCount(10);
    expect(useDeck.getState().index).toBe(9);
  });

  it("closes the overview when a slide is chosen", () => {
    useDeck.getState().toggleOverview();
    expect(useDeck.getState().overview).toBe(true);
    useDeck.getState().go(3);
    expect(useDeck.getState().overview).toBe(false);
  });
});

describe("hash routing", () => {
  const registry = buildRegistry([theory("dp", 6, ["theory", "impact", "code"]), theory("fed", 2, ["theory", "impact", "code"])]);

  it("orders theories by number", () => {
    expect(registry.ids).toEqual(["fed/1", "fed/2", "fed/3", "dp/1", "dp/2", "dp/3"]);
  });

  it("round-trips every slide", () => {
    registry.ids.forEach((id, i) => expect(fromHash(toHash(id), registry.ids)).toBe(i));
  });

  it("falls back to the first slide for an unknown or empty hash", () => {
    expect(fromHash("#/nope/9", registry.ids)).toBe(0);
    expect(fromHash("", registry.ids)).toBe(0);
    expect(fromHash("#", registry.ids)).toBe(0);
  });

  it("ignores a query string after the slide id", () => {
    expect(fromHash("#/dp/2?perf=1", registry.ids)).toBe(4);
  });
});

describe("checkTheory", () => {
  it("accepts a well formed theory", () => {
    expect(checkTheory(theory("dp", 6, ["theory", "theory", "impact", "code"]))).toEqual([]);
    expect(checkTheory(theory("dp", 6, ["theory", "extra", "impact", "code", "extra"]))).toEqual([]);
    expect(checkTheory(theory("intro", 0, ["extra", "extra"]))).toEqual([]);
  });

  it("reports ids that do not follow the pattern", () => {
    const bad = theory("dp", 6, ["theory", "impact", "code"]);
    bad.slides[1] = { ...bad.slides[1], id: "dp/7" };
    expect(checkTheory(bad).join("\n")).toMatch(/expected "dp\/2"/);
  });

  it("reports kinds out of order and missing kinds", () => {
    expect(checkTheory(theory("dp", 6, ["impact", "theory", "code"])).join("\n")).toMatch(/order is theory, impact, code/);
    expect(checkTheory(theory("dp", 6, ["theory", "code"])).join("\n")).toMatch(/no impact slide/);
    expect(checkTheory(theory("dp", 6, ["theory", "impact"])).join("\n")).toMatch(/no code slide/);
  });

  it("reports an impact slide without sources or badged illustration", () => {
    const bad = theory("dp", 6, ["theory", "impact", "code"]);
    bad.slides[1] = { ...bad.slides[1], sources: undefined, badge: "illustration" };
    const text = checkTheory(bad).join("\n");
    expect(text).toMatch(/must list its sources/);
    expect(text).toMatch(/cannot be badged illustration/);
  });

  it("reports unknown sources, long labels, stage layout without a Stage", () => {
    const bad = theory("dp", 6, ["theory", "impact", "code"], { short: "a label that is far too long" });
    bad.slides[1] = { ...bad.slides[1], sources: ["made_up" as never] };
    bad.slides[2] = { ...bad.slides[2], layout: "stage" };
    const text = checkTheory(bad).join("\n");
    expect(text).toMatch(/unknown source "made_up"/);
    expect(text).toMatch(/longer than 14 characters/);
    expect(text).toMatch(/needs a Stage/);
  });

  it("requires code slides, and only code slides, to be badged source", () => {
    const bad = theory("dp", 6, ["theory", "impact", "code"]);
    bad.slides[2] = { ...bad.slides[2], badge: "measured" };
    bad.slides[0] = { ...bad.slides[0], badge: "source" };
    const text = checkTheory(bad).join("\n");
    expect(text).toMatch(/a code slide must be badged source/);
    expect(text).toMatch(/only code slides are badged source/);
  });

  it("requires opening and closing slides to be extras", () => {
    expect(checkTheory(theory("intro", 0, ["theory"])).join("\n")).toMatch(/must be kind "extra"/);
  });
});
