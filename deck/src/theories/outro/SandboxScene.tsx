import { useEffect, useMemo, useRef } from "react";
import { Color, type Mesh, type MeshBasicMaterial, type MeshStandardMaterial } from "three";
import { Crowd, type CrowdApi, Label, Links, useActiveFrame, useRoles } from "../../world/kit";
import { accountLayout } from "./layout";
import { fakeCount, MAX_FAKES, N_GROUPS, N_ITEMS, N_USERS, TARGET } from "./sim";
import { useOutro } from "./store";

const ACCOUNTS = N_USERS + MAX_FAKES;
const ITEM_RADIUS = 1.95;
const CORE = 0.62;

/** Items sit on an inner ring, each group's items facing that group's users; the target sits in a gap at the front. */
function itemLayout(): Float32Array {
  const out = new Float32Array(N_ITEMS * 3);
  const span = (Math.PI * 2) / N_GROUPS - 0.5;
  for (let i = 0; i < N_ITEMS; i++) {
    let angle: number;
    if (i === TARGET) angle = Math.PI / 2 + 0.05;
    else {
      const g = Math.floor(i / 10);
      angle = (g / N_GROUPS) * Math.PI * 2 + 0.12 + (span * ((i % 10) + 0.5)) / 10;
    }
    const radius = i === TARGET ? ITEM_RADIUS + 0.5 : ITEM_RADIUS;
    out[i * 3] = Math.cos(angle) * radius;
    out[i * 3 + 1] = i === TARGET ? -0.2 : 0;
    out[i * 3 + 2] = Math.sin(angle) * radius;
  }
  return out;
}

/**
 * The sandbox federation: real users (amber) in four taste groups on the outer ring, fake
 * accounts (pink-red) on a higher, wider arc, items on an inner ring around the shared model.
 * Each round the sampled accounts flash and send a line to the model; the promoted item grows
 * with its exposure and the noise multiplier makes the items tremble.
 */
