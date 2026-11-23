import type { TheoryDef } from "../../deck/types";
import { CodeView, H, Note, P } from "../../ui";
import { Fallback } from "./Fallback";
import { BriefAttackPanel, BriefCostPanel, BriefExposurePanel } from "./brief";
import { CostPanel, CostStage, ExposurePanel, ExposureStage } from "./impact";
import { AttackPanel, CommitteePanel, RobustPanel, SparsePanel } from "./panels";
import { Scene } from "./Scene";

/* ---------------------------------------------------------------- 8.7 code */

const REFS = [
  "attacks/poisoning.py::make_promotion_hook",
  "attacks/poisoning.py::target_exposure",
  "attacks/poisoning.py::make_committee_median",
  "fl/aggregate.py::robust_total",
];

function CodePanel() {
  return (
    <>
      <H>The attack, the measurement and two defences, in four functions.</H>
      <P>
        <strong>1. Attack.</strong> <code>make_promotion_hook</code> replaces each attacker's row by one honest-style
        local step that tries to raise only the target item, then rescales it to exactly the clipping norm.
      </P>
      <P>
        <strong>2. Measure.</strong> <code>target_exposure</code> scores every eligible user in batches and counts
        whose top 10 holds the target. Attackers, and users who already have it, are left out.
      </P>
      <P>
        <strong>3. Defend with committees.</strong> <code>make_committee_median</code> deals a random permutation into
        committees, sums each, and takes the median of the sums.
      </P>
      <P>
        <strong>4. Defend in plaintext.</strong> <code>robust_total</code> returns the sum, the median or the trimmed
        mean, scaled to be sum-equivalent.
      </P>
      <Note>PyTorch for the tensors, NumPy for the random permutation. Randomness comes from named, seeded streams.</Note>
    </>
  );
}

function CodeStage() {
  return (
    <CodeView
      refs={REFS}
      highlight={{
        "attacks/poisoning.py::make_promotion_hook": [[68, 77]],
        "attacks/poisoning.py::target_exposure": [[106, 114]],
        "attacks/poisoning.py::make_committee_median": [[146, 160]],
        "fl/aggregate.py::robust_total": [[49, 59]],
      }}
    />
  );
}

/* ---------------------------------------------------------------- theory */

export const theory: TheoryDef = {
  id: "poison",
  number: 8,
  title: "Poisoning and robust aggregation",
  short: "Poisoning",
  Scene,
  Fallback,
  slides: [
    {
      id: "poison/1",
      kind: "theory",
      title: "Target-item promotion",
      badge: "illustration",
      pose: { position: [5.2, 3.2, 10.2], target: [1.2, 0.9, 0] },
      step: 0,
      Panel: AttackPanel,
      brief: {
        title: "Fake accounts, and why robust defences cost privacy or accuracy",
        Panel: BriefAttackPanel,
        pose: { position: [4.4, 2.8, 10.2], target: [1.2, 0.9, 0] },
        step: 1,
      },
    },
    {
      id: "poison/2",
      kind: "theory",
      title: "Robust aggregation needs plaintext",
      badge: "illustration",
      pose: { position: [4.4, 2.8, 10.2], target: [1.2, 0.9, 0] },
      step: 1,
      Panel: RobustPanel,
    },
    {
      id: "poison/3",
      kind: "theory",
      title: "Why the median erases a sparse signal",
      badge: "illustration",
      pose: { position: [0, 0.8, 14.5], target: [0, 0.4, 0] },
      step: 2,
      Panel: SparsePanel,
    },
    {
      id: "poison/4",
      kind: "theory",
      title: "Committee median",
      badge: "illustration",
      pose: { position: [0, 7.4, 14.2], target: [0, 0.2, 0] },
      step: 3,
      Panel: CommitteePanel,
    },
    {
      id: "poison/5",
      kind: "impact",
      title: "How far each defence holds",
      badge: "measured",
      sources: ["poisoning"],
      pose: { position: [7, 4.5, 13], target: [0.9, 0.7, 0] },
      step: 0,
      layout: "stage",
      Panel: ExposurePanel,
      Stage: ExposureStage,
      brief: {
        title: "How far each defence holds",
        Panel: BriefExposurePanel,
        Stage: ExposureStage,
        badge: "measured",
        sources: ["poisoning"],
      },
    },
    {
      id: "poison/6",
      kind: "impact",
      title: "What defence costs, and H4",
      badge: "measured",
      sources: ["poisoning"],
      pose: { position: [-5, 4, 14], target: [0, 0.4, 0] },
      step: 3,
      layout: "stage",
      Panel: CostPanel,
      Stage: CostStage,
      brief: {
        title: "What defence costs, and H4",
        Panel: BriefCostPanel,
        Stage: CostStage,
        badge: "measured",
        sources: ["poisoning"],
        pose: { position: [0, 0.8, 14.5], target: [0, 0.4, 0] },
        step: 2,
      },
    },
    {
      id: "poison/7",
      kind: "code",
      title: "Poisoning in code",
      badge: "source",
      pose: { position: [0, 5.5, 14], target: [0, 0.2, 0] },
      step: 3,
      layout: "stage",
      Panel: CodePanel,
      Stage: CodeStage,
    },
  ],
};
