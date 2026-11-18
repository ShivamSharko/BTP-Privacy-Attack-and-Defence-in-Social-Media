import { type MutableRefObject, useMemo, useRef } from "react";
import { BoxGeometry, Color, type InstancedMesh, type Mesh, Object3D } from "three";
import { fmt } from "../../data";
import { rng } from "../../sim/random";
import { Crowd, type CrowdApi, Label, Links, type Role, useActiveFrame, useRoles, useStepTimeline } from "../../world/kit";
import { REPLAY } from "./figures";
import { useOutro } from "./store";

/** Seconds one replay takes. */
export const REPLAY_SECONDS = 4.5;
const FLOOR = -2.6;

/** Replay progress from 0 to 1, and whether the station is on screen. */
type Prog = MutableRefObject<{ p: number; active: boolean }>;

/** A bar standing on the floor that grows to its height as the replay plays. */
function Bar({ x, z = 0, height, role, prog, from = 0, to = 1, children }: { x: number; z?: number; height: number; role: Role; prog: Prog; from?: number; to?: number; children: string }) {
  const roles = useRoles();
  const mesh = useRef<Mesh>(null);
  const geometry = useMemo(() => new BoxGeometry(0.8, 1, 0.8).translate(0, 0.5, 0), []);
  useActiveFrame(prog.current.active, () => {
    const k = Math.min(1, Math.max(0, (prog.current.p - from) / (to - from)));
    if (mesh.current) mesh.current.scale.set(1, Math.max(0.001, height * k), 1);
  });
  return (
    <>
      <mesh ref={mesh} geometry={geometry} position={[x, FLOOR, z]}>
        <meshStandardMaterial color={roles[role]} roughness={0.5} />
      </mesh>
      <Label position={[x, FLOOR + height + 0.45, z]} tone={role} small>
        {children}
      </Label>
    </>
  );
}

/* ------------------------------------------------------------ 1. small cohorts, no amplification */

function CohortReplay({ prog }: { prog: Prog }) {
  const roles = useRoles();
  const n = 60;
  const ring = useMemo(() => {
    const out = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      out.set([Math.cos(a) * 3.6, FLOOR + 0.3, Math.sin(a) * 3.6], i * 3);
    }
    return out;
  }, []);
  // Which users each of 40 shown rounds samples, at the small regime's rate.
  const rounds = useMemo(() => {
    const r = rng(5);
    return Array.from({ length: 40 }, () => {
      const chosen = new Uint8Array(n);
      for (let i = 0; i < n; i++) chosen[i] = r() < REPLAY.cohort.rate ? 1 : 0;
      return chosen;
    });
  }, []);
  const api = useRef<CrowdApi>(null);
  const color = useMemo(() => new Color(), []);
  useActiveFrame(prog.current.active, () => {
    const k = Math.min(rounds.length - 1, Math.floor(prog.current.p * rounds.length));
    for (let i = 0; i < n; i++) {
      const on = prog.current.p < 1 && rounds[k][i] === 1;
      color.copy(roles.muted).lerp(roles.honest, on ? 1 : 0.35);
      api.current?.setColor(i, color);
      api.current?.setScale(i, on ? 2 : 0.9);
    }
    api.current?.commit();
  });
  const { amplified, unamplified } = REPLAY.cohort;
  const scale = (e: number) => (4.8 * Math.log10(1 + e)) / Math.log10(1 + unamplified);
  return (
    <group>
      <Crowd count={n} positions={ring} apiRef={api} />
      <Bar x={-0.9} height={scale(amplified)} role="protected" prog={prog}>
        {`ε ${fmt.n(amplified, 1)}, counted with sampling`}
      </Bar>
      <Bar x={0.9} height={scale(unamplified)} role="attacker" prog={prog}>
        {`ε ${fmt.n(unamplified, 0)}, counted without`}
      </Bar>
      <Label position={[0, 3.2, 0]} small>
        bar heights on a log scale
      </Label>
    </group>
  );
}

/* ------------------------------------------------------------ 2. a robust aggregator erases the model */

