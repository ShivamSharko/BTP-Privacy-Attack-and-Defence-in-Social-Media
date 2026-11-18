import { type MutableRefObject, useMemo, useRef } from "react";
import { Color, type Group } from "three";
import { gaussian, rng } from "../../sim/random";
import { raw } from "../../data";
import { Arrow, type ArrowApi, Crowd, type CrowdApi, Label, Links, useActiveFrame, useRoles } from "../../world/kit";
import { aggregate, attackerUpdate, DIM, honestMean, makePopulation, N_USERS, norm, TARGET } from "./sim";
import { usePoison } from "./store";
import { Whiskers, type WhiskersApi } from "./Whiskers";

/** Scene units per unit of update, for tips and aggregates alike. */
export const S = 2.4;
/** Aggregates are means, so they are drawn this many times longer than one update to stay readable. */
export const AGG_K = 3;
const MASK_RADIUS = 2.9;

/** Where each masked update appears to be: nowhere in particular. */
function maskPositions(n: number): Float32Array {
  const r = rng(404);
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const v = [gaussian(r), Math.abs(gaussian(r)) * 0.7, gaussian(r)];
    const len = Math.hypot(v[0], v[1], v[2]) || 1;
    const radius = MASK_RADIUS * (0.55 + 0.45 * r());
    for (let d = 0; d < 3; d++) out[i * 3 + d] = (v[d] / len) * radius;
  }
  return out;
}

/** A small deterministic spread so identical attacker updates read as a tight cluster, not one dot. */
function jitter(n: number): Float32Array {
  const r = rng(77);
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n * 3; i++) out[i] = (r() - 0.5) * 0.16;
  return out;
}

const AXES = new Float32Array([
  -2.4, 0, 0, 4.4, 0, 0,
  0, 0, 0, 0, 3.0, 0,
  0, 0, 0, 0, 0, 3.0,
]);

