import { describe, expect, it } from "vitest";
import { keyAction } from "./keys";

const body = { tag: "body" };

describe("keyboard", () => {
  it("navigates from the page", () => {
    expect(keyAction("ArrowRight", body)).toBe("next");
    expect(keyAction(" ", body)).toBe("next");
    expect(keyAction("PageDown", body)).toBe("next");
    expect(keyAction("ArrowLeft", body)).toBe("prev");
    expect(keyAction("PageUp", body)).toBe("prev");
    expect(keyAction("Home", body)).toBe("first");
    expect(keyAction("End", body)).toBe("last");
    expect(keyAction("o", body)).toBe("overview");
    expect(keyAction("F", body)).toBe("fullscreen");
    expect(keyAction("t", body)).toBe("theme");
    expect(keyAction("r", body)).toBe("reset");
    expect(keyAction("x", body)).toBeNull();
  });

  it("leaves arrows to a focused slider but still lets Space advance", () => {
    const slider = { tag: "input", type: "range" };
    expect(keyAction("ArrowRight", slider)).toBeNull();
    expect(keyAction("ArrowLeft", slider)).toBeNull();
    expect(keyAction("PageDown", slider)).toBe("next");
    expect(keyAction(" ", slider)).toBe("next");
  });

  it("leaves arrows and Space to radio groups and tabs", () => {
    const radio = { tag: "input", type: "radio" };
    expect(keyAction("ArrowRight", radio)).toBeNull();
    expect(keyAction(" ", radio)).toBeNull();
    const tab = { tag: "button", role: "tab" };
    expect(keyAction("ArrowRight", tab)).toBeNull();
    expect(keyAction("Enter", tab)).toBeNull();
  });

  it("leaves Space and Enter to a focused button, but arrows still navigate", () => {
    const button = { tag: "button" };
    expect(keyAction(" ", button)).toBeNull();
    expect(keyAction("Enter", button)).toBeNull();
    expect(keyAction("ArrowRight", button)).toBe("next");
  });

  it("ignores everything typed into a text field except Escape", () => {
    const text = { tag: "input", type: "text" };
    expect(keyAction("ArrowRight", text)).toBeNull();
    expect(keyAction("r", text)).toBeNull();
    expect(keyAction("Escape", text)).toBe("close");
    expect(keyAction("t", { tag: "div", editable: true })).toBeNull();
  });

  it("ignores shortcuts with a modifier held, so the browser keeps Ctrl+R and friends", () => {
    expect(keyAction("r", body, true)).toBeNull();
    expect(keyAction("f", body, true)).toBeNull();
  });
});
