import type { Registry } from "../deck/registry";
import { useDeck } from "../deck/store";

/** The line along the bottom: one stop per concept, ticks for the slides of the current one. */
export function Rail({ registry }: { registry: Registry }) {
  const index = useDeck((s) => s.index);
  const go = useDeck((s) => s.go);
  const next = useDeck((s) => s.next);
  const prev = useDeck((s) => s.prev);
  const toggleOverview = useDeck((s) => s.toggleOverview);
  const count = registry.slides.length;
  const flat = registry.slides[Math.min(index, count - 1)];
  const currentTheory = registry.theories.indexOf(flat.theory);

  return (
    <nav className="rail" aria-label="Slides">
      <div className="rail__line">
        {registry.theories.map((theory, i) => {
          const first = registry.slides.findIndex((s) => s.theory === theory);
          const state = i < currentTheory ? "done" : i === currentTheory ? "current" : "ahead";
          return (
            <button
              key={theory.id}
              type="button"
              className="rail__stop"
              data-state={state}
              aria-current={state === "current" ? "step" : undefined}
              aria-label={`${theory.title}, ${theory.slides.length} slides`}
              onClick={() => go(first)}
            >
              <span className="rail__dot" />
              {state === "current" ? (
                <span className="rail__ticks" aria-hidden="true">
                  {theory.slides.map((s, j) => (
                    <span key={s.id} className="rail__tick" data-on={j <= flat.local} />
                  ))}
                </span>
              ) : null}
              <span className="rail__label">{theory.short}</span>
            </button>
          );
        })}
      </div>
      <button type="button" className="btn" data-kind="quiet" onClick={toggleOverview} aria-label="Show all slides (O)">
        All slides
      </button>
      <span className="rail__count" aria-live="polite" aria-label={`Slide ${flat.local + 1} of ${flat.theory.slides.length} in ${flat.theory.title}`}>
        {flat.local + 1} / {flat.theory.slides.length}
      </span>
      <div className="rail__nav">
        <button type="button" onClick={prev} disabled={index === 0} aria-label="Previous slide">
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <path d="M9 2 4 7l5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
        <button type="button" onClick={next} disabled={index >= count - 1} aria-label="Next slide">
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <path d="m5 2 5 5-5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </nav>
  );
}
