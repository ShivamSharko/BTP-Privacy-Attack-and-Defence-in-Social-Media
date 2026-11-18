import { DIM, makePopulation, N_USERS, sumMean } from "./sim";

const CX = 250;
const CY = 380;
const SCALE = 130;

/** Still diagram for browsers without WebGL: honest updates near the origin, attackers in one cluster, the average tilting. */
export function Fallback() {
  const pop = makePopulation(N_USERS, 0.2);
  const mean = sumMean(pop);
  // Target axis to the right, the other businesses up and diagonally down-left.
  const at = (v: ArrayLike<number>): [number, number] => [CX + v[0] * SCALE - v[2] * SCALE * 0.5, CY - v[1] * SCALE + v[2] * SCALE * 0.35];
  const tips = Array.from({ length: pop.n }, (_, u) => ({ p: at(pop.updates.slice(u * DIM, u * DIM + DIM)), bad: pop.isAttacker[u] }));
  const [mx, my] = at(mean);
  return (
    <svg viewBox="0 0 800 600" role="img" aria-label="Honest updates as small sparse arrows, attackers as one red cluster pointing at the target, and the average tilting toward it">
      <line x1={CX - 120} y1={CY} x2={CX + 440} y2={CY} stroke="var(--muted)" strokeWidth="1.5" />
      <line x1={CX} y1={CY} x2={CX} y2={CY - 280} stroke="var(--muted)" strokeWidth="1.5" />
      <text x={CX + 440} y={CY + 28} textAnchor="end" fill="var(--attacker)" fontSize="18">
        target business
      </text>
      <text x={CX + 10} y={CY - 285} fill="var(--muted)" fontSize="18">
        another business
      </text>
      {tips.map((t, i) => (
        <g key={i}>
          <line x1={CX} y1={CY} x2={t.p[0]} y2={t.p[1]} stroke={t.bad ? "var(--attacker)" : "var(--honest)"} strokeOpacity="0.4" strokeWidth="1.2" />
          <circle cx={t.p[0]} cy={t.p[1]} r={t.bad ? 5.5 : 3.6} fill={t.bad ? "var(--attacker)" : "var(--honest)"} />
        </g>
      ))}
      <line x1={CX} y1={CY} x2={mx} y2={my} stroke="var(--model)" strokeWidth="5" strokeLinecap="round" />
      <circle cx={mx} cy={my} r="8" fill="var(--model)" />
      <text x={mx + 14} y={my - 12} fill="var(--model)" fontSize="18">
        the average
      </text>
      <text x="400" y="560" textAnchor="middle" fill="var(--ink-soft)" fontSize="18">
        A fifth of the users send the same bounded push; the average leans toward the target.
      </text>
    </svg>
  );
}
