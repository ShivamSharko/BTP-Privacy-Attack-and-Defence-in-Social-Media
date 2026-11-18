import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { BoxGeometry, Color, type InstancedMesh, type Mesh, Object3D } from "three";
import { Label, Links, type Vec3, useActiveFrame, useRoles, useStepTimeline } from "../../world/kit";
import { hexLabel, signed } from "./ringModel";
import { encodeValue, hex64, pairMask, pairSeed, wrap } from "./sim";
import { useSecAgg } from "./store";

export const DEMO_A = 1.25;
export const DEMO_B = -0.75;
const PIPE_SEED = 42;
const WORDS = 16;

const A: Vec3 = [-3.8, 2.5, 0];
const B: Vec3 = [3.8, 2.5, 0];
const SECRET: Vec3 = [0, 2.5, 0];
const SEED: Vec3 = [0, 1.0, 0];
const ROW_Y = -1.5;
const OUT_A: Vec3 = [-3.8, -3.0, 0];
const OUT_B: Vec3 = [3.8, -3.0, 0];
const MASK_A: Vec3 = [-3.8, ROW_Y, 0];
const MASK_B: Vec3 = [3.8, ROW_Y, 0];
const SLOT = 0.44;

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** The real numbers behind the labels, for a round. */
export function pipeValues(round: number) {
  const seed = pairSeed(PIPE_SEED, round, 0, 1);
  const words = pairMask(PIPE_SEED, round, 0, 1, WORDS);
  const encA = encodeValue(DEMO_A);
  const encB = encodeValue(DEMO_B);
  return {
    seed,
    words,
    encA,
    encB,
    maskedA: wrap(encA + words[0]),
    maskedB: wrap(encB - words[0]),
  };
}

function line(points: Vec3[]): Float32Array {
  const out = new Float32Array((points.length - 1) * 6);
  for (let i = 0; i < points.length - 1; i++) {
    out.set(points[i], i * 6);
    out.set(points[i + 1], i * 6 + 3);
  }
  return out;
}

