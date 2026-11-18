import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { BoxGeometry, Color, type Group, type InstancedMesh, type Mesh, Object3D } from "three";
import { Crowd, type CrowdApi, useActiveFrame, useRoles, useStepTimeline } from "../../world/kit";
import { Tag } from "./Tag";
import { ALPHA, bitsOfEvidence, bootstrapCi, canSurviveHolm, formatP, minSignTestP, toySeedValues } from "./sim";
import { MAX_SEEDS, useMethod } from "./store";

const BAR_X0 = -4.2;
const BAR_DX = 0.76;
const BAR_W = 0.5;
const BASE_Y = -2.6;
const HEIGHT_PER_ORDER = 0.6;
const DOT_Y = 1.95;
const CI_Y = 1.5;
const DOT_SCALE = 3.4 / 0.0075;
const clampX = (v: number) => Math.max(-4.4, Math.min(4.4, (v - 0.03) * DOT_SCALE));

/** Step 2: toy seed scores with their bootstrap interval, above the smallest p-value each number of seeds can give. */
export function StatsView({ shown, active }: { shown: boolean; active: boolean }) {
  const roles = useRoles();
  const seeds = useMethod((s) => s.seeds);
  const comparisons = useMethod((s) => s.comparisons);

  const values = useMemo(() => toySeedValues(MAX_SEEDS, 5), []);
  const interval = useMemo(() => bootstrapCi(values.slice(0, seeds), 9), [values, seeds]);
  const mean = useMemo(() => values.slice(0, seeds).reduce((s, v) => s + v, 0) / Math.max(1, seeds), [values, seeds]);
  const threshold = ALPHA / comparisons;
  const minP = minSignTestP(seeds);

  const root = useRef<Group>(null);
  const bars = useRef<InstancedMesh>(null);
  const dots = useRef<CrowdApi>(null);
  const ci = useRef<Mesh>(null);
  const meanTick = useRef<Mesh>(null);
  const line = useRef<Mesh>(null);
  const anim = useRef({ show: shown ? 1 : 0 });
  const live = useRef({
    dots: new Float32Array(MAX_SEEDS),
    dotScale: new Float32Array(MAX_SEEDS),
    ciLo: 0,
    ciHi: 0,
    mean: 0,
    lineY: 0,
  });
  const scratch = useMemo(() => ({ color: new Color(), dummy: new Object3D() }), []);
  const barGeometry = useMemo(() => new BoxGeometry(1, 1, 1).translate(0, 0.5, 0), []);
  useEffect(() => () => barGeometry.dispose(), [barGeometry]);
  const dotPositions = useMemo(() => {
    const out = new Float32Array(MAX_SEEDS * 3);
    for (let i = 0; i < MAX_SEEDS; i++) {
      out[i * 3] = clampX(values[i]);
      out[i * 3 + 1] = DOT_Y;
    }
    return out;
  }, [values]);

  useLayoutEffect(() => {
    const mesh = bars.current;
    if (!mesh) return;
    for (let i = 0; i < MAX_SEEDS; i++) mesh.setColorAt(i, roles.protected);
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [roles]);

  useStepTimeline(shown ? 1 : 0, (tl) => {
    tl.to(anim.current, { show: shown ? 1 : 0, duration: 0.5, ease: "power2.out" });
  });

  useActiveFrame(active, (_state, delta) => {
    const a = anim.current;
    const l = live.current;
    const ease = Math.min(1, delta * 8);
    if (root.current) {
      root.current.visible = a.show > 0.01;
      root.current.scale.setScalar(0.85 + 0.15 * a.show);
    }
    if (a.show <= 0.01) return;

    const mesh = bars.current;
    if (mesh) {
      for (let i = 0; i < MAX_SEEDS; i++) {
        const n = i + 1;
        const reachable = canSurviveHolm(n, comparisons);
        const selected = n === seeds;
        scratch.color.copy(reachable ? roles.protected : roles.noise);
        if (!selected) scratch.color.lerp(roles.muted, 0.5);
        mesh.setColorAt(i, scratch.color);
        const height = Math.max(0.02, HEIGHT_PER_ORDER * bitsOfEvidence(n));
        scratch.dummy.position.set(BAR_X0 + BAR_DX * i, BASE_Y, 0);
        scratch.dummy.scale.set(BAR_W, height, selected ? 0.5 : 0.3);
        scratch.dummy.updateMatrix();
        mesh.setMatrixAt(i, scratch.dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }

    const goalLine = BASE_Y + HEIGHT_PER_ORDER * -Math.log10(threshold);
    l.lineY += (goalLine - l.lineY) * ease;
    if (line.current) line.current.position.y = l.lineY;

    const crowd = dots.current;
    if (crowd) {
      for (let i = 0; i < MAX_SEEDS; i++) {
        const goal = i < seeds ? 1 : 0;
        l.dotScale[i] += (goal - l.dotScale[i]) * ease;
        scratch.color.copy(roles.honest);
        crowd.setColor(i, scratch.color);
        crowd.setScale(i, l.dotScale[i]);
      }
      crowd.commit();
    }
    const lo = clampX(Number.isFinite(interval[0]) ? interval[0] : mean);
    const hi = clampX(Number.isFinite(interval[1]) ? interval[1] : mean);
    l.ciLo += (lo - l.ciLo) * ease;
    l.ciHi += (hi - l.ciHi) * ease;
    l.mean += (clampX(mean) - l.mean) * ease;
    if (ci.current) {
      const width = Math.max(0.04, l.ciHi - l.ciLo);
      ci.current.scale.x = width;
      ci.current.position.x = (l.ciLo + l.ciHi) / 2;
    }
    if (meanTick.current) meanTick.current.position.x = l.mean;
  });

  const selectedX = BAR_X0 + BAR_DX * (seeds - 1);
  const selectedTop = BASE_Y + Math.max(0.02, HEIGHT_PER_ORDER * bitsOfEvidence(seeds));
  return (
    <group ref={root} visible={shown}>
      <Crowd count={MAX_SEEDS} positions={dotPositions} size={0.1} apiRef={dots} />
      <mesh ref={ci} position={[0, CI_Y, 0]}>
        <boxGeometry args={[1, 0.07, 0.07]} />
        <meshBasicMaterial color={roles.model} toneMapped={false} />
      </mesh>
      <mesh ref={meanTick} position={[0, CI_Y, 0]}>
        <boxGeometry args={[0.07, 0.34, 0.07]} />
        <meshBasicMaterial color={roles.model} toneMapped={false} />
      </mesh>
      <Tag on={shown} position={[-3.2, 2.65, 0]} small tone="honest">
        invented scores, one light per seed
      </Tag>
      <Tag on={shown} position={[-0.3, 1.02, 0]} small tone="model">
        95% bootstrap interval of the mean
      </Tag>

      <instancedMesh ref={bars} args={[barGeometry, undefined, MAX_SEEDS]} frustumCulled={false}>
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      <mesh ref={line} position={[0, BASE_Y + HEIGHT_PER_ORDER * -Math.log10(ALPHA), 0.1]}>
        <boxGeometry args={[9.6, 0.03, 0.03]} />
        <meshBasicMaterial color={roles.model} toneMapped={false} />
      </mesh>
      <Tag on={shown} position={[-3.1, BASE_Y + HEIGHT_PER_ORDER * -Math.log10(threshold) + 0.25, 0.3]} small tone="model">
        passes Holm above this line
      </Tag>
      <Tag on={shown} position={[selectedX, selectedTop + 0.35, 0.3]} small tone={canSurviveHolm(seeds, comparisons) ? "protected" : "noise"}>
        {seeds} {seeds === 1 ? "seed" : "seeds"}: p at least {formatP(minP)}
      </Tag>
      <Tag on={shown} position={[BAR_X0, BASE_Y - 0.3, 0]} small>
        1 seed
      </Tag>
      <Tag on={shown} position={[BAR_X0 + BAR_DX * (MAX_SEEDS - 1), BASE_Y - 0.3, 0]} small>
        {MAX_SEEDS} seeds
      </Tag>
      <Tag on={shown} position={[-3.0, -0.9, 0]} small>
        the bar is how small the smallest p-value gets
      </Tag>
    </group>
  );
}
