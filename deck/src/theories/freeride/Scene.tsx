import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { BoxGeometry, Color, ConeGeometry, type InstancedMesh, type Mesh, Object3D, SphereGeometry } from "three";
import { Crowd, Ground, Label, type SceneProps, useActiveFrame, useOnReset, useRoles, useStepTimeline } from "../../world/kit";
import {
  aggregateAlignment,
  cosineToAggregate,
  deviceRing,
  flaggedByCosine,
  flaggedByNorm,
  N_DEVICES,
  RING_RADIUS,
  simulateRound,
} from "./sim";
import { useFreeRide } from "./store";

/** The slides that show the detector bars over each device. */
export const DETECTOR_STEPS = [1, 3];
const SEED = 5;
const BAR_MAX = 1.1;
const BAR_BASE = 0.3;
const GAUGE_WIDTH = 3;

const clamp01 = (x: number) => Math.max(0, Math.min(1, Number.isFinite(x) ? x : 0));
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

export function Scene({ step, active }: SceneProps) {
  const roles = useRoles();
  const share = useFreeRide((s) => s.share);
  const behaviour = useFreeRide((s) => s.behaviour);
  const secure = useFreeRide((s) => s.secure);
  const picked = useFreeRide((s) => s.picked);
  const detectors = DETECTOR_STEPS.includes(step);

  const round = useMemo(() => simulateRound(share, behaviour, SEED), [share, behaviour]);
  const flagNorm = useMemo(() => flaggedByNorm(round.norms), [round]);
  const flagCos = useMemo(() => flaggedByCosine(round.cosines), [round]);
  const align = useMemo(() => aggregateAlignment(round), [round]);
  const layout = useMemo(() => deviceRing(N_DEVICES), []);
  // The cosine of the picked device, for its label.
  const cosines = useMemo(() => cosineToAggregate(round.updates), [round]);

  const truthColours = useMemo(() => {
    const out = new Float32Array(N_DEVICES * 3);
    for (let i = 0; i < N_DEVICES; i++) {
      const c = !round.isRider[i] ? roles.honest : behaviour === "zero" ? roles.muted : roles.noise;
      out[i * 3] = c.r;
      out[i * 3 + 1] = c.g;
      out[i * 3 + 2] = c.b;
    }
    return out;
  }, [round, roles, behaviour]);

  const solid = useRef<InstancedMesh>(null);
  const hollow = useRef<InstancedMesh>(null);
  const bars = useRef<InstancedMesh>(null);
  const cones = useRef<InstancedMesh>(null);
  const hits = useRef<InstancedMesh>(null);
  const core = useRef<Mesh>(null);
  const useful = useRef<Mesh>(null);
  const off = useRef<Mesh>(null);
  const anim = useRef({ det: 0, veil: 0, useful: 1, off: 0 });
  const heights = useRef(new Float32Array(N_DEVICES * 2));
  const pops = useRef(new Float32Array(N_DEVICES * 2));
  const scratch = useMemo(() => ({ o: new Object3D(), c: new Color() }), []);
  const barGeometry = useMemo(() => new BoxGeometry(1, 1, 1).translate(0, 0.5, 0), []);
  const coneGeometry = useMemo(() => new ConeGeometry(0.075, 0.2, 12).rotateX(Math.PI), []);
  const hitGeometry = useMemo(() => new SphereGeometry(0.34, 8, 6), []);
  const gaugeGeometry = useMemo(() => new BoxGeometry(1, 0.13, 0.13).translate(0.5, 0, 0), []);
  useEffect(
    () => () => {
      barGeometry.dispose();
      coneGeometry.dispose();
      hitGeometry.dispose();
      gaugeGeometry.dispose();
    },
    [barGeometry, coneGeometry, hitGeometry, gaugeGeometry],
  );

  useStepTimeline(
    detectors ? 1 : 0,
    (tl) => {
      tl.to(anim.current, { det: detectors ? 1 : 0, duration: 0.7, ease: "power2.inOut" });
    },
    [],
  );
  useStepTimeline(
    secure ? 1 : 0,
    (tl) => {
      tl.to(anim.current, { veil: secure ? 1 : 0, duration: 0.7, ease: "power2.inOut" });
    },
    [],
  );
  useOnReset(() => useFreeRide.getState().reset(), active);

  // Set the instance colours of the hit spheres and the bars once; they never change.
  useLayoutEffect(() => {
    const h = hits.current;
    if (h) {
      for (let i = 0; i < N_DEVICES; i++) {
        scratch.o.position.set(layout[i * 3], 0, layout[i * 3 + 2]);
        scratch.o.scale.setScalar(1);
        scratch.o.rotation.set(0, 0, 0);
        scratch.o.updateMatrix();
        h.setMatrixAt(i, scratch.o.matrix);
      }
      h.instanceMatrix.needsUpdate = true;
    }
    const b = bars.current;
    if (b) {
      for (let i = 0; i < N_DEVICES; i++) {
        b.setColorAt(i * 2, roles.model);
        b.setColorAt(i * 2 + 1, roles.protected);
      }
      if (b.instanceColor) b.instanceColor.needsUpdate = true;
    }
    const c = cones.current;
    if (c) {
      for (let i = 0; i < N_DEVICES * 2; i++) c.setColorAt(i, roles.attacker);
      if (c.instanceColor) c.instanceColor.needsUpdate = true;
    }
  }, [layout, roles, scratch]);

  useActiveFrame(active, (state, delta) => {
    const t = state.clock.elapsedTime;
    const a = anim.current;
    const k = Math.min(1, delta * 8);
    const det = a.det * (1 - a.veil);
    const { o, c } = scratch;

    a.useful += (clamp01(align.useful) - a.useful) * k;
    a.off += (clamp01(align.offTarget) - a.off) * k;
    useful.current?.scale.set(Math.max(0.001, a.useful * GAUGE_WIDTH), 1, 1);
    off.current?.scale.set(Math.max(0.001, a.off * GAUGE_WIDTH), 1, 1);
    if (core.current) {
      core.current.rotation.y = t * 0.25;
      core.current.rotation.x = t * 0.12;
    }

    const s = solid.current;
    const h = hollow.current;
    const b = bars.current;
    const cn = cones.current;
    if (!s || !h || !b || !cn) return;

    for (let i = 0; i < N_DEVICES; i++) {
      const x = layout[i * 3];
      const z = layout[i * 3 + 2];
      const rider = round.isRider[i];

      // The packet: size is the update's norm, hollow if it is a free-rider's. A secure sum
      // makes every packet look alike.
      const phase = (t * 0.3 + i * 0.6180339) % 1;
      const e = phase * phase;
      const fade = 1 - smooth(0.86, 1, phase);
      const realSize = 0.09 + 0.07 * Math.min(1.6, round.norms[i]);
      const size = (realSize + (0.13 - realSize) * a.veil) * fade;
      const hollowNow = rider && a.veil < 0.5;
      o.position.set(x * (1 - e), Math.sin(Math.PI * e) * 0.35, z * (1 - e));
      o.rotation.set(t * 2.1 + i, t * 1.7 + i * 2, 0);
      o.scale.setScalar(hollowNow ? size : 0.0001);
      o.updateMatrix();
      h.setMatrixAt(i, o.matrix);
      o.rotation.set(0, 0, 0);
      o.scale.setScalar(hollowNow ? 0.0001 : size);
      o.updateMatrix();
      s.setMatrixAt(i, o.matrix);
      const base = !rider ? roles.honest : behaviour === "zero" ? roles.muted : roles.noise;
      c.copy(base).lerp(roles.protected, a.veil);
      s.setColorAt(i, c);
      h.setColorAt(i, c);

      // The detector bars above the device: left is the norm, right is the cosine.
      const angle = Math.atan2(z, x);
      const tx = -Math.sin(angle);
      const tz = Math.cos(angle);
      for (let side = 0; side < 2; side++) {
        const slot = i * 2 + side;
        const goal = side === 0 ? clamp01(round.norms[i] / 1.6) : clamp01(round.cosines[i]);
        heights.current[slot] += ((goal * BAR_MAX + 0.03) - heights.current[slot]) * k;
        const height = heights.current[slot] * det;
        const off_ = side === 0 ? -0.085 : 0.085;
        o.position.set(x + tx * off_, BAR_BASE, z + tz * off_);
        o.rotation.set(0, -angle, 0);
        const visible = det > 0.01;
        o.scale.set(visible ? 0.11 : 0.0001, Math.max(0.0001, height), visible ? 0.11 : 0.0001);
        o.updateMatrix();
        b.setMatrixAt(slot, o.matrix);

        const flagged = side === 0 ? flagNorm[i] : flagCos[i];
        pops.current[slot] += ((flagged ? 1 : 0) - pops.current[slot]) * k;
        const pop = pops.current[slot] * det;
        o.position.set(x + tx * off_, BAR_BASE + height + 0.17, z + tz * off_);
        o.rotation.set(0, 0, 0);
        o.scale.setScalar(Math.max(0.0001, pop));
        o.updateMatrix();
        cn.setMatrixAt(slot, o.matrix);
      }
    }
    for (const mesh of [s, h, b, cn]) mesh.instanceMatrix.needsUpdate = true;
    if (s.instanceColor) s.instanceColor.needsUpdate = true;
    if (h.instanceColor) h.instanceColor.needsUpdate = true;
  });

  const pickedRound = picked !== null && picked < N_DEVICES ? picked : null;
  const pickedKind = pickedRound === null ? "" : !round.isRider[pickedRound] ? "honest" : behaviour === "zero" ? "free-rider, zeros" : "free-rider, noise";

  return (
    <group>
      <Ground radius={7} y={-3} />

      <Crowd count={N_DEVICES} positions={layout} colors={truthColours} size={0.085} />
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[RING_RADIUS, 0.012, 6, 120]} />
        <meshBasicMaterial color={roles.muted} transparent opacity={0.55} toneMapped={false} />
      </mesh>

      <mesh ref={core}>
        <icosahedronGeometry args={[0.62, 1]} />
        <meshStandardMaterial color={roles.model} roughness={0.35} metalness={0.1} flatShading />
      </mesh>
      <mesh>
        <icosahedronGeometry args={[1.05, 1]} />
        <meshBasicMaterial color={roles.model} wireframe transparent opacity={0.3} toneMapped={false} />
      </mesh>

      <instancedMesh ref={solid} args={[undefined, undefined, N_DEVICES]} frustumCulled={false}>
        <icosahedronGeometry args={[1, 1]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={hollow} args={[undefined, undefined, N_DEVICES]} frustumCulled={false}>
        <torusGeometry args={[1, 0.34, 8, 18]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={bars} args={[barGeometry, undefined, N_DEVICES * 2]} frustumCulled={false}>
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={cones} args={[coneGeometry, undefined, N_DEVICES * 2]} frustumCulled={false}>
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>

      <instancedMesh
        ref={hits}
        args={[hitGeometry, undefined, N_DEVICES]}
        frustumCulled={false}
        onClick={(e) => {
          e.stopPropagation();
          if (e.instanceId !== undefined) useFreeRide.getState().pick(e.instanceId);
        }}
        onPointerOver={() => (document.body.style.cursor = "pointer")}
        onPointerOut={() => (document.body.style.cursor = "")}
      >
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </instancedMesh>

      {pickedRound !== null && (
        <>
          <mesh position={[layout[pickedRound * 3], 0, layout[pickedRound * 3 + 2]]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.24, 0.018, 8, 32]} />
            <meshBasicMaterial color={roles.model} toneMapped={false} />
          </mesh>
          <Label position={[layout[pickedRound * 3] * 1.12, -0.55, layout[pickedRound * 3 + 2] * 1.12]} small>
            {secure
              ? `device ${pickedRound + 1}: ${pickedKind}. The server sees only the sum.`
              : `device ${pickedRound + 1}: ${pickedKind}. norm ${round.norms[pickedRound].toFixed(2)}, cosine ${cosines[pickedRound].toFixed(2)}`}
          </Label>
        </>
      )}

      {/* The useful step the server takes, against the part that points elsewhere. */}
      <group position={[-GAUGE_WIDTH / 2, 3.15, 0]}>
        <mesh geometry={gaugeGeometry} scale={[GAUGE_WIDTH, 1, 1]}>
          <meshBasicMaterial color={roles.muted} transparent opacity={0.3} toneMapped={false} />
        </mesh>
        <mesh ref={useful} geometry={gaugeGeometry} position={[0, 0, 0.01]}>
          <meshBasicMaterial color={roles.honest} toneMapped={false} />
        </mesh>
      </group>
      <group position={[-GAUGE_WIDTH / 2, 2.8, 0]}>
        <mesh geometry={gaugeGeometry} scale={[GAUGE_WIDTH, 1, 1]}>
          <meshBasicMaterial color={roles.muted} transparent opacity={0.3} toneMapped={false} />
        </mesh>
        <mesh ref={off} geometry={gaugeGeometry} position={[0, 0, 0.01]}>
          <meshBasicMaterial color={roles.noise} toneMapped={false} />
        </mesh>
      </group>
      <Label position={[GAUGE_WIDTH / 2 + 1.35, 3.15, 0]} tone="honest" small>
        useful step {Math.round(clamp01(align.useful) * 100)}%
      </Label>
      <Label position={[GAUGE_WIDTH / 2 + 1.35, 2.8, 0]} tone="noise" small>
        off course {Math.round(clamp01(align.offTarget) * 100)}%
      </Label>

      <Label position={[0, -3.45, 0]} tone={secure ? "protected" : undefined} small>
        {secure
          ? "secure sum: the server sees only the total"
          : detectors
            ? "light colour is the truth; the server sees packets"
            : "solid packet: a real update. Ring: a free-rider's"}
      </Label>
    </group>
  );
}
