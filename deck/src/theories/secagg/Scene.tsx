import { Ground, type SceneProps, useOnReset } from "../../world/kit";
import { GridScene } from "./GridScene";
import { PipelineScene } from "./PipelineScene";
import { RingScene } from "./RingScene";
import { useSecAgg } from "./store";

/**
 * Steps: 0 the ring (masks, send, sum), 1 where a mask comes from, 2 the ring with a dropout,
 * 3 the sum over an item grid, 4 the ring in its finished state behind the impact and code cards.
 */
export function Scene({ step, active }: SceneProps) {
  useOnReset(() => useSecAgg.getState().reset(), active);
  const ring = step === 0 || step === 2 || step === 4;
  return (
    <group>
      {step !== 3 && <Ground radius={7} y={-4.3} />}
      {ring && <RingScene step={step} active={active} />}
      {step === 1 && <PipelineScene active={active} />}
      {step === 3 && <GridScene active={active} />}
    </group>
  );
}
