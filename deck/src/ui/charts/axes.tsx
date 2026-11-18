import { useCallback, useState } from "react";
import type { ReactNode } from "react";
import type { ScaleLinear } from "d3-scale";
import type { Role } from "../../styles/roles";

/** Viewbox units. Text is never below FONT so it reads from the back of a room. */
export const W = 760;
export const H = 440;
export const FONT = 15;
export const FONT_VALUE = 16;
export const MARGIN = { top: 34, right: 28, bottom: 64, left: 78 };

export type Formatter = (v: number) => string;

/** Three significant digits, no exponent, no trailing noise. */
export const sig3: Formatter = (v) => {
  if (!Number.isFinite(v)) return "n/a";
  if (v === 0) return "0";
  const r = Number(v.toPrecision(3));
  return Math.abs(r) >= 1e21 ? r.toExponential(2) : String(r);
};

/** Replaces a non-finite number by a fallback so no attribute ever reads NaN. */
export const fin = (v: number, fallback = 0): number => (Number.isFinite(v) ? v : fallback);

export const roleColor = (role: Role | undefined, fallback: Role = "honest"): string => `var(--${role ?? fallback})`;

/** At most five ticks, always including the domain start. */
export function yTicks(scale: ScaleLinear<number, number>): number[] {
  let t = scale.ticks(4);
  if (t.length > 5) t = t.filter((_, i) => i % 2 === 0);
  return t.slice(0, 5);
}

/** Widens a degenerate domain so scales never divide by zero. */
export function safeDomain(lo: number, hi: number): [number, number] {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [0, 1];
  if (hi > lo) return [lo, hi];
  if (hi === 0) return [0, 1];
  return [Math.min(lo, 0), Math.max(hi, 0) === 0 ? 1 : Math.abs(hi) * 1.2];
}

export interface Tip {
  x: number; // viewbox units
  y: number;
  title: string;
  value: string;
  interval?: string;
  note?: string;
}

export function useTip() {
  const [tip, setTip] = useState<Tip | null>(null);
  const show = useCallback((t: Tip) => setTip(t), []);
  const hide = useCallback(() => setTip(null), []);
  const bind = (t: Tip) => ({
    tabIndex: 0,
    onMouseEnter: () => show(t),
    onMouseLeave: hide,
    onFocus: () => show(t),
    onBlur: hide,
  });
  return { tip, show, hide, bind };
}

export function intervalText(lo: number | undefined, hi: number | undefined, format: Formatter): string | undefined {
  if (lo === undefined || hi === undefined) return undefined;
  return `${format(lo)} – ${format(hi)}`;
}

/** Orders a lo/hi pair around the value so a typo cannot draw an inverted whisker. */
export function clampInterval(value: number, lo?: number, hi?: number): { lo: number; hi: number } | null {
  if (lo === undefined || hi === undefined || !Number.isFinite(lo) || !Number.isFinite(hi)) return null;
  return { lo: Math.min(lo, hi, value), hi: Math.max(lo, hi, value) };
}

interface ShellProps {
  summary: string;
  tip: Tip | null;
  children: ReactNode;
  viewW?: number;
  viewH?: number;
  legend?: ReactNode;
}

/** The figure, svg, screen-reader caption and the HTML tooltip shared by every chart. */
export function ChartShell({ summary, tip, children, viewW = W, viewH = H, legend }: ShellProps) {
  const left = tip ? Math.min(Math.max((tip.x / viewW) * 100, 12), 88) : 0;
  const top = tip ? (tip.y / viewH) * 100 : 0;
  const below = tip ? tip.y < viewH * 0.3 : false;
  return (
    <figure className="chart">
      <svg
        className="chart__svg"
        viewBox={`0 0 ${viewW} ${viewH}`}
        style={{ width: "100%", height: "auto" }}
        role="img"
        aria-label={summary}
      >
        {children}
      </svg>
      {legend}
      {tip && (
        <div
          className="chart__tip"
          role="tooltip"
          data-below={below ? "true" : "false"}
          style={{ left: `${left}%`, top: `${top}%` }}
        >
          <strong>{tip.title}</strong>
          <span className="chart__tip-value">{tip.value}</span>
          {tip.interval && <span className="chart__tip-line">range {tip.interval}</span>}
          {tip.note && <span className="chart__tip-line">{tip.note}</span>}
        </div>
      )}
      <figcaption className="sr-only">{summary}</figcaption>
    </figure>
  );
}

export function YAxis({
  scale,
  label,
  format,
  left = MARGIN.left,
  right = W - MARGIN.right,
}: {
  scale: ScaleLinear<number, number>;
  label: string;
  format: Formatter;
  left?: number;
  right?: number;
}) {
  const ticks = yTicks(scale);
  const mid = (scale.range()[0] + scale.range()[1]) / 2;
  return (
    <g className="chart__axis">
      {ticks.map((t) => (
        <g key={t} transform={`translate(0 ${fin(scale(t))})`}>
          <line className="chart__rule" x1={left} x2={right} />
          <text x={left - 10} dy="0.32em" textAnchor="end" fontSize={FONT}>
            {format(t)}
          </text>
        </g>
      ))}
      <text
        className="chart__axis-label"
        transform={`translate(18 ${fin(mid)}) rotate(-90)`}
        textAnchor="middle"
        fontSize={FONT}
      >
        {label}
      </text>
    </g>
  );
}

export function XLabel({ label, y = H - 10 }: { label: string; y?: number }) {
  return (
    <text
      className="chart__axis-label"
      x={(MARGIN.left + W - MARGIN.right) / 2}
      y={y}
      textAnchor="middle"
      fontSize={FONT}
    >
      {label}
    </text>
  );
}

/** Dashed horizontal line with its label sitting above the right end. */
export function HLine({
  y,
  label,
  kind,
  left = MARGIN.left,
  right = W - MARGIN.right,
  labelX,
  anchor = "end",
}: {
  y: number;
  label: string;
  kind: "threshold" | "reference";
  left?: number;
  right?: number;
  labelX?: number;
  anchor?: "start" | "end";
}) {
  const yy = fin(y);
  const props = kind === "threshold" ? { "data-threshold": "true" } : { "data-reference": "true" };
  return (
    <g className={`chart__${kind}`}>
      <line x1={left} x2={right} y1={yy} y2={yy} {...props} />
      <text x={labelX ?? right} y={yy - 6} textAnchor={anchor} fontSize={FONT}>
        {label}
      </text>
    </g>
  );
}

export function Legend({ items }: { items: { name: string; role: Role }[] }) {
  return (
    <ul className="chart__legend" data-legend="true">
      {items.map((i) => (
        <li key={i.name}>
          <span className="chart__swatch" style={{ background: roleColor(i.role) }} />
          {i.name}
        </li>
      ))}
    </ul>
  );
}

/** Vertical interval line with small caps. y1 and y2 are pixel positions. */
export function Whisker({ x, y1, y2, cap = 7 }: { x: number; y1: number; y2: number; cap?: number }) {
  const a = fin(y1);
  const b = fin(y2);
  return (
    <g className="chart__whisker" data-interval="true">
      <line x1={x} x2={x} y1={a} y2={b} />
      <line x1={x - cap} x2={x + cap} y1={a} y2={a} />
      <line x1={x - cap} x2={x + cap} y1={b} y2={b} />
    </g>
  );
}
