import type { ThreeEvent } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import { Color, DoubleSide, type InstancedMesh, Object3D } from "three";
import { Label, Links, useActiveFrame, useRoles } from "../../world/kit";
import { GROUP_ROLE, POINTS, pointById } from "./figures";
import { AXES } from "./sim";
import { useOutro } from "./store";

const [X0, X1] = AXES.x;
const [Y0, Y1] = AXES.y;
const [Z0, Z1] = AXES.z;
const ZN = AXES.unmeasuredZ;
const RADIUS = 0.17;

/** The three axes from the corner where everything is worst, plus a few guide lines. */
function axisSegments(): Float32Array {
  const s: number[] = [];
  const line = (a: number[], b: number[]) => s.push(...a, ...b);
  line([X0, Y0, Z0], [X1 + 0.4, Y0, Z0]);
  line([X0, Y0, Z0], [X0, Y1 + 0.4, Z0]);
  line([X0, Y0, Z0], [X0, Y0, Z1 + 0.4]);
  // floor grid at the measured robustness levels 0, 0.5 and 1
  for (const z of [Z0 + (Z1 - Z0) * 0.5, Z1]) line([X0, Y0, z], [X1, Y0, z]);
  for (const x of [X0 + (X1 - X0) * 0.5, X1]) line([x, Y0, Z0], [x, Y0, Z1]);
  return new Float32Array(s);
}

/** A thin drop line from each point to the floor, so its depth reads. */
function dropSegments(): Float32Array {
  const out = new Float32Array(POINTS.length * 6);
  POINTS.forEach((p, i) => out.set([p.x, p.y, p.z, p.x, Y0, p.z], i * 6));
  return out;
}

export function TradeoffScene({ active }: { active: boolean }) {
  const roles = useRoles();
  const hovered = useOutro((s) => s.hovered);
  const setHovered = useOutro((s) => s.setHovered);
  const mesh = useRef<InstancedMesh>(null);
  const axes = useMemo(() => axisSegments(), []);
  const drops = useMemo(() => dropSegments(), []);
  const scales = useRef(new Float32Array(POINTS.length).fill(1));
  const scratch = useMemo(() => ({ dummy: new Object3D(), color: new Color() }), []);

  useLayoutEffect(() => {
    const m = mesh.current;
    if (!m) return;
    POINTS.forEach((p, i) => m.setColorAt(i, roles[GROUP_ROLE[p.group]]));
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [roles]);

  useActiveFrame(active, (_state, delta) => {
    const m = mesh.current;
    if (!m) return;
    const current = useOutro.getState().hovered;
    const ease = 1 - Math.exp(-delta * 10);
    for (let i = 0; i < POINTS.length; i++) {
      const p = POINTS[i];
      const goal = p.id === current ? 1.8 : 1;
      scales.current[i] += (goal - scales.current[i]) * ease;
      scratch.dummy.position.set(p.x, p.y, p.z);
      scratch.dummy.scale.setScalar(scales.current[i]);
      scratch.dummy.updateMatrix();
      m.setMatrixAt(i, scratch.dummy.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  });

  const pick = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    const p = e.instanceId === undefined ? undefined : POINTS[e.instanceId];
    if (p && useOutro.getState().hovered !== p.id) setHovered(p.id);
    document.body.style.cursor = "pointer";
  };
  const leave = () => {
    setHovered(null);
    document.body.style.cursor = "";
  };
  const jump = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    const p = e.instanceId === undefined ? undefined : POINTS[e.instanceId];
    if (p) {
      document.body.style.cursor = "";
      window.location.hash = p.hash;
    }
  };

  const focus = pointById(hovered);

  return (
    <group scale={0.86}>
      <Links segments={axes} role="muted" opacity={0.75} />
      <Links segments={drops} role="muted" opacity={0.4} />
      {/* The plane for points whose robustness was never measured. */}
      <mesh position={[0, (Y0 + Y1) / 2, ZN]}>
        <planeGeometry args={[X1 - X0 + 0.8, Y1 - Y0 + 0.4]} />
        <meshBasicMaterial color={roles.muted} transparent opacity={0.16} side={DoubleSide} depthWrite={false} toneMapped={false} />
      </mesh>
      <instancedMesh
        ref={mesh}
        args={[undefined, undefined, POINTS.length]}
        frustumCulled={false}
        onPointerMove={pick}
        onPointerOut={leave}
        onClick={jump}
      >
        <icosahedronGeometry args={[RADIUS, 2]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>

      <Label position={[X1 + 0.2, Y0 - 0.45, Z0]} small>
        more private
      </Label>
      <Label position={[X0, Y0 - 0.45, Z0]} small>
        no noise
      </Label>
      <Label position={[X0, Y1 + 0.75, Z0]} small>
        NDCG@10
      </Label>
      <Label position={[X0 + 0.3, Y0 - 0.5, Z1 + 0.7]} small>
        more robust
      </Label>
      <Label position={[X1 - 0.9, Y1 + 0.15, ZN]} tone="noise" small>
        robustness not measured
      </Label>
      {focus ? (
        <Label position={[focus.x, focus.y + 0.5, focus.z]} tone={GROUP_ROLE[focus.group]}>
          {focus.label}
        </Label>
      ) : null}
    </group>
  );
}
