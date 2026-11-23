import type { TheoryDef } from "../../deck/types";
import { BriefFreeRidePanel, BriefFreeRideStage } from "./brief";
import { Fallback } from "./Fallback";
import { CodePanel, CodeStage, CostPanel, CostStage, DetectionPanel, DetectionStage, DetectPanel, WhatPanel } from "./panels";
import { Scene } from "./Scene";

export const theory: TheoryDef = {
  id: "freeride",
  number: 9,
  title: "Free-riding",
  short: "Free-riding",
  Scene,
  Fallback,
  slides: [
    {
      id: "freeride/1",
      kind: "theory",
      title: "Users who take the model and send nothing",
      badge: "illustration",
      pose: { position: [0, 4.4, 12.4], target: [0, 0.4, 0] },
      step: 0,
      Panel: WhatPanel,
    },
    {
      id: "freeride/2",
      kind: "theory",
      title: "Two detectors, and what a secure sum hides",
      badge: "illustration",
      pose: { position: [0, 4.6, 14], target: [0, 0.6, 0] },
      step: 1,
      Panel: DetectPanel,
    },
    {
      id: "freeride/3",
      kind: "impact",
      title: "What free-riders cost the others",
      badge: "measured",
      sources: ["free_riding"],
      pose: { position: [4, 5, 15], target: [0, 0, 0] },
      step: 2,
      layout: "stage",
      Panel: CostPanel,
      Stage: CostStage,
      brief: {
        title: "Free-riders: cheap for others, caught by size",
        Panel: BriefFreeRidePanel,
        Stage: BriefFreeRideStage,
        badge: "measured",
        sources: ["free_riding"],
        pose: { position: [0, 4.4, 12.4], target: [0, 0.4, 0] },
        step: 0,
      },
    },
    {
      id: "freeride/4",
      kind: "impact",
      title: "Can they be caught? Measured detection",
      badge: "measured",
      sources: ["free_riding"],
      pose: { position: [-4, 5, 15], target: [0, 0, 0] },
      step: 3,
      layout: "stage",
      Panel: DetectionPanel,
      Stage: DetectionStage,
    },
    {
      id: "freeride/5",
      kind: "code",
      title: "The hook in code",
      badge: "source",
      pose: { position: [0, 7, 14], target: [0, 0, 0] },
      step: 4,
      layout: "stage",
      Panel: CodePanel,
      Stage: CodeStage,
    },
  ],
};
