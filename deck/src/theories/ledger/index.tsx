import { fmt, m } from "../../data";
import type { TheoryDef } from "../../deck/types";
import { BarChart, Caption, CodeView, H, Note, P, StatRow } from "../../ui";
import { Fallback } from "./Fallback";
import { BriefPanel, BriefStage } from "./brief";
import { GatePanel, GrowPanel, ProofPanel, TamperPanel } from "./panels";
import { GATE_STEP, Scene } from "./Scene";

const r = (key: string) => m("ledger_audit", `results/${key}`);

/* ---------------------------------------------------------------- 12.5 impact */

function ImpactPanel() {
  return (
    <>
      <H>
        All {r("verification/verified")} ledgers verify, and every one of {r("tamper_detection/flips")} flipped bytes was
        caught.
      </H>
      <P>
        The audit re-checked every ledger the experiments wrote: line order, each checkpoint&apos;s root and signature,
        and coverage, meaning every released private model has its own ledger ending in a release receipt that names its
        configuration and model hash. Then it flipped single bytes of the longest ledger, one at a time, and ran the
        verifier on each copy.
      </P>
      <P>
        The cost is small: {fmt.n(r("costs/append_ms_per_receipt"), 1)} ms to append a receipt, written to disk, and{" "}
        {fmt.n(r("costs/verify_seconds") * 1000, 0)} ms to verify a whole ledger of {fmt.int(r("costs/verified_size"))}{" "}
        receipts.
      </P>
      <Note tone="warn">
        Tampering was tested only with single-byte flips of one ledger file, and the blocked-release run used the synthetic dataset. One key on one machine signs
        everything; publishing checkpoints to an outside witness would close that gap.
      </Note>
    </>
  );
}

function ImpactStage() {
  const mean = r("receipt_overhead/mean_share_of_run_time");
  const max = r("receipt_overhead/max");
  return (
    <>
      <StatRow
        items={[
          { label: "ledgers verified", value: `${r("verification/verified")} / ${r("verification/ledgers")}`, role: "ledger", note: `${fmt.int(r("verification/round_receipts"))} round receipts` },
          { label: "receipt coverage", value: fmt.pct(r("coverage/coverage"), 0), role: "ledger", note: `${r("coverage/private_runs")} private runs` },
          { label: "tampers detected", value: `${r("tamper_detection/detected")} / ${r("tamper_detection/flips")}`, role: "ledger", note: "single-byte flips" },
          { label: "to append a receipt", value: `${fmt.n(r("costs/append_ms_per_receipt"), 1)} ms`, role: "ledger", note: "including the disk sync" },
          { label: "inclusion proof", value: `${r("costs/inclusion_proof_hashes")} hashes`, role: "ledger", note: `${r("costs/inclusion_proof_bytes")} bytes` },
          { label: "to verify a ledger", value: `${fmt.n(r("costs/verify_seconds") * 1000, 0)} ms`, role: "ledger", note: `${fmt.int(r("costs/verified_size"))} receipts` },
          { label: "of log per round", value: `${fmt.int(r("verification/bytes_per_round"))} bytes`, role: "ledger", note: "one JSON line" },
          { label: "of run time on receipts", value: fmt.pct(mean, 2), role: "protected", note: `at most ${fmt.pct(max, 2)}` },
        ]}
      />
      <BarChart
        yLabel="share of a run's time"
        format={(v) => fmt.pct(v, 2)}
        data={[
          { label: "mean over private runs", value: mean, role: "ledger", note: `${r("coverage/private_runs")} runs` },
          { label: "largest single run", value: max, role: "ledger" },
        ]}
        summary={`Writing receipts took ${fmt.pct(mean, 2)} of a private run's time on average and ${fmt.pct(max, 2)} at most.`}
      />
      <Caption>One audit run on one machine: each timing is a single measurement, with no spread.</Caption>
    </>
  );
}

/* ---------------------------------------------------------------- 12.6 code */

