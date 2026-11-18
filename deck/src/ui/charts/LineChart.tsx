import { scaleLinear, scaleLog } from "d3-scale";
import { area, line } from "d3-shape";
import type { Role } from "../../styles/roles";
import {
  ChartShell,
  FONT,
  H,
  HLine,
  Legend,
  MARGIN as BASE,
  W,
  XLabel,
  YAxis,
  clampInterval,
  fin,
  intervalText,
  roleColor,
  safeDomain,
  sig3,
  useTip,
  type Formatter,
} from "./axes";

const MARGIN = { ...BASE, right: 132 };

export interface LinePoint {
  x: number;
  y: number;
  lo?: number;
  hi?: number;
  note?: string;
}
export interface LineSeries {
  name: string;
  role: Role;
  points: LinePoint[];
}
export interface LineChartProps {
  series: LineSeries[];
  xLabel: string;
  yLabel: string;
  xScale?: "linear" | "log";
  format?: Formatter;
  threshold?: { value: number; label: string };
  reference?: { value: number; label: string }[];
  summary: string;
}

interface Pt {
  x: number;
  y: number;
  lo: number;
  hi: number;
  hasBand: boolean;
  note?: string;
}

export function LineChart({
  series,
  xLabel,
  yLabel,
  xScale = "linear",
  format = sig3,
  threshold,
  reference,
  summary,
}: LineChartProps) {
  const { tip, bind } = useTip();
  const isLog = xScale === "log";

  const clean = series.map((s) => ({
    ...s,
    pts: s.points
      .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && (!isLog || p.x > 0))
      .sort((a, b) => a.x - b.x)
      .map<Pt>((p) => {
        const iv = clampInterval(p.y, p.lo, p.hi);
        return { x: p.x, y: p.y, lo: iv?.lo ?? p.y, hi: iv?.hi ?? p.y, hasBand: iv !== null, note: p.note };
      }),
  }));
  const pts = clean.flatMap((s) => s.pts);

  const xs = pts.map((p) => p.x);
  let xMin = xs.length ? Math.min(...xs) : 1;
  let xMax = xs.length ? Math.max(...xs) : 2;
  if (xMin === xMax) {
    if (isLog) {
      xMin /= 2;
      xMax *= 2;
    } else {
      xMin -= 1;
      xMax += 1;
    }
  }
  const left = MARGIN.left + 12;
  const right = W - MARGIN.right;
  const x = isLog
    ? scaleLog().domain([xMin, xMax]).range([left, right])
    : scaleLinear().domain([xMin, xMax]).range([left, right]);

  const yVals = pts.flatMap((p) => [p.y, p.lo, p.hi]);
  if (threshold && Number.isFinite(threshold.value)) yVals.push(threshold.value);
  for (const r of reference ?? []) if (Number.isFinite(r.value)) yVals.push(r.value);
  const [lo0, hi0] = yVals.length ? [Math.min(...yVals), Math.max(...yVals)] : [0, 1];
  const pad = (hi0 - lo0) * 0.08;
  const [d0, d1] = safeDomain(hi0 > lo0 ? lo0 - pad : lo0, hi0 > lo0 ? hi0 + pad : hi0);
  const y = scaleLinear().domain([d0, d1]).range([H - MARGIN.bottom, MARGIN.top]).nice(4);

  const unique = [...new Set(xs)].sort((a, b) => a - b);
  let xTicks: number[];
  if (isLog) {
    xTicks = unique;
    if (xTicks.length > 6) xTicks = xTicks.filter((_, i) => i % Math.ceil(xTicks.length / 5) === 0);
  } else {
    xTicks = x.ticks(5);
  }

  const px = (v: number) => fin(x(v));
  const py = (v: number) => fin(y(v));
  const lineGen = line<Pt>().x((p) => px(p.x)).y((p) => py(p.y));
  const areaGen = area<Pt>().x((p) => px(p.x)).y0((p) => py(p.lo)).y1((p) => py(p.hi));

  // End-of-line labels, nudged apart vertically.
  const ends = clean
    .filter((s) => s.pts.length > 0)
    .map((s) => ({ name: s.name, role: s.role, x: px(s.pts[s.pts.length - 1].x), y: py(s.pts[s.pts.length - 1].y) }))
    .sort((a, b) => a.y - b.y);
  const gap = FONT + 4;
  for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < gap) ends[i].y = ends[i - 1].y + gap;

  return (
    <ChartShell
      summary={summary}
      tip={tip}
      legend={series.length > 3 ? <Legend items={series.map((s) => ({ name: s.name, role: s.role }))} /> : undefined}
    >
      <YAxis scale={y} label={yLabel} format={format} left={left} right={right} />
      <line className="chart__baseline" x1={left} x2={right} y1={H - MARGIN.bottom} y2={H - MARGIN.bottom} />
      {xTicks.map((t) => (
        <text key={t} className="chart__tick" x={px(t)} y={H - MARGIN.bottom + 26} textAnchor="middle" fontSize={FONT}>
          {sig3(t)}
        </text>
      ))}
      <XLabel label={xLabel} />
      {(reference ?? []).map((r) =>
        Number.isFinite(r.value) ? (
          <HLine key={r.label} y={y(r.value)} label={r.label} kind="reference" left={left} right={right} />
        ) : null,
      )}
      {threshold && Number.isFinite(threshold.value) && (
        <HLine y={y(threshold.value)} label={threshold.label} kind="threshold" left={left} right={right} />
      )}
      {clean.map((s) => {
        const color = roleColor(s.role);
        const band = s.pts.some((p) => p.hasBand) ? areaGen(s.pts) : null;
        const path = s.pts.length > 1 ? lineGen(s.pts) : null;
        return (
          <g key={s.name} className="chart__series">
            {band && <path className="chart__band" data-band={s.name} d={band} fill={color} />}
            {path && <path className="chart__line" d={path} fill="none" stroke={color} />}
            {s.pts.map((p, i) => (
              <circle
                key={i}
                className="chart__mark chart__point"
                data-point={s.name}
                cx={px(p.x)}
                cy={py(p.y)}
                r={5.5}
                fill={color}
                aria-label={`${s.name}, x ${sig3(p.x)}: ${format(p.y)}`}
                {...bind({
                  x: px(p.x),
                  y: py(p.y),
                  title: `${s.name} at ${sig3(p.x)}`,
                  value: format(p.y),
                  interval: p.hasBand ? intervalText(p.lo, p.hi, format) : undefined,
                  note: p.note,
                })}
              />
            ))}
          </g>
        );
      })}
      {ends.map((e) => (
        <text key={e.name} className="chart__end-label" x={e.x + 12} y={e.y} dy="0.32em" fontSize={FONT} fill={roleColor(e.role)}>
          {e.name}
        </text>
      ))}
    </ChartShell>
  );
}
