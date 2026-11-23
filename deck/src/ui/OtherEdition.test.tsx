import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EDITIONS } from "../deck/editions";
import { buildRegistry } from "../deck/registry";
import { useDeck } from "../deck/store";
import { DEFAULT_POSE, type TheoryDef } from "../deck/types";
import { ThanksPanel } from "../theories/outro/thanks";
import { Frame } from "./Frame";
import { OtherEdition } from "./OtherEdition";

const opening: TheoryDef = {
  id: "intro",
  number: 0,
  title: "Opening",
  short: "Opening",
  Scene: () => null,
  Fallback: () => <svg viewBox="0 0 8 6" role="img" aria-label="still diagram" />,
  slides: [{ id: "intro/1", kind: "extra", title: "Title", badge: "illustration", pose: DEFAULT_POSE, step: 0, Panel: () => <h1>Title text</h1> }],
};

describe("the two editions point at each other", () => {
  beforeEach(() => {
    useDeck.setState({ index: 0, count: 28, fullCount: 92, edition: "full", overview: false, webgl: false, reducedMotion: true });
  });
  afterEach(() => {
    useDeck.setState({ edition: "full", fullCount: 0 });
  });

  it("the full deck offers the short version and says how long it is", () => {
    render(<OtherEdition />);
    const link = screen.getByRole("link", { name: "Open the short version" });
    expect(link).toHaveAttribute("href", "/?edition=brief");
    expect(link.parentElement).toHaveTextContent(`${EDITIONS.brief.slides?.length} slides and no code`);
  });

  it("the short version says what it is, with counts read from the deck, and offers the full deck", () => {
    useDeck.setState({ edition: "brief" });
    render(<OtherEdition />);
    const link = screen.getByRole("link", { name: "Open the full deck" });
    expect(link).toHaveAttribute("href", "/?edition=full");
    expect(link.parentElement).toHaveTextContent("This is the short version: 28 slides that sum up the full deck's 92.");
  });

  it("the opening slides carry the edition's name at the top", () => {
    const registry = buildRegistry([opening]);
    useDeck.getState().setCount(1);
    const { unmount } = render(<Frame registry={registry} />);
    expect(screen.getByText("PRISM-Rec explained")).toBeInTheDocument();
    unmount();
    useDeck.setState({ edition: "brief" });
    render(<Frame registry={registry} />);
    expect(screen.getByText("PRISM-Rec in brief")).toBeInTheDocument();
    expect(screen.queryByText("PRISM-Rec explained")).toBeNull();
  });
});

describe("the thank-you slide in each edition", () => {
  afterEach(() => {
    useDeck.setState({ edition: "full", fullCount: 0 });
  });

  it("offers the live sandbox in the full deck", () => {
    useDeck.setState({ edition: "full" });
    render(<ThanksPanel />);
    expect(screen.getByRole("button", { name: "The live sandbox" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open the short version" })).toBeInTheDocument();
    expect(screen.getByText(/from the start of this closing/)).toBeInTheDocument();
  });

  it("never offers a slide the short version leaves out, and offers the full deck in its place", () => {
    useDeck.setState({ edition: "brief" });
    render(<ThanksPanel />);
    const sandboxKept = (EDITIONS.brief.slides ?? []).includes("outro/1");
    expect(screen.queryByRole("button", { name: "The live sandbox" }) !== null).toBe(sandboxKept);
    expect(screen.getByRole("link", { name: "Open the full deck" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "All slides" })).toBeInTheDocument();
    expect(screen.getByText(/Dr\. Malika Acharya/)).toBeInTheDocument();
  });
});
