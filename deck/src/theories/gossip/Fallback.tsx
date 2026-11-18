import { DEFAULT_DEGREE, GRAPH, ORDER, takePeers } from "./sim";

const colourOf = (c: number, groups: number) => `color-mix(in srgb, var(--protected) ${Math.round((1 - (c + 0.5) / groups) * 100)}%, var(--honest))`;

/** Still diagram for browsers without WebGL: four friend communities, friend and random-contact lines. */
export function Fallback() {
  const table = takePeers(ORDER, DEFAULT_DEGREE);
  const groups = Math.max(...GRAPH.community) + 1;
  const at = (i: number) => ({ x: 400 + GRAPH.pos[i * 3] * 70, y: 290 + GRAPH.pos[i * 3 + 2] * 38 - GRAPH.pos[i * 3 + 1] * 26 });
  return (
    <svg viewBox="0 0 800 600" role="img" aria-label="A friend network in four communities; each user averages models with a few friends and random contacts">
      {table.peers.map((row, i) =>
        row.map((peer, c) => {
          const a = at(i);
          const b = at(peer);
          const friend = table.isFriend[i][c];
          return (
            <line key={`${i}-${c}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={friend ? "var(--honest)" : "var(--muted)"} strokeOpacity={friend ? 0.4 : 0.3} strokeWidth="1.2" />
          );
        }),
      )}
      {GRAPH.community.map((c, i) => (
        <circle key={i} cx={at(i).x} cy={at(i).y} r="6" style={{ fill: colourOf(c, groups) }} />
      ))}
      <text x="400" y="540" textAnchor="middle" fill="var(--ink-soft)" fontSize="18">
        No server: each user averages models with friends (amber lines) and random contacts (grey lines).
      </text>
    </svg>
  );
}
