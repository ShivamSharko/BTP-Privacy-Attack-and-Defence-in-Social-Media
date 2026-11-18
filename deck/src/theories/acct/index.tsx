import type { TheoryDef } from "../../deck/types";
import { Fallback } from "./Fallback";
import { CodePanel, CodeStage, ImpactPanel, ImpactStage } from "./impact";
import { CalibrationPanel, GatePanel, SurfacePanel } from "./panels";
import { Scene } from "./Scene";

export const theory: TheoryDef = {
  id: "acct",
  number: 7,
  title: "Privacy accounting",
  short: "Accounting",
  Scene,
  Fallback,
  slides: [
    {
      id: "acct/1",
      kind: "theory",
      title: "Epsilon as a surface",
      badge: "computed",
      pose: { position: [4.5, 4.6, 15.5], target: [0, -0.4, 0] },
      step: 0,
      Panel: SurfacePanel,
    },
    {
      id: "acct/2",
      kind: "theory",
      title: "Three accountants and a gate",
      badge: "illustration",
      pose: { position: [0, 0.5, 13.5], target: [0, -0.2, 0] },
      step: 1,
      Panel: GatePanel,
    },
    {
      id: "acct/3",
      kind: "theory",
      title: "Calibrating the noise by search",
      badge: "computed",
      pose: { position: [0, 0.3, 14.5], target: [0, -0.2, 0] },
      step: 2,
      Panel: CalibrationPanel,
    },
    {
      id: "acct/4",
      kind: "impact",
      title: "One run, three epsilons",
      badge: "measured",
      sources: ["privacy_utility", "calibration"],
      pose: { position: [7, 5, 17], target: [0, -0.4, 0] },
      step: 0,
      layout: "stage",
      Panel: ImpactPanel,
      Stage: ImpactStage,
    },
    {
      id: "acct/5",
      kind: "code",
      title: "Accounting in code",
      badge: "source",
      pose: { position: [-6, 4, 14], target: [0, -0.2, 0] },
      step: 0,
      layout: "stage",
      Panel: CodePanel,
      Stage: CodeStage,
    },
  ],
};
