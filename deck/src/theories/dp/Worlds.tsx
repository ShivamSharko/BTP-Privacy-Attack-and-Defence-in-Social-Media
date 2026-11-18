import { type MutableRefObject, useEffect, useMemo, useRef } from "react";
import { BufferAttribute, BufferGeometry, type Group, Line as ThreeLine, LineBasicMaterial, type Mesh } from "three";
import { rng } from "../../sim/random";
import { Crowd, type CrowdApi, Label, Links, useActiveFrame, useDrag, useRoles } from "../../world/kit";
import { distanceFor, gaussianOffsets, normalPdf } from "./sim";
import { useDp, WINDOW_WIDTH } from "./store";
import { DELTA } from "./toy";

/** Shared animation values, tweened by the Scene's step timeline. */
export interface Anim {
  worlds: number;
  window: number;
  updates: number;
  chain: number;
}

/** One noise width (standard deviation) on the output axis, in scene units. */
export const SIGMA = 0.95;
const AXIS_Y = -1.75;
const PEAK = 2.3;
const HEIGHT = PEAK / normalPdf(0);
const X_MIN = -5.2;
const X_MAX = 5.2;
const SAMPLES = 161;
const WORLD_X = 3.1;
const WORLD_Y = 2.55;
const DISC = 1.15;
const USERS = 18;
const PARTICLES = 70;
const CYCLES = 4;
const PERIOD = 3.4;
const FALL = 0.32;

/** Sunflower layout of the users inside a world's disc, in the disc's own plane (x, z). */
function discLayout(): Float32Array {
  const out = new Float32Array(USERS * 3);
  for (let i = 0; i < USERS; i++) {
    const radius = DISC * 0.86 * Math.sqrt((i + 0.6) / USERS);
    const angle = i * 2.39996;
    out[i * 3] = Math.cos(angle) * radius;
    out[i * 3 + 2] = Math.sin(angle) * radius;
  }
  return out;
}

/** Index of "you" in the disc: one of the outer lights, on the side towards the viewer. */
const YOU = 14;

function makeFill(): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(SAMPLES * 2 * 3), 3));
  const index: number[] = [];
  for (let i = 0; i < SAMPLES - 1; i++) {
    const a = i * 2;
    // Counter-clockwise seen from the camera (+z), so the faces are not culled.
    index.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  g.setIndex(index);
  return g;
}

function makeOutline(): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(SAMPLES * 3), 3));
  return g;
}

/** Writes a filled area under f and its top edge. f gives height above the axis at scene x. */
function writeCurve(fill: BufferGeometry, outline: BufferGeometry | null, f: (x: number) => number): void {
  const p = fill.getAttribute("position") as BufferAttribute;
  const o = outline?.getAttribute("position") as BufferAttribute | undefined;
  for (let i = 0; i < SAMPLES; i++) {
    const x = X_MIN + ((X_MAX - X_MIN) * i) / (SAMPLES - 1);
    const h = f(x);
    p.setXYZ(i * 2, x, AXIS_Y, 0);
    p.setXYZ(i * 2 + 1, x, AXIS_Y + h, 0);
    o?.setXYZ(i, x, AXIS_Y + h, 0);
  }
  p.needsUpdate = true;
  fill.computeBoundingSphere();
  if (o && outline) {
    o.needsUpdate = true;
    outline.computeBoundingSphere();
  }
}

/** Height of a curve centred at mu (in noise widths) at scene x. */
const height = (x: number, mu: number) => HEIGHT * normalPdf(x / SIGMA - mu);

