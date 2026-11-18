import { useRef } from "react";
import { Ground, type SceneProps, useOnReset, useStepTimeline } from "../../world/kit";
import { useDp } from "./store";
import { Updates } from "./Updates";
import { type Anim, Worlds } from "./Worlds";

/**
 * Steps: 0 the two worlds, 1 the two worlds with the window S, 2 clipping, 3 the noisy sum,
 * 4 the noisy sum behind the impact cards, 5 clipping behind the code card.
 */
export function Scene({ step, active }: SceneProps) {
  const anim = useRef<Anim>({ worlds: step <= 1 ? 1 : 0, window: 0, updates: step >= 2 ? 1 : 0, chain: 0 });

  useStepTimeline(step, (tl) => {
    const worlds = step <= 1;
    const sum = step === 3 || step === 4;
    tl.to(anim.current, { worlds: worlds ? 1 : 0, window: step === 1 ? 1 : 0, duration: 0.8, ease: "power2.inOut" }, 0);
    tl.to(anim.current, { updates: worlds ? 0 : 1, duration: 0.8, ease: "power2.inOut" }, worlds ? 0 : 0.25);
    tl.to(anim.current, { chain: sum ? 1 : 0, duration: 1.4, ease: "power3.inOut" }, 0.2);
  });

  useOnReset(() => useDp.getState().reset(), active);

  return (
    <group>
      <Ground radius={7} y={-3} />
      <Worlds anim={anim} active={active} step={step} />
      <Updates anim={anim} active={active} step={step} />
    </group>
  );
}
