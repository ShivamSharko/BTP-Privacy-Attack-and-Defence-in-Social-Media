import { render } from "@testing-library/react";
import { briefSlide } from "../deck/editions";
import type { TheoryDef } from "../deck/types";

/**
 * The theory as the brief edition shows it: only the slides that have a brief variant, each in
 * that variant. Pass it to renderAllSlides and longPanels to test a folder's brief slides.
 */
export function briefOf(theory: TheoryDef): TheoryDef {
  return { ...theory, slides: theory.slides.filter((slide) => slide.brief).map(briefSlide) };
}

/**
 * Renders every Panel, Stage and the Fallback of a theory in jsdom and returns all the text.
 * A missing result key, an unknown code reference or any other error thrown while rendering
 * fails the calling test.
 */
export function renderAllSlides(theory: TheoryDef): string {
  let text = "";
  for (const slide of theory.slides) {
    const Panel = slide.Panel;
    const Stage = slide.Stage;
    const view = render(
      <>
        <Panel />
        {Stage ? <Stage /> : null}
      </>,
    );
    text += `\n[${slide.id}] ${view.container.textContent ?? ""}`;
    view.unmount();
  }
  const Fallback = theory.Fallback;
  const fallback = render(<Fallback />);
  if (!fallback.container.querySelector("svg")) throw new Error(`${theory.id}: Fallback must render an <svg>`);
  fallback.unmount();
  return text;
}

/**
 * Slides whose panel text runs past the limit. A panel holds about 130 words; more text
 * belongs on another slide. Counts headline, paragraphs and notes, not the controls.
 */
export function longPanels(theory: TheoryDef, limit = 150): string[] {
  const long: string[] = [];
  for (const slide of theory.slides) {
    const Panel = slide.Panel;
    const view = render(<Panel />);
    const words = Array.from(view.container.querySelectorAll("h1, p, .note, li"))
      .filter((el) => !el.closest(".controls"))
      .map((el) => el.textContent ?? "")
      .join(" ")
      .split(/\s+/)
      .filter(Boolean).length;
    if (words > limit) long.push(`${slide.id}: ${words} words`);
    view.unmount();
  }
  return long;
}
