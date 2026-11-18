import { RESULT_FILES } from "../data";
import type { SlideKind, TheoryDef } from "./types";

const ORDER: Record<Exclude<SlideKind, "extra">, number> = { theory: 0, impact: 1, code: 2 };

/**
 * The rules every theory folder must keep. Returns the problems found; an empty list means
 * the theory is well formed.
 */
export function checkTheory(theory: TheoryDef): string[] {
  const problems: string[] = [];
  const { id, number, slides } = theory;
  if (theory.short.length > 14) problems.push(`${id}: short label "${theory.short}" is longer than 14 characters`);
  if (slides.length === 0) problems.push(`${id}: no slides`);

  slides.forEach((slide, i) => {
    const expected = `${id}/${i + 1}`;
    if (slide.id !== expected) problems.push(`${id}: slide ${i + 1} has id "${slide.id}", expected "${expected}"`);
    if (slide.kind === "impact") {
      if (slide.badge === "illustration") problems.push(`${slide.id}: an impact slide cannot be badged illustration`);
      if (!slide.sources || slide.sources.length === 0) problems.push(`${slide.id}: an impact slide must list its sources`);
    }
    if (slide.kind === "code" && slide.badge !== "source") problems.push(`${slide.id}: a code slide must be badged source`);
    if (slide.kind !== "code" && slide.badge === "source") problems.push(`${slide.id}: only code slides are badged source`);
    for (const source of slide.sources ?? []) {
      if (!RESULT_FILES.includes(source)) problems.push(`${slide.id}: unknown source "${source}"`);
    }
    if (slide.layout === "stage" && !slide.Stage) problems.push(`${slide.id}: layout "stage" needs a Stage`);
    if (!slide.title.trim()) problems.push(`${slide.id}: empty title`);
  });

  if (number === 0 || number === 14) {
    for (const slide of slides) {
      if (slide.kind !== "extra") problems.push(`${slide.id}: opening and closing slides must be kind "extra"`);
    }
    return problems;
  }

  // Concepts 1 to 13: theory slides, then impact slides, then code slides; extras may sit anywhere.
  let stage = -1;
  const seen = new Set<SlideKind>();
  for (const slide of slides) {
    if (slide.kind === "extra") continue;
    const rank = ORDER[slide.kind];
    if (rank < stage) problems.push(`${slide.id}: a ${slide.kind} slide comes after a later kind (order is theory, impact, code)`);
    stage = Math.max(stage, rank);
    seen.add(slide.kind);
  }
  for (const kind of ["theory", "impact", "code"] as const) {
    if (!seen.has(kind)) problems.push(`${id}: no ${kind} slide`);
  }
  return problems;
}
