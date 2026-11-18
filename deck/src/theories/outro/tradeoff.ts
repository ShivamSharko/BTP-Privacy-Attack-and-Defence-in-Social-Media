/** The trade-off points of the closing scatter: measured configurations placed on three display axes. */

const clamp = (x: number, lo: number, hi: number) => (Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : lo);

export interface LevelIn {
  id: string;
  label: string;
  regime: "large" | "small";
  /** null for the non-private level. */
  epsilon: number | null;
  ndcg: number;
}

export interface ModeIn {
  id: string;
  label: string;
  ndcg: number;
  /** Target exposure at the attacker share shown. */
  exposure: number;
}

export interface TradeoffInput {
  levels: LevelIn[];
  modes: ModeIn[];
  gossip: { ndcg: number; epsilon: number } | null;
}

export type TradeoffGroup = "dp" | "poison" | "gossip";

export interface TradeoffPoint {
  id: string;
  label: string;
  group: TradeoffGroup;
  epsilon: number | null;
  ndcg: number;
  exposure: number | null;
  /** 0 at the open end (no noise), 1 at epsilon 1. */
  privacy: number;
  /** NDCG@10 as measured. */
  utility: number;
  /** 1 minus target exposure; null where robustness was not measured. */
  robustness: number | null;
  x: number;
  y: number;
  z: number;
  /** Where clicking the point goes. */
  hash: string;
}

export const AXES = {
  x: [-4, 4] as const,
  y: [-2.6, 2.8] as const,
  z: [-2.2, 3] as const,
  /** The plane where points with no robustness measurement sit. */
  unmeasuredZ: -3.6,
};

/**
 * Display scale for epsilon: 1 at epsilon 1, falling by 0.2 for each doubling, never below
 * 0.1 for a finite epsilon. No noise (null), or a value that is not a positive number, is 0.
 */
export function privacyScale(epsilon: number | null): number {
  if (epsilon === null || !Number.isFinite(epsilon) || epsilon <= 0) return 0;
  return clamp(1 - Math.log2(epsilon) / 5, 0.1, 1);
}

export function tradeoffPoints(input: TradeoffInput): TradeoffPoint[] {
  const raw: Omit<TradeoffPoint, "x" | "y" | "z">[] = [];
  const finite = (v: number) => (Number.isFinite(v) ? v : 0);
  for (const l of input.levels) {
    raw.push({ id: l.id, label: l.label, group: "dp", epsilon: l.epsilon, ndcg: finite(l.ndcg), exposure: null, privacy: privacyScale(l.epsilon), utility: finite(l.ndcg), robustness: null, hash: "#/dp/1" });
  }
  for (const mo of input.modes) {
    const exposure = clamp(mo.exposure, 0, 1);
    raw.push({ id: mo.id, label: mo.label, group: "poison", epsilon: null, ndcg: finite(mo.ndcg), exposure, privacy: 0, utility: finite(mo.ndcg), robustness: 1 - exposure, hash: "#/poison/1" });
  }
  if (input.gossip) {
    const g = input.gossip;
    raw.push({ id: "gossip", label: `gossip, local epsilon ${g.epsilon}`, group: "gossip", epsilon: g.epsilon, ndcg: finite(g.ndcg), exposure: null, privacy: privacyScale(g.epsilon), utility: finite(g.ndcg), robustness: null, hash: "#/gossip/1" });
  }
  const top = Math.max(1e-9, ...raw.map((p) => p.utility));
  return raw.map((p) => ({
    ...p,
    x: AXES.x[0] + (AXES.x[1] - AXES.x[0]) * p.privacy,
    y: AXES.y[0] + (AXES.y[1] - AXES.y[0]) * clamp(p.utility / top, 0, 1),
    z: p.robustness === null ? AXES.unmeasuredZ : AXES.z[0] + (AXES.z[1] - AXES.z[0]) * p.robustness,
  }));
}
