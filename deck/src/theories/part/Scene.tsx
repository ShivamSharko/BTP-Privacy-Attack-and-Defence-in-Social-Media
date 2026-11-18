import { Line } from "@react-three/drei";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { BoxGeometry, Color, type Group, type InstancedMesh, Object3D } from "three";
import { fmt } from "../../data";
import {
  type ArrowApi,
  Arrow,
  Crowd,
  type CrowdApi,
  Ground,
  Label,
  Links,
  type SceneProps,
  useActiveFrame,
  useDrag,
  useOnReset,
  useRoles,
  useStepTimeline,
} from "../../world/kit";
import { configFromResults, GROUP_NAME, groupAvailability, groupNdcg, maxBand } from "./measured";
import { groupsByActivity, isOn, makeWorld } from "./sim";
import { usePart } from "./store";

const ROOF = -2.65;
const BAR_X = [-2.7, 0, 2.7];
const BAR_BASE = -3;
const BAR_SPAN = 4.7;
const GAP_X = 3.95;

export function Scene({ step, active }: SceneProps) {
  const roles = useRoles();
  const scenario = usePart((s) => s.scenario);
  const level = usePart((s) => s.level);
  const clockHour = usePart((s) => Math.floor(s.hour));
  const playing = usePart((s) => s.playing);
  const bands = step === 1;

  const world = useMemo(() => makeWorld(5, 240, configFromResults()), []);
  const groups = useMemo(() => groupsByActivity(world.activity), [world]);
  const ceiling = useMemo(() => maxBand(), []);

  // Where each user stands in the band view: the third they belong to, in rows in front of its bar.
  const bandPos = useMemo(() => {
    const out = new Float32Array(world.n * 3);
    const next = [0, 0, 0];
    for (let i = 0; i < world.n; i++) {
      const g = groups[i];
      const k = next[g]++;
      out[i * 3] = BAR_X[g] - 0.81 + (k % 10) * 0.18;
      out[i * 3 + 1] = BAR_BASE + 0.09;
      out[i * 3 + 2] = 1.5 + Math.floor(k / 10) * 0.17;
    }
    return out;
  }, [world, groups]);

  // What the bands show: measured accuracy per group sets the heights, measured availability the lights.
  const measured = useMemo(() => {
    const ndcg = groupNdcg(scenario, level);
    return { ndcg, heights: ndcg.map((v) => (v / ceiling) * BAR_SPAN), avail: groupAvailability(scenario) };
  }, [scenario, level, ceiling]);

  const friendSegments = useMemo(() => {
    if (bands) return new Float32Array(0);
    const out = new Float32Array(world.friends.length * 6);
    world.friends.forEach(([a, b], k) => {
      out.set([world.pos[a * 3], ROOF + world.height[a], world.pos[a * 3 + 2]], k * 6);
      out.set([world.pos[b * 3], ROOF + world.height[b], world.pos[b * 3 + 2]], k * 6 + 3);
    });
    return out;
  }, [world, bands]);

  const lights = useRef<CrowdApi>(null);
  const towers = useRef<InstancedMesh>(null);
  const barMesh = useRef<InstancedMesh>(null);
  const sun = useRef<Group>(null);
  const tops = useRef<(Group | null)[]>([null, null, null]);
  const gapGroup = useRef<Group>(null);
  const gapArrow = useRef<ArrowApi>(null);
  const anim = useRef({ band: 0 });
  const bright = useRef(new Float32Array(world.n).fill(0.1));
  const barH = useRef(new Float32Array(3));
  const live = useRef({ ...measured, level });
  live.current = { ...measured, level };
  const scratch = useMemo(() => ({ c: new Color(), o: new Object3D() }), []);
  const towerGeometry = useMemo(() => new BoxGeometry(1, 1, 1).translate(0, 0.5, 0), []);
  const barGeometry = useMemo(() => new BoxGeometry(1, 1, 1).translate(0, 0.5, 0), []);
  useEffect(
    () => () => {
      towerGeometry.dispose();
      barGeometry.dispose();
    },
    [towerGeometry, barGeometry],
  );

  const sunArc = useMemo(() => {
    const pts: [number, number, number][] = [];
    for (let i = 0; i <= 96; i++) {
      const a = (i / 96) * Math.PI * 2;
      pts.push([-Math.sin(a) * 4.4, 0.4 - Math.cos(a) * 2.6, -2.8]);
    }
    return pts;
  }, []);

  useStepTimeline(step, (tl) => {
    tl.to(anim.current, { band: bands ? 1 : 0, duration: 1.1, ease: "power2.inOut" });
  });

  // While the clock plays, advance it ten times a second; the scene reads it each frame.
  useEffect(() => {
    if (!active || !playing || bands) return;
    const timer = window.setInterval(() => usePart.getState().advance(0.2), 100);
    return () => window.clearInterval(timer);
  }, [active, playing, bands]);

  useOnReset(() => usePart.getState().reset(), active);

  const drag = useDrag((dx) => {
    const s = usePart.getState();
    s.setHour(s.hour - dx * 0.06);
  });

  useLayoutEffect(() => {
    const mesh = barMesh.current;
    if (mesh) mesh.setColorAt(0, roles.protected);
  }, [roles]);

  useActiveFrame(active, () => {
    const a = anim.current;
    const { hour } = usePart.getState();
    const { heights, avail, level: shown } = live.current;
    const crowd = lights.current;
    const towersMesh = towers.current;
    const phi = (hour / 24) * Math.PI * 2;
    if (sun.current) {
      sun.current.position.set(-Math.sin(phi) * 4.4, 0.4 - Math.cos(phi) * 2.6, -2.8);
      sun.current.visible = a.band < 0.5;
    }

    for (let i = 0; i < world.n; i++) {
      const g = groups[i];
      const lit = bands ? world.coin[i] < avail[g] : isOn(world, scenario, i, hour);
      bright.current[i] += ((lit ? 1 : 0.1) - bright.current[i]) * 0.2;
      const b = bright.current[i];
      scratch.c.copy(roles.muted).lerp(roles.honest, b);
      crowd?.setColor(i, scratch.c);
      crowd?.setScale(i, (0.4 + b * 0.7) * (1 - 0.35 * a.band));
      const cx = world.pos[i * 3];
      const cy = ROOF + world.height[i] * (1 - a.band) + 0.14;
      const cz = world.pos[i * 3 + 2];
      crowd?.setPosition(
        i,
        cx + (bandPos[i * 3] - cx) * a.band,
        cy + (bandPos[i * 3 + 1] - cy) * a.band,
        cz + (bandPos[i * 3 + 2] - cz) * a.band,
      );
      if (towersMesh) {
        scratch.o.position.set(cx, ROOF, cz);
        scratch.o.scale.set(0.13 * (1 - a.band), Math.max(world.height[i] * (1 - a.band), 0.0001), 0.13 * (1 - a.band));
        scratch.o.updateMatrix();
        towersMesh.setMatrixAt(i, scratch.o.matrix);
      }
    }
    crowd?.commit();
    if (towersMesh) towersMesh.instanceMatrix.needsUpdate = true;

    // Bands rise towards the measured accuracy of each group.
    const bm = barMesh.current;
    for (let g = 0; g < 3; g++) {
      barH.current[g] += (heights[g] - barH.current[g]) * 0.12;
      const h = Math.max(barH.current[g] * a.band, 0.0001);
      if (bm) {
        scratch.o.position.set(BAR_X[g], BAR_BASE, 0);
        scratch.o.scale.set(1.8, h, 1.0);
        scratch.o.updateMatrix();
        bm.setMatrixAt(g, scratch.o.matrix);
        scratch.c.copy(shown === "8" ? roles.protected : roles.honest);
        bm.setColorAt(g, scratch.c);
      }
      tops.current[g]?.position.set(BAR_X[g], BAR_BASE + h + 0.4, 0);
    }
    if (bm) {
      bm.instanceMatrix.needsUpdate = true;
      if (bm.instanceColor) bm.instanceColor.needsUpdate = true;
      bm.visible = a.band > 0.02;
    }
    if (gapGroup.current) gapGroup.current.visible = a.band > 0.6;
    gapArrow.current?.set([GAP_X, BAR_BASE + barH.current[0], 0], [GAP_X, BAR_BASE + barH.current[2], 0]);
  });

  return (
    <group>
      <Ground radius={7.5} y={-3} />

      <instancedMesh ref={towers} args={[towerGeometry, undefined, world.n]} frustumCulled={false}>
        <meshStandardMaterial color={roles.muted} roughness={0.8} transparent opacity={0.55} />
      </instancedMesh>
      <Crowd count={world.n} positions={world.pos} size={0.085} apiRef={lights} />
      <Links segments={friendSegments} role="honest" opacity={scenario === "social" ? 0.5 : 0.06} />

      <Line points={sunArc} color={roles.muted} lineWidth={1} transparent opacity={bands ? 0 : 0.35} />
      <group ref={sun}>
        <mesh {...drag}>
          <icosahedronGeometry args={[0.26, 1]} />
          <meshBasicMaterial color={roles.model} toneMapped={false} />
        </mesh>
        <mesh>
          <icosahedronGeometry args={[0.46, 1]} />
          <meshBasicMaterial color={roles.model} wireframe transparent opacity={0.35} toneMapped={false} />
        </mesh>
        {bands ? null : (
          <Label position={[0, 0.7, 0]} small>
            {`${String(clockHour).padStart(2, "0")}:00`}
          </Label>
        )}
      </group>

      <instancedMesh ref={barMesh} args={[barGeometry, undefined, 3]} frustumCulled={false}>
        <meshStandardMaterial roughness={0.45} metalness={0.1} transparent opacity={0.9} />
      </instancedMesh>
      {bands ? (
        <>
          {measured.ndcg.map((v, g) => (
            <group
              key={g}
              ref={(el) => {
                tops.current[g] = el;
              }}
            >
              <Label position={[0, 0, 0]} tone={level === "8" ? "protected" : "honest"}>{fmt.ndcg(v)}</Label>
            </group>
          ))}
          {GROUP_NAME.map((name, g) => (
            <Label key={name} position={[BAR_X[g], -3.45, 2.6]} small>
              {name}
            </Label>
          ))}
          <group ref={gapGroup}>
            <Arrow from={[GAP_X, BAR_BASE, 0]} to={[GAP_X, BAR_BASE + 1, 0]} role="attacker" width={0.05} apiRef={gapArrow} />
            <Label position={[GAP_X + 0.62, BAR_BASE + BAR_SPAN * 0.5 + 0.2, 0]} tone="attacker" small>
              {`gap ${fmt.ndcg(measured.ndcg[2] - measured.ndcg[0])}`}
            </Label>
          </group>
        </>
      ) : null}
    </group>
  );
}
