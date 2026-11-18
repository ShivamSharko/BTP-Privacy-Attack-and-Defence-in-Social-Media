import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { BufferAttribute, BufferGeometry, Color, DoubleSide, type InstancedMesh, Object3D } from "three";
import { useDeck } from "../../deck/store";
import { Arrow, type ArrowApi, Ground, Label, type SceneProps, useActiveFrame, useOnReset, useRoles, useStepTimeline } from "../../world/kit";
import { FROZEN_TEMPERATURE, useModel } from "./store";
import { CATALOGUE as cat, COMPARE_TOP, distinctTopK, itemVector, type Mode, N_ITEMS, scores, splitHistory, TOP, topK, userVector, type V3 } from "./sim";

/** Radius of the sphere the normalised item vectors sit on. */
const R = 3.4;
const ARROW = R * 0.9;
const CLUSTER_NAMES = ["coffee shops", "restaurants", "bars", "shops"];

/** What the scene shows: one user (1.1), the hidden half (1.2), or twelve users at once (1.3). */
type View = "user" | "train" | "compare";
const viewOf = (step: number): View => (step === 1 ? "train" : step === 2 ? "compare" : "user");

const RING: [number, number, number] = [0.86, 1, 40];
const itemRadius = cat.pop.map((p) => 0.1 + 0.11 * Math.sqrt(p));

function sphereTargets(mode: Mode): Float32Array {
  const out = new Float32Array(N_ITEMS * 3);
  for (let i = 0; i < N_ITEMS; i++) {
    const v = itemVector(cat, i, mode);
    out[i * 3] = v[0] * R;
    out[i * 3 + 1] = v[1] * R;
    out[i * 3 + 2] = v[2] * R;
  }
  return out;
}

/** A few latitude and longitude circles: enough to read the sphere, not enough to clutter it. */
function graticuleGeometry(radius: number): BufferGeometry {
  const points: number[] = [];
  const steps = 72;
  const circle = (point: (t: number) => [number, number, number]) => {
    for (let k = 0; k < steps; k++) points.push(...point((k / steps) * Math.PI * 2), ...point(((k + 1) / steps) * Math.PI * 2));
  };
  for (const lat of [-0.7, 0, 0.7]) {
    circle((t) => [Math.cos(t) * Math.cos(lat) * radius, Math.sin(lat) * radius, Math.sin(t) * Math.cos(lat) * radius]);
  }
  for (const lon of [0, Math.PI / 3, (2 * Math.PI) / 3]) {
    circle((t) => [Math.cos(t) * Math.cos(lon) * radius, Math.sin(t) * radius, Math.cos(t) * Math.sin(lon) * radius]);
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(points), 3));
  return g;
}

/** A line buffer that is rewritten every frame without React. */
function useLineBuffer(maxSegments: number) {
  const geometry = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(new Float32Array(maxSegments * 6), 3));
    g.setDrawRange(0, 0);
    return g;
  }, [maxSegments]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return geometry;
}

