import type { ReactNode } from "react";
import { inEdition } from "../deck/editions";
import { useEdition } from "../deck/store";

type Slides = string | readonly string[];
const list = (slides: Slides): readonly string[] => (typeof slides === "string" ? [slides] : slides);

/**
 * Words shown only when the edition on screen leaves out every slide named. Use it for one
 * line that explains a term the named slide explains (what AUC is, what clipping does), so a
 * slide still reads on its own in the short version. In the full deck it shows nothing.
 * It may explain; it must not carry a result the full deck does not show.
 */
export function Without({ slide, children }: { slide: Slides; children: ReactNode }) {
  const edition = useEdition();
  return list(slide).some((id) => inEdition(edition, id)) ? null : <>{children}</>;
}

/**
 * Words shown only when the edition on screen has every slide named. Use it for a pointer at
 * another slide ("on the next slide", "in the code"), so no edition points at a slide it lacks.
 */
export function With({ slide, children }: { slide: Slides; children: ReactNode }) {
  const edition = useEdition();
  return list(slide).every((id) => inEdition(edition, id)) ? <>{children}</> : null;
}
