import { fmt, m } from "../../data";
import { Caption, H, Note, P, StatRow, Table } from "../../ui";
import { hypothesisOutcomes, provenance, seedCounts } from "./evidence";
import { ChainDiagram } from "./impact";

const short = (hash: string) => `${hash.slice(0, 8)}…`;

/** The brief edition's slide for the whole method topic: fixed order, controls, seeds, provenance. */
export function BriefPanel() {
  const outcomes = hypothesisOutcomes();
  const seeds = seedCounts().main;
  return (
    <>
      <H>The rules came first, and every result traces to its code.</H>
      <P>
        Hypotheses and their thresholds were written down before the reported model was evaluated on the test split. Settings were tuned on
        validation data only, then frozen. Each model was evaluated once on test.
      </P>
      <P>
        Every attack has controls: a positive control must find a real effect, a negative control must find
        nothing, and a failed control marks the run INVALID. The main grid uses {seeds} seeds (random starts), with
        bootstrap intervals. Each result file records the hash of the code behind it, and a clean rerun gave the same
        numbers.
      </P>
      <Note tone="warn">
        {outcomes.failed.join(" and ")} did not hold, and the results say so. VALID means the checks passed, not that a
        finding is right.
      </Note>
    </>
  );
}

export function BriefStage() {
  const p = provenance();
  return (
    <>
      <StatRow
        items={[
          { label: "result files VALID", value: `${p.valid} / ${p.files.length}`, role: "protected", note: `${p.controlsPassed} of ${p.controlsTotal} deciding controls passed` },
          { label: "overfitted model, attack AUC", value: fmt.n(m("membership", "controls/positive_overfit/values/auc"), 3), role: "protected", note: `must be at least ${m("membership", "controls/positive_overfit/threshold/auc_min")}` },
          { label: "independent model, attack AUC", value: fmt.n(m("membership", "controls/negative_independent/values/auc"), 3), role: "protected", note: `must be ${m("membership", "controls/negative_independent/threshold/auc_target")} plus or minus ${m("membership", "controls/negative_independent/threshold/tolerance")}` },
          { label: "result files with the engine hash", value: `${p.withSameHash} / ${p.files.length}`, role: "ledger", note: `the same hash, ${short(p.engineHash)}` },
        ]}
      />
      <ChainDiagram hash={p.engineHash} records={p.records} hashed={p.hashed} />
      <Table
        head={["result file", "status", "deciding controls passed"]}
        rows={p.files.map((f) => [
          f.file,
          <span key="s" style={{ color: f.status === "VALID" ? "var(--protected)" : "var(--attacker)" }}>
            {f.status}
          </span>,
          f.gating === 0 ? "none recorded" : `${f.gatingPassed} of ${f.gating}`,
        ])}
      />
      <Caption>
        {p.hashed} of {p.records} run records carry the hash; the other {p.unhashed} are tuning runs on validation. The
        pytest suite counts {p.tests} tests.
      </Caption>
    </>
  );
}
