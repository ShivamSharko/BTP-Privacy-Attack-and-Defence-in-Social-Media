import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { buildRegistry } from "../deck/registry";
import { useDeck } from "../deck/store";
import { DEFAULT_POSE, type TheoryDef } from "../deck/types";
import { Frame, whereInTheory } from "./Frame";

const Scene = () => null;
const Fallback = () => (
  <svg viewBox="0 0 800 600" role="img" aria-label="still diagram">
    <circle cx="400" cy="300" r="10" />
  </svg>
);

const toy: TheoryDef = {
  id: "toy",
  number: 3,
  title: "A toy concept",
  short: "Toy",
  Scene,
  Fallback,
  slides: [
    { id: "toy/1", kind: "theory", title: "First idea", badge: "illustration", pose: DEFAULT_POSE, step: 0, Panel: () => <h1>Panel one text</h1> },
    { id: "toy/2", kind: "theory", title: "Second idea", badge: "illustration", pose: DEFAULT_POSE, step: 1, Panel: () => <h1>Panel two text</h1> },
    {
      id: "toy/3",
      kind: "impact",
      title: "What it did",
      badge: "measured",
      sources: ["privacy_utility"],
      pose: DEFAULT_POSE,
      step: 0,
      layout: "stage",
      Panel: () => <h1>Impact text</h1>,
      Stage: () => <p>Stage figures</p>,
    },
    { id: "toy/4", kind: "code", title: "The code", badge: "source", pose: DEFAULT_POSE, step: 0, Panel: () => <h1>Code text</h1> },
  ],
};

const registry = buildRegistry([toy]);

describe("slide frame without WebGL", () => {
  beforeEach(() => {
    useDeck.setState({ index: 0, count: 0, overview: false, webgl: false, reducedMotion: true });
    useDeck.getState().setCount(registry.slides.length);
  });

  it("shows the still diagram and the text when 3D is unavailable", () => {
    render(<Frame registry={registry} />);
    expect(screen.getByText("Panel one text")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "still diagram" })).toBeInTheDocument();
    expect(screen.getByText(/3D is not available/)).toBeInTheDocument();
    expect(document.querySelector("canvas")).toBeNull();
  });

  it("shows the badge with its sources and the position inside the theory", () => {
    render(<Frame registry={registry} />);
    expect(screen.getByText("Illustration")).toBeInTheDocument();
    expect(screen.getByText("Theory 1 of 2")).toBeInTheDocument();
    useDeck.getState().go(2);
  });

  it("shows the stage card and the source files on an impact slide", () => {
    useDeck.getState().go(2);
    render(<Frame registry={registry} />);
    expect(screen.getByText("Stage figures")).toBeInTheDocument();
    expect(screen.getByText("Measured")).toBeInTheDocument();
    expect(screen.getByText("results/privacy_utility.json")).toBeInTheDocument();
  });

  it("moves with the rail buttons and stops at both ends", async () => {
    const user = userEvent.setup();
    render(<Frame registry={registry} />);
    expect(screen.getByRole("button", { name: "Previous slide" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Next slide" }));
    expect(screen.getByText("Panel two text")).toBeInTheDocument();
    expect(screen.getByText("2 / 4")).toBeInTheDocument();
    useDeck.getState().last();
    expect(await screen.findByText("Code text")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next slide" })).toBeDisabled();
  });

  it("opens the overview and jumps to a slide from it", async () => {
    const user = userEvent.setup();
    render(<Frame registry={registry} />);
    await user.click(screen.getByRole("button", { name: /Show all slides/ }));
    const dialog = screen.getByRole("dialog", { name: "All slides" });
    expect(dialog).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "What it did" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByText("Impact text")).toBeInTheDocument();
  });

  it("names the position for each kind", () => {
    expect(whereInTheory(registry.slides[0])).toBe("Theory 1 of 2");
    expect(whereInTheory(registry.slides[2])).toBe("Impact");
    expect(whereInTheory(registry.slides[3])).toBe("Code");
  });
});
