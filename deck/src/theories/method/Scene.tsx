import { Ground, type SceneProps, useOnReset } from "../../world/kit";
import { ChainView } from "./ChainView";
import { ControlsView } from "./ControlsView";
import { PipelineView } from "./PipelineView";
import { StatsView } from "./StatsView";
import { useMethod } from "./store";

/** Step 0: the order of work. 1: controls. 2: statistics. 3: provenance chain (impact and code slides). */
export function Scene({ step, active }: SceneProps) {
  useOnReset(() => useMethod.getState().reset(), active);
  return (
    <group>
      <Ground radius={7} y={-3} />
      <PipelineView shown={step === 0} active={active} />
      <ControlsView shown={step === 1} active={active} />
      <StatsView shown={step === 2} active={active} />
      <ChainView shown={step >= 3} active={active} />
    </group>
  );
}
