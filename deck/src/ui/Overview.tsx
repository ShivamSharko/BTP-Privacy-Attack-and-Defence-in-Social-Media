import { useEffect, useRef } from "react";
import { topicNumber } from "../deck/editions";
import type { Registry } from "../deck/registry";
import { useDeck, useEdition } from "../deck/store";
import { Fit } from "./Fit";
import { OtherEdition } from "./OtherEdition";

/** Every slide on one page, grouped by concept. Opened with O, closed with O or Escape. */
export function Overview({ registry }: { registry: Registry }) {
  const index = useDeck((s) => s.index);
  const go = useDeck((s) => s.go);
  const toggleOverview = useDeck((s) => s.toggleOverview);
  const current = useRef<HTMLButtonElement>(null);
  const edition = useEdition();

  useEffect(() => {
    current.current?.focus();
  }, []);

  return (
    <div className="overview" role="dialog" aria-modal="true" aria-label="All slides">
      <Fit box=".overview">
      <h2>All slides</h2>
      <OtherEdition />
      {registry.theories.map((theory) => {
        const number = topicNumber(registry, theory, edition);
        return (
        <div className="overview__group" key={theory.id}>
          <div>
            <strong>
              {number !== null ? `${number}. ` : ""}
              {theory.title}
            </strong>
          </div>
          <div className="overview__slides">
            {theory.slides.map((slide) => {
              const i = registry.ids.indexOf(slide.id);
              return (
                <button
                  key={slide.id}
                  ref={i === index ? current : undefined}
                  type="button"
                  className="overview__slide"
                  data-kind={slide.kind}
                  data-current={i === index}
                  onClick={() => go(i)}
                >
                  {slide.title}
                </button>
              );
            })}
          </div>
        </div>
        );
      })}
      <p>
        Right or Space goes to the next slide and Left goes back. O opens this page, F is fullscreen, T switches
        between dark and light, R resets the scene. Drag the scene to look around it.
      </p>
      <button type="button" className="btn" onClick={toggleOverview}>
        Back to the slide
      </button>
      </Fit>
    </div>
  );
}
