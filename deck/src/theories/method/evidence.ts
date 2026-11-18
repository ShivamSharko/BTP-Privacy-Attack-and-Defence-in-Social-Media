import { RESULT_FILES, type ResultFile, fact, raw } from "../../data";
import { summariseControls } from "./sim";

/** One result file's standing: its status, its gating controls and the engine hash in its provenance. */
export interface FileEvidence {
  file: ResultFile;
  status: string;
  gating: number;
  gatingPassed: number;
  advisoryFailed: string[];
  engineHash: string | null;
  gitDirty: boolean | null;
}

function provenanceOf(data: unknown): Record<string, unknown> | null {
  if (typeof data !== "object" || data === null) return null;
  const p = (data as Record<string, unknown>).provenance;
  return typeof p === "object" && p !== null ? (p as Record<string, unknown>) : null;
}

/** Every result file that carries a status (the experiments; the data cards and baselines do not). */
export function fileEvidence(): FileEvidence[] {
  const out: FileEvidence[] = [];
  for (const file of RESULT_FILES) {
    const data = raw(file, "");
    const summary = summariseControls(data);
    if (summary.status === null) continue;
    const prov = provenanceOf(data);
    out.push({
      file,
      status: summary.status,
      gating: summary.gating,
      gatingPassed: summary.gatingPassed,
      advisoryFailed: summary.failedAdvisory,
      engineHash: typeof prov?.engine_sha256 === "string" ? prov.engine_sha256 : null,
      gitDirty: typeof prov?.git_dirty === "boolean" ? prov.git_dirty : null,
    });
  }
  return out;
}

export interface Provenance {
  records: number;
  hashed: number;
  unhashed: number;
  engineHash: string;
  tests: number;
  files: FileEvidence[];
  valid: number;
  withSameHash: number;
  dirty: number;
  controlsPassed: number;
  controlsTotal: number;
}

export function provenance(): Provenance {
  const records = Number(fact("runs.records").value);
  const hashed = Number(fact("runs.with_code_hash").value);
  const engineHash = String(fact("runs.engine_hash").value);
  const files = fileEvidence();
  return {
    records,
    hashed,
    unhashed: records - hashed,
    engineHash,
    tests: Number(fact("tests.count").value),
    files,
    valid: files.filter((f) => f.status === "VALID").length,
    withSameHash: files.filter((f) => f.engineHash === engineHash).length,
    dirty: files.filter((f) => f.gitDirty === true).length,
    controlsPassed: files.reduce((s, f) => s + f.gatingPassed, 0),
    controlsTotal: files.reduce((s, f) => s + f.gating, 0),
  };
}

/** Seeds per experiment: the main grid, and the smallest and largest count elsewhere. */
export function seedCounts(): { main: number; min: number; max: number } {
  const main = raw<number[]>("privacy_utility", "frozen/seeds").length;
  const others = [
    raw<number[]>("free_riding", "settings/seeds").length,
    raw<number[]>("gossip", "settings/seeds").length,
    raw<number[]>("participation", "settings/seeds").length,
    raw<number[]>("poisoning", "settings/seeds").length,
    raw<number[]>("sensitivity", "settings/seeds").length,
    raw<number[]>("membership", "settings/target_seeds").length,
  ];
  return { main, min: Math.min(...others), max: Math.max(...others) };
}

/** Which hypotheses did not hold and which were split, derived from the result files. */
export function hypothesisOutcomes(): { failed: string[]; split: string[] } {
  const failed: string[] = [];
  const split: string[] = [];
  const h1 = (["large", "small"] as const).map((r) => raw<boolean>("privacy_utility", `summary/${r}/h1/met`));
  if (h1.every((met) => !met)) failed.push("H1");
  else if (h1.some((met) => !met)) split.push("H1");
  // H3 has two parts: membership inference (exported verdict) and the secure sum, whose rule is the
  // popularity prior plus the pre-registered margin.
  const cohort = raw<number[]>("update_leakage", "settings/cohort_sizes").at(-1);
  const sumAuc = raw<number>("update_leakage", `results/sum_${cohort}/recovery/auc/mean`);
  const prior = raw<number>("update_leakage", `results/sum_${cohort}/recovery/prior_auc/mean`);
  const parts = [raw<boolean>("membership", "results/hypotheses/H3/holds"), sumAuc <= prior + Number(fact("h3.margin").value)];
  if (parts.every((held) => !held)) failed.push("H3");
  else if (parts.some((held) => !held)) split.push("H3");
  if (!raw<boolean>("poisoning", "h4/holds")) failed.push("H4");
  return { failed, split };
}
