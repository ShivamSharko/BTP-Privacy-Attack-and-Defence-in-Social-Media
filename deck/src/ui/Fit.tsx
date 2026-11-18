import { useLayoutEffect, useRef } from "react";
import type { ReactNode } from "react";

/** Below this the text is too small to read, so the content is left cut and the overflow check fails. */
export const SMALLEST_FIT = 0.5;

/**
 * The scale at which content fits its box. `have` is the box, `need` is what the content
 * takes at full size, and `pad` is the part of both that does not scale (the box's padding).
 */
export function fitScale(have: number, need: number, pad = 0): number {
  const room = have - pad;
  const content = need - pad;
  if (!(content > 0) || !(room > 0) || content <= room) return 1;
  return Math.max(SMALLEST_FIT, room / content);
}

/**
 * Shrinks its children until the box around them holds them. The deck has no scrollers:
 * a slide that is too tall for the window is drawn smaller instead. `box` is a selector for
 * the ancestor that must not overflow.
 */
export function Fit({ box, children }: { box: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const inner = ref.current;
    const outer = inner?.closest<HTMLElement>(box);
    if (!inner || !outer) return;

    const overflows = () => outer.scrollHeight > outer.clientHeight + 1 || outer.scrollWidth > outer.clientWidth + 1;
    const fit = () => {
      inner.style.zoom = "";
      let scale = 1;
      if (overflows()) {
        const style = getComputedStyle(outer);
        const padY = (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);
        const padX = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
        scale = Math.min(fitScale(outer.clientHeight, outer.scrollHeight, padY), fitScale(outer.clientWidth, outer.scrollWidth, padX));
        inner.style.zoom = String(scale);
        for (let tries = 0; tries < 28 && scale > SMALLEST_FIT && overflows(); tries++) {
          scale = Math.max(SMALLEST_FIT, scale * 0.975);
          inner.style.zoom = String(scale);
        }
      }
      inner.dataset.fit = scale.toFixed(3);
    };

    fit();
    if (typeof ResizeObserver === "undefined") return;
    // Refit on the next frame, not inside the observer: changing the size it watches from
    // inside its own callback makes the browser report a loop.
    let frame = 0;
    const later = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(fit);
    };
    const observer = new ResizeObserver(later);
    observer.observe(inner);
    observer.observe(outer);
    void document.fonts?.ready.then(later);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [box]);

  return (
    <div className="fit" ref={ref}>
      {children}
    </div>
  );
}
