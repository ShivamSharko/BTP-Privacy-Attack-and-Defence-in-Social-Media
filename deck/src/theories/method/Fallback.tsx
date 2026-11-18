import { GATES } from "./store";

/** Still diagram for browsers without WebGL: six gates, a result packet, and a stamp. */
export function Fallback() {
  const x = (i: number) => 90 + i * 124;
  return (
    <svg viewBox="0 0 800 600" role="img" aria-label="Six gates in a row that a result passes through before it is reported, ending in a VALID stamp">
      <line x1="30" y1="300" x2="770" y2="300" stroke="var(--muted)" strokeWidth="2" />
      <line x1="30" y1="300" x2={x(4) + 40} y2="300" stroke="var(--ledger)" strokeWidth="3" />
      {GATES.map((gate, i) => (
        <g key={gate.title}>
          <ellipse cx={x(i)} cy="300" rx="16" ry="60" fill="none" stroke={i < 5 ? "var(--protected)" : "var(--muted)"} strokeWidth="4" />
          <text x={x(i)} y={i % 2 === 0 ? 395 : 440} textAnchor="middle" fill="var(--ink)" fontSize="15">
            {i + 1}. {gate.title}
          </text>
        </g>
      ))}
      <circle cx={x(4) + 40} cy="300" r="14" fill="var(--ledger)" />
      <rect x="560" y="140" width="190" height="70" fill="none" stroke="var(--protected)" strokeWidth="3" rx="4" />
      <text x="655" y="187" textAnchor="middle" fill="var(--protected)" fontSize="30" fontWeight="700">
        VALID
      </text>
      <text x="400" y="560" textAnchor="middle" fill="var(--ink-soft)" fontSize="18">
        Written down first, tuned on validation, frozen, run once, checked by controls, then reported.
      </text>
    </svg>
  );
}
