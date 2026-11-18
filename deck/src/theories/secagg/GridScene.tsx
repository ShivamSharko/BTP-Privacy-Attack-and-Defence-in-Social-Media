import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { BoxGeometry, type InstancedMesh, Object3D } from "three";
import { Ground, Label, useActiveFrame, useRoles } from "../../world/kit";
import { attackerGuess, buildCohortTable, cohortView, GRID_COLS, GRID_ITEMS, TARGET_ITEMS } from "./sim";
import { useSecAgg } from "./store";

export const GRID_SEED = 9;
const SPACING = 0.78;
const ROW_SPACING = 0.72;
const BASE_Y = -1.9;
const HMAX = 2.9;
const MIN_SLIVER = 0.08;
const ROWS = Math.ceil(GRID_ITEMS / GRID_COLS);

const itemX = (i: number) => ((i % GRID_COLS) - (GRID_COLS - 1) / 2) * SPACING;
const itemZ = (i: number) => (Math.floor(i / GRID_COLS) - (ROWS - 1) / 2) * ROW_SPACING;

/** Slide four: a sum of updates over an item grid, with the one user's share still in it. */
export function GridScene({ active }: { active: boolean }) {
  const roles = useRoles();
  const cohort = useSecAgg((s) => s.cohort);
  const playing = useSecAgg((s) => s.playing);
  const table = useMemo(() => buildCohortTable(GRID_SEED), []);
  const view = useMemo(() => cohortView(table, cohort), [table, cohort]);
  const guess = useMemo(() => attackerGuess(table, view), [table, view]);
  const peak = useMemo(() => view.total.reduce((m, x) => Math.max(m, x), 1), [view]);

  const others = useRef<InstancedMesh>(null);
  const mine = useRef<InstancedMesh>(null);
  const marks = useRef<InstancedMesh>(null);
  const live = useRef({ o: new Float32Array(GRID_ITEMS), m: new Float32Array(GRID_ITEMS), g: new Float32Array(TARGET_ITEMS * 2) });
  const dummy = useMemo(() => new Object3D(), []);
  const box = useMemo(() => new BoxGeometry(1, 1, 1).translate(0, 0.5, 0), []);
  useEffect(() => () => box.dispose(), [box]);

  useEffect(() => {
    if (!active || !playing) return;
    const timer = window.setInterval(() => useSecAgg.getState().tick(), 70);
    return () => window.clearInterval(timer);
  }, [active, playing]);

  useLayoutEffect(() => {
    for (let i = 0; i < GRID_ITEMS; i++) {
      others.current?.setColorAt(i, roles.noise);
      mine.current?.setColorAt(i, roles.honest);
    }
    for (let k = 0; k < TARGET_ITEMS; k++) marks.current?.setColorAt(k, roles.attacker);
    for (const m of [others.current, mine.current, marks.current]) if (m?.instanceColor) m.instanceColor.needsUpdate = true;
  }, [roles]);

  useActiveFrame(active, (state, delta) => {
    const t = state.clock.elapsedTime;
    const ease = Math.min(1, delta * 9);
    const unit = HMAX / peak;
    const l = live.current;
    for (let i = 0; i < GRID_ITEMS; i++) {
      l.o[i] += (view.others[i] * unit - l.o[i]) * ease;
      l.m[i] += (view.mine[i] * unit - l.m[i]) * ease;
      const x = itemX(i);
      const z = itemZ(i);
      const oh = l.o[i];
      dummy.position.set(x, BASE_Y, z);
      dummy.scale.set(0.6, Math.max(oh, 0.02), 0.6);
      dummy.updateMatrix();
      others.current?.setMatrixAt(i, dummy.matrix);

      const mh = l.m[i] > 0.001 ? Math.max(l.m[i], MIN_SLIVER) : 0;
      dummy.position.set(x, BASE_Y + Math.max(oh, 0.02), z);
      dummy.scale.set(0.64, mh, 0.64);
      dummy.updateMatrix();
      mine.current?.setMatrixAt(i, dummy.matrix);
    }
    for (let k = 0; k < TARGET_ITEMS; k++) {
      const item = guess[k];
      const top = BASE_Y + (l.o[item] + Math.max(l.m[item], 0)) + 0.5 + 0.08 * Math.sin(t * 3 + k);
      l.g[k * 2] += (top - l.g[k * 2]) * ease;
      dummy.position.set(itemX(item), l.g[k * 2], itemZ(item));
      dummy.rotation.set(Math.PI, t * 1.2, 0);
      dummy.scale.setScalar(0.5);
      dummy.updateMatrix();
      marks.current?.setMatrixAt(k, dummy.matrix);
    }
    dummy.rotation.set(0, 0, 0);
    for (const m of [others.current, mine.current, marks.current]) if (m) m.instanceMatrix.needsUpdate = true;
  });

  const frontZ = itemZ(GRID_ITEMS - 1) + 1.0;
  return (
    <group>
      <Ground radius={6.8} y={BASE_Y - 0.02} />
      <instancedMesh ref={others} args={[box, undefined, GRID_ITEMS]} frustumCulled={false}>
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={mine} args={[box, undefined, GRID_ITEMS]} frustumCulled={false}>
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={marks} args={[undefined, undefined, TARGET_ITEMS]} frustumCulled={false}>
        <coneGeometry args={[0.28, 0.55, 5]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>

      <Label position={[0, 2.9, 0]}>{cohort === 1 ? "1 user in the sum" : `${cohort} users in the sum`}</Label>
      <Label position={[-3.1, BASE_Y - 0.1, frontZ]} tone="noise">
        everyone else
      </Label>
      <Label position={[0.35, BASE_Y - 0.1, frontZ]} tone="honest">
        the one user
      </Label>
      <Label position={[3.5, BASE_Y - 0.1, frontZ]} tone="attacker">
        attacker's guesses
      </Label>
    </group>
  );
}
