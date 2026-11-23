import type { TheoryDef } from "../../deck/types";
import { CodeView, H, List, Note, P } from "../../ui";
import { BriefLadderPanel, BriefLadderStage, BriefRingPanel } from "./brief";
import { Fallback } from "./Fallback";
import { ImpactPanel, ImpactStage } from "./ladder";
import { CohortPanel, DropPanel, PipelinePanel, RingPanel } from "./panels";
import { Scene } from "./Scene";

/* ---------------------------------------------------------------- 4.6 code */

function CodePanel() {
  return (
    <>
      <H>The secure sum in code: an encoder, a client, a server and a one-call driver.</H>
      <List
        items={[
          <>
            <code>FixedPoint</code> turns floats into 64-bit two's-complement words and decodes a sum.
          </>,
          <>
            <code>SecAggClient.masked_update</code> encodes the update, derives each peer's seed (<code>_seed</code>),
            expands it (<code>_mask</code>), and adds or subtracts it by comparing the two user numbers.
          </>,
          <>
            <code>SecAggServer.unmask</code> rebuilds the masks of dropped users from revealed seeds and removes them.
          </>,
          <>
            <code>secure_sum</code> runs a whole cohort and reports the bytes each survivor uploads.
          </>,
        ]}
      />
      <P>It uses the cryptography library for X25519, HKDF with SHA-256 and ChaCha20, and NumPy for the 64-bit arithmetic.</P>
      <Note tone="warn">
        This is a simulation of the protocol inside one process, not a network deployment: no network, no secret
        sharing of seeds, no double masking.
      </Note>
    </>
  );
}

function CodeStage() {
  return (
    <CodeView
      refs={[
        "fl/secagg.py::FixedPoint",
        "fl/secagg.py::SecAggClient.masked_update",
        "fl/secagg.py::SecAggServer.unmask",
        "fl/secagg.py::secure_sum",
      ]}
      highlight={{
        "fl/secagg.py::SecAggClient.masked_update": [[111, 114]],
        "fl/secagg.py::SecAggServer.unmask": [[150, 153]],
      }}
    />
  );
}

/* ---------------------------------------------------------------- theory */

const RING_POSE = { position: [0, 1.6, 13] as [number, number, number], target: [0, 0.2, 0] as [number, number, number] };

export const theory: TheoryDef = {
  id: "secagg",
  number: 4,
  title: "Defence: secure sum",
  short: "Secure sum",
  Scene,
  Fallback,
  slides: [
    { id: "secagg/1", kind: "theory", title: "Pairwise masks cancel in the sum", badge: "illustration", pose: RING_POSE, step: 0, Panel: RingPanel, brief: { title: "Masks cancel, so the server sees only the sum", Panel: BriefRingPanel } },
    {
      id: "secagg/2",
      kind: "theory",
      title: "Where the secret behind a mask comes from",
      badge: "illustration",
      pose: { position: [0, 0.3, 13], target: [0, -0.2, 0] },
      step: 1,
      Panel: PipelinePanel,
    },
    { id: "secagg/3", kind: "theory", title: "A user drops out and the sum still closes", badge: "illustration", pose: RING_POSE, step: 2, Panel: DropPanel },
    {
      id: "secagg/4",
      kind: "theory",
      title: "What a secure sum does not hide",
      badge: "illustration",
      pose: { position: [0, 5.0, 12.5], target: [0, -0.5, 0] },
      step: 3,
      Panel: CohortPanel,
    },
    {
      id: "secagg/5",
      kind: "impact",
      title: "The defence ladder",
      badge: "measured",
      sources: ["update_leakage"],
      pose: { position: [4, 3.2, 15], target: [0, 0, 0] },
      step: 4,
      layout: "stage",
      Panel: ImpactPanel,
      Stage: ImpactStage,
      brief: { title: "The defence ladder, measured", Panel: BriefLadderPanel, Stage: BriefLadderStage },
    },
    {
      id: "secagg/6",
      kind: "code",
      title: "The secure sum in code",
      badge: "source",
      pose: { position: [-4, 3.2, 15], target: [0, 0, 0] },
      step: 4,
      layout: "stage",
      Panel: CodePanel,
      Stage: CodeStage,
    },
  ],
};
