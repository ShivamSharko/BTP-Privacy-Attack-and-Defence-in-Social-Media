import { grid } from "../../data";
import { BUDGET } from "./store";
import { epsilonAt, fromLogT, logT } from "./sim";

const X0 = 110;
const X1 = 740;
const Y0 = 90;
const Y1 = 470;
const ROUNDS = grid.rounds[grid.rounds.length - 1];

/** Still diagram for browsers without WebGL: epsilon against noise at the longest run, for both sampling rates, with the budget line. */
export function Fallback() {
  const zLo = grid.noise[0];
  const zHi = grid.noise[grid.noise.length - 1];
  const all = grid.rates.map((_, r) => Array.from({ length: 60 }, (_, i) => epsilonAt(grid, r, fromLogT(i / 59, zLo, zHi), ROUNDS)));
  const lo = Math.min(...all.flat(), BUDGET) * 0.8;
  const hi = Math.max(...all.flat()) * 1.2;
  const y = (e: number) => Y1 - logT(e, lo, hi) * (Y1 - Y0);
  const path = (values: number[]) => values.map((e, i) => `${i === 0 ? "M" : "L"}${(X0 + (i / 59) * (X1 - X0)).toFixed(1)},${y(e).toFixed(1)}`).join(" ");
  return (
    <svg viewBox="0 0 800 600" role="img" aria-label="Epsilon falls as the noise multiplier grows; a lower sampling rate gives a much lower epsilon">
      <line x1={X0} y1={Y1} x2={X1} y2={Y1} stroke="var(--muted)" strokeWidth="2" />
      <line x1={X0} y1={Y0} x2={X0} y2={Y1} stroke="var(--muted)" strokeWidth="2" />
      <line x1={X0} y1={y(BUDGET)} x2={X1} y2={y(BUDGET)} stroke="var(--model)" strokeWidth="2" strokeDasharray="8 6" />
      <text x={X1} y={y(BUDGET) - 8} textAnchor="end" fill="var(--model)" fontSize="16">
        budget: epsilon {BUDGET}
      </text>
      <path d={path(all[0])} fill="none" stroke="var(--protected)" strokeWidth="4" />
      <path d={path(all[1])} fill="none" stroke="var(--attacker)" strokeWidth="4" />
      <text x={X0 + 20} y={y(all[0][10]) + 28} fill="var(--protected)" fontSize="16">
        sampling rate {grid.rates[0]}
      </text>
      <text x={X0 + 20} y={y(all[1][10]) - 12} fill="var(--attacker)" fontSize="16">
        sampling rate {grid.rates[1]}
      </text>
      <text x={(X0 + X1) / 2} y="512" textAnchor="middle" fill="var(--ink)" fontSize="18">
        noise multiplier, {zLo} to {zHi} (log scale)
      </text>
      <text x="60" y="280" textAnchor="middle" fill="var(--ink)" fontSize="18" transform="rotate(-90 60 280)">
        epsilon after {ROUNDS} rounds (log scale)
      </text>
      <text x="400" y="560" textAnchor="middle" fill="var(--ink-soft)" fontSize="18">
        Every round spends budget; more noise and fewer users per round spend less.
      </text>
    </svg>
  );
}
