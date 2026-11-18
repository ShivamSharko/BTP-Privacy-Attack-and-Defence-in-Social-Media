import { describe, it, expect } from "vitest";
import { render, fireEvent, screen } from "@testing-library/react";
import { CodeView } from "./CodeView";
import { code } from "../data";

const A = "models/hybrid.py::user_loss";
const B = "attacks/membership.py::calibrate_scores"; // multi-line docstring

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
