import { type MutableRefObject, useLayoutEffect, useMemo, useRef } from "react";
import type { Group } from "three";
import { Arrow, Crowd, type CrowdApi, Label, Links, useActiveFrame, useRoles, useStepTimeline } from "../../world/kit";
import {
  cleanCommitteeShare,
  committeeMedian,
  committeeSums,
  contaminated,
  dealCommittees,
  DIM,
  makePopulation,
  N_USERS,
  realisedCleanShare,
  SEED,
  TARGET,
  targetPush,
} from "./sim";
import { usePoison } from "./store";

const RING = 4.0;
const POD_Y = 0;
const BEAD_Y = 1.15;
const HUB: [number, number, number] = [0, BEAD_Y, 0];
const SEGMENTS = 30;

/** Committees as pods on a ring around the hub; users spread over each pod like a sunflower head. */
export function podLayout(count: number, sizes: number[]) {
  const centres: [number, number][] = [];
  const radii: number[] = [];
  for (let c = 0; c < count; c++) {
    const angle = (c / Math.max(count, 1)) * Math.PI * 2 + 0.3;
    centres.push([Math.cos(angle) * RING, Math.sin(angle) * RING]);
    radii.push(0.17 * Math.sqrt(sizes[c] ?? 1) + 0.14);
  }
  return { centres, radii };
}

