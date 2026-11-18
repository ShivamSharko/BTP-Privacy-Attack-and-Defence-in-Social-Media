import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { BoxGeometry, Color, type Group, type InstancedMesh, type Mesh, Object3D } from "three";
import { m } from "../../data";
import { Crowd, type CrowdApi, Ground, Label, Links, type SceneProps, useActiveFrame, useOnReset, useRoles, useStepTimeline } from "../../world/kit";
import { cohortForRound, deviceLayout, expectedCohort, N_DEVICES } from "./sim";
import { MAX_HISTOGRAM_ROUNDS, PHASES, useFed } from "./store";

const BARS = 31;
const HIST_WIDTH = 6.4;
const HIST_HEIGHT = 2.3;

/** Which cohort sizes the histogram shows for a sampling rate: a window around n times q. */
function histogramWindow(q: number): { lo: number; hi: number } {
  const mean = expectedCohort(N_DEVICES, q);
  if (mean < 10) return { lo: 0, hi: 12 };
  const lo = Math.max(0, Math.round(mean) - 15);
  return { lo, hi: Math.min(N_DEVICES, lo + BARS - 1) };
}

export function Scene({ step, active }: SceneProps) {
  const roles = useRoles();
  const q = useFed((s) => s.q);
  const phase = useFed((s) => s.phase);
  const round = useFed((s) => s.round);
  const regime = useFed((s) => s.regime);
  const histCohort = useFed((s) => s.histCohort);

  const histogram = step === 1;
  const regimeRate = m("privacy_utility", `frozen/regimes/${regime}/sample_rate`);
  const layout = useMemo(() => deviceLayout(N_DEVICES, 2), []);
  const packetStart = useMemo(() => new Float32Array(N_DEVICES * 3), []);
  const cohort = useMemo(() => (histogram ? histCohort : cohortForRound(round, q)), [histogram, histCohort, round, q]);
  const selected = useMemo(() => {
    const mask = new Uint8Array(N_DEVICES);
    for (const i of cohort) mask[i] = 1;
    return mask;
  }, [cohort]);

  // Lines from the sampled devices to the model, shown while updates travel.
  const sending = !histogram && phase >= 3;
  const segments = useMemo(() => {
    if (!sending) return new Float32Array(0);
    const out = new Float32Array(cohort.length * 6);
    cohort.forEach((device, k) => {
      out[k * 6] = layout[device * 3];
      out[k * 6 + 1] = layout[device * 3 + 1];
      out[k * 6 + 2] = layout[device * 3 + 2];
    });
    return out;
  }, [sending, cohort, layout]);

  const ring = useRef<Group>(null);
  const core = useRef<Mesh>(null);
  const bars = useRef<InstancedMesh>(null);
  const devices = useRef<CrowdApi>(null);
  const packets = useRef<CrowdApi>(null);
  const anim = useRef({ travel: 0, pulse: 0, ringY: 0, ringScale: 1, barsShown: 0 });
  const bright = useRef(new Float32Array(N_DEVICES).fill(0.6));
  const barHeights = useRef(new Float32Array(BARS));
  const scratch = useMemo(() => ({ color: new Color(), dummy: new Object3D() }), []);
  const barGeometry = useMemo(() => new BoxGeometry(1, 1, 1).translate(0, 0.5, 0), []);
  useEffect(() => () => barGeometry.dispose(), [barGeometry]);

  // Slide change: the ring makes room for the histogram, or takes the stage back.
  useStepTimeline(step, (tl) => {
    tl.to(anim.current, {
      ringY: histogram ? 1.5 : 0,
      ringScale: histogram ? 0.72 : 1,
      barsShown: histogram ? 1 : 0,
      duration: 0.8,
      ease: "power2.inOut",
    });
  });

  // Round phases: updates travel in phase 3, the model takes them in phase 4.
  useStepTimeline(
    phase,
    (tl) => {
      if (phase === 3) tl.fromTo(anim.current, { travel: 0 }, { travel: 1, duration: 1.1, ease: "power2.in" });
      else tl.set(anim.current, { travel: phase > 3 ? 1 : 0 });
      if (phase === 4) tl.fromTo(anim.current, { pulse: 1 }, { pulse: 0, duration: 0.9, ease: "power2.out" });
    },
    [round],
  );

  // The histogram slide runs rounds by itself until it has enough.
  useEffect(() => {
    if (!active || !histogram) return;
    const timer = window.setInterval(() => {
      const state = useFed.getState();
      if (state.hist.rounds < MAX_HISTOGRAM_ROUNDS) state.tick(regimeRate);
    }, 90);
    return () => window.clearInterval(timer);
  }, [active, histogram, regimeRate]);

  useOnReset(() => useFed.getState().reset(), active);

  useLayoutEffect(() => {
    const mesh = bars.current;
    if (!mesh) return;
    for (let i = 0; i < BARS; i++) mesh.setColorAt(i, roles.honest);
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [roles]);

  useActiveFrame(active, (state, delta) => {
    const a = anim.current;
    const t = state.clock.elapsedTime;
    const g = ring.current;
    if (g) {
      g.rotation.y += delta * 0.06;
      g.position.y = a.ringY;
      g.scale.setScalar(a.ringScale);
    }
    if (core.current) core.current.scale.setScalar(1 + a.pulse * 0.45);

    const showCohort = histogram || phase >= 1;
    const d = devices.current;
    const p = packets.current;
    const ease = Math.min(1, delta * 7);
    for (let i = 0; i < N_DEVICES; i++) {
      const isIn = selected[i] === 1;
      const goal = !showCohort ? 0.6 : isIn ? 1 : 0.16;
      bright.current[i] += (goal - bright.current[i]) * ease;
      const b = bright.current[i];
      scratch.color.copy(roles.muted).lerp(roles.honest, b);
      d?.setColor(i, scratch.color);
      const working = !histogram && phase === 2 && isIn ? 0.25 * Math.sin(t * 9 + i) : 0;
      d?.setScale(i, 0.7 + b * 0.9 + working);

      // A packet leaves each sampled device and reaches the model at the origin.
      const flying = !histogram && phase === 3 && isIn && a.travel < 1;
      const k = 1 - a.travel;
      p?.setPosition(i, layout[i * 3] * k, layout[i * 3 + 1] * k, layout[i * 3 + 2] * k);
      p?.setScale(i, flying ? 1 : 0);
    }
    d?.commit();
    p?.commit();

    const mesh = bars.current;
    if (mesh) {
      const { counts } = useFed.getState().hist;
      const { lo } = histogramWindow(regimeRate);
      const shown = regimeRate * N_DEVICES < 10 ? 13 : BARS;
      let peak = 1;
      for (let i = 0; i < shown; i++) peak = Math.max(peak, counts[lo + i] ?? 0);
      const slot = HIST_WIDTH / shown;
      for (let i = 0; i < BARS; i++) {
        const goal = i < shown ? ((counts[lo + i] ?? 0) / peak) * HIST_HEIGHT : 0;
        barHeights.current[i] += (goal - barHeights.current[i]) * Math.min(1, delta * 10);
        scratch.dummy.position.set(-HIST_WIDTH / 2 + slot * (i + 0.5), -2.9, 1.2);
        const width = i < shown ? slot * 0.78 : 0;
        scratch.dummy.scale.set(width, Math.max(barHeights.current[i], 0.001) * a.barsShown, i < shown ? 0.5 : 0);
        scratch.dummy.updateMatrix();
        mesh.setMatrixAt(i, scratch.dummy.matrix);
        mesh.setColorAt(i, lo + i === 0 ? roles.noise : roles.honest);
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.visible = a.barsShown > 0.01;
    }
  });

  const window_ = histogramWindow(regimeRate);
  const meanX = -HIST_WIDTH / 2 + ((expectedCohort(N_DEVICES, regimeRate) - window_.lo + 0.5) / (regimeRate * N_DEVICES < 10 ? 13 : BARS)) * HIST_WIDTH;

  return (
    <group>
      <Ground radius={7} y={-3} />

      <group ref={ring}>
        <Crowd count={N_DEVICES} positions={layout} size={0.085} apiRef={devices} />
        <Crowd count={N_DEVICES} positions={packetStart} size={0.055} apiRef={packets} />
        <Links segments={segments} role="honest" opacity={0.28} />
        <mesh ref={core}>
          <icosahedronGeometry args={[0.62, 1]} />
          <meshStandardMaterial color={roles.model} roughness={0.35} metalness={0.1} flatShading />
        </mesh>
        <mesh>
          <icosahedronGeometry args={[1.05, 1]} />
          <meshBasicMaterial color={roles.model} wireframe transparent opacity={0.35} toneMapped={false} />
        </mesh>
      </group>

      <instancedMesh ref={bars} args={[barGeometry, undefined, BARS]} frustumCulled={false}>
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>

      {histogram ? (
        <>
          <Label position={[-HIST_WIDTH / 2, -3.3, 1.2]} small>
            {window_.lo} users
          </Label>
          <Label position={[HIST_WIDTH / 2, -3.3, 1.2]} small>
            {regimeRate * N_DEVICES < 10 ? 12 : window_.hi} users in the cohort
          </Label>
          <Label position={[meanX, -0.25, 1.2]} tone="protected" small>
            expected: {expectedCohort(N_DEVICES, regimeRate).toFixed(0)}
          </Label>
        </>
      ) : (
        <>
          <Label position={[0, 3.3, 0]}>{PHASES[phase]}</Label>
          <Label position={[0, -1.6, 0]} tone="model" small>
            shared model, round {round + 1}
          </Label>
        </>
      )}
    </group>
  );
}
