/** The address bar holds the slide, so a reload or a shared link lands on the same slide. */
export function toHash(slideId: string): string {
  return `#/${slideId}`;
}

/** Index of the slide named by the hash, or 0 when the hash names no slide. */
export function fromHash(hash: string, slideIds: readonly string[]): number {
  const id = hash.replace(/^#\/?/, "").split("?")[0];
  const index = slideIds.indexOf(id);
  return index < 0 ? 0 : index;
}
