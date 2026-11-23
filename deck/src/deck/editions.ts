import { buildRegistry, type Registry } from "./registry";
import type { SlideDef, TheoryDef } from "./types";

export type EditionId = "full" | "brief";

/**
 * One deck, two editions. The full edition shows every slide of every theory folder. The brief
 * edition shows thirty slides for a short presentation. Each of them sits at the place of one
 * slide of the full deck and reuses that topic's 3D scene, but it has its own headline, text and
 * figure (the slide's `brief` variant), written to carry the main points of the whole topic.
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
 * The brief edition, slide by slide. Every topic of the deck is here: the opening, the model and
 * a training round, three attack and defence pairs (the update, the model, the crowd), free-riding,
 * gossip between friends, participation, the ledger, the method and the closing. A topic gets one
 * slide for the idea and, where a measurement settles it, one for the result. No code slides: the
 * code stays in the full deck. What each slide must say is in docs/BRIEF_EDITION.md.
 */
const BRIEF_SLIDES: readonly string[] = [
  "intro/1", "intro/3", "intro/4", "intro/5", "intro/6",
  "model/4",
  "fed/1",
  "leak/1", "leak/4",
  "secagg/1", "secagg/5",
  "mia/1", "mia/4",
  "dp/1", "dp/3", "dp/5", "dp/6",
  "acct/1",
  "poison/1", "poison/5", "poison/6",
  "freeride/3",
  "gossip/1", "gossip/4",
  "part/3",
  "ledger/5",
  "method/1",
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

/** A slide as the brief edition shows it: its brief variant where it has one, the slide itself otherwise. */
export function briefSlide(slide: SlideDef): SlideDef {
  const variant = slide.brief;
  if (!variant) return slide;
  return {
    id: slide.id,
    kind: slide.kind,
    title: variant.title,
    badge: variant.badge ?? slide.badge,
    sources: variant.sources ?? slide.sources,
    pose: variant.pose ?? slide.pose,
    step: variant.step ?? slide.step,
    layout: variant.layout ?? (variant.Stage ? "stage" : "split"),
    Panel: variant.Panel,
    Stage: variant.Stage,
  };
}

export interface Cut extends Registry {
  /** Ids the edition lists that no theory folder has. Always empty in a healthy deck. */
  missing: string[];
}

/**
 * The registry an edition shows: the same theories with only the kept slides, in deck order.
 * The brief edition shows each kept slide in its brief variant. A theory left with no slide is
 * dropped, so the rail and the 3D world skip its station.
 */
export function cutRegistry(registry: Registry, edition: Edition): Cut {
  if (edition.slides === null) return { ...registry, missing: [] };
  const keep = new Set(edition.slides);
  const theories = registry.theories
    .map((theory) => ({
      ...theory,
      slides: theory.slides.filter((slide) => keep.has(slide.id)).map((slide) => (edition.id === "brief" ? briefSlide(slide) : slide)),
    }))
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