export function Worlds({ anim, active, step }: { anim: MutableRefObject<Anim>; active: boolean; step: number }) {
  const roles = useRoles();
  const epsilon = useDp((s) => s.epsilon);
  const windowStart = useDp((s) => s.windowStart);
  const target = useMemo(() => distanceFor(epsilon, DELTA), [epsilon]);

  const root = useRef<Group>(null);
  const windowGroup = useRef<Group>(null);
  const you = useRef<Mesh>(null);
  const partsA = useRef<CrowdApi>(null);
  const partsB = useRef<CrowdApi>(null);
  const shown = useRef({ d: -1 });

  const layout = useMemo(discLayout, []);
  const layoutB = useMemo(() => {
    const out = new Float32Array(USERS * 3);
    out.set(layout);
    // "You" is absent from the right-hand world: park the light far below, scaled to nothing.
    out[YOU * 3 + 1] = -100;
    return out;
  }, [layout]);
  const seeds = useMemo(() => {
    const r = rng(29);
    const uniform = new Float32Array(PARTICLES * CYCLES * 2);
    for (let i = 0; i < uniform.length; i++) uniform[i] = r();
    return { normal: gaussianOffsets(PARTICLES * CYCLES * 2, 31), uniform };
  }, []);
  const particleStart = useMemo(() => new Float32Array(PARTICLES * 3), []);

  const geo = useMemo(
    () => ({ fillA: makeFill(), fillB: makeFill(), both: makeFill(), lineA: makeOutline(), lineB: makeOutline() }),
    [],
  );
  useEffect(() => () => Object.values(geo).forEach((g) => g.dispose()), [geo]);

  const outlines = useMemo(
    () => ({
      a: new ThreeLine(geo.lineA, new LineBasicMaterial({ color: roles.honest, toneMapped: false })),
      b: new ThreeLine(geo.lineB, new LineBasicMaterial({ color: roles.model, toneMapped: false })),
    }),
    [geo, roles],
  );
  useEffect(
    () => () => {
      (outlines.a.material as LineBasicMaterial).dispose();
      (outlines.b.material as LineBasicMaterial).dispose();
    },
    [outlines],
  );
  const modelColours = useMemo(() => {
    const out = new Float32Array(PARTICLES * 3);
    for (let i = 0; i < PARTICLES; i++) roles.model.toArray(out, i * 3);
    return out;
  }, [roles]);

  const axis = useMemo(() => new Float32Array([X_MIN, AXIS_Y, 0, X_MAX, AXIS_Y, 0]), []);
  const drop = useMemo(
    () => new Float32Array([-WORLD_X, WORLD_Y - 0.25, 0, -WORLD_X, AXIS_Y + PEAK + 0.35, 0, WORLD_X, WORLD_Y - 0.25, 0, WORLD_X, AXIS_Y + PEAK + 0.35, 0]),
    [],
  );

  const drag = useDrag((dx) => {
    const s = useDp.getState();
    s.setWindowStart(s.windowStart + dx * 0.012);
  });

  useActiveFrame(active, (state, delta) => {
    const a = anim.current;
    const g = root.current;
    if (!g) return;
    g.visible = a.worlds > 0.01;
    g.scale.setScalar(0.4 + 0.6 * a.worlds);
    g.position.y = (1 - a.worlds) * 3;
    if (!g.visible) return;
    const t = state.clock.elapsedTime;

    // The gap between the clouds eases towards the one the slider asks for.
    const sh = shown.current;
    const d = sh.d < 0 ? target : sh.d + (target - sh.d) * Math.min(1, delta * 5);
    if (Math.abs(d - sh.d) > 1e-5) {
      sh.d = d;
      writeCurve(geo.fillA, geo.lineA, (x) => height(x, -d / 2));
      writeCurve(geo.fillB, geo.lineB, (x) => height(x, d / 2));
      writeCurve(geo.both, null, (x) => Math.min(height(x, -d / 2), height(x, d / 2)));
    }

    if (you.current) you.current.scale.setScalar(1 + 0.25 * Math.sin(t * 3));
    const w = windowGroup.current;
    if (w) {
      w.visible = a.window > 0.01;
      w.scale.set(1, Math.max(a.window, 0.001), 1);
    }

    // Possible outputs fall from each world and settle under its curve.
    for (const [api, sign] of [
      [partsA.current, -1],
      [partsB.current, 1],
    ] as const) {
      if (!api) continue;
      const mu = (sign * d) / 2;
      const offset = sign < 0 ? 0 : PARTICLES * CYCLES;
      for (let i = 0; i < PARTICLES; i++) {
        const phase = t / PERIOD + i / PARTICLES;
        const cycle = Math.floor(phase) % CYCLES;
        const p = phase - Math.floor(phase);
        const k = offset + i * CYCLES + cycle;
        const gx = Math.max(-3.4, Math.min(3.4, seeds.normal[k]));
        const x = (mu + gx) * SIGMA;
        const y = AXIS_Y + 0.04 + seeds.uniform[k] * 0.94 * height(x, mu);
        const sx = sign * WORLD_X;
        const sy = WORLD_Y - 0.3;
        if (p < FALL) {
          const e = (p / FALL) ** 2;
          api.setPosition(i, sx + (x - sx) * e, sy + (y - sy) * e, 0.05);
          api.setScale(i, 0.6 + 0.4 * e);
        } else {
          api.setPosition(i, x, y, 0.05);
          api.setScale(i, p > 0.92 ? (1 - p) / 0.08 : 1);
        }
      }
      api.commit();
    }
  });

  const tilt: [number, number, number] = [0.42, 0, 0];
  const windowX = (windowStart + WINDOW_WIDTH / 2) * SIGMA;
  return (
    <group ref={root}>
      {[-1, 1].map((sign) => (
        <group key={sign} position={[sign * WORLD_X, WORLD_Y, 0]} rotation={tilt}>
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[DISC, 48]} />
            <meshBasicMaterial color={roles.muted} transparent opacity={0.16} depthWrite={false} toneMapped={false} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[DISC, DISC + 0.04, 64]} />
            <meshBasicMaterial color={sign < 0 ? roles.honest : roles.model} transparent opacity={0.7} toneMapped={false} />
          </mesh>
          <Crowd count={USERS} positions={sign < 0 ? layout : layoutB} size={0.085} />
          {sign < 0 ? (
            <mesh ref={you} position={[layout[YOU * 3], 0, layout[YOU * 3 + 2]]}>
              <sphereGeometry args={[0.15, 20, 14]} />
              <meshBasicMaterial color={roles.honest} toneMapped={false} />
            </mesh>
          ) : (
            <mesh position={[layout[YOU * 3], 0, layout[YOU * 3 + 2]]} rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[0.13, 0.165, 28]} />
              <meshBasicMaterial color={roles.muted} toneMapped={false} />
            </mesh>
          )}
        </group>
      ))}

      <Links segments={drop} role="muted" opacity={0.35} />
      <Links segments={axis} role="muted" opacity={0.8} />
      <mesh geometry={geo.fillA} position={[0, 0, -0.02]}>
        <meshBasicMaterial color={roles.honest} transparent opacity={0.16} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh geometry={geo.fillB} position={[0, 0, -0.01]}>
        <meshBasicMaterial color={roles.model} transparent opacity={0.12} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh geometry={geo.both}>
        <meshBasicMaterial color={roles.protected} transparent opacity={0.42} depthWrite={false} toneMapped={false} />
      </mesh>
      <primitive object={outlines.a} />
      <primitive object={outlines.b} />
      <Crowd count={PARTICLES} positions={particleStart} size={0.05} apiRef={partsA} />
      <Crowd count={PARTICLES} positions={particleStart} colors={modelColours} size={0.05} apiRef={partsB} />

      <group ref={windowGroup} position={[0, AXIS_Y, 0]} visible={false}>
        <mesh position={[windowX, 1.45, 0.05]} {...drag}>
          <boxGeometry args={[WINDOW_WIDTH * SIGMA, 2.9, 0.5]} />
          <meshBasicMaterial color={roles.attacker} transparent opacity={0.14} depthWrite={false} toneMapped={false} />
        </mesh>
        <mesh position={[windowX - (WINDOW_WIDTH * SIGMA) / 2, 1.45, 0.06]}>
          <boxGeometry args={[0.025, 2.9, 0.025]} />
          <meshBasicMaterial color={roles.attacker} toneMapped={false} />
        </mesh>
        <mesh position={[windowX + (WINDOW_WIDTH * SIGMA) / 2, 1.45, 0.06]}>
          <boxGeometry args={[0.025, 2.9, 0.025]} />
          <meshBasicMaterial color={roles.attacker} toneMapped={false} />
        </mesh>
      </group>

      {step <= 1 && (
        <>
          <Label position={[-WORLD_X, WORLD_Y + 1.15, 0]} tone="honest">
            with your history
          </Label>
          <Label position={[WORLD_X, WORLD_Y + 1.15, 0]} tone="model">
            without it
          </Label>
          <Label
            position={[-WORLD_X + layout[YOU * 3], WORLD_Y - layout[YOU * 3 + 2] * Math.sin(tilt[0]) - 0.38, layout[YOU * 3 + 2] * Math.cos(tilt[0])]}
            tone="honest"
            small
          >
            you
          </Label>
          <Label position={[X_MAX - 0.6, AXIS_Y - 0.4, 0]} small>
            possible outputs
          </Label>
          <Label position={[0, AXIS_Y - 0.4, 0]} tone="protected" small>
            overlap
          </Label>
        </>
      )}
      {step === 1 && (
        <Label position={[windowX, AXIS_Y + 3.15, 0]} tone="attacker">
          S: drag me
        </Label>
      )}
    </group>
  );
}
