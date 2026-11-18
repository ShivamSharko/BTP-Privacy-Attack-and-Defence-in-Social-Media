import { describe, expect, it } from "vitest";
import { fact, fmt, m } from "../../data";
import { checkTheory } from "../../deck/checkTheory";
import { longPanels, renderAllSlides } from "../../test/renderTheory";
import { POINTS } from "./figures";
import { theory } from "./index";

describe("closing: putting it together", () => {
  it("follows the deck rules", () => {
    expect(checkTheory(theory)).toEqual([]);
    expect(theory.slides.every((s) => s.kind === "extra")).toBe(true);
    expect(theory.slides.length).toBeGreaterThanOrEqual(6);
  });

  it("renders every slide and shows the measured figures", () => {
    const text = renderAllSlides(theory);
    expect(text).toContain(fmt.n(m("privacy_utility", "summary/small/levels/eps8/epsilon_unamplified"), 0));
    expect(text).toContain(fmt.n(m("privacy_utility", "summary/small/levels/eps8/epsilon_of_record"), 2));
    expect(text).toContain(String(fact("runs.records").value));
    expect(text).toContain(String(fact("tests.count").value));
    expect(text).toContain("uv run prism update-leakage");
    expect(text).toContain("npm run build");
    expect(text).toContain("pre-publication review");
    for (const p of POINTS) expect(text).toContain(p.label);
  });

  it("ends by thanking the guide and the panel", () => {
    const last = theory.slides[theory.slides.length - 1];
    expect(last.title).toBe("Thank you");
    const text = renderAllSlides(theory);
    const thanks = text.slice(text.indexOf(`[${last.id}]`));
    expect(thanks).toContain("Thank you.");
    expect(thanks).toContain(String(fact("people.guide").value));
    expect(thanks).toContain("the panel");
    expect(thanks).not.toMatch(/department|electronics/i);
  });

  it("plots every measured configuration it promises", () => {
    expect(POINTS.filter((p) => p.group === "dp")).toHaveLength(12);
    expect(POINTS.filter((p) => p.group === "poison")).toHaveLength(5);
    expect(POINTS.filter((p) => p.group === "gossip")).toHaveLength(1);
    for (const p of POINTS) expect([p.x, p.y, p.z].every(Number.isFinite)).toBe(true);
  });

  it("keeps every panel short enough to read from the back of a room", () => {
    expect(longPanels(theory)).toEqual([]);
  });
});

describe("the package diagram", () => {
  it("draws exactly the imports between packages found in src/prism", async () => {
    const { readdirSync, readFileSync, statSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { EDGES } = await import("./stack");
    const root = join(process.cwd(), "..", "src", "prism");
    const packages = ["data", "models", "fl", "privacy", "attacks", "ledger", "eval", "experiments", "report"];
    const found = new Set<string>();
    const walk = (dir: string, from: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path, from);
        else if (name.endsWith(".py")) {
          for (const match of readFileSync(path, "utf8").matchAll(/(?:from|import) prism\.([a-z_]+)/g)) {
            if (match[1] !== from) found.add(`${from}>${match[1]}`);
          }
        }
      }
    };
    for (const p of packages) walk(join(root, p), p);
    const drawn = new Set(EDGES.filter(([from]) => from !== "cli").map(([from, to]) => `${from}>${to}`));
    expect([...drawn].sort()).toEqual([...found].sort());
  });
});

describe("the reproduce slides", () => {
  it("name only prism commands that src/prism/cli.py defines", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { CHECKS, EXPERIMENTS } = await import("./reproduce");
    const cli = readFileSync(join(process.cwd(), "..", "src", "prism", "cli.py"), "utf8");
    const defined = new Set([...cli.matchAll(/^\s+"([a-z-]+)": \(/gm)].map((match) => match[1]));
    const used = [...EXPERIMENTS, ...CHECKS].map(([command]) => /uv run prism ([a-z-]+)/.exec(command)?.[1]).filter(Boolean);
    expect(used.length).toBeGreaterThan(10);
    for (const name of used) expect(defined).toContain(name);
  });
});
