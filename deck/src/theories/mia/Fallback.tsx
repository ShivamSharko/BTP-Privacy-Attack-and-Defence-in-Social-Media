import { GAP_MAX, normalPdf, rates, sigmaFor } from "./sim";

/** Still diagram for browsers without WebGL: two loss distributions and the attacker's threshold. */
export function Fallback() {
  const sigma = sigmaFor(1);
  const threshold = -0.4;
  const x = (loss: number) => 400 + loss * 62;
  const curve = (mean: number) => {
    const pts: string[] = [];
    for (let loss = -5.2; loss <= 5.2; loss += 0.2)
      pts.push(`${x(loss).toFixed(1)},${(470 - normalPdf(loss, mean, sigma) * 520).toFixed(1)}`);
    return `M ${x(-5.2)},470 L ${pts.join(" L ")} L ${x(5.2)},470 Z`;
  };
  const r = rates(threshold, GAP_MAX, sigma);
  return (
    <svg
      viewBox="0 0 800 600"
      role="img"
      aria-label="Two distributions of loss, members lower than non-members, with a threshold line that flags everything to its left"
    >
      <path d={curve(-GAP_MAX / 2)} fill="var(--honest)" fillOpacity="0.35" stroke="var(--honest)" strokeWidth="2.5" />
      <path d={curve(GAP_MAX / 2)} fill="var(--noise)" fillOpacity="0.3" stroke="var(--noise)" strokeWidth="2.5" />
      <line
        x1={x(threshold)}
        y1="110"
        x2={x(threshold)}
        y2="470"
        stroke="var(--attacker)"
        strokeWidth="3"
        strokeDasharray="10 7"
      />
      <circle cx={x(threshold)} cy="104" r="9" fill="var(--attacker)" />
      <line x1="60" y1="470" x2="740" y2="470" stroke="var(--ink-soft)" strokeWidth="1.5" />
      <text x={x(-GAP_MAX / 2) - 30} y="180" textAnchor="middle" fill="var(--honest)" fontSize="19">
        members
      </text>
      <text x={x(GAP_MAX / 2) + 30} y="250" textAnchor="middle" fill="var(--noise)" fontSize="19">
        non-members
      </text>
      <text x={x(threshold)} y="80" textAnchor="middle" fill="var(--attacker)" fontSize="18">
        the attacker flags everyone to the left
      </text>
      <text x="70" y="500" fill="var(--ink-soft)" fontSize="17">
        lower loss
      </text>
      <text x="730" y="500" textAnchor="end" fill="var(--ink-soft)" fontSize="17">
        higher loss
      </text>
      <text x="400" y="545" textAnchor="middle" fill="var(--ink)" fontSize="18">
        Illustration: this threshold flags {(r.tpr * 100).toFixed(0)}% of members and {(r.fpr * 100).toFixed(0)}% of
        non-members.
      </text>
    </svg>
  );
}
