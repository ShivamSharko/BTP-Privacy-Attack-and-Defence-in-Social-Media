import { useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { BoxGeometry, Color, EdgesGeometry, type Group, type Mesh, Vector3 } from "three";
import { fmt } from "../../data";
import {
  type CrowdApi,
  Crowd,
  Ground,
  Label,
  type SceneProps,
  useActiveFrame,
  useDrag,
  useOnReset,
  useRoles,
  useStepTimeline,
} from "../../world/kit";
import { Roc } from "./Roc";
import {
  type Control,
  gapForControl,
  GAP_MAX,
  makePopulation,
  normalPdf,
  populationLoss,
  rates,
  sigmaFor,
  thresholdForFpr,
} from "./sim";
import { useMia } from "./store";
import {
  BASE_Y,
  crestPoints,
  DEPTH,
  type FrameState,
  HS,
  makeRibbonGeometry,
  makeRidgeGeometry,
  N_POINTS,
  paintCrest,
  updateRibbon,
  updateRidge,
  XS,
  Z_MEMBER,
  Z_NON,
} from "./view";

const EACH = 110;
const PLANE_TOP = BASE_Y + 4.5;
const FLAG_BLEND = 0.7;

/** Where the sliders say the scene should be, for the slide's step. */
function targets(
  step: number,
  s: { privacy: number; calibrated: boolean; control: Control },
): { gap: number; mix: number } {
  if (step === 0) return { gap: GAP_MAX, mix: 1 };
  // the controls slide always looks at calibrated scores, as the real attack does
  if (step >= 2) return { gap: gapForControl(s.control, s.privacy), mix: 0 };
  return {
    gap: gapForControl("released", s.privacy),
    mix: s.calibrated ? 0 : 1,
  };
}

export function Scene({ step, active }: SceneProps) {
  const roles = useRoles();
  const threshold = useMia((s) => s.threshold);
  const privacy = useMia((s) => s.privacy);
  const calibrated = useMia((s) => s.calibrated);
  const control = useMia((s) => s.control);
  const pinned = step >= 1;

  // What the labels say: the end state of the glide, computed from the store.
  const end = useMemo(() => {
    const t = targets(step, { privacy, calibrated, control });
    const sigma = sigmaFor(t.mix);
    const at = pinned ? thresholdForFpr(0.01, t.gap, sigma) : threshold;
    return { ...rates(at, t.gap, sigma) };
  }, [step, privacy, calibrated, control, threshold, pinned]);

  const pop = useMemo(() => makePopulation(EACH, 11), []);
  const frame = useRef<FrameState>({
    gap: GAP_MAX,
    mix: 1,
    threshold: useMia.getState().threshold,
  });
  const pin = useRef({ value: 0 });
  const group = useRef<Group>(null);
  const handle = useRef<Mesh>(null);
  const lights = useRef<CrowdApi>(null);
  const lastKey = useRef("");

  const memberRidge = useMemo(() => makeRidgeGeometry(), []);
  const nonRidge = useMemo(() => makeRidgeGeometry(), []);
  const memberCrest = useMemo(() => makeRibbonGeometry(N_POINTS, true), []);
  const nonCrest = useMemo(() => makeRibbonGeometry(N_POINTS, true), []);
  const crestX = useMemo(() => new Float32Array(N_POINTS), []);
  const crestY = useMemo(() => new Float32Array(N_POINTS), []);
  const crestW = useMemo(() => new Float32Array(N_POINTS), []);
  useEffect(
    () => () => {
      memberRidge.dispose();
      nonRidge.dispose();
      memberCrest.dispose();
      nonCrest.dispose();
    },
    [memberRidge, nonRidge, memberCrest, nonCrest],
  );

  const planeEdges = useMemo(() => new EdgesGeometry(new BoxGeometry(0.1, PLANE_TOP - BASE_Y, 6.4)), []);
  useEffect(() => () => planeEdges.dispose(), [planeEdges]);
  const scratch = useMemo(
    () => ({
      flagM: new Color(),
      flagN: new Color(),
      world: new Vector3(),
      light: new Color(),
    }),
    [],
  );
  const positions = useMemo(() => new Float32Array(EACH * 2 * 3), []);
  const colours = useMemo(() => {
    const out = new Float32Array(EACH * 2 * 3);
    for (let i = 0; i < EACH * 2; i++) {
      const c = i < EACH ? roles.honest : roles.noise;
      out[i * 3] = c.r;
      out[i * 3 + 1] = c.g;
      out[i * 3 + 2] = c.b;
    }
    return out;
  }, [roles]);

  // Slide change: the threshold either belongs to the presenter or snaps to the 1% false-positive point.
  useStepTimeline(step, (tl) => {
    tl.to(pin.current, {
      value: pinned ? 1 : 0,
      duration: 0.9,
      ease: "power2.inOut",
    });
  });
  useOnReset(() => useMia.getState().reset(), active);

  // Dragging the plane: pixels become loss units at the plane's distance from the camera.
  const get = useThree((s) => s.get);
  const drag = useDrag((dx) => {
    const { camera, size } = get();
    const g = group.current;
    if (!g) return;
    g.getWorldPosition(scratch.world);
    const distance = camera.position.distanceTo(scratch.world);
    const fov = ((camera as unknown as { fov?: number }).fov ?? 40) * (Math.PI / 180);
    const unit = (2 * Math.tan(fov / 2) * distance) / size.height;
    const right = camera.matrixWorld.elements[0];
    const world = (dx * unit * right) / Math.max(right * right, 0.12);
    useMia.getState().setThreshold(useMia.getState().threshold + world / XS);
  });

  useActiveFrame(active, (state, delta) => {
    const s = useMia.getState();
    const f = frame.current;
    const goal = targets(step, s);
    const k = 1 - Math.exp(-delta * 6);
    f.gap += (goal.gap - f.gap) * k;
    f.mix += (goal.mix - f.mix) * k;
    const sigma = sigmaFor(f.mix);
    const held = thresholdForFpr(0.01, f.gap, sigma);
    const want = s.threshold + (held - s.threshold) * pin.current.value;
    f.threshold += (want - f.threshold) * (1 - Math.exp(-delta * 16));

    if (group.current) group.current.position.x = f.threshold * XS;
    if (handle.current) {
      const pulse = step === 0 ? 1 + 0.12 * Math.sin(state.clock.elapsedTime * 3) : 1;
      handle.current.scale.setScalar(pulse);
    }

    // Rebuild the ridges only when something moved.
    const key = `${f.gap.toFixed(3)}|${f.mix.toFixed(3)}|${f.threshold.toFixed(3)}`;
    if (key !== lastKey.current) {
      lastKey.current = key;
      scratch.flagM.copy(roles.honest).lerp(roles.attacker, FLAG_BLEND);
      scratch.flagN.copy(roles.noise).lerp(roles.attacker, FLAG_BLEND);
      updateRidge(memberRidge, {
        mean: -f.gap / 2,
        sigma,
        z: Z_MEMBER,
        threshold: f.threshold,
        base: roles.honest,
        flagged: scratch.flagM,
      });
      updateRidge(nonRidge, {
        mean: f.gap / 2,
        sigma,
        z: Z_NON,
        threshold: f.threshold,
        base: roles.noise,
        flagged: scratch.flagN,
      });
      crestPoints(-f.gap / 2, sigma, crestX, crestY, crestW);
      updateRibbon(memberCrest, crestX, crestY, Z_MEMBER + DEPTH / 2 + 0.015, 0.07, crestW);
      paintCrest(memberCrest, f.threshold, roles.honest, roles.attacker);
      crestPoints(f.gap / 2, sigma, crestX, crestY, crestW);
      updateRibbon(nonCrest, crestX, crestY, Z_NON + DEPTH / 2 + 0.015, 0.07, crestW);
      paintCrest(nonCrest, f.threshold, roles.noise, roles.attacker);
    }

    // Each light is one user, standing inside its group's ridge at its own loss.
    const api = lights.current;
    if (api) {
      for (let i = 0; i < pop.count; i++) {
        const member = i < pop.members;
        const loss = populationLoss(pop, i, f.gap, f.mix);
        const mean = member ? -f.gap / 2 : f.gap / 2;
        const top = normalPdf(loss, mean, sigma) * HS * pop.height[i];
        const z = (member ? Z_MEMBER : Z_NON) + (pop.depth[i] - 0.5) * DEPTH * 0.8;
        api.setPosition(i, loss * XS, BASE_Y + Math.max(top, 0.04), z);
        api.setScale(i, loss <= f.threshold ? 1.35 : 0.8);
      }
      api.commit();
    }
  });

  useLayoutEffect(() => {
    lastKey.current = "";
  }, [roles]);

  const pct = (v: number) => fmt.pct(v, 0);
  return (
    <group>
      <Ground radius={7} y={BASE_Y - 0.15} />

      <mesh geometry={memberRidge} frustumCulled={false}>
        <meshStandardMaterial vertexColors transparent depthWrite={false} side={2} roughness={0.55} metalness={0.05} />
      </mesh>
      <mesh geometry={nonRidge} frustumCulled={false}>
        <meshStandardMaterial vertexColors transparent depthWrite={false} side={2} roughness={0.55} metalness={0.05} />
      </mesh>
      <mesh geometry={memberCrest} frustumCulled={false}>
        <meshBasicMaterial vertexColors toneMapped={false} side={2} />
      </mesh>
      <mesh geometry={nonCrest} frustumCulled={false}>
        <meshBasicMaterial vertexColors toneMapped={false} side={2} />
      </mesh>

      <Crowd count={EACH * 2} positions={positions} colors={colours} size={0.055} apiRef={lights} />

      <group ref={group}>
        <mesh position={[0, (BASE_Y + PLANE_TOP) / 2, 0]} {...(step === 0 ? drag : {})}>
          <boxGeometry args={[0.1, PLANE_TOP - BASE_Y, 6.4]} />
          <meshBasicMaterial color={roles.attacker} transparent opacity={0.16} toneMapped={false} depthWrite={false} />
        </mesh>
        <lineSegments position={[0, (BASE_Y + PLANE_TOP) / 2, 0]} geometry={planeEdges}>
          <lineBasicMaterial color={roles.attacker} transparent opacity={0.8} toneMapped={false} />
        </lineSegments>
        <mesh ref={handle} position={[0, PLANE_TOP + 0.2, 0]} {...(step === 0 ? drag : {})}>
          <icosahedronGeometry args={[0.24, 1]} />
          <meshBasicMaterial color={roles.attacker} toneMapped={false} />
        </mesh>
        <Label position={[0, PLANE_TOP + 0.78, 0]} tone="attacker" small>
          {pinned ? "threshold fixed at 1% false positives" : "attacker's threshold: drag me"}
        </Label>
      </group>

      <Label position={[-2.9, 2.0, Z_MEMBER]} tone="honest">
        members: {pct(end.tpr)} flagged
      </Label>
      <Label position={[3.3, 0.6, Z_NON]} tone="noise">
        non-members: {pct(end.fpr)} flagged
      </Label>
      <Label position={[-2.3, BASE_Y - 0.6, Z_MEMBER + 1.3]} small>
        lower loss: the model fits the user well
      </Label>
      <Label position={[3.4, BASE_Y - 0.55, Z_MEMBER + 1.3]} small>
        higher loss
      </Label>

      <Roc frame={frame} active={active} pinned={pinned} />
    </group>
  );
}
