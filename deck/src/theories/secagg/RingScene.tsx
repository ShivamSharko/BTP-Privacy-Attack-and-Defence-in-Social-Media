import { useMemo, useRef } from "react";
import { Color, type Group, type Mesh, type MeshBasicMaterial, type MeshStandardMaterial } from "three";
import { Crowd, type CrowdApi, Label, Links, type Vec3, useActiveFrame, useRoles, useStepTimeline } from "../../world/kit";
import {
  hexLabel,
  labelPos,
  lerp3,
  meetingPoint,
  PAIRS,
  ringState,
  runFor,
  SERVER_POS,
  signed,
  SLAB_TOP,
  toy,
  USER_POS,
} from "./ringModel";
import { N_USERS } from "./sim";
import { useSecAgg } from "./store";

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function segments(pairs: [number, number][]): Float32Array {
  const out = new Float32Array(pairs.length * 6);
  pairs.forEach(([i, j], k) => {
    out.set(USER_POS[i], k * 6);
    out.set(USER_POS[j], k * 6 + 3);
  });
  return out;
}

const NONE = new Float32Array(0);

/** Six users, the masks between them, and the server. Used on the first, third and the stage slides. */
export function RingScene({ step, active }: { step: number; active: boolean }) {
  const roles = useRoles();
  const phase = useSecAgg((s) => s.phase);
  const view = useSecAgg((s) => s.view);
  const focus = useSecAgg((s) => s.focus);
  const dropPhase = useSecAgg((s) => s.dropPhase);
  const droppedUser = useSecAgg((s) => s.dropped);
  const setFocus = useSecAgg((s) => s.setFocus);
  const toggleDropped = useSecAgg((s) => s.toggleDropped);

  const st = ringState(step, phase, dropPhase, droppedUser);
  const dropMode = step === 2;
  const serverView = step === 0 && view === "server";
  const run = runFor(st.dropped);
  const key = (st.masked ? 1 : 0) | (st.sent ? 2 : 0) | (st.summed ? 4 : 0) | (st.revealed ? 8 : 0);

  const anim = useRef({ mask: st.masked ? 1 : 0, send: st.sent ? 1 : 0, sum: st.summed ? 1 : 0, reveal: st.revealed ? 1 : 0 });
  const prevKey = useRef(key);
  useStepTimeline(
    key,
    (tl) => {
      const a = anim.current;
      const changed = prevKey.current ^ key;
      prevKey.current = key;
      // A jump over several states plays them in order: masks, then sending, then the sum, then the seeds.
      let at = 0;
      const stage = (bit: number, prop: "mask" | "send" | "sum" | "reveal", on: boolean, length: number, ease: string) => {
        const turning = (changed & bit) !== 0 && on;
        tl.to(a, { [prop]: on ? 1 : 0, duration: on ? length : 0.3, ease }, turning ? at : 0);
        if (turning) at += length * 0.8;
      };
      stage(1, "mask", st.masked, 0.9, "power2.inOut");
      stage(2, "send", st.sent, 1.2, "power2.inOut");
      stage(4, "sum", st.summed, 1.3, "power1.inOut");
      stage(8, "reveal", st.revealed, 1.2, "power2.inOut");
    },
    [droppedUser, step],
  );

  // Threads: the shared secrets. The server cannot see them, so its view hides them.
  const threads = useMemo(() => {
    if (serverView) return { base: NONE, focus: NONE, orphan: NONE };
    const involves = (p: [number, number], u: number) => p[0] === u || p[1] === u;
    const orphan = PAIRS.filter((p) => dropMode && droppedUser >= 0 && involves(p, droppedUser));
    const hot = PAIRS.filter((p) => !dropMode && focus >= 0 && involves(p, focus));
    const base = PAIRS.filter((p) => !orphan.includes(p) && !hot.includes(p));
    return { base: segments(base), focus: segments(hot), orphan: segments(orphan) };
  }, [serverView, dropMode, droppedUser, focus]);

  const bodies = useRef<(Mesh | null)[]>([]);
  const bodyMats = useRef<(MeshBasicMaterial | null)[]>([]);
  const halos = useRef<(Mesh | null)[]>([]);
  const slabMat = useRef<MeshStandardMaterial>(null);
  const root = useRef<Group>(null);
  const maskBeads = useRef<CrowdApi>(null);
  const cancelBeads = useRef<CrowdApi>(null);
  const packets = useRef<CrowdApi>(null);
  const seeds = useRef<CrowdApi>(null);
  const scratch = useMemo(() => ({ c: new Color() }), []);

  const zeros = useMemo(() => ({ pairs2: new Float32Array(PAIRS.length * 2 * 3), users: new Float32Array(N_USERS * 3) }), []);
  const beadColors = useMemo(() => {
    const out = new Float32Array(PAIRS.length * 2 * 3);
    for (let k = 0; k < PAIRS.length * 2; k++) {
      const c = k % 2 === 0 ? roles.protected : roles.noise; // the user who adds, and the one who subtracts
      out.set([c.r, c.g, c.b], k * 3);
    }
    return out;
  }, [roles]);
  const packetColors = useMemo(() => {
    const out = new Float32Array(N_USERS * 3);
    for (let k = 0; k < N_USERS; k++) out.set([roles.protected.r, roles.protected.g, roles.protected.b], k * 3);
    return out;
  }, [roles]);
  const seedColors = useMemo(() => {
    const out = new Float32Array(N_USERS * 3);
    for (let k = 0; k < N_USERS; k++) out.set([roles.model.r, roles.model.g, roles.model.b], k * 3);
    return out;
  }, [roles]);

  useActiveFrame(active, (state) => {
    const a = anim.current;
    const t = state.clock.elapsedTime;
    const drop = st.dropped;

    for (let i = 0; i < N_USERS; i++) {
      const gone = st.dropped === i;
      const mat = bodyMats.current[i];
      if (mat) {
        scratch.c.copy(roles.honest).lerp(roles.protected, a.mask);
        if (gone) scratch.c.copy(roles.muted);
        mat.color.copy(scratch.c);
      }
      const body = bodies.current[i];
      if (body) body.scale.setScalar((gone ? 0.75 : 1) * (1 + 0.04 * Math.sin(t * 1.6 + i)) * (focus === i && !dropMode ? 1.25 : 1));
      const halo = halos.current[i];
      if (halo) {
        halo.scale.setScalar(Math.max(0.001, gone ? 0 : a.mask) * (1 + 0.05 * Math.sin(t * 2 + i)));
        halo.rotation.z = t * 0.3 + i;
      }
    }

    // Masks flow from the middle of each thread into the two users it belongs to.
    const mb = maskBeads.current;
    if (mb) {
      PAIRS.forEach(([i, j], k) => {
        const mid = lerp3(USER_POS[i], USER_POS[j], 0.5);
        const s = a.mask <= 0.02 ? 0 : 1 - smooth(0.82, 1, a.mask);
        const p0 = lerp3(mid, USER_POS[i], a.mask);
        const p1 = lerp3(mid, USER_POS[j], a.mask);
        mb.setPosition(k * 2, p0[0], p0[1], p0[2]);
        mb.setScale(k * 2, s);
        mb.setPosition(k * 2 + 1, p1[0], p1[1], p1[2]);
        mb.setScale(k * 2 + 1, s);
      });
      mb.commit();
    }

    // Masked updates travel to the server.
    const pk = packets.current;
    if (pk) {
      for (let i = 0; i < N_USERS; i++) {
        const p = lerp3(USER_POS[i], SERVER_POS, a.send);
        const alive = drop !== i;
        pk.setPosition(i, p[0], p[1], p[2]);
        pk.setScale(i, alive && a.send > 0.02 && a.send < 0.97 ? 1 : 0);
      }
      pk.commit();
    }

    // At the server, each pair's two masks meet and cancel; an unmatched mask stays until its seed is revealed.
    const cb = cancelBeads.current;
    if (cb) {
      PAIRS.forEach(([i, j], k) => {
        const meet = meetingPoint(k);
        const orphan = drop >= 0 && (i === drop || j === drop);
        for (let side = 0; side < 2; side++) {
          const user = side === 0 ? i : j;
          const idx = k * 2 + side;
          const start: Vec3 = [meet[0] + (side === 0 ? -0.55 : 0.55), meet[1] + 0.85, meet[2]];
          const p = lerp3(start, meet, a.sum);
          let s = a.sum <= 0.02 ? 0 : 1;
          if (orphan) {
            s = user === drop ? 0 : s * (1 - smooth(0, 1, a.reveal));
            if (user !== drop) p[0] = meet[0], p[1] = meet[1], p[2] = meet[2];
          } else s *= 1 - smooth(0.82, 1, a.sum);
          cb.setPosition(idx, p[0], p[1], p[2]);
          cb.setScale(idx, s);
        }
      });
      cb.commit();
    }

    // Revealed seeds travel from each survivor to the server.
    const sd = seeds.current;
    if (sd) {
      for (let i = 0; i < N_USERS; i++) {
        const p = lerp3(USER_POS[i], SERVER_POS, a.reveal);
        sd.setPosition(i, p[0], p[1] + 0.1, p[2] + 0.2);
        sd.setScale(i, drop >= 0 && i !== drop && a.reveal > 0.02 && a.reveal < 0.97 ? 1.3 : 0);
      }
      sd.commit();
    }

    const mat = slabMat.current;
    if (mat) mat.emissiveIntensity = 0.1 + 0.3 * a.sum;
    if (root.current) root.current.rotation.y = Math.sin(t * 0.2) * 0.05;
  });

  const onUser = (i: number) => {
    if (step === 0) setFocus(i);
    else if (step === 2) toggleDropped(i);
  };
  const interactive = step === 0 || step === 2;

  // Labels.
  const decodedNoise = run.naive[0];
  const serverLines = (() => {
    if (!st.sent) return { a: "server", b: serverView ? "waiting for masked updates" : "waiting for updates", tone: undefined };
    if (!st.summed) return { a: "server", b: "receives masked updates", tone: "protected" as const };
    if (dropMode && st.dropped >= 0 && !st.revealed) {
      return { a: `masked sum ${hexLabel(run.total[0])}`, b: `decodes to ${decodedNoise.toExponential(2)}: noise`, tone: "noise" as const };
    }
    return { a: `masked sum ${hexLabel(run.total[0])}`, b: `decodes to ${signed(run.decoded[0])}`, tone: "protected" as const };
  })();

  return (
    <group ref={root}>
      {/* threads */}
      <Links segments={threads.base} role={st.masked ? "protected" : "muted"} opacity={st.masked ? 0.34 : 0.4} />
      <Links segments={threads.focus} role="protected" opacity={0.95} />
      <Links segments={threads.orphan} role={st.revealed ? "protected" : "noise"} opacity={0.9} />

      <Crowd count={PAIRS.length * 2} positions={zeros.pairs2} colors={beadColors} size={0.085} apiRef={maskBeads} />
      <Crowd count={PAIRS.length * 2} positions={zeros.pairs2} colors={beadColors} size={0.09} apiRef={cancelBeads} />
      <Crowd count={N_USERS} positions={zeros.users} colors={packetColors} size={0.13} apiRef={packets} />
      <Crowd count={N_USERS} positions={zeros.users} colors={seedColors} size={0.1} apiRef={seeds} />

      {/* users */}
      {USER_POS.map((p, i) => (
        <group key={i} position={p}>
          <mesh
            ref={(el) => {
              bodies.current[i] = el;
            }}
          >
            <sphereGeometry args={[0.3, 24, 16]} />
            <meshBasicMaterial
              ref={(el) => {
                bodyMats.current[i] = el;
              }}
              color={roles.honest}
              toneMapped={false}
            />
          </mesh>
          <mesh
            ref={(el) => {
              halos.current[i] = el;
            }}
          >
            <torusGeometry args={[0.52, 0.025, 8, 40]} />
            <meshBasicMaterial color={roles.protected} transparent opacity={0.85} toneMapped={false} />
          </mesh>
          {interactive && (
            <mesh
              onClick={(e) => {
                e.stopPropagation();
                onUser(i);
              }}
              onPointerOver={() => (document.body.style.cursor = "pointer")}
              onPointerOut={() => (document.body.style.cursor = "")}
            >
              <sphereGeometry args={[0.62, 12, 8]} />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>
          )}
        </group>
      ))}

      {/* server */}
      <mesh position={[SERVER_POS[0], (SLAB_TOP + SERVER_POS[1] - 0.25) / 2, 0]}>
        <boxGeometry args={[2.6, SLAB_TOP - (SERVER_POS[1] - 0.25), 1.1]} />
        <meshStandardMaterial
          ref={slabMat}
          color={roles.muted}
          emissive={roles.protected}
          emissiveIntensity={0.15}
          roughness={0.5}
          metalness={0.1}
        />
      </mesh>

      {USER_POS.map((_, i) => {
        const gone = st.dropped === i;
        const name = `user ${i + 1}`;
        const plain = toy.updates[i][0];
        let tone: "honest" | "protected" | "muted" = "protected";
        let second = hexLabel(run.masked[i][0]);
        let first: string = name;
        if (gone) {
          tone = "muted";
          second = "dropped out";
        } else if (serverView && !st.masked) {
          tone = "muted";
          second = "hidden from the server";
        } else if (!st.masked) {
          tone = "honest";
          first = `${name}   ${signed(plain)}`;
          second = hexLabel(run.encoded[i][0]);
        }
        return (
          <Label key={i} position={labelPos(i)} tone={tone}>
            <span style={{ display: "block", textAlign: "center", color: "var(--ink-soft)" }}>{first}</span>
            <span style={{ display: "block", textAlign: "center" }}>{second}</span>
          </Label>
        );
      })}

      <Label position={[0, SERVER_POS[1] - 0.85, 0]} tone={serverLines.tone}>
        <span style={{ display: "block", textAlign: "center" }}>{serverLines.a}</span>
        <span style={{ display: "block", textAlign: "center" }}>{serverLines.b}</span>
      </Label>

      {focus >= 0 && step === 0 && !serverView
        ? Array.from({ length: N_USERS }, (_, p) => p)
            .filter((p) => p !== focus)
            .map((p) => {
              const at = lerp3(USER_POS[focus], USER_POS[p], 0.3);
              const plus = focus < p;
              return (
                <Label key={p} position={at} tone={plus ? "protected" : "noise"}>
                  {plus ? "+" : "−"}
                </Label>
              );
            })
        : null}
    </group>
  );
}
