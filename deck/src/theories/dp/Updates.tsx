import { type MutableRefObject, useMemo, useRef } from "react";
import { type Group, type Mesh, Quaternion, Vector3 } from "three";
import { Arrow, type ArrowApi, Crowd, type CrowdApi, Label, Links, useActiveFrame, useDrag, useRoles, type Vec3 } from "../../world/kit";
import { clippedSum, gaussianOffsets, N_UPDATES } from "./sim";
import { PROJECT_C, useDp } from "./store";
import { removedIndex, TOY_UPDATES } from "./toy";
import type { Anim } from "./Worlds";

/** Scene units per toy unit: large while clipping is shown, small once the updates are summed. */
const S_CLIP = 0.34;
const S_SUM = 0.1;
const CLOUD = 520;
const JITTER = 64;
const JITTER_EVERY = 0.42;
/** Moves the summed chain left and down a little, so the arc and its noise cloud sit in the middle of the view. */
const SUM_SHIFT: Vec3 = [-1.15, -0.55, 0];

/** Turns the toy vectors so their clipped sum points to the right and a little up, across the view. */
function orientation(): Quaternion {
  const sum = new Vector3(...clippedSum(TOY_UPDATES, PROJECT_C)).normalize();
  return new Quaternion().setFromUnitVectors(sum, new Vector3(1, 0.32, 0.12).normalize());
}

