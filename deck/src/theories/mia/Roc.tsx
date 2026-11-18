import { Line } from "@react-three/drei";
import { type MutableRefObject, useEffect, useMemo, useRef } from "react";
import type { Mesh } from "three";
import { Label, useActiveFrame, useRoles } from "../../world/kit";
import { rates, rocCurve, sigmaFor } from "./sim";
import { type FrameState, makeRibbonGeometry, updateRibbon } from "./view";

/** Side of the square plot, in scene units. */
const W = 2.1;
const POINTS = 61;

interface RocProps {
  frame: MutableRefObject<FrameState>;
  active: boolean;
  /** True while the threshold is held at 1% false positives. */
  pinned: boolean;
}

/**
 * A small ROC plot standing in the scene: the share of members flagged against the share of
 * non-members flagged, for every possible threshold. The attacker's current threshold is the dot.
 */
export function Roc({ frame, active, pinned }: RocProps) {
  const roles = useRoles();
  const geometry = useMemo(() => makeRibbonGeometry(POINTS + 1), []);
  const xs = useMemo(() => new Float32Array(POINTS + 1), []);
  const ys = useMemo(() => new Float32Array(POINTS + 1), []);
  const dot = useRef<Mesh>(null);
  const guideX = useRef<Mesh>(null);
  const guideY = useRef<Mesh>(null);
  const last = useRef(-1);
  useEffect(() => () => geometry.dispose(), [geometry]);

  useActiveFrame(active, () => {
    const f = frame.current;
    const sigma = sigmaFor(f.mix);
    const sep = f.gap / sigma;
    if (Math.abs(sep - last.current) > 1e-4) {
      last.current = sep;
      const curve = rocCurve(sep, POINTS);
      for (let i = 0; i < curve.length; i++) {
        xs[i] = curve[i].fpr * W;
        ys[i] = curve[i].tpr * W;
      }
      updateRibbon(geometry, xs, ys, 0.02, 0.045);
    }
    const r = rates(f.threshold, f.gap, sigma);
    const px = r.fpr * W;
    const py = r.tpr * W;
    dot.current?.position.set(px, py, 0.05);
    if (guideX.current) {
      guideX.current.position.set(px / 2, py, 0.01);
      guideX.current.scale.set(Math.max(px, 1e-4), 1, 1);
    }
    if (guideY.current) {
      guideY.current.position.set(px, py / 2, 0.01);
      guideY.current.scale.set(1, Math.max(py, 1e-4), 1);
    }
  });

  return (
    <group position={[2.5, 1.7, -3.4]} rotation={[0, -0.45, 0]}>
      <mesh position={[W / 2, W / 2, -0.01]}>
        <planeGeometry args={[W, W]} />
        <meshBasicMaterial color={roles.muted} transparent opacity={0.1} toneMapped={false} depthWrite={false} />
      </mesh>
      <Line
        points={[
          [0, 0, 0],
          [W, 0, 0],
          [W, W, 0],
          [0, W, 0],
          [0, 0, 0],
        ]}
        color={roles.muted}
        lineWidth={1.4}
        transparent
        opacity={0.8}
      />
      <Line
        points={[
          [0, 0, 0.005],
          [W, W, 0.005],
        ]}
        color={roles.muted}
        lineWidth={1.4}
        dashed
        dashSize={0.09}
        gapSize={0.07}
        transparent
        opacity={0.8}
      />
      <mesh ref={guideX}>
        <boxGeometry args={[1, 0.018, 0.01]} />
        <meshBasicMaterial color={roles.attacker} transparent opacity={0.55} toneMapped={false} />
      </mesh>
      <mesh ref={guideY}>
        <boxGeometry args={[0.018, 1, 0.01]} />
        <meshBasicMaterial color={roles.attacker} transparent opacity={0.55} toneMapped={false} />
      </mesh>
      <mesh geometry={geometry}>
        <meshBasicMaterial color={roles.attacker} toneMapped={false} side={2} />
      </mesh>
      <mesh ref={dot}>
        <sphereGeometry args={[0.095, 20, 14]} />
        <meshBasicMaterial color={roles.attacker} toneMapped={false} />
      </mesh>
      <Label position={[W / 2, W + 0.22, 0]} small>
        members flagged
      </Label>
      <Label position={[W / 2, -0.24, 0]} small>
        {pinned ? "non-members flagged: 1%" : "non-members flagged"}
      </Label>
    </group>
  );
}
