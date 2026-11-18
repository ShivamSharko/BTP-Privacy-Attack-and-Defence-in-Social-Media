import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { StatRow } from "./StatRow";
import { StackList } from "./StackList";

describe("StatRow", () => {
  it("renders figures, labels and notes", () => {
    const { container } = render(
      <StatRow items={[{ label: "nDCG", value: "0.123", role: "honest", note: "mean of 5" }, { label: "AUC", value: "0.51" }]} />,
    );
    expect(container.textContent).toContain("0.123");
    expect(container.textContent).toContain("nDCG");
    expect(container.textContent).toContain("mean of 5");
    expect(container.querySelectorAll("[data-stat]")).toHaveLength(2);
    expect(container.querySelector("[data-wrap='true']")).toBeNull();
  });
  it("flags wrapping beyond four items", () => {
    const items = Array.from({ length: 5 }, (_, i) => ({ label: `l${i}`, value: `${i}` }));
    const { container } = render(<StatRow items={items} />);
    expect(container.querySelector("[data-wrap='true']")).not.toBeNull();
  });
});

describe("StackList", () => {
  it("renders names and roles as a definition list", () => {
    const { container } = render(<StackList items={[{ name: "three", role: "3D scene" }]} />);
    expect(container.querySelector("dl dt")?.textContent).toBe("three");
    expect(container.querySelector("dl dd")?.textContent).toBe("3D scene");
  });
});
