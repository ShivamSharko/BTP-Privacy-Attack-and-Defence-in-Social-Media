import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Fit, fitScale, SMALLEST_FIT } from "./Fit";

describe("fitScale", () => {
  it("is 1 when the content already fits", () => {
    expect(fitScale(800, 800)).toBe(1);
    expect(fitScale(800, 620)).toBe(1);
  });
  it("is the ratio of room to content when it does not", () => {
    expect(fitScale(800, 1000)).toBeCloseTo(0.8, 12);
  });
  it("leaves the padding out of the ratio, because padding does not shrink", () => {
    // 700 of room for 900 of content, with 100 of padding on both.
    expect(fitScale(800, 1000, 100)).toBeCloseTo(700 / 900, 12);
  });
  it("never goes below the smallest readable scale", () => {
    expect(fitScale(100, 10_000)).toBe(SMALLEST_FIT);
  });
  it("is 1 for a box that cannot be measured", () => {
    expect(fitScale(0, 0)).toBe(1);
    expect(fitScale(0, 500)).toBe(1);
  });
});

describe("Fit", () => {
  it("renders its children and records the scale it settled on", () => {
    const { container, getByText } = render(
      <div className="box">
        <Fit box=".box">
          <p>content</p>
        </Fit>
      </div>,
    );
    expect(getByText("content")).toBeInTheDocument();
    expect(container.querySelector(".fit")?.getAttribute("data-fit")).toBe("1.000");
  });
});
