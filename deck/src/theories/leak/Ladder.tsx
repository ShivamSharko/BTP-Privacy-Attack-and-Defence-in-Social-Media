import { FONT, FONT_VALUE, ChartShell } from "../../ui/charts/axes";
import type { Role } from "../../ui";

/**
 * The defence ladder with only its first rung: the raw update. The empty rungs are drawn dashed
 * so the next concept has somewhere to put the protections; nothing is claimed about them here.
 */

export interface LadderPanel {
  title: string;
  /** The raw update's score. */
  raw: number;
  rawRole: Role;
  digits: number;
  /** A level worth comparing the raw score with. */
  reference: { value: number; label: string; role: Role };
}

const W = 760;
const H = 470;
const TOP = 62;
const BOTTOM = 362;
const SLOTS = 4;
const SLOT_W = 64;

const yOf = (v: number) => BOTTOM - (BOTTOM - TOP) * Math.max(0, Math.min(1, v));

function Panel({ panel, left }: { panel: LadderPanel; left: number }) {
  const width = SLOT_W * SLOTS;
  const barX = left + 8;
  return (
    <g>
      <text x={left - 6} y={26} fontSize={FONT + 1} fontWeight={700} className="chart__axis-label">
        {panel.title}
      </text>
      {[0, 0.5, 1].map((t) => (
        <g key={t}>
          <line className="chart__rule" x1={left} x2={left + width} y1={yOf(t)} y2={yOf(t)} />
          <text className="chart__tick" x={left - 8} y={yOf(t)} dy="0.32em" textAnchor="end" fontSize={FONT}>
            {t === 0.5 ? "0.5" : t}
          </text>
        </g>
      ))}
      <text className="chart__tick" x={left + width} y={yOf(0.5) + 18} textAnchor="end" fontSize={FONT - 1}>
        guessing
      </text>

      {/* later rungs, empty for now */}
      {Array.from({ length: SLOTS - 1 }, (_, i) => (
        <rect
          key={i}
          x={left + SLOT_W * (i + 1) + 8}
          y={yOf(1)}
          width={SLOT_W - 16}
          height={BOTTOM - yOf(1)}
          rx={3}
          fill="none"
          stroke="var(--noise)"
          strokeWidth={1.5}
          strokeDasharray="5 5"
          opacity={0.7}
        />
      ))}

      {/* the raw rung */}
      <rect
        className="chart__mark"
        data-bar={`${panel.title}/raw`}
        x={barX}
        y={yOf(panel.raw)}
        width={SLOT_W - 16}
        height={BOTTOM - yOf(panel.raw)}
        rx={3}
        fill={`var(--${panel.rawRole})`}
        aria-label={`${panel.title}, raw update: ${panel.raw.toFixed(4)}`}
      />
      <text className="chart__value" x={barX + (SLOT_W - 16) / 2} y={yOf(panel.raw) - 9} textAnchor="middle" fontSize={FONT_VALUE}>
        {panel.raw.toFixed(panel.digits)}
      </text>

      {/* the comparison level */}
      <line x1={left} x2={left + width} y1={yOf(panel.reference.value)} y2={yOf(panel.reference.value)} stroke={`var(--${panel.reference.role})`} strokeWidth={2} strokeDasharray="8 6" />
      <text x={left + width} y={yOf(panel.reference.value) - 7} textAnchor="end" fontSize={FONT} fontWeight={700} fill={`var(--${panel.reference.role})`} stroke="var(--dusk)" strokeWidth={5} strokeLinejoin="round" paintOrder="stroke">
        {panel.reference.label} {panel.reference.value.toFixed(3)}
      </text>

      <line className="chart__baseline" x1={left} x2={left + width} y1={BOTTOM} y2={BOTTOM} />
      <text className="chart__tick" x={barX + (SLOT_W - 16) / 2} y={BOTTOM + 24} textAnchor="middle" fontSize={FONT}>
        raw update
      </text>
      <text className="chart__tick" x={left + SLOT_W * 2.5} y={BOTTOM + 24} textAnchor="middle" fontSize={FONT}>
        protections come next
      </text>
    </g>
  );
}

export function Ladder({ panels, summary }: { panels: [LadderPanel, LadderPanel]; summary: string }) {
  return (
    <ChartShell summary={summary} tip={null} viewW={W} viewH={H}>
      <Panel panel={panels[0]} left={52} />
      <Panel panel={panels[1]} left={W / 2 + 40} />
    </ChartShell>
  );
}