export function Scene({ step, active }: SceneProps) {
  const roles = useRoles();
  const reduced = useDeck((s) => s.reducedMotion);
  const view = viewOf(step);
  const history = useModel((s) => s.history);
  const seed = useModel((s) => s.seed);
  const storedMode = useModel((s) => s.mode);
  const storedTemperature = useModel((s) => s.temperature);
  const toggleItem = useModel((s) => s.toggleItem);
  const mode: Mode = view === "compare" ? storedMode : "hybrid";
  const temperature = view === "user" ? FROZEN_TEMPERATURE : storedTemperature;

  const [hover, setHover] = useState<number | null>(null);

  const model = useMemo(() => {
    const { visible, hidden } = view === "train" ? splitHistory(history, seed) : { visible: history, hidden: [] as number[] };
    const user = userVector(cat, visible, mode);
    const full = userVector(cat, history, mode);
    const top = topK(scores(cat, user, temperature, mode), TOP, visible);
    const kind = new Uint8Array(N_ITEMS);
    for (const i of visible) kind[i] = 1;
    for (const i of hidden) kind[i] = 2;
    const rank = new Int8Array(N_ITEMS).fill(-1);
    top.forEach((item, r) => {
      rank[item] = r;
    });
    const { counts } = distinctTopK(cat, temperature, mode, COMPARE_TOP);
    return { visible, hidden, user, full, kind, rank, counts, maxCount: Math.max(1, ...counts) };
  }, [view, history, seed, mode, temperature]);

  const targets = useMemo(() => sphereTargets(mode), [mode]);

  // Everything the frame loop reads lives in refs.
  const live = useRef({ model, targets, view });
  live.current = { model, targets, view };
  const cur = useRef(sphereTargets("hybrid"));
  const bright = useRef(new Float32Array(N_ITEMS));
  const size = useRef(new Float32Array(N_ITEMS).fill(1));
  const mix = useRef(new Float32Array(N_ITEMS));
  const userVec = useRef<V3>([0, 0, 0]);
  const ghostVec = useRef<V3>([0, 0, 0]);
  const anim = useRef({ arrow: 1 });

  const items = useRef<InstancedMesh>(null);
  const hiddenRings = useRef<InstancedMesh>(null);
  const topRings = useRef<InstancedMesh>(null);
  const userArrow = useRef<ArrowApi>(null);
  const ghostArrow = useRef<ArrowApi>(null);
  const graticule = useMemo(() => graticuleGeometry(R * 0.985), []);
  useEffect(() => () => graticule.dispose(), [graticule]);
  const historyLines = useLineBuffer(N_ITEMS);
  const pullLines = useLineBuffer(N_ITEMS);
  const scratch = useMemo(() => ({ dummy: new Object3D(), color: new Color(), warm: new Color() }), []);
  const itemGeometryArgs = useMemo(() => [1, 1] as [number, number], []);

  useStepTimeline(step, (tl) => {
    tl.to(anim.current, { arrow: view === "compare" ? 0 : 1, duration: 0.7, ease: "power2.inOut" });
  });
  useOnReset(() => useModel.getState().reset(), active);

  // A fresh instanced mesh needs a colour for every instance before the first frame.
  useLayoutEffect(() => {
    const mesh = items.current;
    if (!mesh) return;
    for (let i = 0; i < N_ITEMS; i++) mesh.setColorAt(i, roles.muted);
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [roles]);

  useActiveFrame(active, (state, delta) => {
    const { model: md, targets: tg, view: v } = live.current;
    const k = reduced ? 1 : 1 - Math.exp(-delta * 7);
    const position = cur.current;
    const mesh = items.current;
    const hid = hiddenRings.current;
    const rec = topRings.current;
    if (!mesh || !hid || !rec) return;
    const { dummy, color, warm } = scratch;
    dummy.quaternion.copy(state.camera.quaternion);

    for (let i = 0; i < N_ITEMS; i++) {
      for (let c = 0; c < 3; c++) position[i * 3 + c] += (tg[i * 3 + c] - position[i * 3 + c]) * k;

      const kind = md.kind[i];
      const rank = md.rank[i];
      let goalBright = 0;
      let goalSize = 1;
      let goalMix = 1;
      if (v === "compare") {
        const c = md.counts[i];
        goalBright = c > 0 ? 0.4 + (0.6 * c) / md.maxCount : 0;
        goalSize = c > 0 ? 1.1 + (0.5 * c) / md.maxCount : 0.8;
      } else if (kind === 1) {
        goalBright = 1;
        goalSize = 1.45;
        goalMix = 0;
      } else if (rank >= 0) {
        goalBright = 1;
        goalSize = 1.55 - 0.04 * rank;
      } else if (kind === 2) {
        goalBright = 0.55;
        goalSize = 1.2;
        goalMix = 0;
      }
      bright.current[i] += (goalBright - bright.current[i]) * k;
      size.current[i] += (goalSize - size.current[i]) * k;
      mix.current[i] += (goalMix - mix.current[i]) * k;

      warm.copy(roles.honest).lerp(roles.model, mix.current[i]);
      color.copy(roles.muted).lerp(warm, bright.current[i]);
      mesh.setColorAt(i, color);

      const r = itemRadius[i] * size.current[i];
      dummy.position.set(position[i * 3], position[i * 3 + 1], position[i * 3 + 2]);
      dummy.scale.setScalar(r);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);

      const showHidden = v === "train" && kind === 2;
      dummy.scale.setScalar(showHidden ? r * 2.1 : 0.0001);
      dummy.updateMatrix();
      hid.setMatrixAt(i, dummy.matrix);

      const showTop = v !== "compare" && rank >= 0;
      dummy.scale.setScalar(showTop ? r * 1.85 : 0.0001);
      dummy.updateMatrix();
      rec.setMatrixAt(i, dummy.matrix);
    }
    for (const m of [mesh, hid, rec]) m.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

    // The user arrow follows the visible history; in the training view a second, fainter arrow
    // shows where the whole history points, which is where the loss pulls the user.
    const show = anim.current.arrow * ARROW;
    const u = userVec.current;
    const g = ghostVec.current;
    for (let c = 0; c < 3; c++) {
      u[c] += (md.user[c] * show - u[c]) * k;
      const ghostGoal = (v === "train" ? md.full[c] * show : md.user[c] * show) - g[c];
      g[c] += ghostGoal * k;
    }
    userArrow.current?.set([0, 0, 0], u);
    ghostArrow.current?.set([0, 0, 0], g);

    // Thin lines from the centre to the history items, and from the arrow tip to the hidden ones.
    const hp = historyLines.attributes.position.array as Float32Array;
    let n = 0;
    if (v !== "compare") {
      for (const i of md.visible) {
        hp[n * 6] = 0;
        hp[n * 6 + 1] = 0;
        hp[n * 6 + 2] = 0;
        hp[n * 6 + 3] = position[i * 3];
        hp[n * 6 + 4] = position[i * 3 + 1];
        hp[n * 6 + 5] = position[i * 3 + 2];
        n++;
      }
    }
    historyLines.setDrawRange(0, n * 2);
    historyLines.attributes.position.needsUpdate = true;

    const pp = pullLines.attributes.position.array as Float32Array;
    let pulls = 0;
    if (v === "train") {
      for (const i of md.hidden) {
        pp[pulls * 6] = u[0];
        pp[pulls * 6 + 1] = u[1];
        pp[pulls * 6 + 2] = u[2];
        pp[pulls * 6 + 3] = position[i * 3];
        pp[pulls * 6 + 4] = position[i * 3 + 1];
        pp[pulls * 6 + 5] = position[i * 3 + 2];
        pulls++;
      }
    }
    pullLines.setDrawRange(0, pulls * 2);
    pullLines.attributes.position.needsUpdate = true;
  });

  const tip = (vec: V3, scale: number): [number, number, number] => [vec[0] * R * scale, vec[1] * R * scale, vec[2] * R * scale];
  const hoverTarget = hover !== null ? tip(itemVector(cat, hover, mode), 1.2) : null;

  return (
    <group>
      <Ground radius={5.4} y={-3.9} />

      {/* Every normalised item vector is a direction, so the items live on a sphere. */}
      <lineSegments geometry={graticule} frustumCulled={false}>
        <lineBasicMaterial color={roles.muted} transparent opacity={0.3} toneMapped={false} depthWrite={false} />
      </lineSegments>
      <mesh>
        <sphereGeometry args={[0.11, 16, 12]} />
        <meshBasicMaterial color={roles.honest} toneMapped={false} />
      </mesh>

      <lineSegments geometry={historyLines} frustumCulled={false}>
        <lineBasicMaterial color={roles.honest} transparent opacity={0.28} toneMapped={false} depthWrite={false} />
      </lineSegments>
      <lineSegments geometry={pullLines} frustumCulled={false}>
        <lineBasicMaterial color={roles.model} transparent opacity={0.6} toneMapped={false} depthWrite={false} />
      </lineSegments>

      <Arrow from={[0, 0, 0]} to={[0, 0.01, 0]} role="honest" width={0.045} opacity={0.42} apiRef={ghostArrow} />
      <Arrow from={[0, 0, 0]} to={[0, 0.01, 0]} role="honest" width={0.06} apiRef={userArrow} />

      <instancedMesh
        ref={items}
        args={[undefined, undefined, N_ITEMS]}
        frustumCulled={false}
        onClick={(e) => {
          if (e.delta > 4 || view === "compare" || e.instanceId === undefined) return;
          e.stopPropagation();
          toggleItem(e.instanceId);
        }}
        onPointerOver={(e) => {
          if (e.instanceId === undefined) return;
          e.stopPropagation();
          setHover(e.instanceId);
          if (view !== "compare") document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          setHover(null);
          document.body.style.cursor = "";
        }}
      >
        <icosahedronGeometry args={itemGeometryArgs} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={hiddenRings} args={[undefined, undefined, N_ITEMS]} frustumCulled={false} raycast={() => null}>
        <ringGeometry args={RING} />
        <meshBasicMaterial color={roles.honest} side={DoubleSide} transparent opacity={0.9} toneMapped={false} depthWrite={false} />
      </instancedMesh>
      <instancedMesh ref={topRings} args={[undefined, undefined, N_ITEMS]} frustumCulled={false} raycast={() => null}>
        <ringGeometry args={RING} />
        <meshBasicMaterial color={roles.model} side={DoubleSide} transparent opacity={0.85} toneMapped={false} depthWrite={false} />
      </instancedMesh>

      {cat.centres.map((c, k) => (
        <Label key={CLUSTER_NAMES[k]} position={[c[0] * R * 1.3, c[1] * R * 1.3, c[2] * R * 1.3]} small>
          {CLUSTER_NAMES[k]}
        </Label>
      ))}
      {view !== "compare" && model.visible.length > 0 ? (
        <Label position={tip(model.user, 1.17)} tone="honest" small>
          user vector
        </Label>
      ) : null}
      {view === "train"
        ? model.hidden.slice(0, 4).map((i) => (
            <Label key={i} position={tip(itemVector(cat, i, "hybrid"), 1.2)} tone="honest" small>
              hidden
            </Label>
          ))
        : null}
      {view === "compare" ? (
        <Label position={[0, -4.25, 0]} tone="model" small>
          {`${model.counts.filter((c) => c > 0).length} different places in the top ${COMPARE_TOP} of 12 sample users`}
        </Label>
      ) : null}
      {hover !== null && hoverTarget ? (
        <Label position={hoverTarget} small>
          {`${CLUSTER_NAMES[cat.cluster[hover]].replace(/s$/, "")}, popularity ${cat.pop[hover].toFixed(2)}`}
        </Label>
      ) : null}
    </group>
  );
}
