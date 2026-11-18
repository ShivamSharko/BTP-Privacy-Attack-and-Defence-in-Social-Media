import { useMemo, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent } from "react";
import hljs from "highlight.js/lib/core";
import python from "highlight.js/lib/languages/python";
import { code } from "../data";

hljs.registerLanguage("python", python);

/**
 * Splits highlight.js output into one HTML string per source line. Spans that cross a newline
 * (docstrings) are closed at the end of the line and re-opened at the start of the next, so
 * every line is balanced on its own.
 */
export function splitHighlighted(html: string): string[] {
  const lines: string[] = [];
  const open: string[] = [];
  let current = "";
  for (const part of html.split(/(<span[^>]*>|<\/span>|\n)/)) {
    if (part === "") continue;
    if (part === "\n") {
      lines.push(current + "</span>".repeat(open.length));
      current = open.join("");
    } else if (part.startsWith("<span")) {
      open.push(part);
      current += part;
    } else if (part === "</span>") {
      open.pop();
      current += part;
    } else {
      current += part;
    }
  }
  lines.push(current + "</span>".repeat(open.length));
  return lines;
}

function inRanges(n: number, ranges: [number, number][] | undefined): boolean {
  return !!ranges && ranges.some(([a, b]) => n >= Math.min(a, b) && n <= Math.max(a, b));
}

/** An excerpt of at most this many lines is shown whole. */
export const WHOLE_LINES = 26;
/** A longer one is shown this many lines at a time: the deck has no scrollers. */
export const PAGE_LINES = 24;
/** Lines kept in view from the page before, so the reader does not lose their place. */
const OVERLAP = 2;

/**
 * Where the first page of a long excerpt starts (an index into its lines): two lines above
 * the first highlighted line, so the point of the slide is in view without any paging.
 */
export function firstPageStart(length: number, firstLine: number, ranges: [number, number][] | undefined): number {
  if (length <= WHOLE_LINES) return 0;
  const tops = (ranges ?? []).map(([a, b]) => Math.min(a, b) - firstLine).filter((i) => i >= 0 && i < length);
  if (tops.length === 0) return 0;
  return Math.max(0, Math.min(Math.min(...tops) - OVERLAP, length - PAGE_LINES));
}

function Excerpt({ id, refKey, ranges }: { id: string; refKey: string; ranges?: [number, number][] }) {
  const c = code(refKey);
  const lines = useMemo(() => splitHighlighted(hljs.highlight(c.source, { language: "python" }).value), [c.source]);
  const longest = useMemo(() => Math.max(...c.source.split("\n").map((line) => line.length)), [c.source]);
  const paged = lines.length > WHOLE_LINES;
  const [start, setStart] = useState(() => firstPageStart(lines.length, c.start, ranges));
  const last = Math.max(0, lines.length - PAGE_LINES);
  const from = paged ? Math.min(start, last) : 0;
  const to = paged ? from + PAGE_LINES : lines.length;
  const elsewhere = paged && (ranges ?? []).some(([a, b]) => Math.max(a, b) < c.start + from || Math.min(a, b) >= c.start + to);
  return (
    <div className="code" id={id} style={{ "--cols": Math.max(60, longest) } as CSSProperties}>
      <div className="code__head">
        <span className="code__file">{c.file}</span>
        <span className="code__range">
          lines {c.start}
          {"–"}
          {c.end}
        </span>
        <span className="code__name">{c.name}</span>
      </div>
      <pre className="code__pre" tabIndex={0} aria-label={`${c.name} source`}>
        {lines.slice(from, to).map((html, k) => {
          const n = c.start + from + k;
          const hl = inRanges(n, ranges);
          return (
            <span className="code__row" key={n} data-line={n} data-hl={hl ? "true" : undefined}>
              <span className="code__num" aria-hidden="true">
                {n}
              </span>
              <span className="code__src" data-code="true" dangerouslySetInnerHTML={{ __html: html || " " }} />
            </span>
          );
        })}
      </pre>
      {paged ? (
        <div className="code__pager">
          <button type="button" className="btn" data-kind="quiet" disabled={from === 0} onClick={() => setStart(Math.max(0, from - (PAGE_LINES - OVERLAP)))}>
            Earlier lines
          </button>
          <button type="button" className="btn" data-kind="quiet" disabled={from >= last} onClick={() => setStart(Math.min(last, from + (PAGE_LINES - OVERLAP)))}>
            Later lines
          </button>
          <span className="code__showing" aria-live="polite">
            Showing lines {c.start + from}
            {"–"}
            {c.start + to - 1} of this {lines.length}-line excerpt
            {elsewhere ? "; more highlighted lines on another page" : ""}
          </span>
        </div>
      ) : null}
    </div>
  );
}

export interface CodeViewProps {
  refs: string[];
  highlight?: Record<string, [number, number][]>;
}

export function CodeView({ refs, highlight }: CodeViewProps) {
  const [active, setActive] = useState(0);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const metas = refs.map((r) => ({ key: r, ...code(r) })); // throws on an unknown ref
  const current = Math.min(active, Math.max(refs.length - 1, 0));
  const uid = useRef(`cv${Math.random().toString(36).slice(2, 8)}`).current;

  const move = (to: number) => {
    const next = (to + refs.length) % refs.length;
    setActive(next);
    tabRefs.current[next]?.focus();
  };
  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    if (e.key === "ArrowRight") move(i + 1);
    else if (e.key === "ArrowLeft") move(i - 1);
    else if (e.key === "Home") move(0);
    else if (e.key === "End") move(refs.length - 1);
    else return;
    e.preventDefault();
  };

  if (refs.length === 0) return <div className="codeview" />;
  const shown = metas[current];
  return (
    <div className="codeview">
      {refs.length > 1 && (
        <div className="codeview__tabs" role="tablist" aria-label="Code excerpts">
          {metas.map((m, i) => (
            <button
              key={m.key}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`${uid}-tab-${i}`}
              aria-selected={i === current}
              aria-controls={`${uid}-panel`}
              tabIndex={i === current ? 0 : -1}
              className="codeview__tab"
              onClick={() => setActive(i)}
              onKeyDown={(e) => onKey(e, i)}
            >
              {m.name}
            </button>
          ))}
        </div>
      )}
      {refs.length > 1 ? (
        <div role="tabpanel" aria-labelledby={`${uid}-tab-${current}`}>
          <Excerpt key={shown.key} id={`${uid}-panel`} refKey={shown.key} ranges={highlight?.[shown.key]} />
        </div>
      ) : (
        <Excerpt key={shown.key} id={`${uid}-panel`} refKey={shown.key} ranges={highlight?.[shown.key]} />
      )}
    </div>
  );
}
