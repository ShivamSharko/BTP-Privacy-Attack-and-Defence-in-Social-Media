import { m, raw } from "../../data";

export type Kind = "zero" | "noise";
export type Fraction = "0.1" | "0.3";
export const KINDS: Kind[] = ["zero", "noise"];
export const FRACTIONS: Fraction[] = ["0.1", "0.3"];

/** Figures read from results/free_riding.json. Nothing here is typed in by hand. */
const cell = (kind: Kind, fraction: Fraction, path: string) => m("free_riding", `results/${kind}/${fraction}/${path}`);

export const clean = {
  mean: () => m("free_riding", "results/clean/ndcg/mean"),
  min: () => m("free_riding", "results/clean/ndcg/min"),
  max: () => m("free_riding", "results/clean/ndcg/max"),
};

export const ndcg = (kind: Kind, fraction: Fraction) => ({
  mean: cell(kind, fraction, "ndcg/mean"),
  min: cell(kind, fraction, "ndcg/min"),
  max: cell(kind, fraction, "ndcg/max"),
});

export const drop = (kind: Kind, fraction: Fraction) => cell(kind, fraction, "cost_to_everyone/relative_ndcg_drop");

export const auc = (kind: Kind, fraction: Fraction, score: "norm" | "cosine") => ({
  mean: cell(kind, fraction, `detection/${score}_auc/mean`),
  min: cell(kind, fraction, `detection/${score}_auc/min`),
  max: cell(kind, fraction, `detection/${score}_auc/max`),
});

/** Mean NDCG@10 of free-riders minus contributors, averaged over the four cells. */
export function meanGain(): number {
  let total = 0;
  for (const kind of KINDS) for (const fraction of FRACTIONS) total += cell(kind, fraction, "free_rider_gain/difference_mean");
  return total / (KINDS.length * FRACTIONS.length);
}

/** How many of the per-seed free-rider-gain intervals contain zero, and how many there are. */
export function gainIntervalsAtZero(): { atZero: number; total: number } {
  let atZero = 0;
  let total = 0;
  for (const kind of KINDS) {
    for (const fraction of FRACTIONS) {
      const per = raw<{ ci95_low: number; ci95_high: number }[]>("free_riding", `results/${kind}/${fraction}/free_rider_gain/per_seed`);
      for (const s of per) {
        total += 1;
        if (s.ci95_low <= 0 && s.ci95_high >= 0) atZero += 1;
      }
    }
  }
  return { atZero, total };
}

export const readout = {
  evadesNorm: () => raw<boolean>("free_riding", "noise_readout/evades_norm_detection"),
  caughtByCosine: () => raw<boolean>("free_riding", "noise_readout/caught_by_cosine"),
  band: () => m("free_riding", "noise_readout/evasion_band"),
  caughtAuc: () => m("free_riding", "noise_readout/caught_auc"),
};

export const settings = {
  sampleRate: () => m("free_riding", "settings/sample_rate"),
  rounds: () => m("free_riding", "settings/rounds"),
  clipNorm: () => m("free_riding", "settings/clip_norm"),
  seeds: () => raw<number[]>("free_riding", "settings/seeds").length,
  runs: () => m("free_riding", "settings/runs"),
  skipped: () => m("free_riding", "settings/skipped_runs"),
  detectionRounds: () => m("free_riding", "settings/detection_rounds"),
  zeroControlMeasured: () => raw<{ name: string; measured: number; threshold: number; passed: boolean }[]>("free_riding", "controls").find((c) => c.name === "positive_zero_detection"),
};

/** A limitation from the result file, found by a phrase it contains. */
export function limitation(phrase: string): string {
  const found = raw<string[]>("free_riding", "limitations").find((l) => l.includes(phrase));
  if (!found) throw new Error(`results/free_riding.json has no limitation containing "${phrase}"`);
  return found;
}

export const range = (xs: number[]): [number, number] => [Math.min(...xs), Math.max(...xs)];
