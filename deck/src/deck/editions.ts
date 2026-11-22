import { buildRegistry, type Registry } from "./registry";
import type { TheoryDef } from "./types";

export type EditionId = "full" | "brief";

/**
 * One deck, two editions. The full edition shows every slide of every theory folder. The brief
 * edition shows a chosen few of the same slides, in the same order, for a short presentation.
 * No slide is written twice: an edition is only a list of slide ids.
 */
export interface Edition {
  id: EditionId;
  /** The browser tab title. */
  name: string;
  /** The label at the top of the opening slides. */
  head: string;
  /** Where this edition is hosted. */
  url: string;
  /** The slide ids this edition keeps. null keeps every slide. */
  slides: readonly string[] | null;
}

/** The brief edition never grows past this many slides. */
export const BRIEF_LIMIT = 30;

/**
 * The brief edition: three attack and defence pairs (the update, the model, the crowd), each with
 * the slide that explains it and the measurement that settles it, then gossip between friends, the
 * ledger audit, the trade-off picture and what is not claimed. No code slides: the code stays in
 * the full deck. Free-riding, participation and the method are left out whole.
 */
const BRIEF_SLIDES: readonly string[] = [
  "intro/1", "intro/3", "intro/4", "intro/5", "intro/7",
  "model/4",
  "fed/1", "fed/2",
  "leak/1", "leak/2", "leak/4",
  "secagg/1", "secagg/5",
  "mia/1", "mia/4",
  "dp/1", "dp/3", "dp/4", "dp/5",
  "acct/1",
  "poison/1", "poison/2", "poison/5", "poison/6",
  "gossip/1", "gossip/4",
  "ledger/5",
  "outro/2", "outro/7", "outro/10",
];

export const EDITIONS: Record<EditionId, Edition> = {
  full: {
    id: "full",
    name: "PRISM-Rec Explained",
    head: "PRISM-Rec explained",
    url: "https://prism-rec-deck.vercel.app",
    slides: null,
  },
  brief: {
    id: "brief",
    name: "PRISM-Rec in Brief",
    head: "PRISM-Rec in brief",
    url: "https://prism-rec-brief.vercel.app",
    slides: BRIEF_SLIDES,
  },
};

/**
 * Which edition to show. `?edition=brief` or `?edition=full` in the address wins, so either
 * edition can be opened from any copy of the deck. Otherwise the build decides: a build made
 * with VITE_EDITION=brief opens the brief edition, any other build opens the full one.
 */
export function pickEdition(address: string, build: string | undefined): EditionId {
  const asked = /[?&]edition=(brief|full)(?![\w-])/.exec(address)?.[1];
  if (asked === "brief" || asked === "full") return asked;
  return build === "brief" ? "brief" : "full";
}

/** True when the edition shows the slide. */
export function inEdition(edition: Edition, slideId: string): boolean {
  return edition.slides === null || edition.slides.includes(slideId);
}

/** True when the edition shows at least one slide of the topic, so a button that opens the topic has somewhere to go. */
export function topicInEdition(edition: Edition, topic: string): boolean {
  return edition.slides === null || edition.slides.some((id) => id.split("/")[0] === topic);
}

export interface Cut extends Registry {
  /** Ids the edition lists that no theory folder has. Always empty in a healthy deck. */
  missing: string[];
}

/**
 * The registry an edition shows: the same theories with only the kept slides, in deck order.
 * A theory left with no slide is dropped, so the rail and the 3D world skip its station.
 */
export function cutRegistry(registry: Registry, edition: Edition): Cut {
  if (edition.slides === null) return { ...registry, missing: [] };
  const keep = new Set(edition.slides);
  const theories = registry.theories
    .map((theory) => ({ ...theory, slides: theory.slides.filter((slide) => keep.has(slide.id)) }))
    .filter((theory) => theory.slides.length > 0);
  const missing = edition.slides.filter((id) => !registry.ids.includes(id));
  return { ...buildRegistry(theories, registry.failed), missing };
}

const isConcept = (theory: TheoryDef) => theory.number >= 1 && theory.number <= 13;

/**
 * The number shown beside a topic, or null for the opening and closing. The full deck shows the
 * topic's own number. A shorter edition counts the concepts it shows, so the numbers on screen
 * run 1, 2, 3 with no gap where a topic was left out.
 */
export function topicNumber(registry: Registry, theory: TheoryDef, edition: Edition): number | null {
  if (!isConcept(theory)) return null;
  return edition.slides === null ? theory.number : registry.theories.filter(isConcept).indexOf(theory) + 1;
}

/**
 * The address of another edition. From a hosted copy it is the other hosted copy; from anywhere
 * else (a laptop, a preview build) it is the same page with `?edition=` set, so the link works
 * offline too.
 */
export function editionHref(target: Edition, origin: string, pathname: string): string {
  const hosted = Object.values(EDITIONS).some((edition) => edition.url === origin);
  return hosted ? target.url : `${pathname}?edition=${target.id}`;
}
