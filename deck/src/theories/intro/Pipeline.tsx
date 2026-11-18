import type { ThreeEvent } from "@react-three/fiber";
import { type RefObject, useEffect, useMemo, useRef } from "react";
import { Color, type Group, type Mesh, type MeshBasicMaterial } from "three";
import { Label, Links, useActiveFrame, useRoles, useStepTimeline, type Vec3 } from "../../world/kit";
import { STOPS } from "./graph";
import type { IntroAnim } from "./shared";
import { packetPosition } from "./sim";
import { goTo, STAGE_SECONDS, STAGES, useIntro } from "./store";

function StageShape({ index }: { index: number }) {
  switch (index) {
    case 0:
      return <boxGeometry args={[0.34, 0.58, 0.08]} />;
    case 1:
      return <coneGeometry args={[0.24, 0.55, 18]} />;
    case 2:
      return <torusGeometry args={[0.28, 0.06, 12, 40]} />;
    case 3:
      return <octahedronGeometry args={[0.33, 0]} />;
    case 4:
      return <dodecahedronGeometry args={[0.32, 0]} />;
    case 5:
      return <icosahedronGeometry args={[0.34, 0]} />;
    case 6:
      return <icosahedronGeometry args={[0.38, 1]} />;
    case 7:
      return <boxGeometry args={[0.5, 0.3, 0.32]} />;
    default:
      return <cylinderGeometry args={[0.3, 0.3, 0.1, 28]} />;
  }
}

/** The system end to end: stops on a snaking path, a packet walking through them. Click a stop to open its concept. */
export function Pipeline({ step, active, anim }: { step: number; active: boolean; anim: RefObject<IntroAnim> }) {
  const roles = useRoles();
  const stage = useIntro((s) => s.stage);
  const playing = useIntro((s) => s.playing);
  const shown = step === 2;

  const root = useRef<Group>(null);
  const shapes = useRef<(Mesh | null)[]>([]);
  const packet = useRef<Mesh>(null);
  const halo = useRef<Mesh>(null);
  const hovered = useRef(-1);
  const sizes = useRef(new Float32Array(STAGES.length).fill(1));
  const scratch = useMemo(() => ({ p: [0, 0, 0] as [number, number, number], h: [0, 0, 0] as [number, number, number], color: new Color() }), []);
  const stops = useMemo(() => Array.from({ length: STAGES.length }, (_, i): Vec3 => [STOPS[i * 3], STOPS[i * 3 + 1], STOPS[i * 3 + 2]]), []);
  const path = useMemo(() => {
    const out = new Float32Array((STAGES.length - 1) * 6);
    for (let i = 0; i + 1 < STAGES.length; i++) {
      out.set(STOPS.subarray(i * 3, i * 3 + 6), i * 6);
    }
    return out;
  }, []);

  useStepTimeline(step, (tl) => {
    tl.to(anim.current, { pipe: shown ? 1 : 0, duration: shown ? 0.9 : 0.4, delay: shown ? 0.3 : 0, ease: "power2.inOut" });
  });

  useStepTimeline(stage, (tl) => {
    const a = anim.current;
    if (stage < a.packet - 0.01) tl.set(a, { packet: stage });
    else tl.to(a, { packet: stage, duration: 0.9, ease: "power2.inOut" });
  });

  // The walk-through moves on by itself while it plays and this slide is on screen.
  useEffect(() => {
    if (!active || !shown || !playing) return;
    const timer = window.setInterval(() => useIntro.getState().nextStage(), STAGE_SECONDS * 1000);
    return () => window.clearInterval(timer);
  }, [active, shown, playing]);

  useEffect(() => () => {
    document.body.style.cursor = "";
  }, []);

  useActiveFrame(active, (state, delta) => {
    const a = anim.current;
    const g = root.current;
    if (g) {
      g.visible = a.pipe > 0.01;
      g.scale.setScalar(Math.max(0.001, a.pipe));
    }
    if (a.pipe <= 0.01) return;
    const t = state.clock.elapsedTime;
    const ease = Math.min(1, delta * 8);
    for (let i = 0; i < STAGES.length; i++) {
      const mesh = shapes.current[i];
      if (!mesh) continue;
      const goal = i === hovered.current ? 1.35 : i === stage ? 1.2 : 1;
      sizes.current[i] += (goal - sizes.current[i]) * ease;
      mesh.scale.setScalar(sizes.current[i]);
      mesh.rotation.y = t * 0.35 + i;
    }
    packetPosition(STOPS, a.packet, scratch.p);
    if (packet.current) {
      packet.current.position.set(scratch.p[0], scratch.p[1] + 0.55 + 0.05 * Math.sin(t * 3), scratch.p[2]);
      const from = Math.floor(a.packet);
      const material = packet.current.material as MeshBasicMaterial;
      material.color.copy(roles[STAGES[from].role]).lerp(roles[STAGES[Math.min(STAGES.length - 1, from + 1)].role], a.packet - from);
    }
    if (halo.current) {
      packetPosition(STOPS, stage, scratch.h);
      halo.current.position.set(scratch.h[0], scratch.h[1], scratch.h[2]);
      halo.current.rotation.z = t * 0.6;
      (halo.current.material as MeshBasicMaterial).color.copy(roles[STAGES[stage].role]);
    }
  });

  const over = (i: number) => (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    hovered.current = i;
    document.body.style.cursor = "pointer";
  };
  const out = () => {
    hovered.current = -1;
    document.body.style.cursor = "";
  };
  const click = (i: number) => (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.delta > 6) return; // a drag to orbit, not a click
    document.body.style.cursor = "";
    goTo(STAGES[i].concept);
  };

  return (
    <group ref={root} visible={false}>
      <Links segments={path} role="muted" opacity={0.7} />
      {STAGES.map((s, i) => (
        <mesh
          key={s.name}
          position={stops[i]}
          ref={(m) => {
            shapes.current[i] = m;
          }}
          onPointerOver={shown ? over(i) : undefined}
          onPointerOut={shown ? out : undefined}
          onClick={shown ? click(i) : undefined}
        >
          <StageShape index={i} />
          <meshStandardMaterial color={roles[s.role]} roughness={0.4} metalness={0.1} flatShading />
        </mesh>
      ))}
      <mesh ref={halo}>
        <torusGeometry args={[0.52, 0.018, 8, 64]} />
        <meshBasicMaterial toneMapped={false} transparent opacity={0.8} />
      </mesh>
      <mesh ref={packet}>
        <sphereGeometry args={[0.11, 20, 14]} />
        <meshBasicMaterial toneMapped={false} />
      </mesh>
      {shown
        ? STAGES.map((s, i) => (
            <Label key={s.name} position={[stops[i][0], stops[i][1] - 0.62, stops[i][2]]} tone={i === stage ? s.role : undefined} small>
              {s.name}
            </Label>
          ))
        : null}
    </group>
  );
}
