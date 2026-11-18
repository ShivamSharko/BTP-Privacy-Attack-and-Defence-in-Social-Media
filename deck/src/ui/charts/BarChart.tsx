import { scaleBand, scaleLinear } from "d3-scale";
import type { Role } from "../../styles/roles";
import {
  ChartShell,
  FONT,
  FONT_VALUE,
  H,
  HLine,
  MARGIN,
  W,
  Whisker,
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

export interface BarDatum {
  label: string;
  value: number;
  lo?: number;
  hi?: number;
  role?: Role;
  note?: string;
}

export interface BarChartProps {
  data: BarDatum[];
  yLabel: string;
  format?: Formatter;
  threshold?: { value: number; label: string };
  summary: string;
}

export function BarChart({ data, yLabel, format = sig3, threshold, summary }: BarChartProps) {
  const { tip, bind } = useTip();
  const rows = data.map((d) => ({ ...d, value: fin(d.value), iv: clampInterval(fin(d.value), d.lo, d.hi) }));
  const tops = rows.flatMap((d) => [d.value, d.iv?.hi ?? d.value]);
  const bottoms = rows.flatMap((d) => [d.value, d.iv?.lo ?? d.value]);
  if (threshold && Number.isFinite(threshold.value)) tops.push(threshold.value);
  const [d0, d1] = safeDomain(Math.min(0, ...bottoms), Math.max(0, ...tops) * 1.1);
  const innerBottom = H - MARGIN.bottom;
  const y = scaleLinear().domain([d0, d1]).range([innerBottom, MARGIN.top]).nice(4);
  const x = scaleBand<string>()
    .domain(rows.map((r) => r.label))
    .range([MARGIN.left, W - MARGIN.right])
    .paddingInner(0.28)
    .paddingOuter(0.18);
  const bw = x.bandwidth();
  const base = fin(y(0), innerBottom);

  return (
    <ChartShell summary={summary} tip={tip}>
      <YAxis scale={y} label={yLabel} format={format} />
      <line className="chart__baseline" x1={MARGIN.left} x2={W - MARGIN.right} y1={base} y2={base} />
      {rows.map((r, i) => {
        const x0 = fin(x(r.label) ?? 0);
        const cx = x0 + bw / 2;
        const top = fin(y(r.value), base);
        const barY = Math.min(top, base);
        const barH = Math.max(Math.abs(base - top), 0);
        const interval = intervalText(r.iv?.lo, r.iv?.hi, format);
        const labelY = r.iv ? fin(y(r.iv.hi)) - 8 : barY - 8;
        const labelBelow = r.value < 0;
        return (
          <g key={`${r.label}-${i}`} className="chart__bar-group">
            <rect
              className="chart__mark"
              data-bar={r.label}
              x={x0}
              y={barY}
              width={fin(bw)}
              height={barH}
              rx={2}
              fill={roleColor(r.role)}
              aria-label={`${r.label}: ${format(r.value)}`}
              {...bind({ x: cx, y: barY, title: r.label, value: format(r.value), interval, note: r.note })}
            />
            {r.iv && <Whisker x={cx} y1={y(r.iv.lo)} y2={y(r.iv.hi)} />}
            <text
              className="chart__value"
              x={cx}
              y={labelBelow ? barY + barH + FONT_VALUE + 4 : Math.max(labelY, FONT_VALUE)}
              textAnchor="middle"
              fontSize={FONT_VALUE}
            >
              {format(r.value)}
            </text>
            <text className="chart__tick" x={cx} y={innerBottom + 26} textAnchor="middle" fontSize={FONT}>
              {r.label}
            </text>
          </g>
        );
      })}
      {threshold && Number.isFinite(threshold.value) && (
        <HLine y={y(threshold.value)} label={threshold.label} kind="threshold" />
      )}
    </ChartShell>
  );
}
