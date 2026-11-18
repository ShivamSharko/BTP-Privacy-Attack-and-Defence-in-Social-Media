import { fmt, m } from "../../data";
import type { TheoryDef } from "../../deck/types";
import { CodeView, H, List, Note } from "../../ui";
import { Fallback } from "./Fallback";
import { AccuracyPanel, AccuracyStage, CostPanel, CostStage } from "./impact";
import { AveragingPanel, NoisePanel, OptimiserPanel } from "./panels";
import { Scene } from "./Scene";

/* ---------------------------------------------------------------- 10.6 code */

function CodePanel() {
  return (
    <>
      <H>One gossip round in the code: pick peers, noise the gradient, step, mix.</H>
      <List
        items={[
          <>
            <code>peer_table</code> gives every user a row of {m("gossip", "settings/degree")} peers: real friends first, then random
            users who are not friends, plus a flag for which are friends.
          </>,
          <>
            <code>privatise_updates</code> clips each node's gradient and adds noise of z times the clip norm.
          </>,
          <>
            <code>mix_into</code> sets each row to the mean of itself and its peers' rows.
          </>,
          <>
            <code>gossip_train</code> runs the loop: gradient, privatise, Adam step, then mix the parameters and, with{" "}
            <code>mix_moments</code>, both moments.
          </>,
          <>
            <code>GossipConfig</code> holds rounds, peers, learning rate, optimiser, clip and noise.
          </>,
        ]}
      />
      <Note>
        Python 3.12 with NumPy, PyTorch (<code>torch.func</code> for per-node gradients) and SciPy sparse for the graph.
        The graph here is {fmt.int(m("social_graph", "users"))} users and {fmt.int(m("social_graph", "edges"))} friendships.
      </Note>
    </>
  );
}

function CodeStage() {
  return (
    <CodeView
      refs={[
        "data/social.py::SocialGraph.peer_table",
        "fl/gossip.py::privatise_updates",
        "fl/gossip.py::mix_into",
        "fl/gossip.py::gossip_train",
        "fl/gossip.py::GossipConfig",
      ]}
      highlight={{
        "data/social.py::SocialGraph.peer_table": [[60, 70]],
        "fl/gossip.py::privatise_updates": [[128, 133]],
        "fl/gossip.py::mix_into": [[157, 160]],
        "fl/gossip.py::gossip_train": [
          [203, 205],
          [209, 213],
          [214, 218],
        ],
      }}
    />
  );
}

/* ---------------------------------------------------------------- theory */

export const theory: TheoryDef = {
  id: "gossip",
  number: 10,
  title: "Gossip learning without a server",
  short: "Gossip",
  Scene,
  Fallback,
  slides: [
    {
      id: "gossip/1",
      kind: "theory",
      title: "Averaging with a few peers",
      badge: "illustration",
      pose: { position: [0, 6, 15.5], target: [0, 0, 0] },
      step: 0,
      Panel: AveragingPanel,
    },
    {
      id: "gossip/2",
      kind: "theory",
      title: "Why plain gossip stalled",
      badge: "illustration",
      pose: { position: [5, 3.6, 16], target: [0, -0.2, 0] },
      step: 1,
      Panel: OptimiserPanel,
    },
    {
      id: "gossip/3",
      kind: "theory",
      title: "Local noise at every node",
      badge: "illustration",
      pose: { position: [-5, 2.6, 15.5], target: [0, -0.2, 0] },
      step: 2,
      Panel: NoisePanel,
    },
    {
      id: "gossip/4",
      kind: "impact",
      title: "Accuracy without a server",
      badge: "measured",
      sources: ["gossip"],
      pose: { position: [4, 4.5, 16], target: [0, 0, 0] },
      step: 3,
      layout: "stage",
      Panel: AccuracyPanel,
      Stage: AccuracyStage,
    },
    {
      id: "gossip/5",
      kind: "impact",
      title: "The bytes on the wire",
      badge: "measured",
      sources: ["gossip", "dataset_card"],
      pose: { position: [-4, 4.5, 16], target: [0, 0, 0] },
      step: 3,
      layout: "stage",
      Panel: CostPanel,
      Stage: CostStage,
    },
    {
      id: "gossip/6",
      kind: "code",
      title: "Gossip in code",
      badge: "source",
      pose: { position: [0, 5, 17], target: [0, 0, 0] },
      step: 3,
      layout: "stage",
      Panel: CodePanel,
      Stage: CodeStage,
    },
  ],
};
