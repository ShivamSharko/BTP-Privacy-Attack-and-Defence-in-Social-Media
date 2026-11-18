import { N_USERS } from "./sim";

/** Still diagram for browsers without WebGL: six users, a mask thread for every pair, the server below. */
export function Fallback() {
  const pts = Array.from({ length: N_USERS }, (_, i) => {
    const a = (i * Math.PI * 2) / N_USERS - Math.PI / 2;
    return { x: 400 + 190 * Math.cos(a), y: 230 + 130 * Math.sin(a) };
  });
  const pairs: [number, number][] = [];
  for (let i = 0; i < N_USERS; i++) for (let j = i + 1; j < N_USERS; j++) pairs.push([i, j]);
  return (
    <svg viewBox="0 0 800 600" role="img" aria-label="Six users joined by a mask thread for every pair; their masked updates go to a server, which adds them and the masks cancel">
      {pairs.map(([i, j]) => (
        <line key={`${i}-${j}`} x1={pts[i].x} y1={pts[i].y} x2={pts[j].x} y2={pts[j].y} stroke="var(--protected)" strokeOpacity="0.35" strokeWidth="1.5" />
      ))}
      {pts.map((p, i) => (
        <line key={`s${i}`} x1={p.x} y1={p.y} x2={400} y2={470} stroke="var(--protected)" strokeOpacity="0.45" strokeWidth="2" strokeDasharray="5 5" />
      ))}
      {pts.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r={20} fill="var(--protected)" />
          <circle cx={p.x} cy={p.y} r={32} fill="none" stroke="var(--protected)" strokeWidth="2" />
        </g>
      ))}
      <rect x="310" y="470" width="180" height="40" rx="6" fill="var(--model)" />
      <text x="400" y="540" textAnchor="middle" fill="var(--ink)" fontSize="18">
        server: the masks cancel, the sum remains
      </text>
      <text x="400" y="580" textAnchor="middle" fill="var(--ink-soft)" fontSize="16">
        Each pair shares a secret mask; one user adds it and the other subtracts it.
      </text>
    </svg>
  );
}
