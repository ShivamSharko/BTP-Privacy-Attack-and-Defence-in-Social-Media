import { Line } from "@react-three/drei";
import { type ThreeEvent, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { BufferAttribute, BufferGeometry, Color, type Group, type Mesh, type MeshBasicMaterial, type Object3D } from "three";
import { grid } from "../../data";
import { Label, useActiveFrame, useDrag, useRoles } from "../../world/kit";
import { contour, epsilonAt, fromLogT, gridRange, heightOf, logT, refine, SURF_D, SURF_H, SURF_W, surfacePoint } from "./sim";
import { BUDGET, useAcct } from "./store";

/** Vertices between two neighbouring grid nodes, along noise and along rounds. */
const SUB_U = 4;
const SUB_V = 8;
const RANGE = gridRange(grid);
const Z_LO = grid.noise[0];
const Z_HI = grid.noise[grid.noise.length - 1];
const T_LO = grid.rounds[0];
const T_HI = grid.rounds[grid.rounds.length - 1];
const xOf = (noise: number) => (logT(noise, Z_LO, Z_HI) - 0.5) * SURF_W;
const zOf = (rounds: number) => (logT(rounds, T_LO, T_HI) - 0.5) * SURF_D;

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Floor of the surface box in the scene's coordinates; the whole box is centred on the origin. */
export const BASE_Y = -SURF_H / 2;

/**
 * The epsilon surface of the project's accountant: x is the noise multiplier, z the number of
 * rounds (both log), height is log epsilon. The budget contour is drawn on it, the part within
 * budget is aqua and the part over budget is pink-red.
 */
export function Surface({ rateIdx, active }: { rateIdx: number; active: boolean }) {
  const roles = useRoles();
  const invalidate = useThree((s) => s.invalidate);
  const group = useRef<Group>(null);

  const us = useMemo(() => refine(grid.noise, SUB_U), []);
  const vs = useMemo(() => refine(grid.rounds, SUB_V), []);
  const NU = us.length;
  const NV = vs.length;

  const mesh = useMemo(() => {
    const geometry = new BufferGeometry();
    const position = new Float32Array(NU * NV * 3);
    for (let j = 0; j < NV; j++)
      for (let i = 0; i < NU; i++) {
        position[(j * NU + i) * 3] = xOf(us[i]);
        position[(j * NU + i) * 3 + 2] = zOf(vs[j]);
      }
    const index: number[] = [];
    for (let j = 0; j < NV - 1; j++)
      for (let i = 0; i < NU - 1; i++) {
        const a = j * NU + i;
        index.push(a, a + NU, a + 1, a + 1, a + NU, a + NU + 1);
      }
    geometry.setAttribute("position", new BufferAttribute(position, 3));
    geometry.setAttribute("color", new BufferAttribute(new Float32Array(NU * NV * 3), 3));
    geometry.setIndex(index);

    // Lines through the grid's own nodes, so the data points stay visible.
    const pairs: number[] = [];
    for (let k = 0; k < grid.rounds.length; k++)
      for (let i = 0; i < NU - 1; i++) pairs.push(k * SUB_V * NU + i, k * SUB_V * NU + i + 1);
    for (let k = 0; k < grid.noise.length; k++)
      for (let j = 0; j < NV - 1; j++) pairs.push(j * NU + k * SUB_U, (j + 1) * NU + k * SUB_U);
    const wire = new BufferGeometry();
    wire.setAttribute("position", new BufferAttribute(new Float32Array(pairs.length * 3), 3));
    return { geometry, wire, pairs: Uint32Array.from(pairs) };
  }, [NU, NV, us, vs]);
  useEffect(
    () => () => {
      mesh.geometry.dispose();
      mesh.wire.dispose();
    },
    [mesh],
  );

  // Epsilon and height at every vertex, for the chosen sampling rate and for the other one (drawn faintly, for comparison).
  const makeField = useMemo(
    () => (rate: number) => {
      const eps = new Float32Array(NU * NV);
      const h = new Float32Array(NU * NV);
      for (let j = 0; j < NV; j++)
        for (let i = 0; i < NU; i++) {
          const e = epsilonAt(grid, rate, us[i], vs[j]);
          eps[j * NU + i] = e;
          h[j * NU + i] = heightOf(e, RANGE);
        }
      return { eps, h };
    },
    [NU, NV, us, vs],
  );
  const field = useMemo(() => makeField(rateIdx), [makeField, rateIdx]);
  const otherIdx = rateIdx === 0 ? grid.rates.length - 1 : 0;
  const ghost = useMemo(() => {
    const h = makeField(otherIdx).h;
    const g = new BufferGeometry();
    const p = new Float32Array(mesh.pairs.length * 3);
    for (let n = 0; n < mesh.pairs.length; n++) {
      const v = mesh.pairs[n];
      p[n * 3] = xOf(us[v % NU]);
      p[n * 3 + 1] = h[v];
      p[n * 3 + 2] = zOf(vs[Math.floor(v / NU)]);
    }
    g.setAttribute("position", new BufferAttribute(p, 3));
    return { geometry: g, corner: h[(NV - 1) * NU] };
  }, [makeField, otherIdx, mesh, us, vs, NU, NV]);
  useEffect(() => () => ghost.geometry.dispose(), [ghost]);

  const live = useRef<{ h: Float32Array; settled: boolean } | null>(null);
  if (!live.current) live.current = { h: field.h.slice(), settled: false };

  const writeHeights = useMemo(
    () => () => {
      const h = live.current!.h;
      const pos = mesh.geometry.getAttribute("position") as BufferAttribute;
      for (let k = 0; k < h.length; k++) pos.setY(k, h[k]);
      pos.needsUpdate = true;
      mesh.geometry.computeVertexNormals();
      mesh.geometry.computeBoundingSphere();
      const wp = mesh.wire.getAttribute("position") as BufferAttribute;
      for (let n = 0; n < mesh.pairs.length; n++) {
        const v = mesh.pairs[n];
        wp.setXYZ(n, pos.getX(v), pos.getY(v) + 0.012, pos.getZ(v));
      }
      wp.needsUpdate = true;
    },
    [mesh],
  );

  // New sampling rate: the heights glide to the new surface.
  useEffect(() => {
    live.current!.settled = false;
    invalidate();
  }, [field, invalidate]);
  useLayoutEffect(() => {
    writeHeights();
  }, [writeHeights]);

  // Colour: aqua within budget, pink-red over it, a little darker where the surface is low.
  const tmp = useMemo(() => new Color(), []);
  useLayoutEffect(() => {
    const color = mesh.geometry.getAttribute("color") as BufferAttribute;
    for (let k = 0; k < field.eps.length; k++) {
      const over = smooth(-0.05, 0.05, Math.log(field.eps[k] / BUDGET));
      tmp.copy(roles.protected).lerp(roles.attacker, over);
      const shade = 0.5 + 0.5 * (field.h[k] / SURF_H);
      color.setXYZ(k, tmp.r * shade, tmp.g * shade, tmp.b * shade);
    }
    color.needsUpdate = true;
    invalidate();
  }, [mesh, field, roles, tmp, invalidate]);

  // The contour, a level line at one height, lying on the surface.
  const budgetY = heightOf(BUDGET, RANGE);
  const line = useMemo(
    () => contour(grid, rateIdx, BUDGET).map((p) => [xOf(p.noise), budgetY + 0.035, zOf(p.rounds)] as [number, number, number]),
    [rateIdx, budgetY],
  );

  // Floor: outline and the grid's own noise and rounds values.
  const floor = useMemo(() => {
    const out: number[] = [];
    const w = SURF_W / 2;
    const d = SURF_D / 2;
    for (const z of grid.rounds) out.push(-w, 0, zOf(z), w, 0, zOf(z));
    for (const n of grid.noise) out.push(xOf(n), 0, -d, xOf(n), 0, d);
    return new Float32Array(out);
  }, []);
  const floorGeo = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(floor, 3));
    return g;
  }, [floor]);
  useEffect(() => () => floorGeo.dispose(), [floorGeo]);

  // The marker and its guide lines, moved every frame without touching React.
  const marker = useRef<Object3D>(null);
  const stem = useRef<Mesh>(null);
  const foot = useRef<Mesh>(null);
  const bead = useRef<MeshBasicMaterial>(null);
  const footMat = useRef<MeshBasicMaterial>(null);
  const guide = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(new Float32Array(12), 3));
    return g;
  }, []);
  useEffect(() => () => guide.dispose(), [guide]);
  const pos = useRef({ x: 0, y: 0, z: 0, ready: false, within: true, roles: null as unknown });

  useActiveFrame(active, (_, delta) => {
    const L = live.current!;
    if (!L.settled) {
      const ease = Math.min(1, delta * 6);
      let worst = 0;
      for (let k = 0; k < L.h.length; k++) {
        const d = field.h[k] - L.h[k];
        L.h[k] += d * ease;
        worst = Math.max(worst, Math.abs(d));
      }
      if (worst < 0.002) {
        L.h.set(field.h);
        L.settled = true;
      }
      writeHeights();
      invalidate();
    }
    const s = useAcct.getState();
    const target = surfacePoint(grid, s.rateIdx, s.noise, s.rounds, RANGE);
    const p = pos.current;
    const k = p.ready ? Math.min(1, delta * 12) : 1;
    p.ready = true;
    p.x += (target.x - p.x) * k;
    p.y += (target.y - p.y) * k;
    p.z += (target.z - p.z) * k;
    marker.current?.position.set(p.x, p.y + 0.1, p.z);
    if (stem.current) {
      stem.current.position.set(p.x, p.y / 2, p.z);
      stem.current.scale.set(1, Math.max(p.y, 0.001), 1);
    }
    foot.current?.position.set(p.x, 0.02, p.z);
    const gp = guide.getAttribute("position") as BufferAttribute;
    gp.setXYZ(0, p.x, 0.01, p.z);
    gp.setXYZ(1, p.x, 0.01, SURF_D / 2);
    gp.setXYZ(2, p.x, 0.01, p.z);
    gp.setXYZ(3, SURF_W / 2, 0.01, p.z);
    gp.needsUpdate = true;
    const within = target.epsilon <= BUDGET;
    if (within !== p.within || p.roles !== roles) {
      p.within = within;
      p.roles = roles;
      const c = within ? roles.protected : roles.attacker;
      bead.current?.color.copy(c);
      footMat.current?.color.copy(c);
    }
    invalidate();
  });
  const drag = useDrag((dx, dy) => {
    const s = useAcct.getState();
    const tz = logT(s.noise, Z_LO, Z_HI) + dx * 0.0035;
    const tt = logT(s.rounds, T_LO, T_HI) - dy * 0.0035;
    s.setPoint(fromLogT(tz, Z_LO, Z_HI), fromLogT(tt, T_LO, T_HI));
  });

  const pick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    const g = group.current;
    if (!g) return;
    const local = g.worldToLocal(e.point.clone());
    useAcct.getState().setPoint(fromLogT(local.x / SURF_W + 0.5, Z_LO, Z_HI), fromLogT(local.z / SURF_D + 0.5, T_LO, T_HI));
  };

  const front = SURF_D / 2 + 0.5;
  const nTicks = [grid.noise[0], 1, 2, 4, Z_HI];
  const tTicks = [T_LO, grid.rounds[2], T_HI];

  return (
    <group ref={group} position={[0, BASE_Y, 0]}>
      <mesh geometry={mesh.geometry} onClick={pick}>
        <meshStandardMaterial vertexColors roughness={0.55} metalness={0.05} side={2} />
      </mesh>
      <lineSegments geometry={mesh.wire} frustumCulled={false}>
        <lineBasicMaterial color={roles.model} transparent opacity={0.3} toneMapped={false} depthWrite={false} />
      </lineSegments>
      <lineSegments geometry={ghost.geometry} frustumCulled={false}>
        <lineBasicMaterial color={roles.noise} transparent opacity={0.28} toneMapped={false} depthWrite={false} />
      </lineSegments>
      <lineSegments geometry={floorGeo} frustumCulled={false}>
        <lineBasicMaterial color={roles.muted} transparent opacity={0.3} toneMapped={false} depthWrite={false} />
      </lineSegments>

      {/* the budget: a faint level and the contour where the surface crosses it */}
      <mesh position={[0, budgetY, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[SURF_W + 0.3, SURF_D + 0.3]} />
        <meshBasicMaterial color={roles.model} transparent opacity={0.07} depthWrite={false} side={2} toneMapped={false} />
      </mesh>
      {line.length > 1 ? <Line points={line} color={roles.model} lineWidth={3.2} toneMapped={false} /> : null}

      {/* the marker */}
      <lineSegments geometry={guide} frustumCulled={false}>
        <lineBasicMaterial color={roles.model} transparent opacity={0.55} toneMapped={false} depthWrite={false} />
      </lineSegments>
      <mesh ref={stem}>
        <cylinderGeometry args={[0.014, 0.014, 1, 6]} />
        <meshBasicMaterial color={roles.model} transparent opacity={0.6} toneMapped={false} />
      </mesh>
      <mesh ref={foot} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.16, 0.22, 28]} />
        <meshBasicMaterial ref={footMat} color={roles.protected} toneMapped={false} />
      </mesh>
      <group ref={marker}>
        <mesh>
          <sphereGeometry args={[0.16, 20, 14]} />
          <meshBasicMaterial ref={bead} color={roles.protected} toneMapped={false} />
        </mesh>
        <mesh {...drag}>
          <sphereGeometry args={[0.42, 10, 8]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </group>

      {/* labels */}
      <Label position={[-SURF_W / 2 - 0.1, budgetY + 0.28, -SURF_D / 2]} tone="model" small>
        budget: epsilon {BUDGET}
      </Label>
      <Label position={[-SURF_W / 2, ghost.corner + 0.3, SURF_D / 2]} tone="noise" small>
        for comparison: q = {grid.rates[otherIdx]}
      </Label>
      <Label position={[0, -0.05, front + 0.55]} small>
        noise multiplier (log scale)
      </Label>
      <Label position={[SURF_W / 2 + 0.55, -0.05, 0]} small>
        rounds
      </Label>
      <Label position={[SURF_W / 2 - 0.2, SURF_H + 0.3, -SURF_D / 2]} small>
        height: epsilon, log scale
      </Label>
      {nTicks.map((n) => (
        <Label key={n} position={[xOf(n), -0.05, front]} small>
          {n}
        </Label>
      ))}
      {tTicks.map((t) => (
        <Label key={t} position={[SURF_W / 2 + 0.28, -0.05, zOf(t)]} small>
          {t}
        </Label>
      ))}
    </group>
  );
}
