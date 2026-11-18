import { deviceRing, N_DEVICES, simulateRound } from "./sim";

/** Still diagram for browsers without WebGL: a ring of devices, solid packets from honest ones, hollow from free-riders. */
export function Fallback() {
  const ring = deviceRing(N_DEVICES);
  const round = simulateRound(0.25, "noise", 5);
  const points = Array.from({ length: N_DEVICES }, (_, i) => {
    const x = ring[i * 3];
    const z = ring[i * 3 + 2];
    return { x: 400 + x * 70, y: 270 + z * 36, rider: round.isRider[i], px: 400 + x * 70 * 0.55, py: 270 + z * 36 * 0.55 };
  });
  return (
    <svg viewBox="0 0 800 600" role="img" aria-label="A ring of devices around the shared model. Honest devices send solid packets and free-riders send hollow ones.">
      {points.map((p, i) => (
        <g key={i}>
          <line x1={p.x} y1={p.y} x2={p.px} y2={p.py} stroke={p.rider ? "var(--noise)" : "var(--honest)"} strokeOpacity="0.3" strokeWidth="1.5" />
          <circle cx={p.x} cy={p.y} r="6" fill={p.rider ? "var(--noise)" : "var(--honest)"} />
          {p.rider ? (
            <circle cx={p.px} cy={p.py} r="7" fill="none" stroke="var(--noise)" strokeWidth="2" strokeDasharray="3 2" />
          ) : (
            <circle cx={p.px} cy={p.py} r="6" fill="var(--honest)" />
          )}
        </g>
      ))}
      <polygon points="400,232 436,254 436,292 400,314 364,292 364,254" fill="none" stroke="var(--model)" strokeWidth="2.5" />
      <circle cx="400" cy="273" r="14" fill="var(--model)" />
      <g fontSize="17" fill="var(--ink)">
        <text x="400" y="470" textAnchor="middle">solid packet: a real update. Hollow packet: a free-rider's zeros or noise.</text>
        <text x="400" y="500" textAnchor="middle" fill="var(--ink-soft)">
          A server that sees each update can check its norm and its cosine to the others; a secure sum hides both.
        </text>
      </g>
    </svg>
  );
}
