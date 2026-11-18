import { useMemo, useRef } from "react";
import { Color, type Group } from "three";
import { fact } from "../../data";
import { Crowd, type CrowdApi, Links, useActiveFrame, useRoles, useStepTimeline } from "../../world/kit";
import { Tag } from "./Tag";
import { cloudLayout } from "./sim";

const X = { number: -4.6, file: -1.6, records: 1.7, hash: 4.7 };
const CLOUD_RADIUS = 1.25;

/** Step 3: a number on a slide, its result file, the run records behind it and the code hash they carry. */
export function ChainView({ shown, active }: { shown: boolean; active: boolean }) {
  const roles = useRoles();
  const records = Number(fact("runs.records").value);
  const hashed = Number(fact("runs.with_code_hash").value);
  const hash = String(fact("runs.engine_hash").value);

  const root = useRef<Group>(null);
  const cloud = useRef<CrowdApi>(null);
  const hashCube = useRef<Group>(null);
  const anim = useRef({ show: shown ? 1 : 0 });
  const scratch = useMemo(() => ({ color: new Color() }), []);

  const positions = useMemo(() => {
    const base = cloudLayout(records, 4, CLOUD_RADIUS);
    for (let i = 0; i < records; i++) base[i * 3] += X.records;
    return base;
  }, [records]);
  const colors = useMemo(() => {
    const out = new Float32Array(records * 3);
    for (let i = 0; i < records; i++) {
      const c = i < hashed ? roles.ledger : roles.muted;
      out[i * 3] = c.r;
      out[i * 3 + 1] = c.g;
      out[i * 3 + 2] = c.b;
    }
    return out;
  }, [records, hashed, roles]);
  const links = useMemo(
    () =>
      new Float32Array([
        X.number + 0.4, 0, 0, X.file - 0.6, 0, 0,
        X.file + 0.6, 0, 0, X.records - CLOUD_RADIUS, 0, 0,
        X.records + CLOUD_RADIUS, 0, 0, X.hash - 0.55, 0, 0,
      ]),
    [],
  );

  useStepTimeline(shown ? 1 : 0, (tl) => {
    tl.to(anim.current, { show: shown ? 1 : 0, duration: 0.5, ease: "power2.out" });
  });

  useActiveFrame(active, (state) => {
    const t = state.clock.elapsedTime;
    const a = anim.current;
    if (root.current) {
      root.current.visible = a.show > 0.01;
      root.current.scale.setScalar(0.85 + 0.15 * a.show);
      root.current.rotation.y = 0.05 * Math.sin(t * 0.3);
    }
    if (a.show <= 0.01) return;
    if (hashCube.current) {
      hashCube.current.rotation.y = t * 0.5;
      hashCube.current.rotation.x = t * 0.3;
    }
    const crowd = cloud.current;
    if (crowd) {
      // a slow shimmer through the hashed records, so the cloud reads as alive
      for (let i = 0; i < hashed; i += 1) {
        const pulse = 0.82 + 0.18 * Math.sin(t * 1.4 + i * 0.37);
        scratch.color.copy(roles.ledger).multiplyScalar(pulse);
        crowd.setColor(i, scratch.color);
      }
      crowd.commit();
    }
  });

  return (
    <group ref={root} visible={shown}>
      <Links segments={links} role="ledger" opacity={0.7} />

      <mesh position={[X.number, 0, 0]}>
        <icosahedronGeometry args={[0.32, 1]} />
        <meshBasicMaterial color={roles.model} toneMapped={false} />
      </mesh>
      <Tag on={shown} position={[X.number, -0.8, 0]} small>
        a number on a slide
      </Tag>

      <mesh position={[X.file, 0, 0]}>
        <boxGeometry args={[1.0, 1.3, 0.12]} />
        <meshStandardMaterial color={roles.ledger} roughness={0.5} metalness={0.05} />
      </mesh>
      <Tag on={shown} position={[X.file, -1.15, 0]} small tone="ledger">
        result file, status VALID
      </Tag>

      <Crowd count={records} positions={positions} colors={colors} size={0.055} apiRef={cloud} />
      <Tag on={shown} position={[X.records, -1.85, 0]} small tone="ledger">
        {records} run records, {hashed} with the hash
      </Tag>

      <group ref={hashCube} position={[X.hash, 0, 0]}>
        <mesh>
          <boxGeometry args={[0.7, 0.7, 0.7]} />
          <meshBasicMaterial color={roles.ledger} wireframe toneMapped={false} />
        </mesh>
        <mesh>
          <boxGeometry args={[0.38, 0.38, 0.38]} />
          <meshBasicMaterial color={roles.ledger} toneMapped={false} />
        </mesh>
      </group>
      <Tag on={shown} position={[X.hash, -0.95, 0]} small tone="ledger">
        {hash.slice(0, 8)}…
      </Tag>
    </group>
  );
}
