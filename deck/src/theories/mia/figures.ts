import { m, raw } from "../../data";

/** The three privacy settings the membership experiment attacked, in the order shown. */
export type LevelKey = "nondp" | "eps8" | "eps1";
export const LEVELS: LevelKey[] = ["nondp", "eps8", "eps1"];

export const LEVEL_NAME: Record<LevelKey, string> = {
  nondp: "Non-private",
  eps8: "Epsilon 8",
  eps1: "Epsilon 1",
};

export type Metric = "auc" | "tpr_at_1pct_fpr" | "raw_auc" | "raw_tpr_at_1pct_fpr" | "epsilon_lower_bound";

export interface Spread {
  mean: number;
  /** Lowest and highest value over the target seeds. */
  lo: number;
  hi: number;
}

/** Mean and seed range of one metric at one privacy setting, straight from results/membership.json. */
export function level(key: LevelKey, metric: Metric): Spread {
  const base = `results/levels/${key}/aggregate/${metric}`;
  return {
    mean: m("membership", `${base}/mean`),
    lo: m("membership", `${base}/min`),
    hi: m("membership", `${base}/max`),
  };
}

/** The epsilon the accountant reported for the setting, or null where the model has no guarantee. */
export function claimed(key: LevelKey): number | null {
  return raw<number | null>("membership", `results/levels/${key}/claimed_epsilon`);
}

export interface ControlFigures {
  overfitAuc: number;
  overfitTpr: number;
  overfitBound: number;
  independentAuc: number;
  overfitPassed: boolean;
  independentPassed: boolean;
  minTpr: number;
  minAuc: number;
  tolerance: number;
}

export function controls(): ControlFigures {
  return {
    overfitAuc: m("membership", "controls/positive_overfit/values/auc"),
    overfitTpr: m("membership", "controls/positive_overfit/values/tpr_at_1pct_fpr"),
    overfitBound: m("membership", "results/controls_detail/overfit/epsilon_lower_bound"),
    independentAuc: m("membership", "controls/negative_independent/values/auc"),
    overfitPassed: raw<boolean>("membership", "controls/positive_overfit/passed"),
    independentPassed: raw<boolean>("membership", "controls/negative_independent/passed"),
    minTpr: m("membership", "controls/positive_overfit/threshold/tpr_at_1pct_fpr_min"),
    minAuc: m("membership", "controls/positive_overfit/threshold/auc_min"),
    tolerance: m("membership", "controls/negative_independent/threshold/tolerance"),
  };
}

export const settings = {
  users: () => m("membership", "settings/n_users"),
  members: () => m("membership", "settings/n_members_per_target"),
  seeds: () => raw<number[]>("membership", "settings/target_seeds").length,
  references: () => m("membership", "settings/n_reference"),
  overfitFactor: () => m("membership", "settings/overfit_factor"),
  delta: () => m("membership", "settings/delta"),
  nonMembers: () => m("membership", "results/controls_detail/overfit/n_nonmembers"),
};

/** The membership limit of hypothesis H3, parsed from the statement stored with its verdict ("tpr_at_1pct_fpr <= x"). */
export function h3Limit(): number {
  const statement = raw<string>("membership", "results/hypotheses/H3/statement");
  const match = /<=\s*([\d.]+)/.exec(statement);
  if (!match) throw new Error(`membership.json H3 statement has no limit: "${statement}"`);
  return Number(match[1]);
}
