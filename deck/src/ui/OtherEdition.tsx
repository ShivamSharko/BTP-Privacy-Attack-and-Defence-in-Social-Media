import { EDITIONS, editionHref } from "../deck/editions";
import { useDeck, useEdition } from "../deck/store";

/**
 * One line that says which edition this is and links to the other one. The slide counts are
 * read from the deck itself, so the sentence stays true when slides are added or removed.
 */
export function OtherEdition() {
  const edition = useEdition();
  const count = useDeck((s) => s.count);
  const fullCount = useDeck((s) => s.fullCount);
  const other = edition.id === "brief" ? EDITIONS.full : EDITIONS.brief;
  const href = editionHref(other, window.location.origin, window.location.pathname);
  if (edition.id === "brief") {
    return (
      <p className="caption edition">
        This is the short version: {count} slides that sum up the full deck's {fullCount}.{" "}
        <a href={href}>Open the full deck</a> for every step, the code behind each result and the live sandbox.
      </p>
    );
  }
  return (
    <p className="caption edition">
      Short of time? <a href={href}>Open the short version</a>, {other.slides?.length ?? 0} slides and no code.
    </p>
  );
}
