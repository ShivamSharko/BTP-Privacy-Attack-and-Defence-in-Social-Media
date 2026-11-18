import katex from "katex";
import { type ReactNode, useMemo } from "react";

/** Slide headline. One per panel. */
export function H({ children }: { children: ReactNode }) {
  return <h1>{children}</h1>;
}

export function P({ children }: { children: ReactNode }) {
  return <p>{children}</p>;
}

/** A formula in LaTeX notation, rendered by KaTeX (bundled, no network). */
export function Tex({ children, block = false }: { children: string; block?: boolean }) {
  const html = useMemo(
    () => katex.renderToString(children, { displayMode: block, throwOnError: false, output: "htmlAndMathml" }),
    [children, block],
  );
  return block ? (
    <div className="tex-block" dangerouslySetInnerHTML={{ __html: html }} />
  ) : (
    <span className="tex-inline" dangerouslySetInnerHTML={{ __html: html }} />
  );
}

/** A marked aside: an edge case, a caveat, a result that went the other way. */
export function Note({ tone = "plain", children }: { tone?: "plain" | "warn" | "good"; children: ReactNode }) {
  return (
    <div className="note" data-tone={tone}>
      {children}
    </div>
  );
}

/** Small text under or over a chart: what it shows, how many seeds, which split. */
export function Caption({ children }: { children: ReactNode }) {
  return <p className="caption">{children}</p>;
}

/** A numbered list, for things that really are a sequence. */
export function Steps({ items }: { items: ReactNode[] }) {
  return (
    <ol className="steps">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ol>
  );
}

/** A plain list. */
export function List({ items }: { items: ReactNode[] }) {
  return (
    <ul className="list">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

/** A small table of figures. `head` names the columns; the first column is the row label. */
export function Table({ head, rows, caption }: { head: string[]; rows: ReactNode[][]; caption?: string }) {
  return (
    <table className="table">
      {caption ? <caption>{caption}</caption> : null}
      <thead>
        <tr>
          {head.map((cell) => (
            <th key={cell} scope="col">
              {cell}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i}>
            {row.map((cell, j) => (j === 0 ? <th key={j} scope="row">{cell}</th> : <td key={j}>{cell}</td>))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