function ErasedModel({ x, ndcg, label, role, prog }: { x: number; ndcg: number; label: string; role: Role; prog: Prog }) {
  const roles = useRoles();
  const mesh = useRef<Mesh>(null);
  const size = 1.15 * (ndcg / REPLAY.robust.sum);
  useActiveFrame(prog.current.active, (state) => {
    const k = Math.min(1, prog.current.p * 1.25);
    if (mesh.current) {
      mesh.current.scale.setScalar(Math.max(0.02, size * k));
      mesh.current.rotation.y = state.clock.elapsedTime * 0.4;
    }
  });
  return (
    <>
      <mesh ref={mesh} position={[x, 0.2, 0]}>
        <icosahedronGeometry args={[1, 1]} />
        <meshStandardMaterial color={roles[role]} roughness={0.35} flatShading />
      </mesh>
      <Label position={[x, -1.65, 0]} tone={role} small>
        {`${label}: NDCG@10 ${fmt.ndcg(ndcg)}`}
      </Label>
    </>
  );
}

function RobustReplay({ prog }: { prog: Prog }) {
  const { sum, trimmed, median } = REPLAY.robust;
  return (
    <group>
      <ErasedModel x={-2.8} ndcg={sum} label="plain sum" role="model" prog={prog} />
      <ErasedModel x={0} ndcg={trimmed} label="trimmed mean" role="noise" prog={prog} />
      <ErasedModel x={2.8} ndcg={median} label="median" role="noise" prog={prog} />
      <Label position={[0, 2.6, 0]} small>
        no attackers at all; size shows quality
      </Label>
    </group>
  );
}

/* ------------------------------------------------------------ 3. gossip under local noise */

const NODES = 36;

function GossipReplay({ prog }: { prog: Prog }) {
  const roles = useRoles();
  const { positions, segments } = useMemo(() => {
    const r = rng(8);
    const pos = new Float32Array(NODES * 3);
    for (let i = 0; i < NODES; i++) {
      const a = r() * Math.PI * 2;
      const d = 2.6 * Math.sqrt(r());
      pos.set([-2.4 + Math.cos(a) * d, 0.2 + (r() - 0.5) * 1.2, Math.sin(a) * d], i * 3);
    }
    const seg: number[] = [];
    for (let i = 0; i < NODES; i++) {
      for (let k = 0; k < 2; k++) {
        let best = -1;
        let bestD = Infinity;
        for (let j = 0; j < NODES; j++) {
          if (j === i) continue;
          const d = Math.hypot(pos[i * 3] - pos[j * 3], pos[i * 3 + 2] - pos[j * 3 + 2]) + r() * 0.8;
          if (d < bestD) {
            bestD = d;
            best = j;
          }
        }
        seg.push(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2], pos[best * 3], pos[best * 3 + 1], pos[best * 3 + 2]);
      }
    }
    return { positions: pos, segments: new Float32Array(seg) };
  }, []);
  const api = useRef<CrowdApi>(null);
  const color = useMemo(() => new Color(), []);
  useActiveFrame(prog.current.active, (state) => {
    const t = state.clock.elapsedTime;
    const shake = 0.12 * Math.min(1, prog.current.p * 3);
    for (let i = 0; i < NODES; i++) {
      api.current?.setPosition(
        i,
        positions[i * 3] + shake * Math.sin(t * 17 + i * 1.3),
        positions[i * 3 + 1] + shake * Math.sin(t * 19 + i * 2.1),
        positions[i * 3 + 2] + shake * Math.cos(t * 15 + i),
      );
      color.copy(roles.honest).lerp(roles.noise, Math.min(1, prog.current.p * 2) * (0.5 + 0.5 * Math.sin(t * 9 + i)));
      api.current?.setColor(i, color);
    }
    api.current?.commit();
  });
  const { federated, gossip } = REPLAY.gossip;
  const scale = (v: number) => (3.6 * v) / federated;
  return (
    <group>
      <Links segments={segments} role="noise" opacity={0.45} />
      <Crowd count={NODES} positions={positions} size={0.1} apiRef={api} />
      <Bar x={1.5} height={scale(federated)} role="protected" prog={prog} from={0.3}>
        {`server, central noise: ${fmt.ndcg(federated)}`}
      </Bar>
      <Bar x={2.9} height={scale(gossip)} role="noise" prog={prog} from={0.3}>
        {`gossip, local noise: ${fmt.ndcg(gossip)}`}
      </Bar>
      <Label position={[-2.4, 2.0, 0]} tone="noise" small>
        every friend adds noise to every message
      </Label>
    </group>
  );
}

