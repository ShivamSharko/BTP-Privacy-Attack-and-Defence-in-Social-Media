import { useRef } from "react";
import { Ground, type SceneProps, useOnReset, useStepTimeline } from "../../world/kit";
import { BarsScene } from "./BarsScene";
import { CloudScene } from "./CloudScene";
import { CommitteeScene } from "./CommitteeScene";
import { usePoison } from "./store";

/**
 * Steps: 0 the cloud with a plain sum, 1 the same cloud under a chosen aggregator,
 * 2 one coordinate sorted into bars, 3 users dealt into committees.
 */
export function Scene({ step, active }: SceneProps) {
  const start = { cloud: step <= 1 ? 1 : 0, bars: step === 2 ? 1 : 0, committees: step === 3 ? 1 : 0 };
  const cloud = useRef(start.cloud);
  const bars = useRef(start.bars);
  const committees = useRef(start.committees);
  const fades = useRef({ ...start });

  useStepTimeline(step, (tl) => {
    tl.to(fades.current, {
      cloud: step <= 1 ? 1 : 0,
      bars: step === 2 ? 1 : 0,
      committees: step === 3 ? 1 : 0,
      duration: 0.7,
      ease: "power2.inOut",
      onUpdate: () => {
        cloud.current = fades.current.cloud;
        bars.current = fades.current.bars;
        committees.current = fades.current.committees;
      },
    });
  });

  useOnReset(() => usePoison.getState().reset(), active);

  return (
    <group>
      <Ground radius={7} y={-3} />
      <CloudScene step={step} active={active} vis={cloud} on={step <= 1} />
      <BarsScene active={active} vis={bars} on={step === 2} />
      <CommitteeScene active={active} vis={committees} on={step === 3} />
    </group>
  );
}
