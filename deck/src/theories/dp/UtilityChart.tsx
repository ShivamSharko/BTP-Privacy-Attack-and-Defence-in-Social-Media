import { scaleLinear, scaleLog } from "d3-scale";
import { area, line } from "d3-shape";
import { useState } from "react";
import type { Role } from "../../ui";

/**
 * A line chart on a log x axis with interval bands, horizontal level lines, and every label in
 * the right margin, pushed apart so none overlap. The deck's LineChart puts each reference label
 * at the end of its own line, which collides here (clip-only and the H1 line sit close together),
 * and its band fade ends fully opaque; so this folder draws its own.
 */

const W = 760;
const H = 440;
const FONT = 15;
const M = { top: 30, right: 214, bottom: 64, left: 84 };

export interface CurvePoint {
  x: number;
  y: number;
  lo: number;
  hi: number;
  /** Tooltip heading and lines. */
  title: string;
  lines: string[];
  emphasis?: boolean;
}

export interface CurveSeries {
  name: string;
  role: Role;
  points: CurvePoint[];
}

export interface Level {
  label: string;
  value: number;
  lo?: number;
  hi?: number;
  role: Role;
  dashed?: boolean;
  strong?: boolean;
}

interface Props {
  series: CurveSeries[];
  levels: Level[];
  xLabel: string;
  yLabel: string;
  xFormat?(x: number): string;
  format(v: number): string;
  summary: string;
}

const colour = (role: Role) => `var(--${role})`;

export function UtilityChart({ series, levels, xLabel, yLabel, xFormat = String, format, summary }: Props) {
  const [tip, setTip] = useState<{ s: number; p: number } | null>(null);
  const left = M.left;
  const right = W - M.right;
  const all = series.flatMap((s) => s.points);
  const xs = [...new Set(all.map((p) => p.x))].sort((a, b) => a - b);
  const x = scaleLog()
    .domain([xs[0] / 1.3, xs[xs.length - 1] * 1.3])
    .range([left, right]);
  const values = [...all.flatMap((p) => [p.lo, p.hi]), ...levels.flatMap((l) => [l.value, l.lo ?? l.value, l.hi ?? l.value])];
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const pad = (hi - lo) * 0.06;
  const y = scaleLinear()
    .domain([lo - pad, hi + pad])
    .range([H - M.bottom, M.top])
    .nice(5);
  const ticks = y.ticks(5);

  // Labels in the right margin, in value order, pushed apart so none overlap.
  const labels = [
    ...levels.map((l) => ({ label: l.label, value: l.value, role: l.role, strong: l.strong ?? false })),
    ...series.map((s) => ({ label: s.name, value: s.points[s.points.length - 1].y, role: s.role, strong: true })),
  ]
    .map((l) => ({ ...l, at: y(l.value) }))
    .sort((a, b) => a.at - b.at);
  const gap = FONT + 5;
  for (let i = 1; i < labels.length; i++) if (labels[i].at - labels[i - 1].at < gap) labels[i].at = labels[i - 1].at + gap;
  const overflow = labels.length ? labels[labels.length - 1].at - (H - M.bottom + 8) : 0;
  if (overflow > 0) for (const l of labels) l.at -= overflow;

  const band = area<CurvePoint>()
    .x((p) => x(p.x))
    .y0((p) => y(p.lo))
    .y1((p) => y(p.hi));
  const path = line<CurvePoint>()
    .x((p) => x(p.x))
    .y((p) => y(p.y));
  const shown = tip === null ? null : series[tip.s].points[tip.p];

  return (
    <figure className="chart">
      <svg className="chart__svg" viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }} role="img" aria-label={summary}>
        <g className="chart__axis">
          {ticks.map((t) => (
            <g key={t} transform={`translate(0 ${y(t)})`}>
              <line className="chart__rule" x1={left} x2={right} />
              <text x={left - 10} dy="0.32em" textAnchor="end" fontSize={FONT}>
                {format(t)}
              </text>
            </g>
          ))}
          <text className="chart__axis-label" transform={`translate(18 ${(M.top + H - M.bottom) / 2}) rotate(-90)`} textAnchor="middle" fontSize={FONT}>
            {yLabel}
          </text>
        </g>
        <line className="chart__baseline" x1={left} x2={right} y1={H - M.bottom} y2={H - M.bottom} />
        {xs.map((v) => (
          <text key={v} className="chart__tick" x={x(v)} y={H - M.bottom + 26} textAnchor="middle" fontSize={FONT}>
            {xFormat(v)}
          </text>
        ))}
        <text className="chart__axis-label" x={(left + right) / 2} y={H - 10} textAnchor="middle" fontSize={FONT}>
          {xLabel}
        </text>

        {levels.map((l) => (
          <g key={l.label} data-level={l.label}>
            {l.lo !== undefined && l.hi !== undefined && (
              <rect x={left} width={right - left} y={y(l.hi)} height={Math.max(1, y(l.lo) - y(l.hi))} fill={colour(l.role)} opacity={0.16} />
            )}
            <line
              x1={left}
              x2={right}
              y1={y(l.value)}
              y2={y(l.value)}
              stroke={colour(l.role)}
              strokeWidth={l.strong ? 2.5 : 1.5}
              strokeDasharray={l.dashed ? "8 6" : undefined}
            />
          </g>
        ))}

        {series.map((s, si) => (
          <g key={s.name} data-series={s.name}>
            <path d={band(s.points) ?? undefined} fill={colour(s.role)} opacity={0.22} />
            <path className="chart__line" d={path(s.points) ?? undefined} fill="none" stroke={colour(s.role)} />
            {s.points.map((p, pi) => (
              <g key={p.x}>
                {p.emphasis && <circle cx={x(p.x)} cy={y(p.y)} r={12} fill="none" stroke={colour(s.role)} strokeWidth={2} />}
                <circle
                  className="chart__mark chart__point"
                  data-point={`${s.name}/${p.x}`}
                  cx={x(p.x)}
                  cy={y(p.y)}
                  r={6.5}
                  fill={colour(s.role)}
                  tabIndex={0}
                  aria-label={`${p.title}: ${format(p.y)}`}
                  onMouseEnter={() => setTip({ s: si, p: pi })}
                  onMouseLeave={() => setTip(null)}
                  onFocus={() => setTip({ s: si, p: pi })}
                  onBlur={() => setTip(null)}
                />
              </g>
            ))}
          </g>
        ))}

        {labels.map((l) => (
          <g key={l.label}>
            <line x1={right + 4} x2={right + 14} y1={y(l.value)} y2={l.at} stroke={colour(l.role)} strokeWidth={1} />
            <text x={right + 18} y={l.at} dy="0.32em" fontSize={FONT} fill={colour(l.role)} fontWeight={l.strong ? 700 : 400}>
              {l.label}
            </text>
          </g>
        ))}
      </svg>
      {shown && (
        <div
          className="chart__tip"
          role="tooltip"
          data-below={y(shown.y) < H * 0.3 ? "true" : "false"}
          style={{ left: `${Math.min(Math.max((x(shown.x) / W) * 100, 16), 78)}%`, top: `${(y(shown.y) / H) * 100}%` }}
        >
          <strong>{shown.title}</strong>
          <span className="chart__tip-value">{format(shown.y)}</span>
          {shown.lines.map((text) => (
            <span key={text} className="chart__tip-line">
              {text}
            </span>
          ))}
        </div>
      )}
      <figcaption className="sr-only">{summary}</figcaption>
    </figure>
  );
}
