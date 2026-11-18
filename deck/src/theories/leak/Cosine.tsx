import { Line } from "@react-three/drei";
import { useMemo } from "react";
import { Arrow, Label, useDrag, useRoles, type Vec3 } from "../../world/kit";
import { usePair } from "./derived";
import { useLeak } from "./store";

const L = 3.1;
const METER_Y = -2.15;
const DEG_PER_PIXEL = 0.4;

const rad = (deg: number) => (deg * Math.PI) / 180;

/** Scene 3.2: two users' updates as arrows. Drag the tip of the second one to change the angle. */
export function Cosine({ labels }: { labels: boolean }) {
  const roles = useRoles();
  const angle = useLeak((s) => s.angle);
  const threshold = useLeak((s) => s.threshold);
  const setAngle = useLeak((s) => s.setAngle);
  const { cos, friends } = usePair();

  // Dragging along the circle: the pointer's movement along the tangent at the handle turns the arrow.
  const drag = useDrag((dx, dy) => {
    const a = rad(useLeak.getState().angle);
    const along = dx * -Math.sin(a) + -dy * Math.cos(a);
    setAngle(useLeak.getState().angle + along * DEG_PER_PIXEL);
  });

  const a = rad(angle);
  const tip: Vec3 = [Math.cos(a) * L, Math.sin(a) * L, 0];
  const arc = useMemo(() => {
    const steps = 28;
    const end = Math.max(a, 0.02);
    return Array.from({ length: steps + 1 }, (_, i): Vec3 => [Math.cos((end * i) / steps) * 1.25, Math.sin((end * i) / steps) * 1.25, 0]);
  }, [a]);
  const circle = useMemo(() => Array.from({ length: 37 }, (_, i): Vec3 => [Math.cos((i / 36) * Math.PI) * L, Math.sin((i / 36) * Math.PI) * L, 0]), []);

  const meterTrack = useMemo<Vec3[]>(() => [[-L, METER_Y, 0], [L, METER_Y, 0]], []);
  const zone = useMemo<Vec3[]>(() => [[Math.min(threshold, 0.995) * L, METER_Y, 0], [L, METER_Y, 0]], [threshold]);
  const guessTone = friends ? "attacker" : "muted";

  return (
    <group>
      <Line points={circle} color={roles.muted} lineWidth={1.2} transparent opacity={0.5} toneMapped={false} />
      <Arrow from={[0, 0, 0]} to={[L, 0, 0]} role="honest" width={0.06} />
      <Arrow from={[0, 0, 0]} to={tip} role="honest" width={0.06} />
      <mesh position={[0, 0, 0]}>
        <sphereGeometry args={[0.12, 16, 16]} />
        <meshBasicMaterial color={roles.model} toneMapped={false} />
      </mesh>
      <Line points={arc} color={friends ? roles.attacker : roles.muted} lineWidth={3} toneMapped={false} />

      {/* the handle on user B's arrow: grab it and turn */}
      <group position={tip}>
        <mesh>
          <sphereGeometry args={[0.2, 20, 20]} />
          <meshBasicMaterial color={roles.honest} toneMapped={false} />
        </mesh>
        <mesh>
          <ringGeometry args={[0.3, 0.36, 32]} />
          <meshBasicMaterial color={roles.honest} toneMapped={false} transparent opacity={0.6} />
        </mesh>
        <mesh {...drag}>
          <sphereGeometry args={[0.55, 12, 12]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </group>

      {/* the cosine on a meter, with the attacker's threshold */}
      <Line points={meterTrack} color={roles.muted} lineWidth={2} toneMapped={false} />
      <Line points={zone} color={roles.attacker} lineWidth={7} transparent opacity={0.8} toneMapped={false} />
      <mesh position={[Math.max(-1, Math.min(1, threshold)) * L, METER_Y, 0]}>
        <boxGeometry args={[0.07, 0.62, 0.07]} />
        <meshBasicMaterial color={roles.attacker} toneMapped={false} />
      </mesh>
      <mesh position={[cos * L, METER_Y, 0.05]}>
        <sphereGeometry args={[0.2, 20, 20]} />
        <meshBasicMaterial color={friends ? roles.attacker : roles.model} toneMapped={false} />
      </mesh>

      {labels ? (
        <>
          <Label position={[L + 0.55, 0.05, 0]} tone="honest" small>
            user A
          </Label>
          <Label position={[tip[0] * 1.17 + 0.25, tip[1] * 1.17 + 0.1, 0]} tone="honest" small>
            user B
          </Label>
          <Label position={[Math.cos(a / 2) * 1.85, Math.sin(a / 2) * 1.85 + 0.12, 0]} tone={guessTone} small>
            cosine {cos.toFixed(2)}
          </Label>
          <Label position={[-L, METER_Y - 0.5, 0]} small>
            -1
          </Label>
          <Label position={[0, METER_Y - 0.5, 0]} small>
            0
          </Label>
          <Label position={[L, METER_Y - 0.5, 0]} small>
            1
          </Label>
          <Label position={[Math.max(-1, Math.min(1, threshold)) * L, METER_Y + 0.65, 0]} tone="attacker" small>
            threshold
          </Label>
          <Label position={[0, METER_Y - 1.05, 0]} tone={guessTone} small>
            guess: {friends ? "friends" : "not friends"}
          </Label>
        </>
      ) : null}
    </group>
  );
}
