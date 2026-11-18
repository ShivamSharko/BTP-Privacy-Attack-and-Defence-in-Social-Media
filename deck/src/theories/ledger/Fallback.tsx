import { buildTree, receiptBytes, short } from "./sim";

const SIZE = 7;
const PICK = 2;

/** Still diagram for browsers without WebGL: a seven-receipt RFC 6962 tree with one proof path. */
export function Fallback() {
  const tree = buildTree(Array.from({ length: SIZE }, (_, i) => receiptBytes(i)));
  const path = tree.pathTo(PICK);
  const onPath = new Set([path.leaf, ...path.ancestors]);
  const siblings = new Set(path.siblings);
  const X = (x: number) => 400 + x * 78;
  const Y = (y: number) => 300 - y * 82;
  return (
    <svg viewBox="0 0 800 600" role="img" aria-label="A Merkle tree over seven receipts; the hashes beside one receipt's path prove it is in the log">
      {tree.nodes.map((nd) =>
        nd.parent === null ? null : (
          <line
            key={`e${nd.key}`}
            x1={X(nd.x)}
            y1={Y(nd.y)}
            x2={X(tree.nodes[nd.parent].x)}
            y2={Y(tree.nodes[nd.parent].y)}
            stroke="var(--ledger)"
            strokeOpacity={onPath.has(nd.key) ? 1 : 0.3}
            strokeWidth={onPath.has(nd.key) ? 3 : 1.5}
          />
        ),
      )}
      {tree.nodes.map((nd) => {
        const strong = onPath.has(nd.key) || siblings.has(nd.key);
        const fill = strong ? "var(--ledger)" : "var(--muted)";
        return nd.level === 0 ? (
          <rect key={nd.key} x={X(nd.x) - 18} y={Y(nd.y) - 24} width={36} height={48} rx={4} fill={fill} />
        ) : (
          <circle key={nd.key} cx={X(nd.x)} cy={Y(nd.y)} r={nd.parent === null ? 20 : 12} fill={fill} />
        );
      })}
      {tree.nodes
        .filter((nd) => siblings.has(nd.key))
        .map((nd) => (
          <circle key={`h${nd.key}`} cx={X(nd.x)} cy={Y(nd.y)} r={nd.level === 0 ? 34 : 22} fill="none" stroke="var(--ledger)" strokeWidth="2" />
        ))}
      <text x={X(tree.nodes[tree.nodes.length - 1].x)} y={Y(tree.nodes[tree.nodes.length - 1].y) - 34} textAnchor="middle" fill="var(--ledger)" fontSize="20">
        root {short(tree.rootHex)}
      </text>
      <text x="400" y="560" textAnchor="middle" fill="var(--ink-soft)" fontSize="18">
        The ringed hashes beside receipt {PICK + 1}'s path are its inclusion proof.
      </text>
    </svg>
  );
}
