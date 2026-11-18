import { useLayoutEffect, useMemo, useRef } from "react";
import { Color, DoubleSide, type Group, type Mesh, type MeshBasicMaterial } from "three";
import { raw } from "../../data";
import { Crowd, type CrowdApi, useActiveFrame, useRoles, useStepTimeline } from "../../world/kit";
import { Tag } from "./Tag";
import { gateX, packetRest } from "./sim";
import { GATES, useMethod } from "./store";

const RING_RADIUS = 0.85;
const RUN_GATE = 3;
const FREEZE_GATE = 2;
const TUNE_GATE = 1;

/** Step 0: six gates in a row, and the result packet that moves through them. */
export function PipelineView({ shown, active }: { shown: boolean; active: boolean }) {
  const roles = useRoles();
  const stage = useMethod((s) => s.stage);
  const seedCount = useMemo(() => raw<number[]>("privacy_utility", "frozen/seeds").length, []);

  const root = useRef<Group>(null);
  const rings = useRef<(Group | null)[]>([]);
  const ringMaterials = useRef<(MeshBasicMaterial | null)[]>([]);
  const discs = useRef<(MeshBasicMaterial | null)[]>([]);
  const packet = useRef<Group>(null);
  const progress = useRef<Mesh>(null);
  const testBlock = useRef<MeshBasicMaterial>(null);
  const seedsApi = useRef<CrowdApi>(null);
  const anim = useRef({ show: shown ? 1 : 0, packetX: packetRest(stage), seeds: stage >= 4 ? 1 : 0 });
  const scratch = useMemo(() => ({ color: new Color() }), []);

  const seedPositions = useMemo(() => {
    const out = new Float32Array(seedCount * 3);
    for (let i = 0; i < seedCount; i++) {
      const angle = (i / seedCount) * Math.PI * 2;
      out[i * 3] = gateX(RUN_GATE);
      out[i * 3 + 1] = Math.cos(angle) * 1.3;
      out[i * 3 + 2] = Math.sin(angle) * 1.3;
    }
    return out;
  }, [seedCount]);

  useLayoutEffect(() => {
    // The seed lights start hidden; the frame loop scales them in once the run gate is passed.
    for (let i = 0; i < seedCount; i++) seedsApi.current?.setScale(i, 0);
    seedsApi.current?.commit();
  }, [seedCount]);

  useStepTimeline(shown ? 1 : 0, (tl) => {
    tl.to(anim.current, { show: shown ? 1 : 0, duration: 0.5, ease: "power2.out" });
  });
  useStepTimeline(stage, (tl) => {
    tl.to(anim.current, { packetX: packetRest(stage), seeds: stage >= 4 ? 1 : 0, duration: 0.9, ease: "power2.inOut" });
  });

  useActiveFrame(active, (state) => {
    const a = anim.current;
    const t = state.clock.elapsedTime;
    if (root.current) {
      root.current.visible = a.show > 0.01;
      root.current.scale.setScalar(0.85 + 0.15 * a.show);
    }
    if (a.show <= 0.01) return;
    for (let i = 0; i < GATES.length; i++) {
      const passed = i < stage;
      const next = i === stage;
      const role = passed ? roles.protected : next ? roles.model : roles.muted;
      ringMaterials.current[i]?.color.copy(role);
      const disc = discs.current[i];
      if (disc) {
        disc.color.copy(role);
        disc.opacity = passed ? 0.16 : next ? 0.1 : 0.04;
      }
      const ring = rings.current[i];
      if (ring) ring.scale.setScalar(next ? 1.05 + 0.04 * Math.sin(t * 3) : 1);
    }
    if (packet.current) {
      packet.current.position.set(a.packetX, 0.06 * Math.sin(t * 2.2), 0);
      packet.current.rotation.y = t * 0.7;
      packet.current.rotation.x = t * 0.4;
    }
    if (progress.current) {
      const from = gateX(0) - 1.15;
      const length = Math.max(0.001, a.packetX - from);
      progress.current.scale.x = length;
      progress.current.position.x = from + length / 2;
    }
    if (testBlock.current) testBlock.current.color.copy(stage >= 4 ? roles.honest : roles.muted);
    const crowd = seedsApi.current;
    if (crowd) {
      for (let i = 0; i < seedCount; i++) {
        const pop = Math.max(0, Math.min(1, a.seeds * 1.6 - (i / seedCount) * 0.6));
        scratch.color.copy(roles.ledger);
        crowd.setColor(i, scratch.color);
        crowd.setScale(i, pop * (1 + 0.15 * Math.sin(t * 3 + i)));
      }
      crowd.commit();
    }
  });

  return (
    <group ref={root} visible={shown}>
      {/* rail the packet rolls along, and the part of it already travelled */}
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[11.4, 0.025, 0.025]} />
        <meshBasicMaterial color={roles.muted} transparent opacity={0.5} toneMapped={false} />
      </mesh>
      <mesh ref={progress}>
        <boxGeometry args={[1, 0.05, 0.05]} />
        <meshBasicMaterial color={roles.ledger} toneMapped={false} />
      </mesh>

      {GATES.map((gate, i) => (
        <group key={gate.title} position={[gateX(i), 0, 0]}>
          <group
            ref={(el) => {
              rings.current[i] = el;
            }}
            rotation={[0, Math.PI / 2, 0]}
          >
            <mesh>
              <torusGeometry args={[RING_RADIUS, 0.055, 10, 56]} />
              <meshBasicMaterial
                ref={(el) => {
                  ringMaterials.current[i] = el;
                }}
                color={roles.muted}
                toneMapped={false}
              />
            </mesh>
            <mesh>
              <circleGeometry args={[RING_RADIUS, 40]} />
              <meshBasicMaterial
                ref={(el) => {
                  discs.current[i] = el;
                }}
                color={roles.muted}
                transparent
                opacity={0.05}
                depthWrite={false}
                side={DoubleSide}
                toneMapped={false}
              />
            </mesh>
          </group>
          <Tag on={shown} position={[0, i % 2 === 0 ? -1.45 : -2.05, 0]} small tone={i < stage ? "protected" : undefined}>
            {i + 1}. {gate.title}
          </Tag>
        </group>
      ))}

      {/* the two data splits: validation is for tuning, test stays sealed until the run gate */}
      <group position={[gateX(TUNE_GATE), 1.75, 0]}>
        <mesh>
          <boxGeometry args={[0.8, 0.36, 0.5]} />
          <meshStandardMaterial color={roles.honest} roughness={0.5} />
        </mesh>
        <Tag on={shown} position={[0, 0.5, 0]} small tone="honest">
          validation split
        </Tag>
      </group>
      <group position={[gateX(RUN_GATE), 1.75, 0]}>
        <mesh>
          <boxGeometry args={[0.8, 0.36, 0.5]} />
          <meshBasicMaterial ref={testBlock} color={roles.muted} toneMapped={false} />
        </mesh>
        <Tag on={shown} position={[0, 0.5, 0]} small tone={stage >= 4 ? "honest" : undefined}>
          {stage >= 4 ? "test split, used once" : "test split, sealed"}
        </Tag>
      </group>
      {stage > FREEZE_GATE ? (
        <Tag on={shown} position={[gateX(FREEZE_GATE), 1.25, 0]} small tone="ledger">
          frozen.json
        </Tag>
      ) : null}

      <Crowd count={seedCount} positions={seedPositions} size={0.07} apiRef={seedsApi} />
      {stage >= 4 ? (
        <Tag on={shown} position={[gateX(RUN_GATE) + 1.2, 1.0, 0]} small tone="ledger">
          {seedCount} seeds
        </Tag>
      ) : null}

      {/* the result packet */}
      <group ref={packet} position={[packetRest(0), 0, 0]}>
        <mesh>
          <icosahedronGeometry args={[0.26, 1]} />
          <meshBasicMaterial color={roles.ledger} toneMapped={false} />
        </mesh>
        <mesh>
          <icosahedronGeometry args={[0.42, 1]} />
          <meshBasicMaterial color={roles.ledger} wireframe transparent opacity={0.4} toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}
