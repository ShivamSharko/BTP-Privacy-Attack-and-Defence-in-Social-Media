import { CATALOGUE as cat, itemVector, scores, topK, userVector } from "./sim";

const NAMES = ["coffee shops", "restaurants", "bars", "shops"];

/** Still diagram: normalised item vectors seen from the front, one user arrow, its ten best places lit. */
export function Fallback() {
  const history = [0, 1, 2, 3, 4];
  const user = userVector(cat, history, "hybrid");
  const top = new Set(topK(scores(cat, user, 20, "hybrid"), 10, history));
  const inHistory = new Set(history);
  const at = (v: readonly number[], k = 1) => ({ x: 400 + v[0] * 215 * k, y: 300 - v[1] * 215 * k });
  const tip = at(user, 0.9);
  return (
    <svg viewBox="0 0 800 600" role="img" aria-label="Places drawn as points on a sphere in four groups; the user arrow points at the places of their history and the ten best matches are lit">
      <circle cx={400} cy={300} r={218} fill="none" stroke="var(--muted)" strokeOpacity={0.5} strokeWidth={1.5} />
      {cat.centres.map((c, k) => {
        const p = at(c, 1.2);
        return (
          <text key={NAMES[k]} x={p.x} y={p.y} textAnchor="middle" fontSize={16} fill="var(--ink-soft)">
            {NAMES[k]}
          </text>
        );
      })}
      {cat.pop.map((pop, i) => {
        const p = at(itemVector(cat, i, "hybrid"));
        const fill = inHistory.has(i) ? "var(--honest)" : top.has(i) ? "var(--model)" : "var(--muted)";
        return <circle key={i} cx={p.x} cy={p.y} r={4 + 6 * Math.sqrt(pop) + (inHistory.has(i) || top.has(i) ? 2 : 0)} fill={fill} />;
      })}
      <line x1={400} y1={300} x2={tip.x} y2={tip.y} stroke="var(--honest)" strokeWidth={4} strokeLinecap="round" />
      <circle cx={400} cy={300} r={6} fill="var(--honest)" />
      <text x={400} y={570} textAnchor="middle" fontSize={18} fill="var(--ink-soft)">
        The user arrow is the mean of their history; the ten best matches, with popularity, are recommended.
      </text>
    </svg>
  );
}
