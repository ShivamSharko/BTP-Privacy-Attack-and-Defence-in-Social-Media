/** The address bar holds the slide, so a reload or a shared link lands on the same slide. */
export function toHash(slideId: string): string {
  return `#/${slideId}`;
}

/**
 * The address of a slide on this page. The query before the hash is kept, and so is one written
 * after the slide (`#/dp/1?edition=brief`, `#/dp/1?perf=1`), so a setting given either way survives
 * every slide change and a reload.
 */
export function addressOf(slideId: string, location: { pathname: string; search: string; hash: string }): string {
  const tail = location.hash.split("?")[1];
  return `${location.pathname}${location.search}${toHash(slideId)}${tail ? `?${tail}` : ""}`;
}

/**
 * Index of the slide a hash asks for, or null when this deck shows nothing it could mean. A
 * slide this deck does not show (the brief edition leaves most out) resolves to the first slide
 * it does show of the same topic, so a link written for the full deck still lands in the right
 * place.
 */
export function resolveHash(hash: string, slideIds: readonly string[]): number | null {
  const id = hash.replace(/^#\/?/, "").split("?")[0];
  const index = slideIds.indexOf(id);
  if (index >= 0) return index;
  const topic = id.split("/")[0];
  const sameTopic = topic ? slideIds.findIndex((other) => other.split("/")[0] === topic) : -1;
  return sameTopic < 0 ? null : sameTopic;
}

/**
 * What a new hash should do while the deck is open: the index of the slide to open, or null to
 * stay on the current slide. A link inside a slide can name a topic this edition leaves out; the
 * deck then stays where it is, because jumping to the title would lose the presenter's place.
 * An address that no edition knows opens the first slide, as it does on load.
 */
export function followHash(hash: string, slideIds: readonly string[], everySlideId: readonly string[]): number | null {
  const shown = resolveHash(hash, slideIds);
  if (shown !== null) return shown;
  return resolveHash(hash, everySlideId) === null ? 0 : null;
}

/** The slide to open when the deck loads: the one the hash asks for, or the first. */
export function fromHash(hash: string, slideIds: readonly string[]): number {
  return resolveHash(hash, slideIds) ?? 0;
}
