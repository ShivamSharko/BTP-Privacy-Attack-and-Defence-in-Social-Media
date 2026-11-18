import type { TheoryDef } from "../../deck/types";
import { CodePanel, CodeStage } from "./Code";
import { Fallback } from "./Fallback";
import { BoundPanel, BoundStage, SuccessPanel, SuccessStage } from "./Impact";
import { CalibrationPanel, ControlsPanel, ThresholdPanel } from "./panels";
import { Scene } from "./Scene";

export const theory: TheoryDef = {
  id: "mia",
  number: 5,
  title: "Attack: membership inference",
  short: "Membership",
  Scene,
  Fallback,
  slides: [
    {
      id: "mia/1",
      kind: "theory",
      title: "Was this user in the training set?",
      badge: "illustration",
      pose: { position: [4.8, 4.2, 12.6], target: [0.2, 0.4, 0] },
      step: 0,
      Panel: ThresholdPanel,
    },
    {
      id: "mia/2",
      kind: "theory",
      title: "Calibration, and the figure that counts",
      badge: "illustration",
      pose: { position: [4.0, 4.0, 12.4], target: [0.3, 0.4, 0] },
      step: 1,
      Panel: CalibrationPanel,
    },
    {
      id: "mia/3",
      kind: "theory",
      title: "Two controls and a bound on epsilon",
      badge: "illustration",
      pose: { position: [-4.0, 4.0, 12.4], target: [0.3, 0.4, 0] },
      step: 2,
      Panel: ControlsPanel,
    },
    {
      id: "mia/4",
      kind: "impact",
      title: "How well the attack works",
      badge: "measured",
      sources: ["membership"],
      pose: { position: [4, 3.4, 15], target: [0, 0.4, 0] },
      step: 1,
      layout: "stage",
      Panel: SuccessPanel,
      Stage: SuccessStage,
    },
    {
      id: "mia/5",
      kind: "impact",
      title: "The bound on epsilon against the claim",
      badge: "measured",
      sources: ["membership"],
      pose: { position: [-4, 3.4, 15], target: [0, 0.4, 0] },
      step: 2,
      layout: "stage",
      Panel: BoundPanel,
      Stage: BoundStage,
    },
    {
      id: "mia/6",
      kind: "code",
      title: "The attack in code",
      badge: "source",
      pose: { position: [0, 5, 15], target: [0, 0.2, 0] },
      step: 0,
      layout: "stage",
      Panel: CodePanel,
      Stage: CodeStage,
    },
  ],
};
