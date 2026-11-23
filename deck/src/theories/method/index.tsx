import type { TheoryDef } from "../../deck/types";
import { CodeView, H, P, StackList } from "../../ui";
import { BriefPanel, BriefStage } from "./brief";
import { Fallback } from "./Fallback";
import { ImpactPanel, ImpactStage } from "./impact";
import { ControlsPanel, OrderPanel, StatsPanel } from "./panels";
import { Scene } from "./Scene";

/* ---------------------------------------------------------------- 13.5 code */

function CodePanel() {
  return (
    <>
      <H>The method in code: run records, hashes and statistics.</H>
      <P>
        <code>run_one</code> trains, accounts and evaluates one run, then writes its record with a status and the code
        hash. <code>code_sha256</code> hashes the files <code>engine_files</code> lists, paths and contents with line
        endings normalised; <code>payload_provenance</code> puts that hash into each result file.
      </P>
      <P>
        <code>paired_tests</code> counts seeds that moved each way and runs the Wilcoxon test. <code>holm_adjust</code>{" "}
        returns decisions only; the deck&apos;s own version also shows adjusted values and takes the same decisions.{" "}
        <code>bootstrap_ci</code> resamples seeds.
      </P>
      <P>
        <code>PREREGISTRATION.md</code> holds the hypotheses, decision rules and both amendments.{" "}
        <code>experiments/frozen.json</code> holds the settings tuned on validation.
      </P>
      <StackList
        items={[
          { name: "pytest, Hypothesis", role: "unit and property tests" },
          { name: "ruff, mypy", role: "lint, format check, strict types" },
          { name: "GitHub Actions", role: "runs all of it with coverage gates, a secret scan, a licence gate and an audit" },
        ]}
      />
    </>
  );
}

function CodeStage() {
  return (
    <CodeView
      refs={[
        "experiments/runner.py::run_one",
        "experiments/runner.py::code_sha256",
        "experiments/runner.py::engine_files",
        "experiments/runner.py::payload_provenance",
        "eval/stats.py::paired_tests",
        "eval/stats.py::holm_adjust",
        "eval/stats.py::bootstrap_ci",
      ]}
    />
  );
}

export const theory: TheoryDef = {
  id: "method",
  number: 13,
  title: "How we know: the method",
  short: "Method",
  Scene,
  Fallback,
  slides: [
    {
      id: "method/1",
      kind: "theory",
      title: "The order of work that makes results believable",
      badge: "illustration",
      pose: { position: [4.5, 3.4, 16], target: [0, -0.3, 0] },
      step: 0,
      Panel: OrderPanel,
      brief: {
        title: "The rules were fixed before the reported model was tested",
        Panel: BriefPanel,
        Stage: BriefStage,
        badge: "measured",
        sources: ["free_riding", "gossip", "ledger_audit", "membership", "participation", "poisoning", "privacy_utility", "sensitivity", "update_leakage", "flower_parity"],
        step: 3,
      },
    },
    {
      id: "method/2",
      kind: "theory",
      title: "Controls: a failed control makes a run INVALID",
      badge: "illustration",
      pose: { position: [3.5, 2.6, 14.5], target: [0, 0, 0] },
      step: 1,
      Panel: ControlsPanel,
    },
    {
      id: "method/3",
      kind: "theory",
      title: "Seeds, intervals and Holm correction",
      badge: "illustration",
      pose: { position: [0, 0.6, 16], target: [0, -0.3, 0] },
      step: 2,
      Panel: StatsPanel,
    },
    {
      id: "method/4",
      kind: "impact",
      title: "From a number to its run record and code hash",
      badge: "measured",
      sources: ["free_riding", "gossip", "ledger_audit", "membership", "participation", "poisoning", "privacy_utility", "sensitivity", "update_leakage", "flower_parity"],
      pose: { position: [3, 3, 15], target: [0, 0, 0] },
      step: 3,
      layout: "stage",
      Panel: ImpactPanel,
      Stage: ImpactStage,
    },
    {
      id: "method/5",
      kind: "code",
      title: "The method in code",
      badge: "source",
      pose: { position: [-3, 3, 15], target: [0, 0, 0] },
      step: 3,
      layout: "stage",
      Panel: CodePanel,
      Stage: CodeStage,
    },
  ],
};
