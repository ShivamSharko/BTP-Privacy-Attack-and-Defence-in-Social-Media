import { useRef } from "react";
import type { Group } from "three";
import { Ground, type SceneProps, useActiveFrame, useOnReset, useStepTimeline } from "../../world/kit";
import { Calib } from "./Calib";
import { Gauge } from "./Gauge";
import { Surface } from "./Surface";
import { useAcct } from "./store";

/** Steps: 0 is the epsilon surface, 1 the three accountants and the gate, 2 the calibration search. */
export function Scene({ step, active }: SceneProps) {
  const rateIdx = useAcct((s) => s.rateIdx);
  const mode = step === 1 ? 1 : step === 2 ? 2 : 0;
  const holder = useRef<Group>(null);
  const grow = useRef({ k: 1 });

  // Each station grows in when it takes the stage.
  useStepTimeline(step, (tl) => {
    tl.fromTo(grow.current, { k: 0.86 }, { k: 1, duration: 0.7, ease: "power2.out" });
  });
  useActiveFrame(active, () => {
    holder.current?.scale.setScalar(grow.current.k);
  });
  useOnReset(() => useAcct.getState().reset(), active);

  return (
    <group>
      <Ground radius={7} y={-3.2} />
      <group ref={holder}>
        {mode === 0 ? <Surface rateIdx={rateIdx} active={active} /> : null}
        {mode === 1 ? <Gauge active={active} /> : null}
        {mode === 2 ? <Calib active={active} /> : null}
      </group>
    </group>
  );
}
