import { introGraph } from "./graph";

/** Still diagram for browsers without WebGL: the generated friend graph seen from above at an angle. */
export function Fallback() {
  const g = introGraph();
  const n = g.degree.length;
  const x = (i: number) => 400 + g.positions[i * 3] * 76;
  const y = (i: number) => 290 + g.positions[i * 3 + 2] * 40 - g.positions[i * 3 + 1] * 34;
  const lines: { a: number; b: number }[] = [];
  for (let e = 0; e < g.edges.length; e += 2 * 5) lines.push({ a: g.edges[e], b: g.edges[e + 1] });
  return (
    <svg viewBox="0 0 800 600" role="img" aria-label="A generated friend graph: communities of users around a few hubs, with a ring of users who have no friends">
      {lines.map(({ a, b }, k) => (
        <line key={k} x1={x(a)} y1={y(a)} x2={x(b)} y2={y(b)} stroke="var(--honest)" strokeOpacity="0.14" strokeWidth="1" />
      ))}
      {Array.from({ length: n }, (_, i) => (
        <circle
          key={i}
          cx={x(i)}
          cy={y(i)}
          r={g.hub[i] ? 4.5 : g.degree[i] === 0 ? 1.6 : 2.2}
          fill={g.degree[i] === 0 ? "var(--muted)" : "var(--honest)"}
        />
      ))}
      <text x="400" y="560" textAnchor="middle" fill="var(--ink-soft)" fontSize="18">
        Generated to match the measured friend graph; no real user is shown.
      </text>
    </svg>
  );
}
