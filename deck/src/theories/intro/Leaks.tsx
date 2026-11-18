import { type RefObject, useLayoutEffect, useMemo, useRef } from "react";
import type { Group } from "three";
import { rng } from "../../sim/random";
import { Arrow, type ArrowApi, Crowd, type CrowdApi, Label, Links, useActiveFrame, useRoles, useStepTimeline, type Vec3 } from "../../world/kit";
import { introGraph } from "./graph";
import { type IntroAnim, useLineMaterial, YOU_AZIMUTH } from "./shared";
import { useIntro } from "./store";

const SERVER: Vec3 = [0, 3.0, 0];
const SNOOP: Vec3 = [-3.7, 2.9, 1.0];
const OUTSIDER: Vec3 = [3.2, 2.2, 1.2];
const FAKE_CENTRE: Vec3 = [2.7, -0.7, 1.5];
const FAKES = 22;

const lerp3 = (out: Vec3, a: Vec3, b: Vec3, t: number) => {
  out[0] = a[0] + (b[0] - a[0]) * t;
  out[1] = a[1] + (b[1] - a[1]) * t;
  out[2] = a[2] + (b[2] - a[2]) * t;
  return out;
};

/** The problem slide: one user's update goes up to the server, and three leak paths light up. */
export function Leaks({ step, active, anim }: { step: number; active: boolean; anim: RefObject<IntroAnim> }) {
  const roles = useRoles();
  const leak = useIntro((s) => s.leak);
  const g = useMemo(() => introGraph(), []);
  const shown = step === 1;

  // Where the followed user stands once the graph has turned them towards the camera.
  const you = useMemo<Vec3>(() => {
    const x = g.positions[g.user * 3];
    const z = g.positions[g.user * 3 + 2];
    const r = Math.hypot(x, z);
    return [r * Math.sin(YOU_AZIMUTH), g.positions[g.user * 3 + 1], r * Math.cos(YOU_AZIMUTH)];
  }, [g]);
  const uploadEnd = useMemo<Vec3>(() => [SERVER[0], SERVER[1] - 0.75, SERVER[2] + 0.1], []);
  const midway = useMemo<Vec3>(() => lerp3([0, 0, 0], you, uploadEnd, 0.5), [you, uploadEnd]);

  const fakes = useMemo(() => {
    const r = rng(31);
    const out = new Float32Array(FAKES * 3);
    for (let i = 0; i < FAKES; i++) {
      out[i * 3] = FAKE_CENTRE[0] + (r() - 0.5) * 1.1;
      out[i * 3 + 1] = FAKE_CENTRE[1] + (r() - 0.5) * 0.5;
      out[i * 3 + 2] = FAKE_CENTRE[2] + (r() - 0.5) * 1.1;
    }
    return out;
  }, []);
  const fakeSegments = useMemo(() => {
    const out = new Float32Array(FAKES * 6);
    for (let i = 0; i < FAKES; i++) {
      out.set(fakes.subarray(i * 3, i * 3 + 3), i * 6);
      out.set([SERVER[0], SERVER[1] - 0.5, SERVER[2]], i * 6 + 3);
    }
    return out;
  }, [fakes]);

  const root = useRef<Group>(null);
  const server = useRef<Group>(null);
  const snoop = useRef<Group>(null);
  const outsider = useRef<Group>(null);
  const fakeApi = useRef<CrowdApi>(null);
  const fakeLines = useLineMaterial();
  const upload = useRef<ArrowApi>(null);
  const readUpdate = useRef<ArrowApi>(null);
  const release = useRef<ArrowApi>(null);
  const tip = useMemo<Vec3>(() => [0, 0, 0], []);

  useLayoutEffect(() => {
    const api = fakeApi.current;
    if (!api) return;
    for (let i = 0; i < FAKES; i++) api.setColor(i, roles.attacker);
    api.commit();
  }, [roles]);

  useStepTimeline(
    step,
    (tl) => {
      const a = anim.current;
      if (!shown) {
        tl.to(a, { upload: 0, leakUpdate: 0, leakModel: 0, leakCrowd: 0, duration: 0.4, ease: "power2.in" }, 0);
        return;
      }
      tl.to(a, { upload: 1, duration: 0.8, ease: "power2.out" }, 1.0);
      const all = leak === "all";
      const at = (k: number) => (all ? 2.0 + k * 1.1 : 0.3);
      tl.to(a, { leakUpdate: all || leak === "update" ? 1 : 0, duration: 0.7, ease: "power2.out" }, at(0));
      tl.to(a, { leakModel: all || leak === "model" ? 1 : 0, duration: 0.7, ease: "power2.out" }, at(1));
      tl.to(a, { leakCrowd: all || leak === "crowd" ? 1 : 0, duration: 0.7, ease: "power2.out" }, at(2));
    },
    [leak],
  );

  useActiveFrame(active, () => {
    const a = anim.current;
    const on = a.dim * (1 - a.hide);
    if (root.current) root.current.visible = on > 0.01;
    if (on <= 0.01) return;
    server.current?.scale.setScalar(Math.max(0.001, on));
    snoop.current?.scale.setScalar(Math.max(0.001, a.leakUpdate));
    outsider.current?.scale.setScalar(Math.max(0.001, a.leakModel));
    upload.current?.set(you, lerp3(tip, you, uploadEnd, a.upload));
    readUpdate.current?.set(midway, lerp3(tip, midway, SNOOP, a.leakUpdate * 0.9));
    release.current?.set(SERVER, lerp3(tip, SERVER, OUTSIDER, a.leakModel * 0.86));
    const f = fakeApi.current;
    if (f) {
      for (let i = 0; i < FAKES; i++) f.setScale(i, a.leakCrowd);
      f.commit();
    }
    if (fakeLines.material.current) fakeLines.material.current.opacity = 0.45 * a.leakCrowd;
  });

  const showUpdate = shown && (leak === "all" || leak === "update");
  const showModel = shown && (leak === "all" || leak === "model");
  const showCrowd = shown && (leak === "all" || leak === "crowd");

  return (
    <group ref={root} visible={false}>
      <group ref={server} position={SERVER}>
        <mesh>
          <icosahedronGeometry args={[0.5, 1]} />
          <meshStandardMaterial color={roles.model} roughness={0.35} metalness={0.1} flatShading />
        </mesh>
        <mesh>
          <icosahedronGeometry args={[0.82, 1]} />
          <meshBasicMaterial color={roles.model} wireframe transparent opacity={0.3} toneMapped={false} />
        </mesh>
      </group>
      <group ref={snoop} position={SNOOP}>
        <mesh>
          <octahedronGeometry args={[0.28, 0]} />
          <meshBasicMaterial color={roles.attacker} toneMapped={false} />
        </mesh>
      </group>
      <group ref={outsider} position={OUTSIDER}>
        <mesh>
          <octahedronGeometry args={[0.28, 0]} />
          <meshBasicMaterial color={roles.attacker} toneMapped={false} />
        </mesh>
      </group>
      <Arrow from={you} to={you} role="honest" width={0.04} apiRef={upload} />
      <Arrow from={midway} to={midway} role="attacker" width={0.035} apiRef={readUpdate} />
      <Arrow from={SERVER} to={SERVER} role="model" width={0.035} apiRef={release} />
      <Crowd count={FAKES} positions={fakes} size={0.085} apiRef={fakeApi} />
      <group ref={fakeLines.group}>
        <Links segments={fakeSegments} role="attacker" opacity={0} />
      </group>

      {shown ? (
        <>
          <Label position={[0, SERVER[1] + 0.95, 0]} tone="model" small>
            the server and its model
          </Label>
          <Label position={[you[0], you[1] - 0.45, you[2]]} tone="honest" small>
            you
          </Label>
        </>
      ) : null}
      {showUpdate ? (
        <Label position={[SNOOP[0], SNOOP[1] + 0.6, SNOOP[2]]} tone="attacker" small>
          1. the update: history and friends
        </Label>
      ) : null}
      {showModel ? (
        <Label position={[OUTSIDER[0], OUTSIDER[1] - 0.6, OUTSIDER[2]]} tone="attacker" small>
          2. the model: were you in it?
        </Label>
      ) : null}
      {showCrowd ? (
        <Label position={[FAKE_CENTRE[0], FAKE_CENTRE[1] - 0.75, FAKE_CENTRE[2]]} tone="attacker" small>
          3. the crowd: malicious accounts
        </Label>
      ) : null}
    </group>
  );
}