/* ------------------------------------------------------------ 4. a blocked release */

const COLS = 11;

function LedgerReplay({ prog }: { prog: Prog }) {
  const roles = useRoles();
  const { asked, allowed, released, budget } = REPLAY.ledger;
  const slots = Math.max(1, Math.round(asked));
  const mesh = useRef<InstancedMesh>(null);
  const meter = useRef<Mesh>(null);
  const dummy = useMemo(() => new Object3D(), []);
  const geometry = useMemo(() => new BoxGeometry(0.55, 0.55, 0.12), []);
  const place = (i: number) => {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    return [-3.75 + col * 0.75, 0.7 - row * 0.85, 0] as const;
  };
  useActiveFrame(prog.current.active, () => {
    const m = mesh.current;
    if (!m) return;
    const shown = prog.current.p * (allowed + 1.5);
    for (let i = 0; i < slots; i++) {
      const [x, y, z] = place(i);
      const done = i < allowed;
      const refusal = i === allowed;
      const appear = done || refusal ? Math.min(1, Math.max(0, shown - i)) : prog.current.p > 0.9 ? 0.5 : 0;
      dummy.position.set(x, y, z);
      dummy.scale.setScalar(Math.max(0.001, appear));
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
      m.setColorAt(i, done ? roles.ledger : refusal ? roles.attacker : roles.muted);
    }
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    if (meter.current) {
      const k = Math.min(1, prog.current.p * ((allowed + 1.5) / allowed));
      const w = Math.max(0.001, 8 * (released / budget) * k);
      meter.current.scale.set(w, 1, 1);
      meter.current.position.x = -4 + w / 2;
    }
  });
  const limit = useMemo(() => new Float32Array([4, 2.05, 0, 4, 2.75, 0]), []);
  const [rx, ry] = place(Math.min(slots - 1, Math.round(allowed)));
  return (
    <group position={[0, -0.9, 0]} scale={0.85}>
      <instancedMesh ref={mesh} args={[geometry, undefined, slots]} frustumCulled={false}>
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      <mesh ref={meter} position={[-4, 2.4, 0]}>
        <boxGeometry args={[1, 0.35, 0.2]} />
        <meshBasicMaterial color={roles.protected} toneMapped={false} />
      </mesh>
      <Links segments={limit} role="attacker" opacity={0.9} />
      <Label position={[0, 3.05, 0]} tone="protected" small>
        {`privacy spent: ε ${fmt.n(released, 2)} of a budget of ${fmt.n(budget, 1)}`}
      </Label>
      <Label position={[rx, ry - 0.6, 0.2]} tone="attacker" small>
        refused
      </Label>
      <Label position={[0, -2.0, 0]} tone="ledger" small>
        {`${allowed} round receipts; ${asked - allowed} more rounds asked for, never run`}
      </Label>
    </group>
  );
}

/* ------------------------------------------------------------ the four replays */

export function ReplayScene({ active }: { active: boolean }) {
  const replay = useOutro((s) => s.replay);
  const nonce = useOutro((s) => s.replayNonce);
  const prog = useRef({ p: 0, active });
  prog.current.active = active;

  useStepTimeline(
    replay,
    (tl) => {
      tl.fromTo(prog.current, { p: 0 }, { p: 1, duration: REPLAY_SECONDS, ease: "power1.inOut" });
    },
    [nonce],
  );

  return (
    <group>
      {replay === 0 ? <CohortReplay prog={prog} /> : null}
      {replay === 1 ? <RobustReplay prog={prog} /> : null}
      {replay === 2 ? <GossipReplay prog={prog} /> : null}
      {replay === 3 ? <LedgerReplay prog={prog} /> : null}
    </group>
  );
}
