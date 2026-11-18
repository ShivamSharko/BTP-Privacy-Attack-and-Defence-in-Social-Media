import { useEffect, useMemo, useRef } from "react";
import { BufferAttribute, BufferGeometry, type Group, RingGeometry } from "three";
import { Label, useActiveFrame, useRoles } from "../../world/kit";
import { gate, movedNeedles, type Needles } from "./sim";
import { TOY_BASE, useAcct } from "./store";

/** Dial scale: epsilon 0 at the left end of the arc, DIAL_MAX at the right end. */
const DIAL_MAX = Math.ceil((TOY_BASE.rdp * 1.35) / 2) * 2;
const R = 3;
const HUB_Y = 0.2;
const angleOf = (eps: number) => Math.PI * (1 - Math.min(DIAL_MAX, Math.max(0, eps)) / DIAL_MAX);
const KEYS: { key: keyof Needles; name: string; length: number }[] = [
  { key: "prv", name: "PRV", length: 1.75 },
  { key: "pld", name: "PLD", length: 3.55 },
  { key: "rdp", name: "RDP", length: 2.9 },
];

/**
 * Three needles, one dial, one gate. The band is the room PRV and PLD have to disagree; if the
 * smaller needle leaves it, or RDP drops below them, the gate closes and no epsilon is recorded.
 */
export function Gauge({ active }: { active: boolean }) {
  const roles = useRoles();
  const moved = useAcct((s) => s.moved);
  const shift = useAcct((s) => s.shift);
  const values = useMemo(() => movedNeedles(TOY_BASE, moved, shift), [moved, shift]);
  const result = useMemo(() => gate(values.prv, values.pld, values.rdp), [values]);
  const bigger = Math.max(values.prv, values.pld);

  // The permitted band: from the larger of PRV and PLD down by the tolerance.
  const band = useMemo(() => {
    const from = angleOf(bigger);
    const to = angleOf(Math.max(0, bigger - result.tolerance));
    return new RingGeometry(R - 0.34, R + 0.34, 24, 1, from, Math.max(0.001, to - from));
  }, [bigger, result.tolerance]);
  useEffect(() => () => band.dispose(), [band]);

  const ticks = useMemo(() => {
    const g = new BufferGeometry();
    const out: number[] = [];
    for (let e = 0; e <= DIAL_MAX; e++) {
      const a = angleOf(e);
      const len = e % 2 === 0 ? 0.28 : 0.15;
      out.push(Math.cos(a) * (R - 0.2 - len), Math.sin(a) * (R - 0.2 - len), 0, Math.cos(a) * (R - 0.2), Math.sin(a) * (R - 0.2), 0);
    }
    g.setAttribute("position", new BufferAttribute(new Float32Array(out), 3));
    return g;
  }, []);
  useEffect(() => () => ticks.dispose(), [ticks]);

  const bars = useRef<Group>(null);
  const door = useRef(result.ok ? 0 : 1);
  useActiveFrame(active, (_, delta) => {
    const goal = currentGateOk() ? 0 : 1;
    door.current += (goal - door.current) * Math.min(1, delta * 7);
    bars.current?.scale.set(1, 0.1 + 0.9 * door.current, 1);
  });

  const tone = (key: keyof Needles) => (!result.ok && moved === key ? roles.attacker : roles.model);
  const gateColour = result.ok ? roles.protected : roles.attacker;

  return (
    <group position={[0, -0.2, 0]}>
      {/* the dial */}
      <mesh position={[0, HUB_Y, 0]}>
        <ringGeometry args={[R - 0.03, R + 0.03, 72, 1, 0, Math.PI]} />
        <meshBasicMaterial color={roles.muted} toneMapped={false} />
      </mesh>
      <lineSegments geometry={ticks} position={[0, HUB_Y, 0]}>
        <lineBasicMaterial color={roles.muted} toneMapped={false} />
      </lineSegments>
      <mesh geometry={band} position={[0, HUB_Y, 0]}>
        <meshBasicMaterial color={roles.protected} transparent opacity={0.85} toneMapped={false} depthWrite={false} />
      </mesh>

      {/* needles */}
      {KEYS.map(({ key, name, length }) => {
        const a = angleOf(values[key]);
        return (
          <group key={key} position={[0, HUB_Y, 0.02 * (KEYS.findIndex((k) => k.key === key) + 1) + (moved === key ? 0.1 : 0)]} rotation={[0, 0, a - Math.PI / 2]}>
            <mesh position={[0, length / 2, 0]}>
              <boxGeometry args={[0.07, length, 0.05]} />
              <meshBasicMaterial color={tone(key)} toneMapped={false} />
            </mesh>
            <mesh position={[0, length, 0]}>
              <sphereGeometry args={[0.13, 14, 10]} />
              <meshBasicMaterial color={tone(key)} toneMapped={false} />
            </mesh>
            <Label position={[key === "prv" ? -0.85 : key === "rdp" ? 0.85 : 0, length + (key === "pld" ? 0.38 : 0.15), 0]} tone={!result.ok && moved === key ? "attacker" : "model"} small>
              {name} {values[key].toFixed(2)}
            </Label>
          </group>
        );
      })}
      <mesh position={[0, HUB_Y, 0.1]}>
        <sphereGeometry args={[0.22, 16, 12]} />
        <meshBasicMaterial color={roles.model} toneMapped={false} />
      </mesh>
      <Label position={[-R, HUB_Y - 0.3, 0]} small>
        0
      </Label>
      <Label position={[R, HUB_Y - 0.3, 0]} small>
        {DIAL_MAX}
      </Label>
      <Label position={[0, HUB_Y - 0.95, 0]} tone={result.ok ? "protected" : "attacker"}>
        {result.ok ? `value of record: ${result.ofRecord.toFixed(2)}` : "no value of record"}
      </Label>

      {/* the gate: bars drop to close it */}
      <group position={[0, -2.1, 0.1]}>
        <mesh position={[-2.25, -0.1, 0]}>
          <boxGeometry args={[0.2, 1.7, 0.2]} />
          <meshStandardMaterial color={roles.muted} roughness={0.5} />
        </mesh>
        <mesh position={[2.25, -0.1, 0]}>
          <boxGeometry args={[0.2, 1.7, 0.2]} />
          <meshStandardMaterial color={roles.muted} roughness={0.5} />
        </mesh>
        <mesh position={[0, 0.78, 0]}>
          <boxGeometry args={[4.7, 0.2, 0.22]} />
          <meshStandardMaterial color={gateColour} roughness={0.4} emissive={gateColour} emissiveIntensity={0.3} />
        </mesh>
        <group ref={bars} position={[0, 0.68, 0]}>
          {Array.from({ length: 9 }, (_, i) => (
            <mesh key={i} position={[-1.8 + i * 0.45, -0.7, 0]}>
              <boxGeometry args={[0.12, 1.4, 0.12]} />
              <meshStandardMaterial color={gateColour} roughness={0.4} emissive={gateColour} emissiveIntensity={0.3} />
            </mesh>
          ))}
        </group>
      </group>
      <Label position={[0, -3.35, 0.1]} tone={result.ok ? "protected" : "attacker"} small>
        {result.ok ? "gate open: the run may be released" : "gate closed: the run is refused"}
      </Label>
    </group>
  );
}

/** Reads the gate outcome from the store without re-rendering. */
function currentGateOk(): boolean {
  const { moved, shift } = useAcct.getState();
  const v = movedNeedles(TOY_BASE, moved, shift);
  return gate(v.prv, v.pld, v.rdp).ok;
}
