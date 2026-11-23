import { fmt, m } from "../../data";
import { BarChart, Caption, H, Note, P, StatRow } from "../../ui";
import { demo } from "./store";

const r = (key: string) => m("ledger_audit", `results/${key}`);

/** The brief edition's slide for the whole ledger topic: the idea, the audit, the gate and the limit. */
export function BriefPanel() {
  return (
    <>
      <H>
        Every round is signed into a log, and all {r("verification/verified")} ledgers verified.
      </H>
      <P>
        After each training round the server appends a signed receipt to an append-only log. The log is a Merkle tree:
        one hash commits to every receipt, so changing any byte changes it. Before each round a
        release gate checks the privacy budget and stops the run at the first round that would pass it.
      </P>
      <P>
        The audit flipped single bytes of the longest ledger: {r("tamper_detection/detected")} of{" "}
        {r("tamper_detection/flips")} changes were caught. A run asked for {demo.asked} rounds on a budget of ε{" "}
        {fmt.n(demo.budget, 1)}, and the gate stopped it after {demo.completed}.
      </P>
      <Note tone="warn">
        A ledger does not prove that training ran as recorded, and one key on one machine signs everything.
      </Note>
    </>
  );
}

export function BriefStage() {
  const mean = r("receipt_overhead/mean_share_of_run_time");
  return (
    <>
      <StatRow
        items={[
          { label: "ledgers verified", value: `${r("verification/verified")} / ${r("verification/ledgers")}`, role: "ledger", note: `${fmt.int(r("verification/round_receipts"))} round receipts` },
          { label: "tampers detected", value: `${r("tamper_detection/detected")} / ${r("tamper_detection/flips")}`, role: "ledger", note: "single-byte flips" },
          { label: "to append a receipt", value: `${fmt.n(r("costs/append_ms_per_receipt"), 1)} ms`, role: "ledger", note: "including the disk sync" },
          { label: "to verify a ledger", value: `${fmt.n(r("costs/verify_seconds") * 1000, 0)} ms`, role: "ledger", note: `${fmt.int(r("costs/verified_size"))} receipts` },
          { label: "of run time on receipts", value: fmt.pct(mean, 2), role: "protected", note: `at most ${fmt.pct(r("receipt_overhead/max"), 2)}` },
          { label: "rounds before the gate stopped", value: `${demo.completed} of ${demo.asked}`, role: "protected", note: `budget ε ${fmt.n(demo.budget, 1)}, released at ε ${fmt.n(demo.released, 3)}` },
        ]}
      />
      <BarChart
        yLabel="rounds"
        format={(v) => fmt.int(v)}
        data={[
          { label: "asked for", value: demo.asked, role: "noise" },
          { label: "fit the budget", value: demo.allowed, role: "protected" },
          { label: "completed", value: demo.completed, role: "ledger" },
        ]}
        summary={`The blocked run asked for ${demo.asked} rounds; ${demo.allowed} fit the budget and ${demo.completed} were completed before the gate refused round ${demo.allowed + 1}.`}
      />
      <Caption>One audit run on one machine, each timing a single measurement. The blocked run used the synthetic dataset.</Caption>
    </>
  );
}
