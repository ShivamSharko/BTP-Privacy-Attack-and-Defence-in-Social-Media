import { Ground, type SceneProps, useOnReset } from "../../world/kit";
import { GateView } from "./GateView";
import { TreeView } from "./TreeView";
import { useLedger } from "./store";

/** Step 0 to 2: the Merkle tree (grow, prove, tamper). Step 3: the release gate. */
export const GATE_STEP = 3;

export function Scene({ step, active }: SceneProps) {
  useOnReset(() => useLedger.getState().reset(), active);
  const gate = step === GATE_STEP;
  return (
    <group>
      <Ground radius={7} y={-3} />
      <TreeView step={step} active={active} shown={!gate} />
      <GateView step={step} active={active} shown={gate} />
    </group>
  );
}
