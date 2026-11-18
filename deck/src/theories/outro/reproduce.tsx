import { fact, raw, RESULT_FILES } from "../../data";
import { H, Note, P, Table } from "../../ui";

/** Result files whose provenance names this engine hash. */
function filesWithEngine(hash: string): number {
  return RESULT_FILES.filter((file) => {
    try {
      return raw<string>(file, "provenance/engine_sha256") === hash;
    } catch {
      return false;
    }
  }).length;
}

const C = ({ children }: { children: string }) => <code>{children}</code>;

/** prism commands come from COMMANDS in src/prism/cli.py; the scripts from scripts/ and the README. */
export const EXPERIMENTS: [string, string][] = [
  ["uv run python scripts/build_philly_subset.py", "philly_filter_report.json"],
  ["uv run python scripts/build_dataset.py", "dataset_card.json"],
  ["uv run python scripts/build_features.py", "features_card.json"],
  ["uv run prism social", "social_graph.json"],
  ["uv run prism baselines", "baselines.json"],
  ["uv run prism grid", "privacy_utility.json, run records, ledgers"],
  ["uv run prism update-leakage", "update_leakage.json"],
  ["uv run prism membership", "membership.json"],
  ["uv run prism poisoning", "poisoning.json"],
  ["uv run prism gossip", "gossip.json"],
  ["uv run prism participation", "participation.json"],
  ["uv run prism sensitivity", "sensitivity.json"],
  ["uv run prism free-riding", "free_riding.json"],
  ["uv run prism ledger", "ledger_audit.json"],
  ["uv run prism report", "report/report.html and report.md"],
  ["flower_parity.py, in its own environment", "flower_parity.json"],
];

export function ReproducePanel() {
  return (
    <>
      <H>Every result file has one command that writes it.</H>
      <P>
        After <C>uv sync</C>, run these from the repository root in this order. The three data scripts need the
        dataset, which each person downloads under the provider's terms; it is never shared or committed. Without it,{" "}
        <C>uv run prism demo-small</C> runs the whole pipeline on synthetic data in a few minutes.
      </P>
      <P>
        Settings come from <C>experiments/frozen.json</C>, fixed on validation data before any test evaluation. The
        long commands resume: a finished run with an unchanged configuration is skipped. Noise calibrations are cached
        in <C>calibration.json</C> along the way.
      </P>
      <Note>
        <C>make all-experiments</C> runs the experiment commands in order where make is available.
      </Note>
    </>
  );
}

export function ReproduceStage() {
  return (
    <div style={{ fontSize: "0.88em" }}>
      <Table
        head={["Command", "Writes under results/"]}
        rows={EXPERIMENTS.map(([command, writes]) => [<C key="c">{command}</C>, writes])}
      />
    </div>
  );
}

export function ProvenancePanel() {
  const records = fact("runs.records");
  const hashed = fact("runs.with_code_hash");
  const engine = String(fact("runs.engine_hash").value);
  return (
    <>
      <H>
        {records.value} run records, {hashed.value} of them carrying the hash of the code that made them.
      </H>
      <P>
        Each run writes a record with its configuration, its seed and the SHA-256 of the engine source. The hash most
        records carry begins <C>{engine.slice(0, 12)}</C>, and {filesWithEngine(engine)} result files name that same
        engine in their provenance.
      </P>
      <P>
        The commands on the right set up the environment, rerun the tests and rebuild this deck from the same files. The deck never types a
        number by hand: every figure is read from the exported results.
      </P>
      <P>That is the project: what was attacked, what defended it, what it cost, and what is still not known.</P>
    </>
  );
}

export const CHECKS: [string, string][] = [
  ["uv sync", "the locked Python environment in .venv"],
  ["uv run prism demo-small", "the whole pipeline on synthetic data; ends with DEMO OK"],
  ["uv run pytest", `${fact("tests.count").value} tests, collected by pytest`],
  ["uv run ruff check . and uv run mypy", "lint and strict types, as CI runs them"],
  ["uv run python deck/scripts/export_data.py", "the deck's copy of the results, code and facts, in deck/src/data/"],
  ["npm install (in deck/)", "the deck's locked JavaScript packages"],
  ["npm run dev", "the deck on a local server, no network needed"],
  ["npm run build", "a type check, then a static copy in deck/dist/"],
];

export function ProvenanceStage() {
  return (
    <>
      <Table head={["Command", "What it gives"]} rows={CHECKS.map(([command, gives]) => [<C key="c">{command}</C>, gives])} />
      <p className="caption">
        Counts from {fact("runs.records").source}; the test count from {fact("tests.count").source}.
      </p>
    </>
  );
}
