import { useThree } from "@react-three/fiber";
import { type Ref, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef } from "react";
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  type Group,
  type InstancedMesh,
  Object3D,
  PolarGridHelper,
  Quaternion,
  Vector3,
} from "three";
import type { Vec3 } from "../../deck/types";
import type { Role } from "../../styles/roles";
import { useRoles } from "./hooks";

/* ------------------------------------------------------------------ Crowd */

export interface CrowdApi {
  setPosition(i: number, x: number, y: number, z: number): void;
  setColor(i: number, c: Color): void;
  setScale(i: number, s: number): void;
  /** Call once after a batch of changes. */
  commit(): void;
}

export interface CrowdProps {
  count: number;
  /** xyz per instance. */
  positions: Float32Array;
  /** rgb per instance, 0 to 1. Defaults to the honest colour for every instance. */
  colors?: Float32Array;
  /** Radius of one light. */
  size?: number;
  apiRef?: Ref<CrowdApi>;
}

/** Many points of light drawn in one call. Use for users, devices, items. */
export function Crowd({ count, positions, colors, size = 0.09, apiRef }: CrowdProps) {
  const mesh = useRef<InstancedMesh>(null);
  const roles = useRoles();
  const invalidate = useThree((s) => s.invalidate);
  const scales = useRef(new Float32Array(0));
  const live = useRef(new Float32Array(0));
  const dummy = useMemo(() => new Object3D(), []);
  const tmp = useMemo(() => new Color(), []);

  useLayoutEffect(() => {
    const m = mesh.current;
    if (!m) return;
    scales.current = new Float32Array(count).fill(1);
    live.current = positions.slice(0, count * 3);
    for (let i = 0; i < count; i++) {
      dummy.position.set(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
      if (colors) tmp.setRGB(colors[i * 3], colors[i * 3 + 1], colors[i * 3 + 2]);
      else tmp.copy(roles.honest);
      m.setColorAt(i, tmp);
    }
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    invalidate();
  }, [count, positions, colors, roles, dummy, tmp, invalidate]);

  useImperativeHandle(
    apiRef,
    () => ({
      setPosition(i, x, y, z) {
        const m = mesh.current;
        if (!m || i < 0 || i >= count) return;
        live.current[i * 3] = x;
        live.current[i * 3 + 1] = y;
        live.current[i * 3 + 2] = z;
        dummy.position.set(x, y, z);
        dummy.scale.setScalar(scales.current[i]);
        dummy.updateMatrix();
        m.setMatrixAt(i, dummy.matrix);
      },
      setColor(i, c) {
        const m = mesh.current;
        if (!m || i < 0 || i >= count) return;
        m.setColorAt(i, c);
      },
      setScale(i, s) {
        const m = mesh.current;
        if (!m || i < 0 || i >= count) return;
        scales.current[i] = s;
        dummy.position.set(live.current[i * 3], live.current[i * 3 + 1], live.current[i * 3 + 2]);
        dummy.scale.setScalar(s);
        dummy.updateMatrix();
        m.setMatrixAt(i, dummy.matrix);
      },
      commit() {
        const m = mesh.current;
        if (!m) return;
        m.instanceMatrix.needsUpdate = true;
        if (m.instanceColor) m.instanceColor.needsUpdate = true;
        invalidate();
      },
    }),
    [count, dummy, invalidate],
  );

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, count]} frustumCulled={false} key={count}>
      <icosahedronGeometry args={[size, 1]} />
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  );
}

/* ------------------------------------------------------------------ Arrow */

export interface ArrowApi {
  set(from: Vec3, to: Vec3): void;
}

export interface ArrowProps {
  from: Vec3;
  to: Vec3;
  role: Role;
  width?: number;
  opacity?: number;
  /** Move the arrow every frame without re-rendering React. */
  apiRef?: Ref<ArrowApi>;
}

const UP = new Vector3(0, 1, 0);

