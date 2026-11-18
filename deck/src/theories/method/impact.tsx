import { fmt, hasFact, fact } from "../../data";
import { H, Note, P, StatRow, Table } from "../../ui";
import { provenance } from "./evidence";

const short = (hash: string) => `${hash.slice(0, 8)}…`;

/** A coverage fact is shown only if the facts file has it; it may be a fraction or a percentage. */
function coverageText(id: string): string | null {
  if (!hasFact(id)) return null;
  const v = Number(fact(id).value);
  if (!Number.isFinite(v)) return null;
  return v <= 1 ? fmt.pct(v, 0) : `${fmt.n(v, 0)}%`;
}

export function ImpactPanel() {
  const p = provenance();
  const advisory = p.files.flatMap((f) => f.advisoryFailed.map((name) => `${name} in ${f.file}`));
  return (
    <>
      <H>Every number on a slide traces to a result file, a run record and a hash of the code.</H>
      <P>
        Each result file carries its status, its controls and the hash of the engine source it ran on. So do {p.hashed} of
        the {p.records} run records; the other {p.unhashed} are the tuning runs on validation.
      </P>
      <P>
        All {p.valid} result files with a status finished VALID, and {p.controlsPassed} of {p.controlsTotal} deciding
        controls passed. A clean rerun with the training code frozen, the README says, reproduced the numbers exactly.
      </P>
      <Note tone="warn">
        VALID means the sanity checks passed, not that a finding is right. {advisory.length === 0 ? "No advisory control failed." : `Advisory control not passed: ${advisory.join(", ")}; the file says why.`} All {p.dirty} files with provenance record git_dirty as true, so the hash, not
        the commit, identifies the code.
      </Note>
    </>
  );
}

function ChainDiagram({ hash, records, hashed }: { hash: string; records: number; hashed: number }) {
  const nodes = [
    { x: 8, w: 150, a: "a number", b: "on a slide", color: "var(--model)" },
    { x: 218, w: 170, a: "result file", b: "status and controls", color: "var(--ledger)" },
    { x: 448, w: 170, a: `${records} run records`, b: `${hashed} with the hash`, color: "var(--ledger)" },
    { x: 678, w: 114, a: "engine hash", b: short(hash), color: "var(--ledger)" },
  ];
  return (
    <svg viewBox="0 0 800 92" role="img" aria-label={`A number on a slide leads to its result file, then to ${records} run records, then to the engine hash ${short(hash)}`} style={{ width: "100%", height: "auto", display: "block" }}>
      {nodes.map((n, i) => (
        <g key={n.a}>
          <rect x={n.x} y={14} width={n.w} height={64} rx={4} fill="none" stroke={n.color} strokeWidth={2} />
          <text x={n.x + n.w / 2} y={43} textAnchor="middle" fill="var(--ink)" fontSize={17} fontWeight={600}>
            {n.a}
          </text>
          <text x={n.x + n.w / 2} y={65} textAnchor="middle" fill={n.color} fontSize={15}>
            {n.b}
          </text>
          {i < nodes.length - 1 ? (
            <g stroke="var(--ledger)" strokeWidth={2} fill="none">
              <line x1={n.x + n.w + 6} y1={46} x2={nodes[i + 1].x - 8} y2={46} />
              <polyline points={`${nodes[i + 1].x - 15},40 ${nodes[i + 1].x - 8},46 ${nodes[i + 1].x - 15},52`} />
            </g>
          ) : null}
        </g>
      ))}
    </svg>
  );
}

export function ImpactStage() {
  const p = provenance();
  const overall = coverageText("coverage.overall");
  const privacy = coverageText("coverage.privacy");
  const items = [
    { label: "run records", value: String(p.records), role: "ledger" as const, note: `${p.hashed} carry the engine hash` },
    { label: "result files with the engine hash", value: `${p.withSameHash} / ${p.files.length}`, role: "ledger" as const, note: `the same hash, ${short(p.engineHash)}` },
    { label: "tests", value: String(p.tests), role: "protected" as const, note: "counted by pytest" },
    { label: "result files VALID", value: `${p.valid} / ${p.files.length}`, role: "protected" as const, note: `${p.controlsPassed} of ${p.controlsTotal} deciding controls passed` },
    ...(overall ? [{ label: "coverage, overall", value: overall, role: "protected" as const }] : []),
    ...(privacy ? [{ label: "coverage, privacy-critical code", value: privacy, role: "protected" as const }] : []),
  ];
  return (
    <>
      <StatRow items={items} />
      <ChainDiagram hash={p.engineHash} records={p.records} hashed={p.hashed} />
      <Table
        head={["result file", "status", "deciding controls passed", "engine hash"]}
        rows={p.files.map((f) => [
          f.file,
          <span key="s" style={{ color: f.status === "VALID" ? "var(--protected)" : "var(--attacker)" }}>
            {f.status}
          </span>,
          f.gating === 0 ? "none recorded" : `${f.gatingPassed} of ${f.gating}`,
          f.engineHash === null ? "not recorded" : f.engineHash === p.engineHash ? short(f.engineHash) : "differs",
        ])}
        caption="Read from the status, controls and provenance of each result file."
      />
    </>
  );
}
