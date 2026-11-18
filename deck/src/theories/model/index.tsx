import type { TheoryDef } from "../../deck/types";
import { Fallback } from "./Fallback";
import { CollapsePanel, ScorePanel, TrainingPanel } from "./panels";
import { CodePanel, CodeStage, ImpactPanel, ImpactStage } from "./results";
import { Scene } from "./Scene";

export const theory: TheoryDef = {
  id: "model",
  number: 1,
  title: "The hybrid recommender",
  short: "Recommender",
  Scene,
  Fallback,
  slides: [
    {
      id: "model/1",
      kind: "theory",
      title: "A user is the mean of their history",
      badge: "illustration",
      pose: { position: [2.5, 2.5, 12.5], target: [0, 0, 0] },
      step: 0,
      Panel: ScorePanel,
    },
    {
      id: "model/2",
      kind: "theory",
      title: "Training hides half and predicts it",
      badge: "illustration",
      pose: { position: [-2.5, 3, 12], target: [0, 0, 0] },
      step: 1,
      Panel: TrainingPanel,
    },
    {
      id: "model/3",
      kind: "theory",
      title: "Why content alone fell back on popularity",
      badge: "illustration",
      pose: { position: [0, 4.5, 12.5], target: [0, 0, 0] },
      step: 2,
      Panel: CollapsePanel,
    },
    {
      id: "model/4",
      kind: "impact",
      title: "How well it ranks, without privacy noise",
      badge: "measured",
      sources: ["baselines", "privacy_utility", "dataset_card"],
      pose: { position: [5, 3, 15], target: [0, 0, 0] },
      step: 0,
      layout: "stage",
      Panel: ImpactPanel,
      Stage: ImpactStage,
    },
    {
      id: "model/5",
      kind: "code",
      title: "The model in code",
      badge: "source",
      pose: { position: [-5, 3, 15], target: [0, 0, 0] },
      step: 0,
      layout: "stage",
      Panel: CodePanel,
      Stage: CodeStage,
    },
  ],
};
