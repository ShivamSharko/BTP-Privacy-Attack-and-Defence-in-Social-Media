import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { BoxGeometry, Color, type InstancedMesh, Object3D, RingGeometry } from "three";
import { Crowd, type CrowdApi, Label, useActiveFrame, useRoles } from "../../world/kit";
import { useInversion } from "./derived";
import { itemCell, N_ITEMS, TOP_K } from "./sim";
import { useLeak } from "./store";

const SPACING = 0.72;
const TILE = 0.62;
const COLUMN_SCALE = 1.45;
const COLUMN_MAX = 2.2;
const STRIP_Z = 3.45;

/** Scene 3.1: one update as columns over the item grid, and the attacker's ranked guess in front. */
export function Inversion({ run, labels }: { run: boolean; labels: boolean }) {
  const roles = useRoles();
  const mask = useLeak((s) => s.mask);
  const toggleItem = useLeak((s) => s.toggleItem);
  const { update, recovery, k } = useInversion();

  const cells = useMemo(() => Array.from({ length: N_ITEMS }, (_, i) => itemCell(i, SPACING)), []);
  const stripPositions = useMemo(() => {
    const out = new Float32Array(TOP_K * 3);
    for (let i = 0; i < TOP_K; i++) {
      out[i * 3] = (i - (TOP_K - 1) / 2) * SPACING;
      out[i * 3 + 1] = 0.2;
      out[i * 3 + 2] = STRIP_Z;
    }
    return out;
  }, []);

  const tiles = useRef<InstancedMesh>(null);
  const columns = useRef<InstancedMesh>(null);
  const rings = useRef<InstancedMesh>(null);
  const strip = useRef<CrowdApi>(null);
  const heights = useRef(new Float32Array(N_ITEMS));
  const targets = useRef(new Float32Array(N_ITEMS));
  const scratch = useMemo(() => ({ dummy: new Object3D(), color: new Color() }), []);

  const tileGeometry = useMemo(() => new BoxGeometry(TILE, 0.08, TILE), []);
  const columnGeometry = useMemo(() => new BoxGeometry(0.36, 1, 0.36).translate(0, 0.5, 0), []);
  const ringGeometry = useMemo(() => new RingGeometry(0.34, 0.42, 32).rotateX(-Math.PI / 2), []);

  useEffect(
    () => () => {
      tileGeometry.dispose();
      columnGeometry.dispose();
      ringGeometry.dispose();
    },
    [tileGeometry, columnGeometry, ringGeometry],
  );

  targets.current = Float32Array.from(update, (v) => Math.min(COLUMN_MAX, Math.abs(v) * COLUMN_SCALE));

  // Tiles: the real history stands out in amber and sits a little higher.
  useLayoutEffect(() => {
    const mesh = tiles.current;
    if (!mesh) return;
    const { dummy, color } = scratch;
    for (let i = 0; i < N_ITEMS; i++) {
      const own = mask[i];
      dummy.position.set(cells[i].x, own ? 0.03 : 0, cells[i].z);
      dummy.scale.set(1, own ? 1.7 : 1, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      color.copy(own ? roles.honest : roles.muted);
      if (!own) color.multiplyScalar(0.62);
      mesh.setColorAt(i, color);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [mask, roles, cells, scratch]);

  useLayoutEffect(() => {
    const mesh = columns.current;
    if (!mesh) return;
    for (let i = 0; i < N_ITEMS; i++) mesh.setColorAt(i, roles.attacker);
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [roles]);

  // Rings on the guessed items, and the ranked strip: pink where the guess was right.
  useLayoutEffect(() => {
    const mesh = rings.current;
    const { dummy } = scratch;
    for (let r = 0; r < TOP_K; r++) {
      const item = recovery.ranking[r];
      const shown = r < k && item !== undefined;
      if (mesh) {
        dummy.position.set(shown ? cells[item].x : 0, 0.1, shown ? cells[item].z : 0);
        dummy.scale.setScalar(shown ? 1 : 0.0001);
        dummy.updateMatrix();
        mesh.setMatrixAt(r, dummy.matrix);
      }
      const light = strip.current;
      if (light) {
        light.setColor(r, shown && mask[item] ? roles.attacker : roles.muted);
        light.setScale(r, shown ? (mask[item] ? 1.5 : 1) : 0);
      }
    }
    if (mesh) {
      mesh.instanceMatrix.needsUpdate = true;
      for (let r = 0; r < TOP_K; r++) mesh.setColorAt(r, roles.attacker);
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    strip.current?.commit();
  }, [recovery, k, mask, roles, cells, scratch]);

  useActiveFrame(run, (_state, delta) => {
    const mesh = columns.current;
    if (!mesh) return;
    const { dummy } = scratch;
    const ease = Math.min(1, delta * 7);
    for (let i = 0; i < N_ITEMS; i++) {
      heights.current[i] += (targets.current[i] - heights.current[i]) * ease;
      dummy.position.set(cells[i].x, 0.04, cells[i].z);
      dummy.scale.set(1, Math.max(heights.current[i], 0.001), 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  const hits = recovery.ranking.slice(0, k).filter((item) => mask[item]).length;

  return (
    <group>
      <instancedMesh
        ref={tiles}
        args={[tileGeometry, undefined, N_ITEMS]}
        frustumCulled={false}
        onClick={(e) => {
          e.stopPropagation();
          if (e.instanceId !== undefined) toggleItem(e.instanceId);
        }}
        onPointerOver={() => {
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          document.body.style.cursor = "";
        }}
      >
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>

      <instancedMesh ref={columns} args={[columnGeometry, undefined, N_ITEMS]} frustumCulled={false} raycast={() => null}>
        <meshStandardMaterial roughness={0.5} metalness={0.05} />
      </instancedMesh>

      <instancedMesh ref={rings} args={[ringGeometry, undefined, TOP_K]} frustumCulled={false} raycast={() => null}>
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>

      <Crowd count={TOP_K} positions={stripPositions} size={0.1} apiRef={strip} />

      {labels ? (
        <>
          <Label position={[0, 0.1, STRIP_Z + 0.75]} tone="attacker" small>
            the attacker's top {k} guesses, best first: {hits} right
          </Label>
          <Label position={[0, 0.1, -3.1]} tone="honest" small>
            amber tiles: the user's real history
          </Label>
        </>
      ) : null}
    </group>
  );
}
