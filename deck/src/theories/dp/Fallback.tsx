import { normalPdf } from "./sim";

/** Still diagram for browsers without WebGL: the two overlapping output clouds, and clipping to a ball of radius C. */
export function Fallback() {
  const curve = (mu: number) =>
    Array.from({ length: 81 }, (_, i) => {
      const x = -4 + i * 0.1;
      return `${(60 + (x + 4) * 50).toFixed(1)},${(330 - normalPdf(x - mu) * 400).toFixed(1)}`;
    }).join(" ");
  const arrows = [
    [1.6, -0.4],
    [0.7, -1.1],
    [-0.5, -1.4],
    [-1.3, 0.2],
    [0.4, 0.6],
  ].map(([x, y]) => {
    const length = Math.hypot(x, y);
    const k = Math.min(1, 1 / length);
    return { raw: [x, y], clipped: [x * k, y * k], clipped_: length > 1 };
  });
  return (
    <svg viewBox="0 0 800 600" role="img" aria-label="Two overlapping clouds of possible outputs, with and without one user; and updates clipped to a ball of radius C">
      <polyline points={curve(-0.45)} fill="var(--honest)" fillOpacity="0.15" stroke="var(--honest)" strokeWidth="2.5" />
      <polyline points={curve(0.45)} fill="var(--model)" fillOpacity="0.12" stroke="var(--model)" strokeWidth="2.5" />
      <line x1="60" y1="330" x2="460" y2="330" stroke="var(--muted)" strokeWidth="1.5" />
      <text x="260" y="370" textAnchor="middle" fill="var(--ink)" fontSize="18">
        outputs with you, and without you
      </text>

      <circle cx="620" cy="250" r="90" fill="var(--protected)" fillOpacity="0.1" stroke="var(--protected)" strokeWidth="2" />
      {arrows.map((a, i) => (
        <g key={i}>
          {a.clipped_ && (
            <line x1="620" y1="250" x2={620 + a.raw[0] * 90} y2={250 + a.raw[1] * 90} stroke="var(--honest)" strokeOpacity="0.3" strokeWidth="2" strokeDasharray="5 5" />
          )}
          <line
            x1="620"
            y1="250"
            x2={620 + a.clipped[0] * 90}
            y2={250 + a.clipped[1] * 90}
            stroke={a.clipped_ ? "var(--protected)" : "var(--honest)"}
            strokeWidth="4"
            strokeLinecap="round"
          />
        </g>
      ))}
      <text x="620" y="400" textAnchor="middle" fill="var(--ink)" fontSize="18">
        updates clipped to radius C
      </text>
      <text x="400" y="540" textAnchor="middle" fill="var(--ink-soft)" fontSize="18">
        Clip each user's update, add noise once to the sum: one user barely changes the result.
      </text>
    </svg>
  );
}
