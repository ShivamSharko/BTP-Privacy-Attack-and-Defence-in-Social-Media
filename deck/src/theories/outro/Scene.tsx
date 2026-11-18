import { useEffect, useRef } from "react";
import type { Group } from "three";
import { Ground, type SceneProps, useOnReset, useStepTimeline } from "../../world/kit";
import { ReplayScene } from "./ReplayScene";
import { SandboxScene } from "./SandboxScene";
import { TICK_MS, useOutro } from "./store";
import { TradeoffScene } from "./TradeoffScene";

/**
 * Steps: 0 the live sandbox, 1 the trade-off scatter, 2 the failure-mode replays,
 * 3 the sandbox at rest behind the stage slides.
 */
export function Scene({ step, active }: SceneProps) {
  const running = useOutro((s) => s.running);
  const group = useRef<Group>(null);
  const fade = useRef({ s: 0.6 });

  // Training runs on a timer, never inside the frame callback, and only while it is on screen.
  useEffect(() => {
    if (!active || step !== 0 || !running) return;
    const timer = window.setInterval(() => useOutro.getState().tick(), TICK_MS);
    return () => window.clearInterval(timer);
  }, [active, step, running]);

  useOnReset(() => useOutro.getState().reset(), active);

  // Each view grows in from slightly smaller when the slide changes.
  useStepTimeline(step, (tl) => {
    tl.fromTo(
      fade.current,
      { s: 0.82 },
      {
        s: 1,
        duration: 0.7,
        ease: "power2.out",
        onUpdate: () => group.current?.scale.setScalar(fade.current.s),
      },
    );
  });

  return (
    <group>
      <Ground radius={7} y={-3} />
      <group ref={group}>
        {step === 0 || step === 3 ? <SandboxScene active={active} labels={step === 0} /> : null}
        {step === 1 ? <TradeoffScene active={active} /> : null}
        {step === 2 ? <ReplayScene active={active} /> : null}
      </group>
    </group>
  );
}
