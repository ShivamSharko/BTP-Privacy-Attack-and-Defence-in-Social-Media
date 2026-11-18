import { useLayoutEffect, useMemo, useRef } from "react";
import { Color, type Group } from "three";
import { Crowd, type CrowdApi, Ground, Links, type SceneProps, useActiveFrame, useOnReset, useRoles, useStepTimeline } from "../../world/kit";
import { introGraph } from "./graph";
import { Leaks } from "./Leaks";
import { Pipeline } from "./Pipeline";
import { type IntroAnim, useLineMaterial, YOU_AZIMUTH } from "./shared";
import { useIntro } from "./store";

const EDGE_OPACITY = 0.14;

export function Scene({ step, active }: SceneProps) {
  const roles = useRoles();
  const g = useMemo(() => introGraph(), []);
  const highlight = useIntro((s) => s.highlight);
  const assembly = useIntro((s) => s.assembly);
  const n = g.degree.length;

  const anim = useRef<IntroAnim>({
    assemble: 0,
    rot: 0,
    spin: 1,
    dim: 0,
    hide: 0,
    upload: 0,
    leakUpdate: 0,
    leakModel: 0,
    leakCrowd: 0,
    pipe: 0,
    packet: 0,
  });
  const spinner = useRef<Group>(null);
  const lights = useRef<CrowdApi>(null);
  const edges = useLineMaterial();
  const friendEdges = useLineMaterial();
  const bright = useRef(new Float32Array(n).fill(0.8));
  const lastAssemble = useRef(-1);
  const lastNonce = useRef(assembly);
  const scratch = useMemo(() => ({ color: new Color() }), []);
  const user = g.user;
  const friend = useMemo(() => {
    const out = new Uint8Array(n);
    for (let e = 0; e < g.edges.length; e += 2) {
      if (g.edges[e] === user) out[g.edges[e + 1]] = 1;
      if (g.edges[e + 1] === user) out[g.edges[e]] = 1;
    }
    return out;
  }, [g, n, user]);

  // The graph's part in each slide.
  useStepTimeline(
    step,
    (tl) => {
      const a = anim.current;
      if (assembly !== lastNonce.current) {
        lastNonce.current = assembly;
        tl.set(a, { assemble: 0 });
      }
      if (step === 0 || step === 3) {
        tl.to(a, { assemble: 1, duration: 3.6, ease: "power1.inOut" }, 0);
        tl.to(a, { dim: 0, hide: 0, spin: 1, duration: 0.9, ease: "power2.inOut" }, 0);
      } else if (step === 1) {
        // Turn the graph until the followed user faces the camera, then hold still.
        const x = g.positions[user * 3];
        const z = g.positions[user * 3 + 2];
        const face = YOU_AZIMUTH - Math.atan2(x, z);
        const turns = Math.round((a.rot - face) / (Math.PI * 2));
        tl.to(a, { assemble: 1, spin: 0, dim: 1, hide: 0, duration: 0.8, ease: "power2.inOut" }, 0);
        tl.to(a, { rot: face + turns * Math.PI * 2, duration: 1.4, ease: "power2.inOut" }, 0);
      } else {
        tl.to(a, { assemble: 1, spin: 0.4, hide: 1, duration: 0.8, ease: "power2.inOut" }, 0);
      }
    },
    [assembly],
  );

  useOnReset(() => useIntro.getState().reset(), active);

  // Crowd puts every light back at its starting place when the theme changes; place them again.
  useLayoutEffect(() => {
    lastAssemble.current = -1;
  }, [roles]);

  useActiveFrame(active, (state, delta) => {
    const a = anim.current;
    a.rot += delta * 0.045 * a.spin;
    if (spinner.current) {
      spinner.current.rotation.y = a.rot;
      spinner.current.visible = a.hide < 0.999;
    }
    const api = lights.current;
    if (!api) return;
    const t = state.clock.elapsedTime;
    const { city, positions, delay, phase, speed, hub, degree } = g;

    // Positions move only while the city assembles.
    if (a.assemble !== lastAssemble.current) {
      lastAssemble.current = a.assemble;
      for (let i = 0; i < n; i++) {
        const local = Math.max(0, Math.min(1, (a.assemble - delay[i] * 0.55) / 0.45));
        const s = local * local * (3 - 2 * local);
        const lift = Math.sin(Math.PI * s) * 0.9;
        api.setPosition(
          i,
          city[i * 3] + (positions[i * 3] - city[i * 3]) * s,
          city[i * 3 + 1] + (positions[i * 3 + 1] - city[i * 3 + 1]) * s + lift,
          city[i * 3 + 2] + (positions[i * 3 + 2] - city[i * 3 + 2]) * s,
        );
      }
    }

    // Brightness: what is highlighted, what steps back, and a slow twinkle.
    const ease = Math.min(1, delta * 4);
    const friendOf = step === 1;
    for (let i = 0; i < n; i++) {
      let goal: number;
      if (step === 1) goal = i === user ? 1 : friend[i] ? 0.75 : 0.12;
      else if (highlight === "hubs") goal = hub[i] ? 1 : 0.14;
      else if (highlight === "alone") goal = degree[i] === 0 ? 1 : 0.14;
      else goal = degree[i] === 0 ? 0.55 : 0.92;
      bright.current[i] += (goal - bright.current[i]) * ease;
      const b = bright.current[i];
      const twinkle = 0.88 + 0.12 * Math.sin(t * speed[i] + phase[i]);
      scratch.color.copy(roles.muted).lerp(roles.honest, Math.min(1, b * twinkle));
      api.setColor(i, scratch.color);
      const size = hub[i] ? 2.6 : degree[i] === 0 ? 0.85 : 0.9 + Math.min(0.5, degree[i] / 40);
      const focus = friendOf && i === user ? 2.6 : 1;
      api.setScale(i, size * focus * (0.55 + 0.45 * b) * (1 - a.hide));
    }
    api.commit();

    const appear = Math.max(0, Math.min(1, (a.assemble - 0.72) / 0.28));
    const lit = highlight === "all" || step === 1 ? 1 : 0.45;
    if (edges.material.current) edges.material.current.opacity = EDGE_OPACITY * appear * lit * (1 - 0.85 * a.dim) * (1 - a.hide);
    if (friendEdges.material.current) friendEdges.material.current.opacity = 0.85 * a.dim * (1 - a.hide);
  });

  return (
    <group>
      <Ground radius={7} y={-3} />
      <group ref={spinner}>
        <Crowd count={n} positions={g.city} size={0.04} apiRef={lights} />
        <group ref={edges.group}>
          <Links segments={g.segments} role="honest" opacity={0} />
        </group>
        <group ref={friendEdges.group}>
          <FriendLinks segments={g.userSegments} />
        </group>
      </group>
      <Leaks step={step} active={active} anim={anim} />
      <Pipeline step={step} active={active} anim={anim} />
    </group>
  );
}

/** The followed user's friendships: amber, or pink once the update is shown to leak them. */
function FriendLinks({ segments }: { segments: Float32Array }) {
  const leak = useIntro((s) => s.leak);
  const exposed = leak === "all" || leak === "update";
  return <Links segments={segments} role={exposed ? "attacker" : "honest"} opacity={0} />;
}
