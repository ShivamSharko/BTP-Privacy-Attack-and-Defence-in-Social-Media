import { describe, it, expect } from "vitest";
import { render, fireEvent, screen } from "@testing-library/react";
import { BarChart } from "./BarChart";
import { LineChart } from "./LineChart";
import { GroupedBars } from "./GroupedBars";

describe("BarChart", () => {
  const data = [
    { label: "A", value: 0.5, lo: 0.4, hi: 0.6, role: "honest" as const, note: "seed spread" },
    { label: "B", value: 0.25 },
    { label: "C", value: 0.1, lo: 0.3, hi: 0.05 },
  ];
  it("renders a bar per datum and an interval where lo/hi are given", () => {
    const { container } = render(<BarChart data={data} yLabel="nDCG" summary="Three bars" />);
    expect(container.querySelectorAll("rect[data-bar]")).toHaveLength(3);
    expect(container.querySelectorAll("[data-interval]")).toHaveLength(2);
    expect(container.innerHTML).not.toContain("NaN");
  });
  it("exposes the summary as accessible text", () => {
    const { container } = render(<BarChart data={data} yLabel="y" summary="Three bars" />);
    expect(screen.getByText("Three bars").className).toContain("sr-only");
    expect(container.querySelector("svg")?.getAttribute("aria-label")).toBe("Three bars");
    expect(container.querySelector("svg")?.getAttribute("role")).toBe("img");
  });
  it("shows value and note on hover and on focus", () => {
    const { container } = render(<BarChart data={data} yLabel="y" format={(v) => `v=${v}`} summary="s" />);
    const bar = container.querySelector("rect[data-bar]") as Element;
    fireEvent.mouseEnter(bar);
    const tip = container.querySelector("[role='tooltip']") as HTMLElement;
    expect(tip.textContent).toContain("v=0.5");
    expect(tip.textContent).toContain("seed spread");
    fireEvent.mouseLeave(bar);
    expect(container.querySelector("[role='tooltip']")).toBeNull();
    fireEvent.focus(bar);
    expect(container.querySelector("[role='tooltip']")).not.toBeNull();
  });
  it("renders a labelled threshold line", () => {
    const { container } = render(
      <BarChart data={data} yLabel="y" threshold={{ value: 0.3, label: "floor" }} summary="s" />,
    );
    expect(container.querySelector("line[data-threshold]")).not.toBeNull();
    expect(container.textContent).toContain("floor");
  });
  it("survives one datum, all zeros and all-equal values without NaN", () => {
    const a = render(<BarChart data={[{ label: "only", value: 0.7 }]} yLabel="y" summary="s" />);
    expect(a.container.innerHTML).not.toContain("NaN");
    const b = render(
      <BarChart data={[{ label: "a", value: 0 }, { label: "b", value: 0 }]} yLabel="y" summary="s" />,
    );
    expect(b.container.innerHTML).not.toContain("NaN");
    const c = render(
      <BarChart data={[{ label: "a", value: 3 }, { label: "b", value: 3 }]} yLabel="y" summary="s" />,
    );
    expect(c.container.innerHTML).not.toContain("NaN");
  });
  it("formats to 3 significant digits by default", () => {
    const { container } = render(<BarChart data={[{ label: "a", value: 0.123456 }]} yLabel="y" summary="s" />);
    expect(container.textContent).toContain("0.123");
  });
});

