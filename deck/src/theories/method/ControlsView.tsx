import { useMemo, useRef } from "react";
import { BoxGeometry, DoubleSide, EdgesGeometry, type Group, type LineBasicMaterial, type Mesh, type MeshBasicMaterial } from "three";
import { Links, useActiveFrame, useRoles, useStepTimeline } from "../../world/kit";
import { Tag } from "./Tag";
import { controlVerdict } from "./sim";
import { useMethod } from "./store";

const RUN: [number, number] = [-4.2, 0];
const POS: [number, number] = [-0.6, 1.55];
const NEG: [number, number] = [-0.6, -1.55];
const STAMP: [number, number] = [3.7, 0];
const FAR = -200;

function lane(out: number[], a: [number, number], b: [number, number]) {
  out.push(a[0], a[1], 0, b[0], b[1], 0);
}

/** Step 1: the run feeds a positive and a negative control; both must behave, or the stamp is INVALID. */
export function ControlsView({ shown, active }: { shown: boolean; active: boolean }) {
  const roles = useRoles();
  const positiveOk = useMethod((s) => s.positiveOk);
  const negativeOk = useMethod((s) => s.negativeOk);
  const runNonce = useMethod((s) => s.runNonce);
  const verdict = controlVerdict(positiveOk, negativeOk);
  const valid = verdict === "VALID";

  const root = useRef<Group>(null);
  const probeA = useRef<Mesh>(null);
  const probeB = useRef<Mesh>(null);
  const ringA = useRef<MeshBasicMaterial>(null);
  const ringB = useRef<MeshBasicMaterial>(null);
  const packet = useRef<Group>(null);
  const packetMaterial = useRef<MeshBasicMaterial>(null);
  const stamp = useRef<Group>(null);
  const stampFill = useRef<MeshBasicMaterial>(null);
  const stampEdge = useRef<LineBasicMaterial>(null);
  const slab = useMemo(() => new BoxGeometry(2.2, 1.0, 0.22), []);
  const slabEdges = useMemo(() => new EdgesGeometry(slab), [slab]);
  const stampLabel = useRef<Group>(null);
  const ringLabelA = useRef<Group>(null);
  const ringLabelB = useRef<Group>(null);
  const anim = useRef({ show: shown ? 1 : 0, probe: 1, packet: 1, stamp: 1 });

  const lanes = useMemo(() => {
    const out: number[] = [];
    lane(out, RUN, POS);
    lane(out, RUN, NEG);
    lane(out, POS, STAMP);
    lane(out, NEG, STAMP);
    lane(out, RUN, STAMP);
    return new Float32Array(out);
  }, []);

  // Entering the slide, or pressing Run, plays: probes to the controls, packet to the stamp, stamp.
  useStepTimeline(
    shown ? 1 : 0,
    (tl) => {
      tl.to(anim.current, { show: shown ? 1 : 0, duration: 0.5, ease: "power2.out" }, 0);
      if (!shown) return;
      tl.set(anim.current, { probe: 0, packet: 0, stamp: 0 }, 0);
      tl.to(anim.current, { probe: 1, duration: 0.9, ease: "power2.inOut" }, 0.2);
      tl.to(anim.current, { packet: 1, duration: 0.9, ease: "power2.inOut" }, 1.1);
      tl.to(anim.current, { stamp: 1, duration: 0.45, ease: "back.out(2.2)" }, 2.0);
    },
    [runNonce, positiveOk, negativeOk],
  );

  useActiveFrame(active, (state) => {
    const a = anim.current;
    const t = state.clock.elapsedTime;
    if (root.current) {
      root.current.visible = a.show > 0.01;
      root.current.scale.setScalar(0.85 + 0.15 * a.show);
    }
    if (a.show <= 0.01) return;
    probeA.current?.position.set(RUN[0] + (POS[0] - RUN[0]) * a.probe, RUN[1] + (POS[1] - RUN[1]) * a.probe, 0);
    probeB.current?.position.set(RUN[0] + (NEG[0] - RUN[0]) * a.probe, RUN[1] + (NEG[1] - RUN[1]) * a.probe, 0);
    const decided = a.probe > 0.97;
    ringA.current?.color.copy(decided ? (positiveOk ? roles.protected : roles.attacker) : roles.muted);
    ringB.current?.color.copy(decided ? (negativeOk ? roles.protected : roles.attacker) : roles.muted);
    if (ringLabelA.current) ringLabelA.current.position.y = decided ? 0 : FAR;
    if (ringLabelB.current) ringLabelB.current.position.y = decided ? 0 : FAR;

    if (packet.current) {
      packet.current.position.set(RUN[0] + (STAMP[0] - 1.45 - RUN[0]) * a.packet, 0.06 * Math.sin(t * 2.2), 0);
      packet.current.rotation.y = t * 0.7;
      packet.current.rotation.x = t * 0.4;
    }
    packetMaterial.current?.color.copy(a.packet > 0.99 && !valid ? roles.attacker : roles.ledger);

    const pop = Math.max(0.0001, a.stamp);
    if (stamp.current) {
      stamp.current.scale.setScalar(pop);
      stamp.current.rotation.z = valid ? 0 : 0.14 * Math.min(1, a.stamp);
    }
    const stampColor = valid ? roles.protected : roles.attacker;
    stampFill.current?.color.copy(stampColor);
    stampEdge.current?.color.copy(stampColor);
    if (stampLabel.current) stampLabel.current.position.y = a.stamp > 0.6 ? 0 : FAR;
  });

  return (
    <group ref={root} visible={shown}>
      <Links segments={lanes} role="muted" opacity={0.4} />

      {/* the run */}
      <group position={[RUN[0], RUN[1], 0]} rotation={[0, Math.PI / 2, 0]}>
        <mesh>
          <torusGeometry args={[0.8, 0.055, 10, 56]} />
          <meshBasicMaterial color={roles.model} toneMapped={false} />
        </mesh>
      </group>
      <Tag on={shown} position={[RUN[0], -1.2, 0]} small>
        the experiment runs
      </Tag>

      {/* the two controls */}
      {(
        [
          { at: POS, material: ringA, holder: ringLabelA, ok: positiveOk, head: "positive control", rule: "the effect must be found", yHead: 1.5 },
          { at: NEG, material: ringB, holder: ringLabelB, ok: negativeOk, head: "negative control", rule: "nothing must be found", yHead: -1.5 },
        ] as const
      ).map((c) => (
        <group key={c.head} position={[c.at[0], c.at[1], 0]}>
          <group rotation={[0, Math.PI / 2, 0]}>
            <mesh>
              <torusGeometry args={[0.7, 0.055, 10, 56]} />
              <meshBasicMaterial ref={c.material} color={roles.muted} toneMapped={false} />
            </mesh>
            <mesh>
              <circleGeometry args={[0.7, 36]} />
              <meshBasicMaterial color={c.ok ? roles.protected : roles.attacker} transparent opacity={0.1} depthWrite={false} side={DoubleSide} toneMapped={false} />
            </mesh>
          </group>
          <Tag on={shown} position={[0, c.yHead > 0 ? 1.2 : -1.2, 0]} small>
            {c.head}: {c.rule}
          </Tag>
          <group ref={c.holder} position={[0, FAR, 0]}>
            <Tag on={shown} position={[0, c.yHead > 0 ? 0.95 : -0.95, 0]} small tone={c.ok ? "protected" : "attacker"}>
              {c.ok ? "as required" : "not as required"}
            </Tag>
          </group>
        </group>
      ))}

      {/* probes sent to the controls */}
      <mesh ref={probeA}>
        <icosahedronGeometry args={[0.1, 1]} />
        <meshBasicMaterial color={roles.model} toneMapped={false} />
      </mesh>
      <mesh ref={probeB}>
        <icosahedronGeometry args={[0.1, 1]} />
        <meshBasicMaterial color={roles.model} toneMapped={false} />
      </mesh>

      {/* the result packet */}
      <group ref={packet}>
        <mesh>
          <icosahedronGeometry args={[0.26, 1]} />
          <meshBasicMaterial ref={packetMaterial} color={roles.ledger} toneMapped={false} />
        </mesh>
        <mesh>
          <icosahedronGeometry args={[0.42, 1]} />
          <meshBasicMaterial color={valid ? roles.ledger : roles.attacker} wireframe transparent opacity={0.4} toneMapped={false} />
        </mesh>
      </group>

      {/* the stamp */}
      <group ref={stamp} position={[STAMP[0], STAMP[1], 0]}>
        <mesh geometry={slab}>
          <meshBasicMaterial ref={stampFill} color={roles.protected} transparent opacity={0.16} depthWrite={false} toneMapped={false} />
        </mesh>
        <lineSegments geometry={slabEdges}>
          <lineBasicMaterial ref={stampEdge} color={roles.protected} toneMapped={false} />
        </lineSegments>
      </group>
      <group ref={stampLabel} position={[0, FAR, 0]}>
        <Tag on={shown} position={[STAMP[0], STAMP[1], 0.3]} tone={valid ? "protected" : "attacker"}>
          <strong>{verdict}</strong>
        </Tag>
      </group>
    </group>
  );
}