export function CloudScene({ step, active, vis, on }: { step: number; active: boolean; vis: MutableRefObject<number>; on: boolean }) {
  const roles = useRoles();
  const share = usePoison((s) => s.share);
  const aggregator = usePoison((s) => s.aggregator);
  const view = usePoison((s) => s.view);
  const trim = raw<number>("poisoning", "settings/trim_fraction");

  const masked = step === 0 && view === "secure";
  const kind = step === 0 ? "sum" : aggregator;
  const pop = useMemo(() => makePopulation(N_USERS, share), [share]);
  const agg = useMemo(() => aggregate(pop, kind, trim), [pop, kind, trim]);
  const ghost = useMemo(() => honestMean(pop), [pop]);
  const masks = useMemo(() => maskPositions(N_USERS), []);
  const spread = useMemo(() => jitter(N_USERS), []);
  const zero = useMemo(() => new Float32Array(N_USERS * 3), []);

  const live = useRef({ pop, masked, agg, ghost });
  live.current = { pop, masked, agg, ghost };

  const group = useRef<Group>(null);
  const tips = useRef<CrowdApi>(null);
  const whiskers = useRef<WhiskersApi>(null);
  const aggArrow = useRef<ArrowApi>(null);
  const ghostArrow = useRef<ArrowApi>(null);
  const cur = useRef(new Float32Array(N_USERS * 3));
  const col = useRef(new Float32Array(N_USERS * 3));
  const aggCur = useRef(new Float32Array(3));
  const ghostCur = useRef(new Float32Array(3));
  const scratch = useMemo(() => ({ color: new Color() }), []);

  useActiveFrame(active, (_state, delta) => {
    const g = group.current;
    if (g) {
      const v = vis.current;
      g.visible = v > 0.01;
      g.scale.setScalar(0.001 + v * 0.999);
    }
    if (vis.current < 0.01) return;
    const { pop: p, masked: hidden, agg: a, ghost: h } = live.current;
    const ease = 1 - Math.exp(-delta * 7);
    const c = cur.current;
    const k = col.current;
    for (let u = 0; u < N_USERS; u++) {
      for (let d = 0; d < 3; d++) {
        const goal = hidden ? masks[u * 3 + d] : u < p.n ? p.updates[u * DIM + d] * S + (p.isAttacker[u] ? spread[u * 3 + d] : 0) : 0;
        c[u * 3 + d] += (goal - c[u * 3 + d]) * ease;
      }
      const role = hidden ? roles.noise : p.isAttacker[u] ? roles.attacker : roles.honest;
      k[u * 3] += (role.r - k[u * 3]) * ease;
      k[u * 3 + 1] += (role.g - k[u * 3 + 1]) * ease;
      k[u * 3 + 2] += (role.b - k[u * 3 + 2]) * ease;
      scratch.color.setRGB(k[u * 3], k[u * 3 + 1], k[u * 3 + 2]);
      tips.current?.setPosition(u, c[u * 3], c[u * 3 + 1], c[u * 3 + 2]);
      tips.current?.setColor(u, scratch.color);
      tips.current?.setScale(u, !hidden && p.isAttacker[u] ? 1.5 : 1);
      whiskers.current?.set(u, c[u * 3], c[u * 3 + 1], c[u * 3 + 2], k[u * 3], k[u * 3 + 1], k[u * 3 + 2]);
    }
    tips.current?.commit();
    whiskers.current?.commit();
    for (let d = 0; d < 3; d++) {
      aggCur.current[d] += (a[d] * S * AGG_K - aggCur.current[d]) * ease;
      ghostCur.current[d] += (h[d] * S * AGG_K - ghostCur.current[d]) * ease;
    }
    aggArrow.current?.set([0, 0, 0], [aggCur.current[0], aggCur.current[1], aggCur.current[2]]);
    ghostArrow.current?.set([0, 0, 0], [ghostCur.current[0], ghostCur.current[1], ghostCur.current[2]]);
  });

  const aggTip: [number, number, number] = [agg[0] * S * AGG_K + 1.1, agg[1] * S * AGG_K - 0.1, agg[2] * S * AGG_K];
  const ghostTip: [number, number, number] = [ghost[0] * S * AGG_K, ghost[1] * S * AGG_K, ghost[2] * S * AGG_K];
  const far = Math.hypot(agg[0] - ghost[0], agg[1] - ghost[1], agg[2] - ghost[2]) * S * AGG_K > 0.9;
  const clusterX = attackerUpdate()[TARGET] * S;
  const aggName = `${kind === "sum" ? "the average" : kind === "trimmed" ? "trimmed mean" : "median"} (drawn ${AGG_K} times longer)`;

  return (
    <group ref={group}>
      <Links segments={AXES} role="muted" opacity={0.55} />
      <Whiskers count={N_USERS} apiRef={whiskers} opacity={0.42} />
      <Crowd count={N_USERS} positions={zero} size={0.075} apiRef={tips} />
      <Arrow from={[0, 0, 0]} to={[0.01, 0, 0]} role="honest" width={0.035} opacity={0.55} apiRef={ghostArrow} />
      <Arrow from={[0, 0, 0]} to={[0.01, 0, 0]} role="model" width={0.075} apiRef={aggArrow} />
      <mesh>
        <icosahedronGeometry args={[0.09, 1]} />
        <meshBasicMaterial color={roles.model} toneMapped={false} />
      </mesh>

      {on ? (
        <>
      <Label position={[4.7, 0, 0]} tone="attacker" small>
        target business
      </Label>
      <Label position={[0, 3.3, 0]} tone="muted" small>
        another business
      </Label>
      <Label position={[0, 0, 3.4]} tone="muted" small>
        a third business
      </Label>
      {norm(agg) >= 0.02 ? (
        <Label position={aggTip} tone="model" small>
        {aggName}
      </Label>
      ) : null}
      {far && !masked ? (
        <Label position={[ghostTip[0] - 1.0, ghostTip[1] + 0.15, ghostTip[2]]} tone="honest" small>
          honest users alone
        </Label>
      ) : null}
      {!masked && step === 0 && pop.nAttackers > 0 ? (
        <Label position={[clusterX, 0.75, 0]} tone="attacker" small>
          {pop.nAttackers} attackers, identical updates
        </Label>
      ) : null}
      {masked ? (
        <Label position={[0, -2.4, 0]} tone="noise" small>
          what the server sees: masked updates
        </Label>
      ) : null}
      {norm(agg) < 0.02 && step === 1 ? (
        <Label position={[0, -0.7, 0]} tone="model" small>
          nothing left
        </Label>
      ) : null}
        </>
      ) : null}
    </group>
  );
}
