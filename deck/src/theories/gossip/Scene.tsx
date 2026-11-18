import type { ThreeEvent } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { Color, type InstancedMesh, type Group, Object3D } from "three";
import { rng } from "../../sim/random";
import { Crowd, type CrowdApi, Ground, Label, Links, type SceneProps, useActiveFrame, useOnReset, useRoles, useStepTimeline } from "../../world/kit";
import { disagreement, GRAPH, MAX_DEGREE, N_NODES } from "./sim";
import { GOAL, START_RANGE, tableFor, TRAIN_DEGREE, useGossip } from "./store";

/** What the scene is showing: 0 colours spreading, 1 training, 2 settled backdrop for the chart and code slides. */
function modeOf(step: number): 0 | 1 | 2 {
  return step === 0 ? 0 : step <= 2 ? 1 : 2;
}

const GOAL_SIZE = Math.hypot(GOAL[0], GOAL[1]);
const SPARKS_PER_NODE = 4;
const SPARK_RADIUS = 0.75;

export function Scene({ step, active }: SceneProps) {
  const roles = useRoles();
  const mode = modeOf(step);
  const degree = useGossip((s) => s.degree);
  const values = useGossip((s) => s.values);
  const round = useGossip((s) => s.round);
  const trainRounds = useGossip((s) => s.trainRounds);
  const optimiser = useGossip((s) => s.optimiser);
  const noise = useGossip((s) => s.noise);

  const drawn = mode === 0 ? degree : TRAIN_DEGREE;
  const table = tableFor(drawn);

  /* edges: real friends and random contacts, as the peer table has them */
  const { friendLines, randomLines } = useMemo(() => {
    const t = tableFor(drawn);
    const friends: number[] = [];
    const randoms: number[] = [];
    t.peers.forEach((row, i) =>
      row.forEach((peer, c) => {
        const out = t.isFriend[i][c] ? friends : randoms;
        out.push(GRAPH.pos[i * 3], GRAPH.pos[i * 3 + 1], GRAPH.pos[i * 3 + 2], GRAPH.pos[peer * 3], GRAPH.pos[peer * 3 + 1], GRAPH.pos[peer * 3 + 2]);
      }),
    );
    return { friendLines: new Float32Array(friends), randomLines: new Float32Array(randoms) };
  }, [drawn]);

  const nodes = useRef<InstancedMesh>(null);
  const spin = useRef<Group>(null);
  const packets = useRef<CrowdApi>(null);
  const sparks = useRef<CrowdApi>(null);
  const shown = useRef(new Float32Array(N_NODES));
  const anim = useRef({ travel: 1, wasTravelling: true, frame: 2 });
  const scratch = useMemo(() => ({ a: new Color(), dummy: new Object3D(), noise: rng(4) }), []);

  const packetStart = useMemo(() => new Float32Array(N_NODES * MAX_DEGREE * 3), []);
  const sparkStart = useMemo(() => new Float32Array(N_NODES * SPARKS_PER_NODE * 3), []);
  const packetColors = useMemo(() => {
    const out = new Float32Array(N_NODES * MAX_DEGREE * 3);
    for (let i = 0; i < N_NODES; i++) {
      for (let c = 0; c < MAX_DEGREE; c++) {
        const colour = tableFor(MAX_DEGREE).isFriend[i][c] ? roles.honest : roles.muted;
        out.set([colour.r, colour.g, colour.b], (i * MAX_DEGREE + c) * 3);
      }
    }
    return out;
  }, [roles]);
  const sparkColors = useMemo(() => {
    const out = new Float32Array(N_NODES * SPARKS_PER_NODE * 3);
    for (let k = 0; k < N_NODES * SPARKS_PER_NODE; k++) out.set([roles.noise.r, roles.noise.g, roles.noise.b], k * 3);
    return out;
  }, [roles]);

  useLayoutEffect(() => {
    const mesh = nodes.current;
    if (!mesh) return;
    for (let i = 0; i < N_NODES; i++) {
      scratch.dummy.position.set(GRAPH.pos[i * 3], GRAPH.pos[i * 3 + 1], GRAPH.pos[i * 3 + 2]);
      scratch.dummy.updateMatrix();
      mesh.setMatrixAt(i, scratch.dummy.matrix);
      mesh.setColorAt(i, roles.muted);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [roles, scratch]);

  /* a round happened: messages travel from each peer to the node that averages them */
  useStepTimeline(
    mode === 0 ? round : trainRounds,
    (tl) => {
      tl.fromTo(anim.current, { travel: 0 }, { travel: 1, duration: mode === 0 ? 0.6 : 0.09, ease: "power1.inOut" });
    },
    [mode],
  );

  /* the simulation clock, only while this station is on screen */
  useEffect(() => {
    if (!active || mode === 2) return;
    const timer = window.setInterval(
      () => {
        const s = useGossip.getState();
        if (mode === 0 && s.playing) {
          if (disagreement(s.values) <= 0.004 * START_RANGE) s.setPlaying(false);
          else s.step();
        } else if (mode === 1 && s.trainPlaying) s.stepTrain();
      },
      mode === 0 ? 650 : 110,
    );
    return () => window.clearInterval(timer);
  }, [active, mode]);

  /* the training slides start their own run when they open */
  useEffect(() => {
    if (!active) return;
    if (step === 1) {
      useGossip.setState({ optimiser: "adam", noise: false });
      useGossip.getState().restartTrain(true);
    } else if (step === 2) {
      useGossip.setState({ optimiser: "adam", noise: true });
      useGossip.getState().restartTrain(true);
    }
  }, [active, step]);

  useOnReset(() => useGossip.getState().reset(), active);

  useActiveFrame(active, (_state, delta) => {
    const s = useGossip.getState();
    const a = anim.current;
    if (spin.current) spin.current.rotation.y += delta * (mode === 2 ? 0.05 : 0.025);

    /* node colours */
    const mesh = nodes.current;
    const ease = Math.min(1, delta * (mode === 0 ? 7 : 9));
    const dv = shown.current;
    let lo = 1;
    let hi = 0;
    for (let i = 0; i < N_NODES; i++) {
      let goal = 1;
      if (mode === 0) goal = s.values[i];
      else if (mode === 1) {
        const theta = s.train.theta[i];
        goal = Math.max(0, Math.min(1, 1 - Math.hypot(theta[0] - GOAL[0], theta[1] - GOAL[1]) / GOAL_SIZE));
      }
      dv[i] += (goal - dv[i]) * ease;
      if (dv[i] < lo) lo = dv[i];
      if (dv[i] > hi) hi = dv[i];
    }
    const agree = mode === 0 ? 1 - Math.min(1, (hi - lo) / START_RANGE) : 1;
    for (let i = 0; i < N_NODES; i++) {
      if (mode === 0) scratch.a.copy(roles.protected).lerp(roles.honest, dv[i]).lerp(roles.model, agree * agree * agree * 0.9);
      else if (mode === 1) scratch.a.copy(roles.muted).lerp(roles.model, dv[i]);
      else scratch.a.copy(roles.model);
      mesh?.setColorAt(i, scratch.a);
    }
    if (mesh?.instanceColor) mesh.instanceColor.needsUpdate = true;

    /* messages in flight */
    const travelling = a.travel < 1 && mode === 0;
    const p = packets.current;
    if (p && (travelling || a.wasTravelling)) {
      const d = mode === 0 ? s.degree : TRAIN_DEGREE;
      const t = tableFor(d).peers;
      for (let i = 0; i < N_NODES; i++) {
        for (let c = 0; c < MAX_DEGREE; c++) {
          const k = i * MAX_DEGREE + c;
          const peer = t[i]?.[c];
          if (!travelling || peer === undefined) {
            p.setScale(k, 0);
            continue;
          }
          const u = a.travel;
          p.setPosition(
            k,
            GRAPH.pos[peer * 3] + (GRAPH.pos[i * 3] - GRAPH.pos[peer * 3]) * u,
            GRAPH.pos[peer * 3 + 1] + (GRAPH.pos[i * 3 + 1] - GRAPH.pos[peer * 3 + 1]) * u,
            GRAPH.pos[peer * 3 + 2] + (GRAPH.pos[i * 3 + 2] - GRAPH.pos[peer * 3 + 2]) * u,
          );
          p.setScale(k, 1);
        }
      }
      p.commit();
    }
    a.wasTravelling = travelling;

    /* static: with local noise every node's outgoing message is mostly noise */
    const sp = sparks.current;
    a.frame += 1;
    if (sp && a.frame % 3 === 0) {
      const on = mode === 1 && s.noise;
      for (let i = 0; i < N_NODES; i++) {
        for (let c = 0; c < SPARKS_PER_NODE; c++) {
          const k = i * SPARKS_PER_NODE + c;
          if (!on) {
            sp.setScale(k, 0);
            continue;
          }
          const r = SPARK_RADIUS * (0.35 + 0.65 * scratch.noise());
          const theta = scratch.noise() * Math.PI * 2;
          const phi = Math.acos(2 * scratch.noise() - 1);
          sp.setPosition(
            k,
            GRAPH.pos[i * 3] + r * Math.sin(phi) * Math.cos(theta),
            GRAPH.pos[i * 3 + 1] + r * Math.cos(phi),
            GRAPH.pos[i * 3 + 2] + r * Math.sin(phi) * Math.sin(theta),
          );
          sp.setScale(k, 0.6 + scratch.noise() * 0.9);
        }
      }
      sp.commit();
    }
  });

  const range = disagreement(values);
  const agreed = range <= 0.03 * START_RANGE;
  const topLabel =
    mode === 0
      ? `round ${round}${agreed ? ", the whole graph agrees" : ""}`
      : mode === 1
        ? `${optimiser === "adam" ? "Adam with shared moments" : "plain averaging"}, round ${trainRounds}`
        : "";

  const onPick = (e: ThreeEvent<MouseEvent>) => {
    if (mode !== 0 || e.instanceId === undefined) return;
    e.stopPropagation();
    useGossip.getState().kick(e.instanceId);
  };

  return (
    <group>
      <Ground radius={7} y={-3.2} />
      <group ref={spin}>
        <Links segments={friendLines} role="honest" opacity={mode === 0 ? 0.42 : 0.26} />
        <Links segments={randomLines} role="muted" opacity={mode === 0 ? 0.6 : 0.3} />
        <instancedMesh
          ref={nodes}
          args={[undefined, undefined, N_NODES]}
          frustumCulled={false}
          onClick={onPick}
          onPointerOver={() => {
            if (mode === 0) document.body.style.cursor = "pointer";
          }}
          onPointerOut={() => {
            document.body.style.cursor = "";
          }}
        >
          <icosahedronGeometry args={[0.12, 1]} />
          <meshBasicMaterial toneMapped={false} />
        </instancedMesh>
        <Crowd count={N_NODES * MAX_DEGREE} positions={packetStart} colors={packetColors} size={0.05} apiRef={packets} />
        <Crowd count={N_NODES * SPARKS_PER_NODE} positions={sparkStart} colors={sparkColors} size={0.06} apiRef={sparks} />
      </group>

      {mode !== 2 ? (
        <Label position={[0, 3.7, 0]} tone={mode === 1 && noise ? "noise" : undefined}>
          {topLabel}
        </Label>
      ) : null}
      {mode === 0 ? (
        <>
          <Label position={[-2.4, -3.0, 2.6]} tone="honest" small>
            {`friends ${table.isFriend.flat().filter(Boolean).length} of ${table.isFriend.flat().length}`}
          </Label>
          <Label position={[2.4, -3.0, 2.6]} tone="muted" small>
            random contacts
          </Label>
        </>
      ) : null}
      {mode === 1 ? (
        <>
          <Label position={[-2.4, -3.0, 2.6]} tone="muted" small>
            far from the goal
          </Label>
          <Label position={[2.4, -3.0, 2.6]} tone="model" small>
            at the goal
          </Label>
        </>
      ) : null}
    </group>
  );
}