/** Slide two: how the secret behind a mask is made, one ingredient at a time. */
export function PipelineScene({ active }: { active: boolean }) {
  const roles = useRoles();
  const stage = useSecAgg((s) => s.stage);
  const round = useSecAgg((s) => s.round);
  const v = useMemo(() => pipeValues(round), [round]);

  const anim = useRef({ pub: 0, secret: 0, seed: 0, stream: 0, out: 0 });
  const auto = useSecAgg((s) => s.auto);

  // On arrival the four pieces appear one after another; touching the controls stops that.
  useEffect(() => {
    if (!active) return;
    useSecAgg.getState().startAuto();
  }, [active]);
  useEffect(() => {
    if (!active || !auto) return;
    const timer = window.setInterval(() => useSecAgg.getState().autoStep(), 1900);
    return () => window.clearInterval(timer);
  }, [active, auto]);
  useStepTimeline(stage, (tl) => {
    const a = anim.current;
    tl.to(a, { pub: stage >= 1 ? 1 : 0, duration: stage >= 1 ? 1.1 : 0.3, ease: "power2.inOut" }, 0);
    tl.to(a, { secret: stage >= 1 ? 1 : 0, duration: 0.6, ease: "back.out(2)" }, stage >= 1 ? 0.9 : 0);
    tl.to(a, { seed: stage >= 2 ? 1 : 0, duration: stage >= 2 ? 0.7 : 0.3, ease: "back.out(2)" }, stage >= 2 ? 0.1 : 0);
    tl.to(a, { stream: stage >= 3 ? 1 : 0, duration: stage >= 3 ? 1.1 : 0.3, ease: "power2.out" }, stage >= 3 ? 0.1 : 0);
    tl.to(a, { out: stage >= 4 ? 1 : 0, duration: stage >= 4 ? 1.0 : 0.3, ease: "power2.inOut" }, stage >= 4 ? 0.1 : 0);
  });

  const pubA = useRef<Mesh>(null);
  const pubB = useRef<Mesh>(null);
  const secret = useRef<Mesh>(null);
  const seed = useRef<Mesh>(null);
  const bars = useRef<InstancedMesh>(null);
  const outA = useRef<Mesh>(null);
  const outB = useRef<Mesh>(null);
  const scratch = useMemo(() => ({ o: new Object3D(), c: new Color() }), []);
  const barGeometry = useMemo(() => new BoxGeometry(1, 1, 1).translate(0, 0.5, 0), []);
  useEffect(() => () => barGeometry.dispose(), [barGeometry]);

  const heights = useMemo(() => v.words.map((w) => 0.18 + 0.82 * Number(w >> 48n) / 65535), [v]);

  useLayoutEffect(() => {
    const mesh = bars.current;
    if (!mesh) return;
    for (let i = 0; i < WORDS; i++) mesh.setColorAt(i, roles.noise);
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [roles]);

  useActiveFrame(active, (state) => {
    const a = anim.current;
    const t = state.clock.elapsedTime;
    const cross = 0.82 * a.pub;
    if (pubA.current) {
      pubA.current.position.set(A[0] + (B[0] - A[0]) * cross, A[1] + 0.42, 0);
      pubA.current.scale.setScalar(a.pub > 0.02 ? 1 - smooth(0, 0.5, a.seed) : 0);
      pubA.current.rotation.y = t * 1.4;
    }
    if (pubB.current) {
      pubB.current.position.set(B[0] + (A[0] - B[0]) * cross, B[1] - 0.42, 0);
      pubB.current.scale.setScalar(a.pub > 0.02 ? 1 - smooth(0, 0.5, a.seed) : 0);
      pubB.current.rotation.y = -t * 1.4;
    }
    if (secret.current) secret.current.scale.setScalar(Math.max(0.001, a.secret) * (1 + 0.05 * Math.sin(t * 2)));
    if (seed.current) {
      seed.current.scale.setScalar(Math.max(0.001, a.seed));
      seed.current.rotation.y = t * 0.8;
    }
    if (outA.current) outA.current.scale.setScalar(Math.max(0.001, a.out));
    if (outB.current) outB.current.scale.setScalar(Math.max(0.001, a.out));

    const mesh = bars.current;
    if (mesh) {
      const slot = SLOT;
      for (let i = 0; i < WORDS; i++) {
        const grow = smooth(i / WORDS * 0.55, i / WORDS * 0.55 + 0.45, a.stream);
        scratch.o.position.set(-((WORDS - 1) * slot) / 2 + i * slot, ROW_Y, 0);
        scratch.o.scale.set(slot * 0.62, Math.max(heights[i] * 1.15 * grow, 0.001), 0.3);
        scratch.o.updateMatrix();
        mesh.setMatrixAt(i, scratch.o.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.visible = a.stream > 0.01;
    }
  });

  const s1 = stage >= 1;
  const s2 = stage >= 2;
  const s3 = stage >= 3;
  const s4 = stage >= 4;
  const seedHex = `0x${v.seed.toString(16).padStart(8, "0")}`;

  return (
    <group>
      <Links segments={line([A, B])} role="muted" opacity={0.35} />
      {s2 && <Links segments={line([SECRET, SEED])} role="protected" opacity={0.6} />}
      {s3 && <Links segments={line([SEED, [0, ROW_Y + 1.15, 0]])} role="protected" opacity={0.6} />}
      {s4 && (
        <>
          <Links segments={line([A, OUT_A])} role="honest" opacity={0.55} />
          <Links segments={line([B, OUT_B])} role="honest" opacity={0.55} />
          <Links segments={line([[-3.45, ROW_Y, 0], MASK_A])} role="protected" opacity={0.7} />
          <Links segments={line([[3.45, ROW_Y, 0], MASK_B])} role="noise" opacity={0.7} />
        </>
      )}

      {/* the two users */}
      {[A, B].map((p, i) => (
        <mesh key={i} position={p}>
          <sphereGeometry args={[0.3, 24, 16]} />
          <meshBasicMaterial color={roles.honest} toneMapped={false} />
        </mesh>
      ))}
      <Label position={[A[0], A[1] + 0.85, 0]}>
        <span style={{ display: "block", textAlign: "center" }}>user 1</span>
        {s1 && <span style={{ display: "block", textAlign: "center", color: "var(--protected)" }}>keeps a private key</span>}
      </Label>
      <Label position={[B[0], B[1] + 0.85, 0]}>
        <span style={{ display: "block", textAlign: "center" }}>user 2</span>
        {s1 && <span style={{ display: "block", textAlign: "center", color: "var(--protected)" }}>keeps a private key</span>}
      </Label>

      {/* 1. key agreement */}
      <mesh ref={pubA}>
        <octahedronGeometry args={[0.2, 0]} />
        <meshBasicMaterial color={roles.model} toneMapped={false} />
      </mesh>
      <mesh ref={pubB}>
        <octahedronGeometry args={[0.2, 0]} />
        <meshBasicMaterial color={roles.model} toneMapped={false} />
      </mesh>
      <mesh ref={secret} position={SECRET}>
        <icosahedronGeometry args={[0.36, 1]} />
        <meshBasicMaterial color={roles.protected} toneMapped={false} />
      </mesh>
      {s1 && (
        <>
          <Label position={[0, 3.4, 0]} tone="protected">
            <span style={{ display: "block", textAlign: "center" }}>shared secret: the same at both ends</span>
            <span style={{ display: "block", textAlign: "center", color: "var(--ink-soft)" }}>made from a private key and the other's public key</span>
          </Label>
          {stage === 1 && (
            <Label position={[1.55, 1.9, 0]} tone="model" small>
              public keys cross
            </Label>
          )}
        </>
      )}

      {/* 2. key derivation */}
      <mesh ref={seed} position={SEED}>
        <boxGeometry args={[0.5, 0.5, 0.5]} />
        <meshStandardMaterial color={roles.protected} roughness={0.4} metalness={0.1} />
      </mesh>
      {s2 && (
        <Label position={[2.7, 1.0, 0]} tone="protected">
          <span style={{ display: "block" }}>HKDF: seed {seedHex}</span>
          <span style={{ display: "block", color: "var(--ink-soft)" }}>from the secret, round {round}, users 1 and 2</span>
        </Label>
      )}

      {/* 3. mask stream */}
      <instancedMesh ref={bars} args={[barGeometry, undefined, WORDS]} frustumCulled={false}>
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      {s3 && (
        <Label position={[0, ROW_Y - 0.65, 0.2]} tone="noise">
          <span style={{ display: "block", textAlign: "center" }}>ChaCha20 stream, as 64-bit words: first is {hexLabel(v.words[0])}</span>
        </Label>
      )}

      {/* 4. fixed point and masking */}
      <mesh ref={outA} position={OUT_A}>
        <sphereGeometry args={[0.26, 20, 14]} />
        <meshBasicMaterial color={roles.protected} toneMapped={false} />
      </mesh>
      <mesh ref={outB} position={OUT_B}>
        <sphereGeometry args={[0.26, 20, 14]} />
        <meshBasicMaterial color={roles.protected} toneMapped={false} />
      </mesh>
      {s4 && (
        <>
          <mesh position={MASK_A}>
            <sphereGeometry args={[0.2, 16, 12]} />
            <meshBasicMaterial color={roles.protected} toneMapped={false} />
          </mesh>
          <mesh position={MASK_B}>
            <sphereGeometry args={[0.2, 16, 12]} />
            <meshBasicMaterial color={roles.noise} toneMapped={false} />
          </mesh>
          <Label position={[A[0] + 1.1, 1.75, 0]} tone="honest">
            <span style={{ display: "block", textAlign: "center" }}>update {signed(DEMO_A)}</span>
            <span style={{ display: "block", textAlign: "center" }}>{hex64(v.encA)}</span>
          </Label>
          <Label position={[B[0] - 1.1, 1.75, 0]} tone="honest">
            <span style={{ display: "block", textAlign: "center" }}>update {signed(DEMO_B)}</span>
            <span style={{ display: "block", textAlign: "center" }}>{hex64(v.encB)}</span>
          </Label>
          <Label position={[MASK_A[0] + 0.45, ROW_Y - 0.55, 0]} tone="protected">
            adds the mask
          </Label>
          <Label position={[MASK_B[0] - 0.55, ROW_Y - 0.55, 0]} tone="noise">
            subtracts the mask
          </Label>
          <Label position={[OUT_A[0] + 1.1, OUT_A[1] - 0.1, 0]} tone="protected">
            <span style={{ display: "block", textAlign: "center" }}>user 1 sends</span>
            <span style={{ display: "block", textAlign: "center" }}>{hex64(v.maskedA)}</span>
          </Label>
          <Label position={[OUT_B[0] - 1.1, OUT_B[1] - 0.1, 0]} tone="protected">
            <span style={{ display: "block", textAlign: "center" }}>user 2 sends</span>
            <span style={{ display: "block", textAlign: "center" }}>{hex64(v.maskedB)}</span>
          </Label>
        </>
      )}
    </group>
  );
}
