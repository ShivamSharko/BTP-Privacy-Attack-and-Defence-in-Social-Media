import { deviceLayout, N_DEVICES } from "./sim";

/** Still diagram for browsers without WebGL: devices around the shared model, some of them sending. */
export function Fallback() {
  const layout = deviceLayout(N_DEVICES, 2);
  const points = Array.from({ length: N_DEVICES }, (_, i) => ({
    x: 400 + layout[i * 3] * 62,
    y: 300 + layout[i * 3 + 2] * 34 - layout[i * 3 + 1] * 30,
    chosen: i % 4 === 0,
  }));
  return (
    <svg viewBox="0 0 800 600" role="img" aria-label="Devices around a shared model; a sampled few send their updates to it">
      {points
        .filter((p) => p.chosen)
        .map((p, i) => (
          <line key={i} x1={p.x} y1={p.y} x2={400} y2={300} stroke="var(--honest)" strokeOpacity="0.35" strokeWidth="1.5" />
        ))}
      {points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={p.chosen ? 8 : 5} fill={p.chosen ? "var(--honest)" : "var(--muted)"} />
      ))}
      <polygon points="400,262 436,284 436,322 400,344 364,322 364,284" fill="none" stroke="var(--model)" strokeWidth="2.5" />
      <circle cx="400" cy="303" r="16" fill="var(--model)" />
      <text x="400" y="380" textAnchor="middle" fill="var(--ink)" fontSize="18">
        shared model
      </text>
      <text x="400" y="560" textAnchor="middle" fill="var(--ink-soft)" fontSize="18">
        Each round a random sample of devices sends an update; the data stays where it is.
      </text>
    </svg>
  );
}
