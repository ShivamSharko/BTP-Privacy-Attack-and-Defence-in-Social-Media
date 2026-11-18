import { useLayoutEffect, useRef } from "react";
import type { Group } from "three";
import { Ground, type SceneProps, useActiveFrame, useOnReset, useStepTimeline } from "../../world/kit";
import { Cosine } from "./Cosine";
import { Inversion } from "./Inversion";
import { Network } from "./Network";
import { useLeak } from "./store";

/** The three views: 0 the item grid, 1 the two arrows, 2 the friend network. */
const VIEWS = 3;

export function Scene({ step, active }: SceneProps) {
  const groups = [useRef<Group>(null), useRef<Group>(null), useRef<Group>(null)];
  const shown = useRef<Record<string, number>>(Object.fromEntries(Array.from({ length: VIEWS }, (_, i) => [`v${i}`, i === step ? 1 : 0])));

  const place = () => {
    groups.forEach((ref, i) => {
      const g = ref.current;
      if (!g) return;
      const s = shown.current[`v${i}`];
      g.visible = s > 0.01;
      g.scale.setScalar(Math.max(s, 0.001));
      g.position.y = (1 - s) * -0.8 + (i === 0 ? -1.0 : 0);
    });
  };

  useLayoutEffect(place);

  useStepTimeline(step, (tl) => {
    const goal: Record<string, number> = {};
    for (let i = 0; i < VIEWS; i++) goal[`v${i}`] = i === step ? 1 : 0;
    tl.to(shown.current, { ...goal, duration: 0.7, ease: "power2.inOut" });
  });

  useActiveFrame(active, place);
  useOnReset(() => useLeak.getState().reset(), active);

  return (
    <group>
      <Ground radius={7} y={-3} />
      <group ref={groups[0]}>
        <Inversion run={active && step === 0} labels={step === 0} />
      </group>
      <group ref={groups[1]}>
        <Cosine labels={step === 1} />
      </group>
      <group ref={groups[2]}>
        <Network labels={step === 2} />
      </group>
    </group>
  );
}
