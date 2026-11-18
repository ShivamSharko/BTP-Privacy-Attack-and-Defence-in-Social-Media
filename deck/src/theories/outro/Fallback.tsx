import { accountLayout } from "./layout";
import { MAX_FAKES, N_USERS } from "./sim";

/** Still diagram for browsers without WebGL: the sandbox federation, real users and a few fake accounts around the model. */
export function Fallback() {
  const layout = accountLayout();
  const points = Array.from({ length: N_USERS + MAX_FAKES }, (_, i) => ({
    x: 400 + layout[i * 3] * 62,
    y: 290 + layout[i * 3 + 2] * 34 - layout[i * 3 + 1] * 30,
    fake: i >= N_USERS,
  })).filter((p, i) => !p.fake || i % 4 === 0);
  return (
    <svg viewBox="0 0 800 600" role="img" aria-label="Real users in four taste groups and a few fake accounts around a shared model">
      {points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={p.fake ? 6 : 5} fill={p.fake ? "var(--attacker)" : "var(--honest)"} />
      ))}
      <polygon points="400,252 436,274 436,312 400,334 364,312 364,274" fill="none" stroke="var(--model)" strokeWidth="2.5" />
      <circle cx="400" cy="293" r="16" fill="var(--model)" />
      <circle cx="404" cy="356" r="7" fill="var(--attacker)" />
      <text x="400" y="390" textAnchor="middle" fill="var(--ink)" fontSize="18">
        shared model and the promoted item
      </text>
      <text x="400" y="560" textAnchor="middle" fill="var(--ink-soft)" fontSize="18">
        Attack and defence together: fake accounts push one item; the aggregator and the noise push back.
      </text>
    </svg>
  );
}