export function CommitteeScene({ active, vis, on }: { active: boolean; vis: MutableRefObject<number>; on: boolean }) {
  const roles = useRoles();
  const size = usePoison((s) => s.committeeSize);
  const share = usePoison((s) => s.committeeShare);
  const seed = usePoison((s) => s.dealSeed);

  const model = useMemo(() => {
    const pop = makePopulation(N_USERS, share, SEED);
    const deal = dealCommittees(N_USERS, size, seed);
    const bad = contaminated(pop, deal);
    const sums = committeeSums(pop, deal);
    const sizes = new Array<number>(deal.count).fill(0);
    for (let u = 0; u < N_USERS; u++) sizes[deal.of[u]] += 1;
    const { centres, radii } = podLayout(deal.count, sizes);

    const positions = new Float32Array(N_USERS * 3);
    const colors = new Float32Array(N_USERS * 3);
    const seen = new Array<number>(deal.count).fill(0);
    const lines: number[] = [];
    const lineColors: number[] = [];
    const bead = new Float32Array(16 * 3);
    for (let c = 0; c < deal.count; c++) {
      bead[c * 3] = centres[c][0];
      bead[c * 3 + 1] = BEAD_Y;
      bead[c * 3 + 2] = centres[c][1];
    }
    for (let u = 0; u < N_USERS; u++) {
      const c = deal.of[u];
      const k = seen[c]++;
      const a = k * 2.399963;
      const r = 0.17 * Math.sqrt(k + 0.5);
      const x = centres[c][0] + Math.cos(a) * r;
      const z = centres[c][1] + Math.sin(a) * r;
      positions.set([x, POD_Y, z], u * 3);
      lines.push(x, POD_Y, z, centres[c][0], BEAD_Y, centres[c][1]);
      const tone = pop.isAttacker[u] ? roles.attacker : roles.honest;
      colors.set([tone.r, tone.g, tone.b], u * 3);
      lineColors.push(tone.r, tone.g, tone.b, tone.r, tone.g, tone.b);
    }

    // A ring around each pod, red when it holds an attacker, and a spoke from its sum to the hub.
    const rings: number[] = [];
    const ringColors: number[] = [];
    for (let c = 0; c < deal.count; c++) {
      const tone = bad[c] ? roles.attacker : roles.protected;
      for (let s = 0; s < SEGMENTS; s++) {
        const a0 = (s / SEGMENTS) * Math.PI * 2;
        const a1 = ((s + 1) / SEGMENTS) * Math.PI * 2;
        rings.push(
          centres[c][0] + Math.cos(a0) * radii[c], POD_Y, centres[c][1] + Math.sin(a0) * radii[c],
          centres[c][0] + Math.cos(a1) * radii[c], POD_Y, centres[c][1] + Math.sin(a1) * radii[c],
        );
        ringColors.push(tone.r, tone.g, tone.b, tone.r, tone.g, tone.b);
      }
      rings.push(centres[c][0], BEAD_Y, centres[c][1], HUB[0], HUB[1], HUB[2]);
      ringColors.push(tone.r, tone.g, tone.b, tone.r, tone.g, tone.b);
    }

    const beadColors = new Float32Array(16 * 3);
    const beadScale = new Float32Array(16);
    for (let c = 0; c < deal.count; c++) {
      const tone = bad[c] ? roles.attacker : roles.protected;
      beadColors.set([tone.r, tone.g, tone.b], c * 3);
      beadScale[c] = Math.min(2.4, 1 + Math.max(0, sums[c * DIM + TARGET]) * 0.16);
    }
    // The committee whose target value is the middle one: the median takes this value.
    const order = Array.from({ length: deal.count }, (_, c) => c).sort((a, b) => sums[a * DIM + TARGET] - sums[b * DIM + TARGET]);
    const middles = deal.count < 2 ? [] : [...new Set([order[(deal.count - 1) >> 1], order[deal.count >> 1]])];

    return {
      pop,
      deal,
      positions,
      colors,
      bead,
      beadColors,
      beadScale,
      middles,
      users: new Float32Array(lines),
      userColors: new Float32Array(lineColors),
      rings: new Float32Array(rings),
      ringColors: new Float32Array(ringColors),
      push: targetPush(committeeMedian(pop, size, seed)),
      clean: realisedCleanShare(pop, deal),
      chance: cleanCommitteeShare(N_USERS, pop.nAttackers, size),
    };
  }, [roles, share, size, seed]);

  const group = useRef<Group>(null);
  const beadsApi = useRef<CrowdApi>(null);
  const anim = useRef({ pop: 1 });

  // Each new deal pops in.
  useStepTimeline(
    3,
    (tl) => {
      tl.fromTo(anim.current, { pop: 0.82 }, { pop: 1, duration: 0.45, ease: "back.out(2)" });
    },
    [size, seed, share],
  );

  useLayoutEffect(() => {
    const beads = beadsApi.current;
    if (!beads) return;
    for (let c = 0; c < 16; c++) beads.setScale(c, c < model.deal.count ? model.beadScale[c] : 0);
    beads.commit();
  }, [model]);

  useActiveFrame(active, () => {
    const g = group.current;
    if (!g) return;
    g.visible = vis.current > 0.01;
    g.scale.setScalar((0.001 + vis.current * 0.999) * anim.current.pop);
  });

  const lengthOfPush = Math.max(0, model.push) * 7;
  const cleanCount = Math.round(model.clean * model.deal.count);

  return (
    <group ref={group}>
      <Crowd count={N_USERS} positions={model.positions} colors={model.colors} size={0.07} />
      <Crowd count={16} positions={model.bead} colors={model.beadColors} size={0.14} apiRef={beadsApi} />
      <Links segments={model.users} colors={model.userColors} role="muted" opacity={0.22} />
      <Links segments={model.rings} colors={model.ringColors} role="muted" opacity={0.85} />

      {model.middles.map((c, i) => (
        <group key={c}>
          <mesh position={[model.bead[c * 3], BEAD_Y, model.bead[c * 3 + 2]]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.36, 0.022, 8, 40]} />
            <meshBasicMaterial color={roles.model} toneMapped={false} />
          </mesh>
          {i === 0 && on ? (
            <Label position={[model.bead[c * 3], BEAD_Y + 0.62, model.bead[c * 3 + 2]]} tone="model" small>
              {model.middles.length === 1 ? "median takes this sum" : "median averages these two"}
            </Label>
          ) : null}
        </group>
      ))}
      <mesh position={HUB}>
        <icosahedronGeometry args={[0.5, 1]} />
        <meshStandardMaterial color={roles.model} roughness={0.35} metalness={0.1} flatShading />
      </mesh>
      <mesh position={HUB}>
        <icosahedronGeometry args={[0.85, 1]} />
        <meshBasicMaterial color={roles.model} wireframe transparent opacity={0.3} toneMapped={false} />
      </mesh>
      {lengthOfPush > 0.05 ? <Arrow from={[HUB[0], HUB[1] + 0.55, HUB[2]]} to={[HUB[0], HUB[1] + 0.55 + lengthOfPush, HUB[2]]} role="attacker" width={0.07} /> : null}

      {on ? <Label position={[HUB[0], HUB[1] - 1.35, HUB[2]]} tone="model" small>
        median of the committee sums
      </Label> : null}
      {on && lengthOfPush > 0.05 ? (
        <Label position={[HUB[0], HUB[1] + 1.0 + lengthOfPush, HUB[2]]} tone="attacker" small>
          pushes the target
        </Label>
      ) : null}
      {on ? <Label position={[HUB[0], HUB[1] - 1.95, HUB[2]]} tone="protected" small>
        {cleanCount} of {model.deal.count} committees hold no attacker
      </Label> : null}
    </group>
  );
}
