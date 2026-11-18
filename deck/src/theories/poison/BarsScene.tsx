import { type MutableRefObject, useEffect, useMemo, useRef } from "react";
import { BoxGeometry, Color, type Group, type InstancedMesh, type Mesh, Object3D } from "three";
import { raw } from "../../data";
import { Label, useActiveFrame, useRoles } from "../../world/kit";
import { coordinateMedian, DIM, makePopulation, N_USERS, sumMean, trimCount, trimmedMean } from "./sim";
import { usePoison } from "./store";

const WIDTH = 6.4;
const SY = 2.0;
const BASE = -1.2;
const TOP = 3.0;
const MIN_STUB = 0.035;

interface Bar {
  value: number;
  attacker: boolean;
}

/** One coordinate of every user, lowest first, with who is an attacker. */
export function sortedBars(share: number, coord: number): Bar[] {
  const pop = makePopulation(N_USERS, share);
  const bars: Bar[] = [];
  for (let u = 0; u < pop.n; u++) bars.push({ value: pop.updates[u * DIM + coord], attacker: pop.isAttacker[u] });
  return bars.sort((a, b) => a.value - b.value);
}

export function BarsScene({ active, vis, on }: { active: boolean; vis: MutableRefObject<number>; on: boolean }) {
  const roles = useRoles();
  const share = usePoison((s) => s.share);
  const coord = usePoison((s) => s.coord);
  const trim = raw<number>("poisoning", "settings/trim_fraction");

  const bars = useMemo(() => sortedBars(share, coord), [share, coord]);
  const levels = useMemo(() => {
    const pop = makePopulation(N_USERS, share);
    return { mean: sumMean(pop)[coord], trimmed: trimmedMean(pop, trim)[coord], median: coordinateMedian(pop)[coord] };
  }, [share, coord, trim]);
  const cut = trimCount(N_USERS, trim);
  const slot = WIDTH / N_USERS;
  const xOf = (i: number) => -WIDTH / 2 + slot * (i + 0.5);

  const group = useRef<Group>(null);
  const mesh = useRef<InstancedMesh>(null);
  const lineRefs = useRef<(Mesh | null)[]>([null, null, null]);
  const heights = useRef(new Float32Array(N_USERS));
  const lineY = useRef(new Float32Array(3).fill(BASE));
  const geometry = useMemo(() => new BoxGeometry(1, 1, 1).translate(0, 0.5, 0), []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const scratch = useMemo(() => ({ dummy: new Object3D(), color: new Color() }), []);
  const live = useRef({ bars, levels });
  live.current = { bars, levels };

  useActiveFrame(active, (_state, delta) => {
    const g = group.current;
    if (g) {
      g.visible = vis.current > 0.01;
      g.scale.setScalar(0.001 + vis.current * 0.999);
    }
    const m = mesh.current;
    if (!m || vis.current < 0.01) return;
    const ease = 1 - Math.exp(-delta * 9);
    const { bars: b, levels: l } = live.current;
    for (let i = 0; i < N_USERS; i++) {
      const goal = b[i].value === 0 ? 0 : b[i].value * SY;
      heights.current[i] += (goal - heights.current[i]) * ease;
      const h = heights.current[i];
      const drawn = Math.abs(h) < MIN_STUB ? MIN_STUB : Math.abs(h);
      const y = h < 0 ? BASE + h : BASE;
      scratch.dummy.position.set(-WIDTH / 2 + slot * (i + 0.5), y, 0);
      scratch.dummy.scale.set(slot * 0.74, drawn, 0.3);
      scratch.dummy.updateMatrix();
      m.setMatrixAt(i, scratch.dummy.matrix);
      const trimmed = i < cut || i >= N_USERS - cut;
      const role = b[i].attacker ? roles.attacker : b[i].value === 0 ? roles.muted : roles.honest;
      scratch.color.copy(role);
      if (trimmed) scratch.color.lerp(roles.muted, b[i].attacker ? 0.45 : 0.6);
      m.setColorAt(i, scratch.color);
    }
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    const goals = [l.mean, l.trimmed, l.median];
    for (let k = 0; k < 3; k++) {
      lineY.current[k] += (BASE + goals[k] * SY - lineY.current[k]) * ease;
      lineRefs.current[k]?.position.set(0, lineY.current[k], 0.25);
    }
  });

  // Labels sit at the right end of each level, pushed apart so they never overlap.
  const named = [
    { name: "plain mean", y: BASE + levels.mean * SY },
    { name: "trimmed mean", y: BASE + levels.trimmed * SY },
    { name: "median", y: BASE + levels.median * SY },
  ].sort((a, b) => a.y - b.y);
  for (let i = 1; i < named.length; i++) if (named[i].y - named[i - 1].y < 0.42) named[i].y = named[i - 1].y + 0.42;
  const medianIndex = (N_USERS - 1) >> 1;

  return (
    <group ref={group} position={[-0.7, 0.2, 0]}>
      <instancedMesh ref={mesh} args={[geometry, undefined, N_USERS]} frustumCulled={false}>
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>

      <mesh position={[0, BASE, 0]}>
        <boxGeometry args={[WIDTH + 0.4, 0.025, 0.05]} />
        <meshBasicMaterial color={roles.muted} toneMapped={false} />
      </mesh>

      {[0, 1, 2].map((k) => (
        <mesh key={k} ref={(el) => void (lineRefs.current[k] = el)} position={[0, BASE, 0.25]}>
          <boxGeometry args={[WIDTH + 0.5, 0.035, 0.05]} />
          <meshBasicMaterial color={roles.model} toneMapped={false} transparent opacity={k === 0 ? 0.95 : k === 1 ? 0.7 : 1} />
        </mesh>
      ))}

      {/* The two cut ends of the trimmed mean. */}
      {[0, 1].map((side) => {
        const from = side === 0 ? 0 : N_USERS - cut;
        const x0 = xOf(from) - slot / 2;
        const x1 = xOf(from + cut - 1) + slot / 2;
        return (
          <mesh key={side} position={[(x0 + x1) / 2, (BASE - 0.5 + TOP) / 2, -0.2]}>
            <boxGeometry args={[x1 - x0, TOP - BASE + 0.5, 0.02]} />
            <meshBasicMaterial color={roles.noise} toneMapped={false} transparent opacity={0.13} depthWrite={false} />
          </mesh>
        );
      })}

      <mesh position={[xOf(medianIndex), BASE - 0.42, 0]}>
        <octahedronGeometry args={[0.13, 0]} />
        <meshBasicMaterial color={roles.model} toneMapped={false} />
      </mesh>

      {on ? (
        <>
      {named.map((l) => (
        <Label key={l.name} position={[WIDTH / 2 + 1.1, l.y, 0.25]} tone="model" small>
          {l.name}
        </Label>
      ))}
      <Label position={[xOf(medianIndex), BASE - 0.85, 0]} tone="model" small>
        the middle user
      </Label>
      <Label position={[xOf(Math.floor(cut / 2)), TOP + 0.35, 0]} tone="noise" small>
        cut away
      </Label>
      <Label position={[xOf(N_USERS - 1 - Math.floor(cut / 2)), TOP + 0.35, 0]} tone="noise" small>
        cut away
      </Label>
      <Label position={[0, BASE - 1.45, 0]} tone="muted" small>
        all {N_USERS} users, lowest value first
      </Label>
        </>
      ) : null}
    </group>
  );
}
