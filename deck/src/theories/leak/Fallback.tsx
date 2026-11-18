import { COLS, N_ITEMS, userHistory, historyMask } from "./sim";

/** Still diagram for browsers without WebGL: one update as columns over an item grid. */
export function Fallback() {
  const mask = historyMask(userHistory(0, 8));
  const cell = 52;
  const x0 = 400 - (COLS * cell) / 2;
  const y0 = 230;
  return (
    <svg viewBox="0 0 800 600" role="img" aria-label="A grid of items; the ones in a user's history stand tall in the update, and the attacker's guesses are ringed">
      {Array.from({ length: N_ITEMS }, (_, i) => {
        const x = x0 + (i % COLS) * cell;
        const y = y0 + Math.floor(i / COLS) * 36;
        const own = mask[i];
        return (
          <g key={i}>
            {own ? <rect x={x + 14} y={y - 70} width={22} height={70} rx={2} fill="var(--attacker)" /> : <rect x={x + 14} y={y - 5} width={22} height={5} rx={1} fill="var(--attacker)" opacity={0.5} />}
            <rect x={x + 4} y={y} width={cell - 8} height={14} rx={2} fill={own ? "var(--honest)" : "var(--muted)"} />
          </g>
        );
      })}
      <text x="400" y="500" textAnchor="middle" fill="var(--ink)" fontSize="18">
        One update stands tall exactly where the user has history.
      </text>
      <text x="400" y="535" textAnchor="middle" fill="var(--ink-soft)" fontSize="18">
        Updates of friends also point the same way, which leaks friendships.
      </text>
      <text x="400" y="80" textAnchor="middle" fill="var(--ink-soft)" fontSize="18">
        amber: real history, red: the size of the update
      </text>
    </svg>
  );
}
