import type { ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { BoxGeometry, Color, CylinderGeometry, type Group, type InstancedMesh, type Mesh, type MeshBasicMaterial, Object3D, OctahedronGeometry, Quaternion, TorusGeometry, Vector3 } from "three";
import { Label, Links, useActiveFrame, useRoles, useStepTimeline } from "../../world/kit";
import { buildTree, EMPTY_ROOT_HEX, leafSpacing, MAX_LEAVES, receiptBytes, short, tamper } from "./sim";
import { useLedger } from "./store";

const MAX_NODES = 2 * MAX_LEAVES - 1;
const UP = new Vector3(0, 1, 0);
const PLATE_OFFSET = 2.6;
const PLATE_LINK = new Float32Array([-0.95, 0, 0, -PLATE_OFFSET + 0.6, 0, 0]);

/** Brightness of a flash that starts when the wave reaches `at` and fades over one step. */
function flash(wave: number, at: number): number {
  const d = wave - at;
  return d >= 0 && d < 1 ? 1 - d : 0;
}

interface Smooth {
  x: number;
  y: number;
  a: number;
}

/**
 * The RFC 6962 tree over the toy log. Step 0: receipts are appended and the new leaf's path
 * to the root is rehashed. Step 1: the selected receipt's proof path climbs to the root and
 * verifies. Step 2: one byte of that receipt is flipped and the broken path turns red.
 */
export function TreeView({ step: rawStep, active, shown }: { step: number; active: boolean; shown: boolean }) {
  const step = shown ? rawStep : 0;
  const roles = useRoles();
  const size = useLedger((s) => s.size);
  const appends = useLedger((s) => s.appends);
  const selected = useLedger((s) => s.selected);
  const checks = useLedger((s) => s.checks);
  const tampered = useLedger((s) => s.tampered);
  const select = useLedger((s) => s.select);

  const isTamper = step === 2 && tampered;
  const leaves = useMemo(() => Array.from({ length: size }, (_, i) => receiptBytes(i)), [size]);
  const honest = useMemo(() => buildTree(leaves), [leaves]);
  const tree = useMemo(() => (isTamper ? buildTree(tamper(leaves, selected)) : honest), [isTamper, leaves, selected, honest]);
  const focus = step === 0 ? size - 1 : selected;
  const path = useMemo(() => honest.pathTo(focus), [honest, focus]);
  const proofLength = path.siblings.length;
  const marks = useMemo(() => {
    const onPath = new Map<string, number>();
    const sibling = new Map<string, number>();
    if (path.leaf) onPath.set(path.leaf, 0);
    path.ancestors.forEach((key, i) => onPath.set(key, i + 1));
    path.siblings.forEach((key, i) => sibling.set(key, i + 1));
    return { onPath, sibling };
  }, [path]);
  const broken = useMemo(() => tree.nodes.map((nd, i) => nd.hex !== honest.nodes[i]?.hex), [tree, honest]);

  const group = useRef<Group>(null);
  const leafMesh = useRef<InstancedMesh>(null);
  const nodeMesh = useRef<InstancedMesh>(null);
  const haloMesh = useRef<InstancedMesh>(null);
  const edgeMesh = useRef<InstancedMesh>(null);
  const lineMesh = useRef<InstancedMesh>(null);
  const seal = useRef<Mesh>(null);
  const plate = useRef<Group>(null);
  const anim = useRef({ show: shown ? 1 : 0, wave: 10, plate: 0 });
  const smooth = useRef(new Map<string, Smooth>());
  const scratch = useMemo(
    () => ({ dummy: new Object3D(), color: new Color(), dim: new Color(), from: new Vector3(), to: new Vector3(), dir: new Vector3(), q: new Quaternion() }),
    [],
  );
  const geo = useMemo(
    () => ({
      card: new BoxGeometry(1, 1, 1),
      node: new OctahedronGeometry(0.17, 0),
      halo: new TorusGeometry(0.3, 0.018, 8, 40),
      edge: new CylinderGeometry(1, 1, 1, 8, 1, true),
    }),
    [],
  );
  useEffect(() => () => Object.values(geo).forEach((g) => g.dispose()), [geo]);

  // Forget nodes that are no longer in the tree (after "Start over").
  useEffect(() => {
    const keys = new Set(tree.nodes.map((nd) => nd.key));
    for (const key of smooth.current.keys()) if (!keys.has(key)) smooth.current.delete(key);
  }, [tree]);

  useStepTimeline(rawStep, (tl) => {
    tl.to(anim.current, { show: shown ? 1 : 0, plate: step === 2 ? 1 : 0, duration: 0.7, ease: "power2.inOut" });
  });

  // The hash wave: climbs the focused path one proof step at a time.
  useStepTimeline(
    step,
    (tl) => {
      tl.fromTo(anim.current, { wave: -0.6 }, { wave: proofLength + 1.2, duration: 0.5 + 0.42 * (proofLength + 1), ease: "none", delay: 0.25 });
    },
    [appends, checks, tampered, size, selected],
  );

  const onLeafClick = (e: ThreeEvent<MouseEvent>) => {
    if (step < 1 || e.instanceId === undefined) return;
    e.stopPropagation();
    select(e.instanceId);
  };

  useActiveFrame(active, (state, delta) => {
    const a = anim.current;
    const g = group.current;
    if (g) {
      g.visible = a.show > 0.01;
      g.scale.setScalar(0.6 + 0.4 * a.show);
      g.position.y = (1 - a.show) * -2.5;
    }
    if (!g?.visible) return;
    const lm = leafMesh.current;
    const nm = nodeMesh.current;
    const hm = haloMesh.current;
    const em = edgeMesh.current;
    const rm = lineMesh.current;
    if (!lm || !nm || !hm || !em || !rm) return;
    const { dummy, color, dim, from, to, dir, q } = scratch;
    const ease = Math.min(1, delta * 6);
    const s = leafSpacing(size);
    const cardW = Math.min(0.5, s * 0.64);
    const t = state.clock.elapsedTime;
    dim.copy(roles.muted).lerp(roles.ledger, 0.22);

    const nodes = tree.nodes;
    const pos: Smooth[] = [];
    for (const nd of nodes) {
      let p = smooth.current.get(nd.key);
      if (!p) {
        p = { x: nd.x, y: nd.level === 0 ? nd.y + 2.4 : nd.y, a: 0 };
        smooth.current.set(nd.key, p);
      }
      p.x += (nd.x - p.x) * ease;
      p.y += (nd.y - p.y) * ease;
      p.a += (1 - p.a) * Math.min(1, delta * 4);
      pos.push(p);
    }

    /** Colour and size of node i; also used by its edge. */
    const look = (i: number): { lit: number; role: "ledger" | "attacker" | "dim"; sib: boolean } => {
      const nd = nodes[i];
      const onPath = marks.onPath.get(nd.key);
      const sib = marks.sibling.get(nd.key);
      if (step === 0) return { lit: onPath !== undefined ? flash(a.wave, onPath) : 0, role: "ledger", sib: false };
      if (onPath !== undefined) {
        const reached = a.wave >= onPath;
        return { lit: reached ? 0.6 + 0.4 * flash(a.wave, onPath) : 0, role: !reached ? "dim" : broken[i] ? "attacker" : "ledger", sib: false };
      }
      if (sib !== undefined) {
        const reached = a.wave >= sib - 0.4;
        return { lit: reached ? 0.6 * flash(a.wave, sib - 0.4) : 0, role: reached ? "ledger" : "dim", sib: true };
      }
      return { lit: 0, role: "dim", sib: false };
    };
    const paint = (i: number, l: ReturnType<typeof look>) => {
      const nd = nodes[i];
      if (l.role === "attacker") color.copy(roles.attacker);
      else if (l.role === "dim") color.copy(step === 0 ? roles.ledger : dim);
      else color.copy(roles.ledger);
      if (step === 0 && l.role !== "dim") color.lerp(roles.muted, nd.parent === null ? 0 : nd.level === 0 ? 0.06 : 0.16);
      if (l.lit > 0) color.lerp(roles.model, l.lit * 0.55);
    };

    let leaf = 0;
    let inner = 0;
    let halo = 0;
    let edge = 0;
    for (let i = 0; i < nodes.length; i++) {
      const nd = nodes[i];
      const p = pos[i];
      const l = look(i);
      paint(i, l);
      const grow = 1 + l.lit * 0.35 + (l.sib ? 0.15 : 0);
      if (nd.level === 0) {
        const z = l.lit > 0 && !l.sib && step >= 1 ? 0.18 : 0;
        const w = cardW * grow * p.a;
        dummy.position.set(p.x, p.y, z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(w, w * 1.32, 0.05);
        dummy.updateMatrix();
        lm.setMatrixAt(nd.lo, dummy.matrix);
        lm.setColorAt(nd.lo, color);
        // three lines of print on the receipt
        for (let k = 0; k < 3; k++) {
          dummy.position.set(p.x - w * (k === 1 ? 0.08 : 0), p.y + w * (0.36 - k * 0.24), z + 0.03);
          dummy.scale.set(w * (k === 1 ? 0.5 : 0.66), w * 0.07, 0.01);
          dummy.updateMatrix();
          rm.setMatrixAt(nd.lo * 3 + k, dummy.matrix);
          rm.setColorAt(nd.lo * 3 + k, roles.muted);
        }
        leaf++;
      } else {
        const root = nd.parent === null;
        dummy.position.set(p.x, p.y, 0);
        dummy.rotation.set(0, t * 0.5 + i, 0);
        dummy.scale.setScalar((root ? 1.75 : 1) * grow * p.a);
        dummy.updateMatrix();
        nm.setMatrixAt(inner, dummy.matrix);
        nm.setColorAt(inner, color);
        inner++;
      }
      if (l.sib && l.role !== "dim") {
        dummy.position.set(p.x, p.y, 0);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.setScalar((nd.level === 0 ? 1.45 : 1) * (1 + 0.08 * Math.sin(t * 3)));
        dummy.updateMatrix();
        hm.setMatrixAt(halo, dummy.matrix);
        hm.setColorAt(halo, roles.ledger);
        halo++;
      }
      if (nd.parent !== null) {
        const pp = pos[nd.parent];
        from.set(p.x, p.y + (nd.level === 0 ? cardW * 0.66 : 0), 0);
        to.set(pp.x, pp.y, 0);
        dir.subVectors(to, from);
        const length = dir.length();
        q.setFromUnitVectors(UP, dir.normalize());
        const pl = look(nd.parent);
        const onPathEdge = marks.onPath.has(nd.key) && marks.onPath.has(nodes[nd.parent].key);
        const sibEdge = l.sib && marks.onPath.has(nodes[nd.parent].key);
        const strong = step >= 1 && (onPathEdge ? pl.role !== "dim" : sibEdge && l.role !== "dim");
        if (strong) paint(nd.parent, onPathEdge ? pl : l);
        else color.copy(step === 0 ? roles.ledger : dim).lerp(roles.muted, step === 0 ? 0.45 : 0);
        const width = strong ? 0.032 : 0.013;
        dummy.position.copy(from).addScaledVector(dir, length / 2);
        dummy.quaternion.copy(q);
        dummy.scale.set(width, length * Math.min(p.a, pos[nd.parent].a), width);
        dummy.updateMatrix();
        dummy.rotation.set(0, 0, 0);
        em.setMatrixAt(edge, dummy.matrix);
        em.setColorAt(edge, color);
        edge++;
      }
    }
    dummy.scale.setScalar(0);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    for (let i = leaf; i < MAX_LEAVES; i++) lm.setMatrixAt(i, dummy.matrix);
    for (let i = leaf * 3; i < MAX_LEAVES * 3; i++) rm.setMatrixAt(i, dummy.matrix);
    for (let i = inner; i < MAX_LEAVES; i++) nm.setMatrixAt(i, dummy.matrix);
    for (let i = halo; i < MAX_NODES; i++) hm.setMatrixAt(i, dummy.matrix);
    for (let i = edge; i < MAX_NODES; i++) em.setMatrixAt(i, dummy.matrix);
    for (const m of [lm, nm, hm, em, rm]) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }

    // The seal round the root: the root is what a checkpoint signs.
    const sm = seal.current;
    if (sm) {
      const rootPos = pos[nodes.length - 1];
      sm.visible = nodes.length > 0;
      if (rootPos) sm.position.set(rootPos.x, rootPos.y, 0);
      sm.rotation.set(0.35 * Math.sin(t * 0.7), 0.35 * Math.cos(t * 0.5), 0);
      const rootBroken = isTamper && a.wave >= proofLength;
      (sm.material as MeshBasicMaterial).color.copy(rootBroken ? roles.attacker : roles.ledger);
    }
    const pg = plate.current;
    if (pg) {
      pg.visible = a.plate > 0.01;
      pg.scale.setScalar(a.plate);
    }
  });

  const root = tree.nodes.at(-1);
  const honestRoot = honest.nodes.at(-1);
  const selectedNode = honest.nodes.find((nd) => nd.level === 0 && nd.lo === selected);
  const verdictShown = step === 2 && isTamper;
  const siblingLabels =
    step === 1
      ? path.siblings
          .map((key) => honest.nodes.find((nd) => nd.key === key))
          .filter((nd): nd is NonNullable<typeof nd> => nd !== undefined)
          .slice(0, 5)
      : [];

  return (
    <group ref={group}>
      <instancedMesh ref={leafMesh} args={[geo.card, undefined, MAX_LEAVES]} frustumCulled={false} onClick={onLeafClick}
        onPointerOver={() => { if (step >= 1) document.body.style.cursor = "pointer"; }}
        onPointerOut={() => { document.body.style.cursor = ""; }}>
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={lineMesh} args={[geo.card, undefined, MAX_LEAVES * 3]} frustumCulled={false}>
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={nodeMesh} args={[geo.node, undefined, MAX_LEAVES]} frustumCulled={false}>
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={haloMesh} args={[geo.halo, undefined, MAX_NODES]} frustumCulled={false}>
        <meshBasicMaterial toneMapped={false} transparent opacity={0.85} />
      </instancedMesh>
      <instancedMesh ref={edgeMesh} args={[geo.edge, undefined, MAX_NODES]} frustumCulled={false}>
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      <mesh ref={seal}>
        <torusGeometry args={[0.52, 0.025, 8, 64]} />
        <meshBasicMaterial toneMapped={false} transparent opacity={0.9} />
      </mesh>

      {/* The signed checkpoint the verifier compares against. */}
      {root && honestRoot ? (
        <group ref={plate} position={[honestRoot.x + PLATE_OFFSET, honestRoot.y, 0]}>
          <mesh>
            <boxGeometry args={[1.9, 1.05, 0.05]} />
            <meshStandardMaterial color={roles.muted} transparent opacity={0.35} roughness={0.8} />
          </mesh>
          <mesh position={[-0.68, 0.22, 0.05]} rotation={[0, 0, 0]}>
            <torusGeometry args={[0.15, 0.03, 8, 40]} />
            <meshBasicMaterial color={roles.ledger} toneMapped={false} />
          </mesh>
          <Links segments={PLATE_LINK} role="ledger" opacity={0.6} />
        </group>
      ) : null}

      {shown && size === 0 ? (
        <Label position={[0, 0, 0]} tone="ledger">
          empty log: root is SHA-256 of nothing, {short(EMPTY_ROOT_HEX)}
        </Label>
      ) : null}

      {shown && root && step === 0 ? (
        <Label position={[root.x, root.y + 0.75, 0]} tone="ledger">
          root {short(root.hex)}
        </Label>
      ) : null}
      {shown && step === 0 && size > 0 ? (
        <Label position={[honest.nodes.find((nd) => nd.level === 0 && nd.lo === size - 1)?.x ?? 0, -2.95, 0]} small>
          receipt {size}
        </Label>
      ) : null}

      {shown && step >= 1 && selectedNode ? (
        <Label position={[selectedNode.x, -2.95, 0]} tone={verdictShown ? "attacker" : "ledger"} small>
          {verdictShown ? `receipt ${selected + 1}, one byte flipped` : `receipt ${selected + 1}`}
        </Label>
      ) : null}
      {siblingLabels.map((nd) => (
        <Label key={nd.key} position={[nd.x, nd.y + (nd.level === 0 ? 0.95 : 0.5), 0]} tone="ledger" small>
          {short(nd.hex)}
        </Label>
      ))}
      {shown && step === 1 && root ? (
        <Label position={[root.x, root.y + 0.75, 0]} tone="ledger">
          root {short(root.hex)}
        </Label>
      ) : null}
      {shown && step === 2 && root && honestRoot ? (
        <>
          <Label position={[root.x, root.y + 0.78, 0]} tone={verdictShown ? "attacker" : "ledger"}>
            recomputed {short(root.hex)}
          </Label>
          <Label position={[honestRoot.x + PLATE_OFFSET + 0.18, honestRoot.y + 0.22, 0]} tone="ledger" small>
            signed checkpoint
          </Label>
          <Label position={[honestRoot.x + PLATE_OFFSET, honestRoot.y - 0.2, 0]} small>
            size {size}, root {short(honestRoot.hex)}
          </Label>
        </>
      ) : null}
    </group>
  );
}
