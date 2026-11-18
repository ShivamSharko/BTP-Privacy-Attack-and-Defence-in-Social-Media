import { useEffect, useMemo, useRef } from "react";
import { BoxGeometry, Color, type Group, type InstancedMesh, type Mesh, Object3D } from "three";
import { fmt } from "../../data";
import { Label, Links, useActiveFrame, useRoles, useStepTimeline } from "../../world/kit";
import { demo, MAX_ASKED, runFor, useLedger } from "./store";

const ROW_Y = -1.5;
const BAR_Y = 0.35;
const WIDTH = 7.4;
const TICK_MS = 140;
const ARM = 1.7;

/**
 * The release gate: one card per round asked for, a budget bar that fills as round receipts
 * are written, and a barrier at the round the budget runs out. The barrier closes, a refusal
 * receipt rises, and the release receipt covers the rounds that did run.
 */
export function GateView({ active, shown, step }: { active: boolean; shown: boolean; step: number }) {
  const roles = useRoles();
  const asked = useLedger((s) => s.asked);
  const progress = useLedger((s) => s.progress);
  const playing = useLedger((s) => s.playing);
  const run = useMemo(() => runFor(asked), [asked]);

  const slots = Math.max(run.asked, run.allowed + 1, 1);
  const sp = WIDTH / Math.max(slots, 12);
  const x0 = -(slots * sp) / 2;
  const slotX = (round: number) => x0 + (round - 0.5) * sp;
  const budgetX = x0 + run.allowed * sp;
  const written = run.receipts.slice(0, progress);
  const roundsWritten = written.filter((r) => r.kind === "round").length;
  const refused = written.some((r) => r.kind === "refusal");
  const released = written.some((r) => r.kind === "release");

  const group = useRef<Group>(null);
  const cards = useRef<InstancedMesh>(null);
  const fill = useRef<Mesh>(null);
  const arm = useRef<Group>(null);
  const refusal = useRef<Group>(null);
  const release = useRef<Group>(null);
  const anim = useRef({ show: shown ? 1 : 0, fill: 0, arm: 0, refusal: 0, release: 0 });
  const lit = useRef(new Float32Array(MAX_ASKED + 2));
  const scratch = useMemo(() => ({ dummy: new Object3D(), color: new Color() }), []);
  const cardGeometry = useMemo(() => new BoxGeometry(1, 1, 1), []);
  useEffect(() => () => cardGeometry.dispose(), [cardGeometry]);

  useStepTimeline(step, (tl) => {
    tl.to(anim.current, { show: shown ? 1 : 0, duration: 0.7, ease: "power2.inOut" });
  });

  // Arriving on the slide plays the run once.
  useEffect(() => {
    if (active && shown) useLedger.getState().play();
  }, [active, shown]);

  useEffect(() => {
    if (!active || !shown || !playing) return;
    const last = run.receipts.length;
    const timer = window.setInterval(() => useLedger.getState().tick(last), TICK_MS);
    return () => window.clearInterval(timer);
  }, [active, shown, playing, run]);

  useActiveFrame(active, (state, delta) => {
    const a = anim.current;
    const g = group.current;
    if (g) {
      g.visible = a.show > 0.01;
      g.scale.setScalar(0.6 + 0.4 * a.show);
      g.position.y = (1 - a.show) * 2.5;
    }
    if (!g?.visible) return;
    const k = Math.min(1, delta * 8);
    a.fill += (Math.min(1, run.allowed > 0 ? roundsWritten / run.allowed : 0) - a.fill) * k;
    a.arm += ((refused ? 1 : 0) - a.arm) * Math.min(1, delta * 5);
    a.refusal += ((refused ? 1 : 0) - a.refusal) * Math.min(1, delta * 5);
    a.release += ((released ? 1 : 0) - a.release) * Math.min(1, delta * 4);
    const t = state.clock.elapsedTime;

    const mesh = cards.current;
    if (mesh) {
      const { dummy, color } = scratch;
      for (let i = 0; i < MAX_ASKED + 2; i++) {
        const round = i + 1;
        const inRun = round <= run.asked;
        const done = round <= roundsWritten;
        const beyond = round > run.allowed;
        lit.current[i] += ((done ? 1 : 0) - lit.current[i]) * k;
        const b = lit.current[i];
        if (!inRun) {
          dummy.scale.setScalar(0);
        } else {
          dummy.scale.set(sp * 0.7, beyond ? 0.42 : 0.56 + b * 0.08, beyond ? 0.02 : 0.05);
        }
        dummy.position.set(slotX(round), ROW_Y + b * 0.12, beyond ? -0.15 : 0);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        if (beyond) color.copy(roles.muted).multiplyScalar(0.8);
        else color.copy(roles.muted).lerp(roles.ledger, 0.15 + 0.85 * b);
        mesh.setColorAt(i, color);
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    const f = fill.current;
    if (f) {
      const length = Math.max(0.0001, (budgetX - x0) * a.fill);
      f.scale.set(length, 1, 1);
      f.position.x = x0 + length / 2;
    }
    if (arm.current) arm.current.rotation.z = (1 - a.arm) * (Math.PI / 2) * 0.92;
    if (refusal.current) {
      refusal.current.visible = a.refusal > 0.01;
      refusal.current.position.y = ROW_Y + 0.2 + a.refusal * 2.85;
      refusal.current.scale.setScalar(a.refusal);
      refusal.current.rotation.y = 0.15 * Math.sin(t * 1.3);
    }
    if (release.current) {
      release.current.visible = a.release > 0.01;
      release.current.scale.setScalar(a.release);
    }
  });

  const releaseX = (x0 + slotX(Math.max(run.completed, 1))) / 2;
  // Threads from the release receipt down to every round receipt it covers.
  const chain = useMemo(() => {
    const out = new Float32Array(run.completed * 6);
    for (let t = 1; t <= run.completed; t++) {
      out.set([releaseX, BAR_Y + 0.66, 0, slotX(t), ROW_Y + 0.34, 0], (t - 1) * 6);
    }
    return out;
    // slotX depends only on the run's size, which `run` carries
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, releaseX]);
  const measured = run.completed === demo.completed && run.refusedAt !== null;

  return (
    <group ref={group}>
      {/* the cards: one per round asked for */}
      <instancedMesh ref={cards} args={[cardGeometry, undefined, MAX_ASKED + 2]} frustumCulled={false}>
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>

      {/* the budget bar: track up to the budget, fill as round receipts are written */}
      <mesh position={[(x0 + budgetX) / 2, BAR_Y, -0.02]}>
        <boxGeometry args={[Math.max(budgetX - x0, 0.01), 0.22, 0.04]} />
        <meshBasicMaterial color={roles.protected} toneMapped={false} transparent opacity={0.16} />
      </mesh>
      <mesh ref={fill} position={[x0, BAR_Y, 0]}>
        <boxGeometry args={[1, 0.22, 0.06]} />
        <meshBasicMaterial color={roles.protected} toneMapped={false} />
      </mesh>
      {run.asked > run.allowed ? (
        <mesh position={[(budgetX + x0 + run.asked * sp) / 2, BAR_Y, -0.02]}>
          <boxGeometry args={[(run.asked - run.allowed) * sp, 0.22, 0.02]} />
          <meshBasicMaterial color={roles.muted} toneMapped={false} transparent opacity={0.35} />
        </mesh>
      ) : null}

      {/* the gate at the budget line */}
      <group position={[budgetX, 0, 0.1]}>
        <mesh position={[0, (ROW_Y + BAR_Y + 0.9) / 2 - 0.35, 0]}>
          <boxGeometry args={[0.07, BAR_Y - ROW_Y + 1.6, 0.07]} />
          <meshStandardMaterial color={roles.protected} roughness={0.5} />
        </mesh>
        <group ref={arm} position={[0, ROW_Y + 0.5, 0.05]}>
          <mesh position={[ARM / 2, 0, 0]}>
            <boxGeometry args={[ARM, 0.13, 0.13]} />
            <meshBasicMaterial color={roles.protected} toneMapped={false} />
          </mesh>
        </group>
      </group>

      {/* the refusal receipt rises from the first round over budget */}
      {run.refusedAt !== null ? (
        <group ref={refusal} position={[slotX(run.refusedAt), ROW_Y, 0.25]}>
          <mesh>
            <boxGeometry args={[0.42, 0.56, 0.05]} />
            <meshBasicMaterial color={roles.ledger} toneMapped={false} />
          </mesh>
          <mesh position={[0, 0, 0.03]}>
            <boxGeometry args={[0.3, 0.05, 0.01]} />
            <meshBasicMaterial color={roles.protected} toneMapped={false} />
          </mesh>
        </group>
      ) : null}

      {released ? <Links segments={chain} role="ledger" opacity={0.22} /> : null}

      {/* the release receipt over the rounds that ran */}
      {run.completed > 0 ? (
        <group ref={release} position={[releaseX, BAR_Y + 1.0, 0]}>
          <mesh>
            <boxGeometry args={[0.5, 0.66, 0.05]} />
            <meshBasicMaterial color={roles.ledger} toneMapped={false} />
          </mesh>
          <mesh position={[0, 0, 0.05]}>
            <torusGeometry args={[0.16, 0.03, 8, 40]} />
            <meshBasicMaterial color={roles.model} toneMapped={false} />
          </mesh>
        </group>
      ) : null}

      {shown ? (
        <>
          <Label position={[budgetX - 0.85, BAR_Y - 0.4, 0]} tone="protected">
            budget ε {fmt.n(demo.budget, 1)}
          </Label>
          <Label position={[x0 + 1.1, BAR_Y + 0.4, 0]} tone="protected" small>
            budget used, in rounds
          </Label>
          <Label position={[x0 + 0.3, ROW_Y - 0.62, 0]} small>
            round 1
          </Label>
          <Label position={[slotX(run.asked), ROW_Y - 0.62, 0]} small>
            round {run.asked}
          </Label>
          {refused && run.refusedAt !== null ? (
            <Label position={[slotX(run.refusedAt) + 0.4, ROW_Y + 3.62, 0]} tone="ledger" small>
              refusal receipt, round {run.refusedAt}
            </Label>
          ) : null}
          {released ? (
            <Label position={[releaseX, BAR_Y + 1.62, 0]} tone="ledger" small>
              {measured
                ? `release receipt: rounds 1 to ${run.completed}, ε ${fmt.n(demo.released, 3)}`
                : `release receipt: rounds 1 to ${run.completed}`}
            </Label>
          ) : null}
        </>
      ) : null}
    </group>
  );
}