function CodePanel() {
  return (
    <>
      <H>The ledger in the code: four files.</H>
      <P>
        <strong>merkle.py.</strong> <code>inclusion_proof</code> returns the sibling hashes on a leaf&apos;s path;{" "}
        <code>verify_inclusion</code> and <code>verify_consistency</code> follow RFC 9162 and return false on bad input
        instead of raising.
      </P>
      <P>
        <strong>receipts.py.</strong> <code>canonical_bytes</code> rejects NaN and infinity, then serialises with the{" "}
        <code>rfc8785</code> library. <code>sign</code> uses Ed25519 from the <code>cryptography</code> library.
      </P>
      <P>
        <strong>log.py.</strong> <code>Ledger</code> appends one JSON line per receipt, syncs it to disk, and signs
        checkpoints. <code>verify_ledger</code> re-reads the file strictly, recomputes every root and checks every
        signature.
      </P>
      <P>
        <strong>gate.py.</strong> <code>ReleaseGate</code> logs a refusal when ε would pass the budget, and refuses a
        release unless the round receipts are exactly 1 to the rounds completed.
      </P>
      <Note>SHA-256 comes from Python&apos;s hashlib. The browser port on these slides is checked against the same test vectors.</Note>
    </>
  );
}

function CodeStage() {
  return (
    <CodeView
      refs={[
        "ledger/merkle.py::inclusion_proof",
        "ledger/merkle.py::verify_inclusion",
        "ledger/merkle.py::verify_consistency",
        "ledger/receipts.py::canonical_bytes",
        "ledger/receipts.py::sign",
        "ledger/log.py::Ledger",
        "ledger/log.py::verify_ledger",
        "ledger/gate.py::ReleaseGate",
      ]}
    />
  );
}

/* ---------------------------------------------------------------- theory */

export const theory: TheoryDef = {
  id: "ledger",
  number: 12,
  title: "The transparency ledger",
  short: "Ledger",
  Scene,
  Fallback,
  slides: [
    {
      id: "ledger/1",
      kind: "theory",
      title: "An append-only Merkle log",
      badge: "illustration",
      pose: { position: [0, 0.6, 13.5], target: [0, 0.1, 0] },
      step: 0,
      Panel: GrowPanel,
    },
    {
      id: "ledger/2",
      kind: "theory",
      title: "Inclusion and consistency proofs",
      badge: "illustration",
      pose: { position: [0.9, 1.0, 13.6], target: [0, 0.1, 0] },
      step: 1,
      Panel: ProofPanel,
    },
    {
      id: "ledger/3",
      kind: "theory",
      title: "Signed roots and a flipped byte",
      badge: "illustration",
      pose: { position: [2.4, 0.9, 13.8], target: [0.8, 0.2, 0] },
      step: 2,
      Panel: TamperPanel,
    },
    {
      id: "ledger/4",
      kind: "theory",
      title: "The release gate",
      badge: "illustration",
      pose: { position: [0, 1.6, 12.6], target: [0, 0.2, 0] },
      step: GATE_STEP,
      Panel: GatePanel,
    },
    {
      id: "ledger/5",
      kind: "impact",
      title: "Every ledger verifies; every tamper is caught",
      badge: "measured",
      sources: ["ledger_audit"],
      pose: { position: [4, 4, 16], target: [0, 0, 0] },
      step: GATE_STEP,
      layout: "stage",
      Panel: ImpactPanel,
      Stage: ImpactStage,
      brief: {
        title: "Every round is signed into a log that can be checked",
        Panel: BriefPanel,
        Stage: BriefStage,
        badge: "measured",
        sources: ["ledger_audit"],
        step: GATE_STEP,
      },
    },
    {
      id: "ledger/6",
      kind: "code",
      title: "The ledger in code",
      badge: "source",
      pose: { position: [-4, 4, 16], target: [0, 0, 0] },
      step: 0,
      layout: "stage",
      Panel: CodePanel,
      Stage: CodeStage,
    },
  ],
};
