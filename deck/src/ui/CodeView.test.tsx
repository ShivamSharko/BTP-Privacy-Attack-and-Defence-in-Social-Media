import { describe, it, expect } from "vitest";
import { render, fireEvent, screen } from "@testing-library/react";
import { CodeView, firstPageStart, PAGE_LINES, WHOLE_LINES } from "./CodeView";
import { code } from "../data";

const A = "models/hybrid.py::user_loss";
const B = "attacks/membership.py::calibrate_scores"; // multi-line docstring
const LONG = "fl/server.py::train"; // far more lines than fit on a slide

function lineNumbers(container: HTMLElement): number[] {
  return [...container.querySelectorAll("[data-line]")].map((e) => Number(e.getAttribute("data-line")));
}

describe("CodeView", () => {
  it("shows path, range, name and real line numbers", () => {
    const c = code(A);
    const { container } = render(<CodeView refs={[A]} />);
    expect(container.textContent).toContain(c.file);
    expect(container.textContent).toContain(`lines ${c.start}–${c.end}`);
    expect(container.textContent).toContain(c.name);
    const n = lineNumbers(container);
    expect(n[0]).toBe(c.start);
    expect(n[n.length - 1]).toBe(c.end);
    expect(n).toHaveLength(c.end - c.start + 1);
  });
  it("throws on an unknown ref", () => {
    const spy = console.error;
    console.error = () => {};
    try {
      expect(() => render(<CodeView refs={["nope.py::missing"]} />)).toThrow();
    } finally {
      console.error = spy;
    }
  });
  it("marks exactly the highlighted absolute lines", () => {
    const c = code(A);
    const { container } = render(
      <CodeView refs={[A]} highlight={{ [A]: [[c.start + 1, c.start + 2], [c.end, c.end]] }} />,
    );
    const hl = [...container.querySelectorAll("[data-hl='true']")].map((e) => Number(e.getAttribute("data-line")));
    expect(hl).toEqual([c.start + 1, c.start + 2, c.end]);
  });
  it("keeps one row per source line across a multi-line docstring", () => {
    const c = code(B);
    expect(c.source).toContain('"""');
    const { container } = render(<CodeView refs={[B]} />);
    const rows = [...container.querySelectorAll("[data-line]")];
    expect(rows).toHaveLength(c.source.split("\n").length);
    const first = rows.find((r) => r.textContent?.includes("Reference mean loss"));
    expect(first?.innerHTML).toContain("hljs-string");
    const inner = rows.find((r) => r.textContent?.includes("and ``in_reference``") || r.textContent?.includes("in_reference`` are"));
    expect(inner?.innerHTML).toContain("hljs-string");
    for (const r of rows) {
      const html = r.querySelector("[data-code]")?.innerHTML ?? "";
      expect((html.match(/<span/g) ?? []).length).toBe((html.match(/<\/span>/g) ?? []).length);
    }
  });
  it("shows tabs for several refs and switches with ArrowRight", () => {
    render(<CodeView refs={[A, B]} />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(2);
    expect(tabs[0].getAttribute("aria-selected")).toBe("true");
    expect(screen.getAllByRole("tabpanel")).toHaveLength(1);
    fireEvent.keyDown(tabs[0], { key: "ArrowRight" });
    const after = screen.getAllByRole("tab");
    expect(after[1].getAttribute("aria-selected")).toBe("true");
    expect(after[0].getAttribute("aria-selected")).toBe("false");
    expect(screen.getByRole("tabpanel").textContent).toContain("calibrate_scores");
    fireEvent.keyDown(after[1], { key: "ArrowRight" });
    expect(screen.getAllByRole("tab")[0].getAttribute("aria-selected")).toBe("true");
  });
  it("shows no tabs for a single ref", () => {
    render(<CodeView refs={[A]} />);
    expect(screen.queryAllByRole("tab")).toHaveLength(0);
  });
});

describe("a long excerpt is paged, never scrolled", () => {
  const c = code(LONG);
  const length = c.end - c.start + 1;

  it("has a long excerpt to test with, and a short one that is shown whole", () => {
    expect(length).toBeGreaterThan(WHOLE_LINES * 2);
    const short = code(A);
    expect(short.end - short.start + 1).toBeLessThanOrEqual(WHOLE_LINES);
    render(<CodeView refs={[A]} />);
    expect(screen.queryByRole("button", { name: "Later lines" })).toBeNull();
  });

  it("shows one page of real line numbers and says which lines", () => {
    const { container } = render(<CodeView refs={[LONG]} />);
    const n = lineNumbers(container);
    expect(n).toHaveLength(PAGE_LINES);
    expect(n[0]).toBe(c.start);
    expect(container.textContent).toContain(`Showing lines ${c.start}–${c.start + PAGE_LINES - 1} of this ${length}-line excerpt`);
    expect(screen.getByRole("button", { name: "Earlier lines" })).toBeDisabled();
  });

  it("pages forward with two lines of overlap and stops on the last line", () => {
    const { container } = render(<CodeView refs={[LONG]} />);
    const later = screen.getByRole("button", { name: "Later lines" });
    fireEvent.click(later);
    expect(lineNumbers(container)[0]).toBe(c.start + PAGE_LINES - 2);
    for (let i = 0; i < 20; i++) fireEvent.click(later);
    const n = lineNumbers(container);
    expect(n).toHaveLength(PAGE_LINES);
    expect(n[n.length - 1]).toBe(c.end);
    expect(later).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Earlier lines" }));
    expect(lineNumbers(container)[0]).toBe(c.end - PAGE_LINES + 1 - (PAGE_LINES - 2));
  });

  it("opens on the page that holds the first highlighted line", () => {
    const target = c.start + 60;
    const { container } = render(<CodeView refs={[LONG]} highlight={{ [LONG]: [[target, target + 3], [c.start + 2, c.start + 2].map((x) => x + 90) as [number, number]] }} />);
    const n = lineNumbers(container);
    expect(n[0]).toBe(target - 2);
    expect(container.querySelectorAll("[data-hl='true']")).toHaveLength(4);
    expect(container.textContent).toContain("more highlighted lines on another page");
  });

  it("starts each tab on its own first page", () => {
    const { container } = render(<CodeView refs={[LONG, A]} />);
    fireEvent.click(screen.getByRole("button", { name: "Later lines" }));
    fireEvent.click(screen.getAllByRole("tab")[1]);
    fireEvent.click(screen.getAllByRole("tab")[0]);
    expect(lineNumbers(container)[0]).toBe(c.start);
  });

  it("gives the listing the length of its longest line, so the type can be sized to fit it", () => {
    const { container } = render(<CodeView refs={[LONG]} />);
    const longest = Math.max(...c.source.split("\n").map((l) => l.length));
    expect((container.querySelector(".code") as HTMLElement).style.getPropertyValue("--cols")).toBe(String(Math.max(60, longest)));
  });
});

describe("firstPageStart", () => {
  it("is 0 for an excerpt shown whole and for one with nothing highlighted", () => {
    expect(firstPageStart(WHOLE_LINES, 10, [[20, 22]])).toBe(0);
    expect(firstPageStart(200, 10, undefined)).toBe(0);
    expect(firstPageStart(200, 10, [])).toBe(0);
  });
  it("puts the earliest highlighted line two lines below the top", () => {
    expect(firstPageStart(200, 100, [[180, 185], [150, 151]])).toBe(48);
    expect(firstPageStart(200, 100, [[101, 101]])).toBe(0);
  });
  it("never starts so late that the page runs past the end", () => {
    expect(firstPageStart(100, 1, [[99, 100]])).toBe(100 - PAGE_LINES);
  });
  it("ignores a range outside the excerpt", () => {
    expect(firstPageStart(100, 50, [[10, 12]])).toBe(0);
  });
});
