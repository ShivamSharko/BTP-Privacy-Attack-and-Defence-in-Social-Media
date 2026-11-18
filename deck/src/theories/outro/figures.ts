import { fmt, m, raw } from "../../data";
import { type LevelIn, type ModeIn, tradeoffPoints, type TradeoffPoint } from "./sim";

/* Every measured figure the closing slides use, read once from the result files. */

const LEVELS = ["nondp", "eps1", "eps2", "eps4", "eps8", "eps16"] as const;
const REGIMES = ["large", "small"] as const;
export const MODES = [
  { id: "secure_sum_norm_bound", label: "secure sum" },
  { id: "plaintext_trimmed_mean", label: "trimmed mean" },
  { id: "plaintext_median", label: "median" },
  { id: "committee_median_size4", label: "committees of 4" },
  { id: "committee_median_size20", label: "committees of 20" },
] as const;
/** The attacker share at which the poisoning points are taken. */
export const ATTACK_SHARE = "0.1";

const levels: LevelIn[] = REGIMES.flatMap((regime) =>
  LEVELS.map((level) => {
    const base = `summary/${regime}/levels/${level}`;
    const epsilon = level === "nondp" ? null : m("privacy_utility", `${base}/epsilon_of_record`);
    return {
      id: `${regime}-${level}`,
      label: `${regime} cohorts, ${epsilon === null ? "no noise" : `ε ${fmt.n(epsilon, 0)}`}`,
      regime,
      epsilon,
      ndcg: m("privacy_utility", `${base}/ndcg@10_mean`),
    };
  }),
);

const modes: ModeIn[] = MODES.map(({ id, label }) => ({
  id,
  label: `${label}, ${fmt.pct(Number(ATTACK_SHARE), 0)} attackers`,
  ndcg: m("poisoning", `results/${id}/${ATTACK_SHARE}/ndcg/mean`),
  exposure: m("poisoning", `results/${id}/${ATTACK_SHARE}/exposure/mean`),
}));

export const GOSSIP_EPS = "8.0";
const gossip = {
  ndcg: m("gossip", `results/by_epsilon/${GOSSIP_EPS}/gossip_ndcg10/mean`),
  epsilon: m("gossip", `results/by_epsilon/${GOSSIP_EPS}/epsilon_claimed/gossip_local`),
};

export const POINTS: TradeoffPoint[] = tradeoffPoints({ levels, modes, gossip });
/** Gossip's label rounds its epsilon like the others. */
for (const p of POINTS) if (p.group === "gossip") p.label = `gossip, local ε ${fmt.n(gossip.epsilon, 0)}`;

export const GROUP_ROLE = { dp: "protected", poison: "attacker", gossip: "noise" } as const;
export const GROUP_NAME = { dp: "privacy and utility", poison: "poisoning defences", gossip: "gossip" } as const;
export const GROUP_CONCEPT = { dp: "user-level differential privacy", poison: "poisoning", gossip: "gossip learning" } as const;

export const pointById = (id: string | null): TradeoffPoint | undefined => POINTS.find((p) => p.id === id);

/** Settings of the experiments behind the points, which differ between files. */
export const SETTINGS = {
  poisonRounds: raw<number>("poisoning", "settings/rounds"),
  poisonRate: raw<number>("poisoning", "settings/sample_rate"),
  poisonSeeds: raw<number[]>("poisoning", "settings/seeds").length,
  gossipNodes: raw<number>("gossip", "results/nodes"),
  delta: m("gossip", `results/by_epsilon/${GOSSIP_EPS}/epsilon_claimed/delta`),
};

/* ---------------------------------------------------------------- failure-mode replays */

export const REPLAY = {
  cohort: {
    rate: m("privacy_utility", "frozen/regimes/small/sample_rate"),
    rounds: m("privacy_utility", "frozen/regimes/small/rounds"),
    amplified: m("privacy_utility", "summary/small/levels/eps8/epsilon_of_record"),
    unamplified: m("privacy_utility", "summary/small/levels/eps8/epsilon_unamplified"),
    noise: m("privacy_utility", "summary/small/levels/eps8/noise_multiplier"),
  },
  robust: {
    sum: m("poisoning", "results/secure_sum_norm_bound/0.0/ndcg/mean"),
    trimmed: m("poisoning", "results/plaintext_trimmed_mean/0.0/ndcg/mean"),
    median: m("poisoning", "results/plaintext_median/0.0/ndcg/mean"),
  },
  gossip: {
    federated: m("gossip", `results/by_epsilon/${GOSSIP_EPS}/federated_ndcg10/mean`),
    gossip: m("gossip", `results/by_epsilon/${GOSSIP_EPS}/gossip_ndcg10/mean`),
    popular: m("gossip", `results/by_epsilon/${GOSSIP_EPS}/most_popular_ndcg10`),
    noise: m("gossip", `results/by_epsilon/${GOSSIP_EPS}/local_noise_multiplier`),
    epsilon: gossip.epsilon,
  },
  ledger: {
    budget: m("ledger_audit", "results/blocked_release_demo/budget_epsilon"),
    released: m("ledger_audit", "results/blocked_release_demo/epsilon_released"),
    asked: m("ledger_audit", "results/blocked_release_demo/rounds_asked"),
    allowed: m("ledger_audit", "results/blocked_release_demo/rounds_allowed"),
    completed: m("ledger_audit", "results/blocked_release_demo/rounds_completed"),
    refusals: m("ledger_audit", "results/blocked_release_demo/refusal_receipts"),
  },
};
