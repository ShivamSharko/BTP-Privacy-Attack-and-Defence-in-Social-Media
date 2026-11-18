import { makeWorld } from "./sim";

/** Still diagram for browsers without WebGL: a city of users, some lit, and three bands of accuracy. */
export function Fallback() {
  const world = makeWorld(5, 240);
  return (
    <svg viewBox="0 0 800 600" role="img" aria-label="A city of users with some lights on, and three bars showing less active users get a lower accuracy">
      {Array.from({ length: world.n }, (_, i) => {
        const x = 400 + world.pos[i * 3] * 72;
        const y = 210 + world.pos[i * 3 + 2] * 42;
        const on = world.coin[i] < 0.5;
        return <circle key={i} cx={x} cy={y} r={on ? 5 : 3} fill={on ? "var(--honest)" : "var(--muted)"} />;
      })}
      {[0.4, 0.62, 1].map((h, g) => (
        <rect key={g} x={190 + g * 160} y={560 - h * 190} width={110} height={h * 190} rx={4} fill="var(--protected)" fillOpacity="0.85" />
      ))}
      <text x="400" y="590" textAnchor="middle" fill="var(--ink-soft)" fontSize="16">
        least active, middle, most active third
      </text>
      <text x="400" y="40" textAnchor="middle" fill="var(--ink)" fontSize="18">
        Only users whose phone is free can take part; the less active third ends up with the lower accuracy.
      </text>
    </svg>
  );
}
