import { Line } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { BufferAttribute, BufferGeometry, type Mesh } from "three";
import { grid } from "../../data";
import { Label, useActiveFrame, useRoles } from "../../world/kit";
import { calibrationTrace, projectNoise } from "./search";
import { epsilonAt, fromLogT, logT } from "./sim";
import { LEVELS, regimeSetting, useAcct } from "./store";

const W = 8.6;
const H = 4.2;
const Z_LO = grid.noise[0];
const Z_HI = grid.noise[grid.noise.length - 1];
const xOf = (z: number) => (logT(z, Z_LO, Z_HI) - 0.5) * W;
const SAMPLES = 90;

/**
 * The calibration search as a picture: epsilon against noise for one regime, the target as a
 * level, and a bracket that halves each step (in log noise) around the place the curve crosses it.
 */
export function Calib({ active }: { active: boolean }) {
  const roles = useRoles();
  const invalidate = useThree((s) => s.invalidate);
  const regime = useAcct((s) => s.calibRegime);
  const target = useAcct((s) => s.calibTarget);
  const step = useAcct((s) => s.calibStep);
  const setting = useMemo(() => regimeSetting(regime), [regime]);

  const curve = useMemo(() => {
    const zs = Array.from({ length: SAMPLES }, (_, i) => fromLogT(i / (SAMPLES - 1), Z_LO, Z_HI));
    const eps = zs.map((z) => epsilonAt(grid, setting.rateIdx, z, setting.rounds));
    return { zs, eps };
  }, [setting]);
  const range = useMemo(() => ({ lo: Math.min(Math.min(...curve.eps), LEVELS[0]) * 0.7, hi: Math.max(Math.max(...curve.eps), LEVELS[LEVELS.length - 1]) * 1.3 }), [curve]);
  const yOf = useMemo(() => (e: number) => (logT(e, range.lo, range.hi) - 0.5) * H, [range]);

  const points = useMemo(() => curve.zs.map((z, i) => [xOf(z), yOf(curve.eps[i]), 0] as [number, number, number]), [curve, yOf]);
  const colours = useMemo(
    () => curve.eps.map((e) => (e <= target ? [roles.protected.r, roles.protected.g, roles.protected.b] : [roles.attacker.r, roles.attacker.g, roles.attacker.b]) as [number, number, number]),
    [curve, target, roles],
  );

  const trace = useMemo(() => calibrationTrace(regime, target), [regime, target]);
  const shown = Math.min(step, trace.steps.length);
  const current = shown > 0 ? trace.steps[shown - 1] : null;
  const lo = current?.lo ?? Z_LO;
  const hi = current?.hi ?? Z_HI;
  const done = trace.reachable && shown === trace.steps.length;
  const project = projectNoise(regime, target);

  // The bracket slides to its new place instead of jumping.
  const live = useRef({ lo: xOf(Z_LO), hi: xOf(Z_HI), px: 0, py: 0 });
  const plane = useRef<Mesh>(null);
  const edgeL = useRef<Mesh>(null);
  const edgeR = useRef<Mesh>(null);
  const probe = useRef<Mesh>(null);
  const goal = useRef({ lo: 0, hi: 0, px: 0, py: 0, show: false });
  goal.current = {
    lo: xOf(lo),
    hi: xOf(hi),
    px: current ? xOf(current.probe) : 0,
    py: current ? yOf(current.eps) : 0,
    show: Boolean(current),
  };
  useActiveFrame(active, (_, delta) => {
    const L = live.current;
    const g = goal.current;
    const k = Math.min(1, delta * 9);
    L.lo += (g.lo - L.lo) * k;
    L.hi += (g.hi - L.hi) * k;
    L.px += (g.px - L.px) * k;
    L.py += (g.py - L.py) * k;
    plane.current?.position.set((L.lo + L.hi) / 2, 0, -0.02);
    plane.current?.scale.set(Math.max(L.hi - L.lo, 0.001), 1, 1);
    edgeL.current?.position.set(L.lo, 0, 0);
    edgeR.current?.position.set(L.hi, 0, 0);
    probe.current?.position.set(L.px, L.py, 0.05);
    if (probe.current) probe.current.visible = g.show;
    invalidate();
  });

  const frame = useMemo(() => {
    const g = new BufferGeometry();
    const a = [-W / 2, -H / 2, 0, W / 2, -H / 2, 0, -W / 2, -H / 2, 0, -W / 2, H / 2, 0];
    for (const z of [0.5, 1, 2, 4, 12]) a.push(xOf(z), -H / 2, 0, xOf(z), -H / 2 - 0.12, 0);
    g.setAttribute("position", new BufferAttribute(new Float32Array(a), 3));
    return g;
  }, []);
  useEffect(() => () => frame.dispose(), [frame]);

  const targetY = yOf(target);
  const within = current ? current.eps <= target : true;

  return (
    <group>
      <lineSegments geometry={frame}>
        <lineBasicMaterial color={roles.muted} toneMapped={false} />
      </lineSegments>

      {/* the bracket */}
      <mesh ref={plane}>
        <planeGeometry args={[1, H]} />
        <meshBasicMaterial color={roles.protected} transparent opacity={0.13} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh ref={edgeL}>
        <boxGeometry args={[0.035, H, 0.02]} />
        <meshBasicMaterial color={roles.attacker} transparent opacity={0.85} toneMapped={false} />
      </mesh>
      <mesh ref={edgeR}>
        <boxGeometry args={[0.035, H, 0.02]} />
        <meshBasicMaterial color={roles.protected} transparent opacity={0.85} toneMapped={false} />
      </mesh>

      {/* the curve and the target */}
      <Line points={points} vertexColors={colours} lineWidth={4} toneMapped={false} />
      <Line points={[[-W / 2, targetY, 0], [W / 2, targetY, 0]]} color={roles.model} lineWidth={2} dashed dashSize={0.18} gapSize={0.12} toneMapped={false} />
      <mesh ref={probe}>
        <sphereGeometry args={[0.17, 18, 12]} />
        <meshBasicMaterial color={within ? roles.protected : roles.attacker} toneMapped={false} />
      </mesh>

      {/* result, and the project's own number for comparison */}
      {done && current ? (
        <>
          <Label position={[xOf(current.hi), -H / 2 - 0.72, 0]} tone="protected">
            found: {current.hi.toFixed(3)}
          </Label>
        </>
      ) : null}
      {done && project !== undefined ? (
        <>
          <mesh position={[xOf(project), -H / 2, 0.03]}>
            <sphereGeometry args={[0.1, 12, 8]} />
            <meshBasicMaterial color={roles.ledger} toneMapped={false} />
          </mesh>
          <Label position={[xOf(project), -H / 2 - 1.2, 0]} tone="ledger" small>
            project value: {project}
          </Label>
        </>
      ) : null}
      {!trace.reachable ? (
        <Label position={[0, 0.2, 0.1]} tone="attacker">
          out of reach inside this grid
        </Label>
      ) : null}

      <Label position={[-W / 2 + 0.2, targetY + 0.28, 0]} tone="model" small>
        target epsilon {target}
      </Label>
      <Label position={[0, -H / 2 - 1.75, 0]} small>
        noise multiplier (log scale)
      </Label>
      <Label position={[-W / 2 - 0.2, H / 2 + 0.35, 0]} small>
        epsilon (log scale)
      </Label>
      {[0.5, 1, 2, 4, 12].map((z) => (
        <Label key={z} position={[xOf(z), -H / 2 - 0.32, 0]} small>
          {z}
        </Label>
      ))}
    </group>
  );
}
