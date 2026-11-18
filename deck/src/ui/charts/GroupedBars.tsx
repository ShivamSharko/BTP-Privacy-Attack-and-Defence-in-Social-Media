import { scaleBand, scaleLinear } from "d3-scale";
import type { Role } from "../../styles/roles";
import {
  ChartShell,
  FONT,
  FONT_VALUE,
  H,
  HLine,
  Legend,
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

export interface GroupedBarsProps {
  groups: { label: string; bars: { name: string; value: number; lo?: number; hi?: number; role: Role }[] }[];
  yLabel: string;
  format?: Formatter;
  threshold?: { value: number; label: string };
  summary: string;
}

export function GroupedBars({ groups, yLabel, format = sig3, threshold, summary }: GroupedBarsProps) {
  const { tip, bind } = useTip();
  const all = groups.flatMap((g) =>
    g.bars.map((b) => ({ ...b, value: fin(b.value), iv: clampInterval(fin(b.value), b.lo, b.hi) })),
  );
  const tops = all.flatMap((b) => [b.value, b.iv?.hi ?? b.value]);
  const bottoms = all.flatMap((b) => [b.value, b.iv?.lo ?? b.value]);
  if (threshold && Number.isFinite(threshold.value)) tops.push(threshold.value);
  const [d0, d1] = safeDomain(Math.min(0, ...bottoms), Math.max(0, ...tops) * 1.1);
  const innerBottom = H - MARGIN.bottom;
  const y = scaleLinear().domain([d0, d1]).range([innerBottom, MARGIN.top]).nice(4);
  const x0 = scaleBand<string>()
    .domain(groups.map((g) => g.label))
    .range([MARGIN.left, W - MARGIN.right])
    .paddingInner(0.22)
    .paddingOuter(0.12);
  const names = [...new Set(groups.flatMap((g) => g.bars.map((b) => b.name)))];
  const x1 = scaleBand<string>().domain(names).range([0, x0.bandwidth()]).paddingInner(0.1);
  const base = fin(y(0), innerBottom);
  const legend: { name: string; role: Role }[] = [];
  for (const g of groups) for (const b of g.bars) if (!legend.some((l) => l.name === b.name)) legend.push({ name: b.name, role: b.role });

  return (
    <ChartShell summary={summary} tip={tip} legend={<Legend items={legend} />}>
      <YAxis scale={y} label={yLabel} format={format} />
      <line className="chart__baseline" x1={MARGIN.left} x2={W - MARGIN.right} y1={base} y2={base} />
      {groups.map((g) => {
        const gx = fin(x0(g.label) ?? 0);
        return (
          <g key={g.label}>
            {g.bars.map((raw, i) => {
              const value = fin(raw.value);
              const iv = clampInterval(value, raw.lo, raw.hi);
              const bx = gx + fin(x1(raw.name) ?? 0);
              const bw = fin(x1.bandwidth());
              const cx = bx + bw / 2;
              const top = fin(y(value), base);
              const barY = Math.min(top, base);
              const barH = Math.abs(base - top);
              const labelY = iv ? fin(y(iv.hi)) - 8 : barY - 8;
              return (
                <g key={`${raw.name}-${i}`}>
                  <rect
                    className="chart__mark"
                    data-bar={`${g.label}/${raw.name}`}
                    x={bx}
                    y={barY}
                    width={bw}
                    height={barH}
                    rx={2}
                    fill={roleColor(raw.role)}
                    aria-label={`${g.label}, ${raw.name}: ${format(value)}`}
                    {...bind({
                      x: cx,
                      y: barY,
                      title: `${g.label}, ${raw.name}`,
                      value: format(value),
                      interval: intervalText(iv?.lo, iv?.hi, format),
                    })}
                  />
                  {iv && <Whisker x={cx} y1={y(iv.lo)} y2={y(iv.hi)} cap={Math.min(7, bw / 3)} />}
                  <text className="chart__value" x={cx} y={Math.max(labelY, FONT_VALUE)} textAnchor="middle" fontSize={FONT_VALUE}>
                    {format(value)}
                  </text>
                </g>
              );
            })}
            <text
              className="chart__tick"
              x={gx + x0.bandwidth() / 2}
              y={innerBottom + 26}
              textAnchor="middle"
              fontSize={FONT}
            >
              {g.label}
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
