import { describe, expect, it } from "vitest";
import { panelShift } from "./CameraRig";

describe("panelShift", () => {
  it("is half the text column of the 1920x1080 design: (640 + 2 x 48) / 2", () => {
    expect(panelShift(1920, 1080)).toBeCloseTo(368, 0);
  });
  it("scales with the width in a 16:9 window", () => {
    expect(panelShift(1280, 720)).toBeCloseTo((368 * 1280) / 1920, 0);
  });
  it("follows the height in a window wider than 16:9, as the style sheet does", () => {
    expect(panelShift(2560, 1080)).toBeCloseTo(368, 0);
    expect(panelShift(1536, 730)).toBeCloseTo((368 * 730) / 1080, 0);
  });
  it("follows the width in a window taller than 16:9", () => {
    expect(panelShift(1024, 768)).toBeCloseTo((368 * 1024) / 1920, 0);
  });
});