export function SandboxScene({ active, labels }: { active: boolean; labels: boolean }) {
  const roles = useRoles();
  const share = useOutro((s) => s.settings.share);
  const round = useOutro((s) => s.round);
  const running = useOutro((s) => s.running);
  const cohort = useOutro((s) => s.cohort);
  const tickId = useOutro((s) => s.tickId);

  const accounts = useMemo(() => accountLayout(), []);
  const items = useMemo(() => itemLayout(), []);
  const fakes = fakeCount(share);

  const users = useRef<CrowdApi>(null);
  const itemApi = useRef<CrowdApi>(null);
  const core = useRef<Mesh>(null);
  const shell = useRef<Mesh>(null);
  const flash = useRef(new Float32Array(ACCOUNTS));
  const pulse = useRef(0);
  const shown = useRef({ exposure: 0, noise: 0 });
  const scratch = useMemo(() => ({ color: new Color() }), []);

  // A round happened: the sampled accounts flash and the model pulses.
  useEffect(() => {
    for (const a of cohort) if (a < ACCOUNTS) flash.current[a] = 1;
    if (cohort.length > 0) pulse.current = 1;
  }, [tickId, cohort]);

  const segments = useMemo(() => {
    const out = new Float32Array(cohort.length * 6);
    cohort.forEach((a, k) => {
      const x = accounts[a * 3];
      const y = accounts[a * 3 + 1];
      const z = accounts[a * 3 + 2];
      const len = Math.hypot(x, y, z) || 1;
      out.set([x, y, z, (x / len) * CORE, (y / len) * CORE, (z / len) * CORE], k * 6);
    });
    return out;
  }, [cohort, accounts]);
  const segmentColors = useMemo(() => {
    const out = new Float32Array(cohort.length * 6);
    cohort.forEach((a, k) => {
      const c = a >= N_USERS ? roles.attacker : roles.honest;
      out.set([c.r, c.g, c.b, c.r, c.g, c.b], k * 6);
    });
    return out;
  }, [cohort, roles]);

  useActiveFrame(active, (state, delta) => {
    const t = state.clock.elapsedTime;
    const s = useOutro.getState();
    const ease = 1 - Math.exp(-delta * 4);
    shown.current.exposure += (s.exposure - shown.current.exposure) * ease;
    shown.current.noise += (s.settings.noise - shown.current.noise) * ease;
    const exposure = shown.current.exposure;
    const noise = shown.current.noise;
    const nFakes = fakeCount(s.settings.share);
    const decay = Math.exp(-delta * 5);

    const u = users.current;
    if (u) {
      for (let a = 0; a < ACCOUNTS; a++) {
        const fake = a >= N_USERS;
        const on = !fake || a - N_USERS < nFakes;
        const f = (flash.current[a] *= decay);
        const base = fake ? roles.attacker : roles.honest;
        scratch.color.copy(roles.muted).lerp(base, 0.55 + 0.45 * f);
        u.setColor(a, scratch.color);
        u.setScale(a, on ? 0.85 + f * 0.9 : 0);
      }
      u.commit();
    }

    const it = itemApi.current;
    if (it) {
      const tremble = Math.min(noise, 3) * 0.05;
      for (let i = 0; i < N_ITEMS; i++) {
        const x = items[i * 3];
        const y = items[i * 3 + 1];
        const z = items[i * 3 + 2];
        it.setPosition(i, x + tremble * Math.sin(t * 11 + i * 1.7), y + tremble * Math.sin(t * 13 + i * 2.3), z + tremble * Math.cos(t * 12 + i));
        if (i === TARGET) {
          it.setColor(i, roles.attacker);
          it.setScale(i, 1 + exposure * 2.6);
        } else {
          scratch.color.copy(roles.muted).lerp(roles.model, 0.7);
          it.setColor(i, scratch.color);
          it.setScale(i, 0.8);
        }
      }
      it.commit();
    }

    pulse.current *= Math.exp(-delta * 6);
    if (core.current) {
      core.current.scale.setScalar(1 + pulse.current * 0.18);
      const mat = core.current.material as MeshStandardMaterial;
      mat.color.copy(roles.model).lerp(roles.attacker, exposure * 0.75);
    }
    if (shell.current) {
      const mat = shell.current.material as MeshBasicMaterial;
      mat.color.copy(roles.model).lerp(roles.attacker, exposure);
    }
    if (shell.current) shell.current.rotation.y += delta * (0.1 + (s.running ? 0.5 : 0));
  });

  const targetAt: [number, number, number] = [items[TARGET * 3] + 0.85, items[TARGET * 3 + 1] - 0.05, items[TARGET * 3 + 2]];

  return (
    <group>
      <Crowd count={ACCOUNTS} positions={accounts} size={0.085} apiRef={users} />
      <Links segments={segments} role="honest" colors={segmentColors} opacity={0.32} />
      <Crowd count={N_ITEMS} positions={items} size={0.07} apiRef={itemApi} />
      <mesh ref={core}>
        <icosahedronGeometry args={[CORE, 1]} />
        <meshStandardMaterial color={roles.model} roughness={0.35} metalness={0.1} flatShading />
      </mesh>
      <mesh ref={shell} rotation={[0.3, 0, 0]}>
        <icosahedronGeometry args={[1.0, 1]} />
        <meshBasicMaterial color={roles.model} wireframe transparent opacity={0.3} toneMapped={false} />
      </mesh>
      {labels ? (
        <>
          <Label position={targetAt} tone="attacker" small>
            promoted item
          </Label>
          <Label position={[0, 1.3, 0]} tone="model" small>
            shared model
          </Label>
          <Label position={[-2.75, 0.05, 0]} tone="model" small>
            items
          </Label>
          {fakes > 0 ? (
            <Label position={[0, 2.35, -4.7]} tone="attacker" small>
              {fakes} fake accounts
            </Label>
          ) : null}
          <Label position={[0, -1.25, 4.4]} tone="honest" small>
            {N_USERS} real users in {N_GROUPS} taste groups
          </Label>
          <Label position={[0, 3.4, 0]}>{running ? `round ${round}` : round === 0 ? "press Start" : `paused at round ${round}`}</Label>
        </>
      ) : null}
    </group>
  );
}