describe("LineChart", () => {
  const pts = [1, 2, 4, 8, 16].map((x) => ({ x, y: x / 20 }));
  it("places x on a log scale at equal spacing", () => {
    const { container } = render(
      <LineChart series={[{ name: "s", role: "honest", points: pts }]} xLabel="x" yLabel="y" xScale="log" summary="s" />,
    );
    const cx = [...container.querySelectorAll("circle[data-point]")].map((c) => Number(c.getAttribute("cx")));
    expect(cx).toHaveLength(5);
    const gaps = cx.slice(1).map((v, i) => v - cx[i]);
    for (const g of gaps) expect(g).toBeCloseTo(gaps[0], 3);
  });
  it("skips x <= 0 on a log scale", () => {
    const { container } = render(
      <LineChart
        series={[{ name: "s", role: "honest", points: [{ x: 0, y: 1 }, { x: -2, y: 1 }, ...pts] }]}
        xLabel="x"
        yLabel="y"
        xScale="log"
        summary="s"
      />,
    );
    expect(container.querySelectorAll("circle[data-point]")).toHaveLength(5);
    expect(container.innerHTML).not.toContain("NaN");
  });
  it("draws threshold, references, band, direct label and tooltip", () => {
    const series = [
      {
        name: "alpha",
        role: "honest" as const,
        points: [
          { x: 1, y: 1, lo: 0.5, hi: 1.5, note: "n1" },
          { x: 2, y: 2, lo: 1.5, hi: 2.5 },
        ],
      },
    ];
    const { container } = render(
      <LineChart
        series={series}
        xLabel="x"
        yLabel="y"
        threshold={{ value: 1.2, label: "limit" }}
        reference={[{ value: 0.8, label: "random" }]}
        summary="s"
      />,
    );
    expect(container.querySelector("line[data-threshold]")).not.toBeNull();
    expect(container.querySelector("line[data-reference]")).not.toBeNull();
    expect(container.querySelector("path[data-band]")).not.toBeNull();
    expect(container.textContent).toContain("alpha");
    expect(container.textContent).toContain("limit");
    expect(container.textContent).toContain("random");
    fireEvent.focus(container.querySelector("circle[data-point]") as Element);
    expect(container.querySelector("[role='tooltip']")?.textContent).toContain("n1");
  });
  it("handles a single point and flat series without NaN", () => {
    const a = render(
      <LineChart series={[{ name: "s", role: "noise", points: [{ x: 3, y: 0 }] }]} xLabel="x" yLabel="y" summary="s" />,
    );
    expect(a.container.innerHTML).not.toContain("NaN");
    const b = render(
      <LineChart
        series={[{ name: "s", role: "noise", points: [{ x: 1, y: 2 }, { x: 2, y: 2 }] }]}
        xLabel="x"
        yLabel="y"
        xScale="log"
        summary="s"
      />,
    );
    expect(b.container.innerHTML).not.toContain("NaN");
  });
  it("adds a legend only beyond three series", () => {
    const mk = (n: number) =>
      Array.from({ length: n }, (_, i) => ({
        name: `s${i}`,
        role: "honest" as const,
        points: [{ x: 1, y: i }, { x: 2, y: i + 1 }],
      }));
    const few = render(<LineChart series={mk(3)} xLabel="x" yLabel="y" summary="s" />);
    expect(few.container.querySelector("[data-legend]")).toBeNull();
    const many = render(<LineChart series={mk(4)} xLabel="x" yLabel="y" summary="s" />);
    expect(many.container.querySelector("[data-legend]")).not.toBeNull();
  });
});

describe("GroupedBars", () => {
  const groups = [
    {
      label: "g1",
      bars: [
        { name: "a", value: 0.4, role: "honest" as const },
        { name: "b", value: 0.2, lo: 0.1, hi: 0.3, role: "protected" as const },
      ],
    },
    {
      label: "g2",
      bars: [
        { name: "a", value: 0, role: "honest" as const },
        { name: "b", value: 0.5, role: "protected" as const },
      ],
    },
  ];
  it("renders every bar, intervals, threshold and a tooltip", () => {
    const { container } = render(
      <GroupedBars groups={groups} yLabel="y" threshold={{ value: 0.3, label: "bar" }} summary="grouped" />,
    );
    expect(container.querySelectorAll("rect[data-bar]")).toHaveLength(4);
    expect(container.querySelectorAll("[data-interval]")).toHaveLength(1);
    expect(container.querySelector("line[data-threshold]")).not.toBeNull();
    expect(container.innerHTML).not.toContain("NaN");
    fireEvent.mouseEnter(container.querySelector("rect[data-bar]") as Element);
    expect(container.querySelector("[role='tooltip']")?.textContent).toContain("0.4");
  });
});
