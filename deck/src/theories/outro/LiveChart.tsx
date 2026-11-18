import { fmt } from "../../data";
import { MAX_ROUNDS, POPULAR, useOutro } from "./store";

const W = 600;
const H = 150;
const L = 44;
const R = 590;
const T = 12;
const B = 118;

const px = (round: number) => L + ((R - L) * Math.min(round, MAX_ROUNDS)) / MAX_ROUNDS;
const py = (v: number) => B - (B - T) * Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0));

/** The sandbox's history: accuracy, the promoted item's exposure, and the popularity baseline. */
export function LiveChart() {
  const history = useOutro((s) => s.history);
  const path = (key: "accuracy" | "exposure") =>
    history.map((h, i) => `${i === 0 ? "M" : "L"}${px(h.round).toFixed(1)},${py(h[key]).toFixed(1)}`).join("");
  const last = history[history.length - 1];
  const summary = `After ${last.round} rounds the toy model ranks ${fmt.pct(last.accuracy, 0)} of held-out items in the top 5, against ${fmt.pct(POPULAR, 0)} for a most-popular list; the promoted item is in ${fmt.pct(last.exposure, 0)} of users' top 5.`;
  return (
    <figure className="outro-chart" style={{ margin: 0 }}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={summary} style={{ width: "100%", height: "auto", display: "block" }}>
        {[0, 0.5, 1].map((v) => (
          <g key={v}>
            <line x1={L} x2={R} y1={py(v)} y2={py(v)} stroke="var(--rule)" strokeWidth={1} />
            <text x={L - 8} y={py(v)} dy="0.32em" textAnchor="end" fontSize={13} fill="var(--ink-soft)">
              {fmt.pct(v, 0)}
            </text>
          </g>
        ))}
        <line x1={L} x2={R} y1={py(POPULAR)} y2={py(POPULAR)} stroke="var(--noise)" strokeWidth={2} strokeDasharray="6 5" />
        <path d={path("exposure")} fill="none" stroke="var(--attacker)" strokeWidth={2.5} strokeLinejoin="round" />
        <path d={path("accuracy")} fill="none" stroke="var(--model)" strokeWidth={2.5} strokeLinejoin="round" />
        <text x={L} y={H - 10} fontSize={13} fill="var(--ink-soft)">
          rounds: 0
        </text>
        <text x={R} y={H - 10} fontSize={13} textAnchor="end" fill="var(--ink-soft)">
          {MAX_ROUNDS}
        </text>
        <g fontSize={13} fontWeight={700}>
          <text x={L + 70} y={H - 10} fill="var(--model)">
            accuracy
          </text>
          <text x={L + 160} y={H - 10} fill="var(--noise)">
            most popular
          </text>
          <text x={L + 275} y={H - 10} fill="var(--attacker)">
            promoted item shown
          </text>
        </g>
      </svg>
    </figure>
  );
}