/** A straight arrow: an update, a gradient, a direction of push. */
export function Arrow({ from, to, role, width = 0.05, opacity = 1, apiRef }: ArrowProps) {
  const group = useRef<Group>(null);
  const shaft = useRef<Object3D>(null);
  const head = useRef<Object3D>(null);
  const roles = useRoles();
  const invalidate = useThree((s) => s.invalidate);
  const scratch = useMemo(() => ({ a: new Vector3(), b: new Vector3(), d: new Vector3(), q: new Quaternion() }), []);

  const place = useMemo(
    () => (f: Vec3, t: Vec3) => {
      const g = group.current;
      if (!g || !shaft.current || !head.current) return;
      const { a, b, d, q } = scratch;
      a.set(f[0], f[1], f[2]);
      b.set(t[0], t[1], t[2]);
      d.subVectors(b, a);
      const length = d.length();
      g.visible = length > 1e-4;
      if (!g.visible) return;
      const headLength = Math.min(width * 5, length * 0.4);
      q.setFromUnitVectors(UP, d.normalize());
      g.position.copy(a);
      g.quaternion.copy(q);
      shaft.current.scale.set(1, length - headLength, 1);
      shaft.current.position.set(0, (length - headLength) / 2, 0);
      head.current.scale.set(1, headLength, 1);
      head.current.position.set(0, length - headLength / 2, 0);
    },
    [scratch, width],
  );

  useLayoutEffect(() => {
    place(from, to);
    invalidate();
    // from and to are compared by value so inline arrays do not re-run this every render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [place, invalidate, from[0], from[1], from[2], to[0], to[1], to[2]]);

  useImperativeHandle(apiRef, () => ({ set: place }), [place]);

  return (
    <group ref={group}>
      <mesh ref={shaft}>
        <cylinderGeometry args={[width, width, 1, 10]} />
        <meshBasicMaterial color={roles[role]} toneMapped={false} transparent={opacity < 1} opacity={opacity} />
      </mesh>
      <mesh ref={head}>
        <coneGeometry args={[width * 2.6, 1, 14]} />
        <meshBasicMaterial color={roles[role]} toneMapped={false} transparent={opacity < 1} opacity={opacity} />
      </mesh>
    </group>
  );
}

/* ------------------------------------------------------------------ Links */

export interface LinksProps {
  /** Two points (xyz xyz) per segment. Pass a new array to change the lines. */
  segments: Float32Array;
  role: Role;
  opacity?: number;
  /** rgb per vertex (two per segment). Overrides the role colour. */
  colors?: Float32Array;
}

/** Thin lines drawn in one call: friendships, mask threads, proof paths. */
export function Links({ segments, role, opacity = 0.5, colors }: LinksProps) {
  const roles = useRoles();
  const invalidate = useThree((s) => s.invalidate);
  const geometry = useMemo(() => new BufferGeometry(), []);

  useLayoutEffect(() => {
    geometry.setAttribute("position", new BufferAttribute(segments, 3));
    if (colors) geometry.setAttribute("color", new BufferAttribute(colors, 3));
    else geometry.deleteAttribute("color");
    geometry.computeBoundingSphere();
    invalidate();
  }, [geometry, segments, colors, invalidate]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <lineSegments geometry={geometry} frustumCulled={false}>
      <lineBasicMaterial
        color={colors ? "#ffffff" : roles[role]}
        vertexColors={Boolean(colors)}
        transparent
        opacity={opacity}
        toneMapped={false}
        depthWrite={false}
      />
    </lineSegments>
  );
}

/* ------------------------------------------------------------------ Ground */

/** A faint polar grid under the scene, to give the lights something to stand over. */
export function Ground({ radius = 7, y = -3 }: { radius?: number; y?: number }) {
  const roles = useRoles();
  const grid = useMemo(() => {
    const helper = new PolarGridHelper(radius, 12, 5, 72, roles.muted, roles.muted);
    const materials = Array.isArray(helper.material) ? helper.material : [helper.material];
    for (const material of materials) {
      material.transparent = true;
      material.opacity = 0.28;
      material.depthWrite = false;
      material.toneMapped = false;
    }
    return helper;
  }, [radius, roles]);

  useEffect(
    () => () => {
      grid.geometry.dispose();
      const materials = Array.isArray(grid.material) ? grid.material : [grid.material];
      for (const material of materials) material.dispose();
    },
    [grid],
  );

  return <primitive object={grid} position={[0, y, 0]} />;
}