export function Updates({ anim, active, step }: { anim: MutableRefObject<Anim>; active: boolean; step: number }) {
  const roles = useRoles();
  const C = useDp((s) => s.C);
  const z = useDp((s) => s.z);
  const cohort = useDp((s) => s.cohort);

  const raw = useMemo(() => {
    const q = orientation();
    return TOY_UPDATES.map((v) => new Vector3(...v).applyQuaternion(q));
  }, []);
  const clipped = useMemo(() => raw.map((v) => v.length() > C), [raw, C]);
  // Laid end to end in order of direction, the updates trace a smooth arc rather than a tangle.
  const order = useMemo(() => {
    const sum = raw.reduce((acc, v) => acc.add(v), new Vector3());
    const base = Math.atan2(sum.y, sum.x);
    const turn = (v: Vector3) => {
      const a = Math.atan2(v.y, v.x) - base;
      return Math.atan2(Math.sin(a), Math.cos(a));
    };
    return raw
      .map((v, i) => ({ i, a: turn(v) }))
      .sort((p, q) => q.a - p.a)
      .map((p) => p.i);
  }, [raw]);

  const root = useRef<Group>(null);
  const spin = useRef<Group>(null);
  const sphere = useRef<Group>(null);
  const ghosts = useRef<Group>(null);
  const origin = useRef<Mesh>(null);
  const before = useRef<Mesh>(null);
  const arrows = useRef<(ArrowApi | null)[]>([]);
  const sumArrow = useRef<ArrowApi>(null);
  const released = useRef<ArrowApi>(null);
  const cloud = useRef<CrowdApi>(null);
  const tips = useRef<CrowdApi>(null);

  const state = useMemo(
    () => ({
      cur: raw.map((v) => v.clone()),
      pres: new Float32Array(N_UPDATES).fill(1),
      from: raw.map((): Vec3 => [0, 0, 0]),
      to: raw.map((): Vec3 => [0, 0, 0]),
      o: [0, 0, 0] as Vec3,
      tip: [0, 0, 0] as Vec3,
      out: [0, 0, 0] as Vec3,
      outGoal: new Vector3(),
      outNow: new Vector3(),
      run: new Vector3(),
      all: new Vector3(),
      goal: new Vector3(),
      angle: 0,
      jitterAt: 0,
      jitterIndex: 0,
      cloudOffsets: gaussianOffsets(CLOUD, 17),
      jitterOffsets: gaussianOffsets(JITTER, 23),
    }),
    [raw],
  );
  const cloudStart = useMemo(() => new Float32Array(CLOUD * 3), []);
  const noiseColours = useMemo(() => {
    const out = new Float32Array(CLOUD * 3);
    for (let i = 0; i < CLOUD; i++) roles.noise.toArray(out, i * 3);
    return out;
  }, [roles]);
  const tipPositions = useMemo(() => {
    const out = new Float32Array(N_UPDATES * 3);
    raw.forEach((v, i) => v.clone().multiplyScalar(S_CLIP).toArray(out, i * 3));
    return out;
  }, [raw]);
  const ghostLines = useMemo(() => {
    const out = new Float32Array(N_UPDATES * 6);
    raw.forEach((v, i) => v.clone().multiplyScalar(S_CLIP).toArray(out, i * 6 + 3));
    return out;
  }, [raw]);

  const drag = useDrag((_, dy) => {
    const s = useDp.getState();
    s.setC(Math.round((s.C - dy * 0.03) * 10) / 10);
  });

  useActiveFrame(active, (frame, delta) => {
    const a = anim.current;
    const g = root.current;
    if (!g) return;
    g.visible = a.updates > 0.01;
    g.scale.setScalar(Math.max(a.updates, 0.001));
    if (!g.visible) return;
    const st = state;
    const chain = a.chain;
    const { C: c, z: noise, cohort: who } = useDp.getState();
    const s = S_CLIP + (S_SUM - S_CLIP) * chain;
    const ease = Math.min(1, delta * 6);

    // Spin slowly while clipping is shown; come to rest facing the viewer for the sum.
    if (chain < 0.5) st.angle += delta * 0.14;
    else st.angle += (Math.round(st.angle / (Math.PI * 2)) * Math.PI * 2 - st.angle) * Math.min(1, delta * 3);
    if (spin.current) spin.current.rotation.y = st.angle;

    // Each update eases towards its clipped self; users leave or rejoin the cohort.
    st.all.set(0, 0, 0);
    for (let i = 0; i < N_UPDATES; i++) {
      const v = raw[i];
      const length = v.length();
      const k = c > 0 ? Math.min(1, c / Math.max(length, 1e-12)) : 0;
      st.goal.copy(v).multiplyScalar(k);
      st.cur[i].lerp(st.goal, ease);
      st.all.add(st.cur[i]);
      const keep = chain < 0.02 ? 1 : who === "empty" ? 0 : who === "minus" && i === removedIndex ? 0 : 1;
      st.pres[i] += (keep - st.pres[i]) * ease;
    }

    // Laid end to end, the clipped updates build the sum; the chain is centred on the full cohort's sum.
    const ox = ((-st.all.x * s) / 2 + SUM_SHIFT[0]) * chain;
    const oy = ((-st.all.y * s) / 2 + SUM_SHIFT[1]) * chain;
    const oz = ((-st.all.z * s) / 2 + SUM_SHIFT[2]) * chain;
    st.o[0] = ox;
    st.o[1] = oy;
    st.o[2] = oz;
    st.run.set(0, 0, 0);
    for (const i of order) {
      const f = st.from[i];
      const t = st.to[i];
      const p = st.pres[i];
      f[0] = ox + st.run.x * s * chain;
      f[1] = oy + st.run.y * s * chain;
      f[2] = oz + st.run.z * s * chain;
      t[0] = f[0] + st.cur[i].x * s * p;
      t[1] = f[1] + st.cur[i].y * s * p;
      t[2] = f[2] + st.cur[i].z * s * p;
      arrows.current[i]?.set(f, t);
      st.run.addScaledVector(st.cur[i], p);
      tips.current?.setScale(i, clipped[i] ? Math.max(0, 1 - chain * 2) : 0);
    }
    tips.current?.commit();
    st.tip[0] = ox + st.run.x * s;
    st.tip[1] = oy + st.run.y * s;
    st.tip[2] = oz + st.run.z * s;

    if (sphere.current) {
      const r = c * S_CLIP * (1 - chain);
      sphere.current.visible = r > 0.01;
      sphere.current.scale.setScalar(Math.max(r, 0.001));
    }
    if (ghosts.current) {
      ghosts.current.visible = chain < 0.5;
      ghosts.current.scale.setScalar(Math.max(1 - chain * 2, 0.001));
    }
    origin.current?.position.set(ox, oy, oz);

    // The noise cloud: every point is one possible released sum, centred on the true sum.
    const showNoise = chain > 0.5;
    const sigma = noise * c * S_SUM;
    const api = cloud.current;
    if (api) {
      const size = showNoise ? (chain - 0.5) * 2 : 0;
      for (let k = 0; k < CLOUD; k++) {
        const off = st.cloudOffsets;
        api.setPosition(k, st.tip[0] + sigma * off[k * 3], st.tip[1] + sigma * off[k * 3 + 1], st.tip[2] + sigma * off[k * 3 + 2]);
        api.setScale(k, size);
      }
      api.commit();
    }
    if (before.current) {
      before.current.visible = showNoise && who !== "all";
      before.current.position.set(ox + st.all.x * s, oy + st.all.y * s, oz + st.all.z * s);
    }

    // The released sum jumps to a new draw a few times a second.
    const t = frame.clock.elapsedTime;
    if (t - st.jitterAt > JITTER_EVERY) {
      st.jitterAt = t;
      st.jitterIndex = (st.jitterIndex + 1) % JITTER;
    }
    const j = st.jitterIndex * 3;
    st.outGoal.set(
      st.tip[0] + sigma * st.jitterOffsets[j],
      st.tip[1] + sigma * st.jitterOffsets[j + 1],
      st.tip[2] + sigma * st.jitterOffsets[j + 2],
    );
    st.outNow.lerp(st.outGoal, Math.min(1, delta * 12));
    st.out[0] = st.outNow.x;
    st.out[1] = st.outNow.y;
    st.out[2] = st.outNow.z;
    released.current?.set(st.o, showNoise ? st.out : st.o);
    sumArrow.current?.set(st.o, showNoise ? st.tip : st.o);
  });

  // Where the labels of the sum view go once the chain has settled (chain = 1).
  const settled = useMemo(() => {
    const all = new Vector3();
    const kept = new Vector3();
    raw.forEach((v, i) => {
      const k = C > 0 ? Math.min(1, C / Math.max(v.length(), 1e-12)) : 0;
      all.addScaledVector(v, k);
      const keep = cohort === "empty" ? 0 : cohort === "minus" && i === removedIndex ? 0 : 1;
      kept.addScaledVector(v, k * keep);
    });
    const o = all.clone().multiplyScalar(-S_SUM / 2).add(new Vector3(...SUM_SHIFT));
    return { o, tip: o.clone().addScaledVector(kept, S_SUM), full: o.clone().addScaledVector(all, S_SUM) };
  }, [raw, C, cohort]);
  const sigmaScene = z * C * S_SUM;
  const clipView = step === 2 || step === 5;
  const sumView = step === 3 || step === 4;

  return (
    <group ref={root} visible={false}>
      <group ref={spin}>
        <group ref={sphere}>
          <mesh {...drag}>
            <sphereGeometry args={[1, 48, 32]} />
            <meshBasicMaterial color={roles.protected} transparent opacity={0.09} depthWrite={false} toneMapped={false} />
          </mesh>
          <mesh>
            <sphereGeometry args={[1, 24, 14]} />
            <meshBasicMaterial color={roles.protected} wireframe transparent opacity={0.22} depthWrite={false} toneMapped={false} />
          </mesh>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[1, 0.008, 6, 96]} />
            <meshBasicMaterial color={roles.protected} toneMapped={false} />
          </mesh>
        </group>
        <group ref={ghosts}>
          <Links segments={ghostLines} role="honest" opacity={0.22} />
          <Crowd count={N_UPDATES} positions={tipPositions} size={0.06} apiRef={tips} />
        </group>
        {raw.map((v, i) => (
          <Arrow
            key={i}
            from={[0, 0, 0]}
            to={[v.x * S_CLIP, v.y * S_CLIP, v.z * S_CLIP]}
            role={clipped[i] ? "protected" : "honest"}
            width={0.032}
            apiRef={(api) => {
              arrows.current[i] = api;
            }}
          />
        ))}
        <mesh ref={origin}>
          <sphereGeometry args={[0.09, 16, 12]} />
          <meshBasicMaterial color={roles.model} toneMapped={false} />
        </mesh>
      </group>

      <Crowd count={CLOUD} positions={cloudStart} size={0.032} colors={noiseColours} apiRef={cloud} />
      <Arrow from={[0, 0, 0]} to={[0, 0, 0]} role="protected" width={0.022} opacity={0.6} apiRef={sumArrow} />
      <Arrow from={[0, 0, 0]} to={[0, 0, 0]} role="model" width={0.05} apiRef={released} />
      <mesh ref={before} visible={false}>
        <octahedronGeometry args={[0.12, 0]} />
        <meshBasicMaterial color={roles.honest} wireframe toneMapped={false} />
      </mesh>

      {clipView && (
        <>
          <Label position={[0, Math.max(C * S_CLIP, 0.2) + 0.45, 0]} tone="protected">
            radius C = {C.toFixed(1)}
          </Label>
          <Label position={[0, -Math.max(C * S_CLIP, 0.2) - 0.45, 0]} small>
            drag the sphere to resize it
          </Label>
        </>
      )}
      {sumView && (
        <>
          {cohort !== "empty" && (
            <Label position={[settled.o.x - 0.2, settled.o.y - 0.45, settled.o.z]} small>
              clipped updates, end to end
            </Label>
          )}
          <Label position={[settled.tip.x, settled.tip.y - Math.min(Math.max(sigmaScene * 2, 0.3), 1.9) - 0.35, settled.tip.z]} tone="noise">
            {z > 0 ? (cohort === "empty" ? "empty cohort: noise alone" : "noise cloud: possible released sums") : "no noise: the exact sum is exposed"}
          </Label>
          {cohort !== "all" && (
            <Label position={[settled.full.x, settled.full.y + 0.4, settled.full.z]} tone="honest" small>
              sum with every user
            </Label>
          )}
        </>
      )}
    </group>
  );
}
