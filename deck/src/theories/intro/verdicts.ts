import { fmt, m, raw } from "../../data";

/**
 * The five pre-registered hypotheses and their verdicts, derived from the result files.
 * Where a file exports a boolean verdict it is used; where it does not, the decision rule of
 * PREREGISTRATION.md (Amendment 1, A1.3) is applied to the exported numbers, and `derivedFrom`
 * says so.
 */

export type Tone = "for" | "against" | "mixed";

export interface Hypothesis {
  id: string;
  /** The hypothesis in one plain sentence. */
  statement: string;
  verdict: string;
  tone: Tone;
  /** The measured figures behind the verdict. */
  evidence: string;
  /** Exported fields the verdict comes from. */
  derivedFrom: string;
  /** Concepts that hold the evidence. */
  links: { id: string; label: string }[];
}

const yes = (b: boolean) => (b ? "yes" : "no");

/* ---------------------------------------------------------------- H1 */
const h1 = (regime: "large" | "small") => ({
  met: raw<boolean>("privacy_utility", `summary/${regime}/h1/met`),
  retention: m("privacy_utility", `summary/${regime}/h1/retention`),
});
const H1_LARGE = h1("large");
const H1_SMALL = h1("small");
const H1_THRESHOLD = m("privacy_utility", "summary/large/h1/threshold");
const H1_EPS = m("privacy_utility", "summary/large/h1/epsilon");

/* ---------------------------------------------------------------- H2 */
const H2_CI = raw<number[]>("gossip", "results/h2/gap_ci95");
const H2_GAP = m("gossip", "results/h2/gap_mean");
const H2_EPS = m("gossip", "results/h2/epsilon");
/** A1.3: the 95% interval of (federated minus gossip) excludes 0. gossip.json exports no boolean. */
const H2_HOLDS = H2_CI[0] > 0;

/* ---------------------------------------------------------------- H3 */
const H3_MIA_HOLDS = raw<boolean>("membership", "results/hypotheses/H3/holds");
const H3_TPR = m("membership", "results/hypotheses/H3/mean_tpr_at_1pct_fpr");
const H3_STATEMENT = raw<string>("membership", "results/hypotheses/H3/statement");
const H3_LIMIT = Number(/<=\s*([\d.]+)/.exec(H3_STATEMENT)?.[1] ?? Number.NaN);
const H3_EPS = Number(/epsilon\s*=\s*([\d.]+)/.exec(H3_STATEMENT)?.[1] ?? Number.NaN);
const H3_COHORT = raw<number[]>("update_leakage", "settings/cohort_sizes").at(-1) ?? Number.NaN;
const H3_SUM_AUC = m("update_leakage", "results/sum_100/recovery/auc/mean");
const H3_PRIOR_AUC = m("update_leakage", "results/sum_100/recovery/prior_auc/mean");
/**
 * The secure-sum part of H3 has no exported verdict and its margin over the prior is not in
 * update_leakage.json. The verdict is the wording of README.md, section 2: "the secure-sum part
 * misses its threshold".
 */
export const H3_SUM_HELD_FROM_README = false;

/* ---------------------------------------------------------------- H4 */
const H4_HOLDS = raw<boolean>("poisoning", "h4/holds");
const H4_LOWER = raw<boolean>("poisoning", "h4/lower_at_every_share");
const H4_LARGEST = raw<boolean>("poisoning", "h4/gap_largest_at_max_share");
const H4_SHARES = raw<{ fraction: number }[]>("poisoning", "h4/per_fraction").map((f) => f.fraction);

/* ---------------------------------------------------------------- H5 */
const H5_HOLDS = raw<boolean>("participation", "results/h5/holds");
type Cell = { all_seeds_improved: boolean; mean_difference: number; seeds: number };
const H5_CELLS: { name: string; cell: Cell }[] = (["activity", "social"] as const).flatMap((scenario) =>
  Object.entries(raw<Record<string, Cell>>("participation", `results/h5/${scenario}`)).map(([level, cell]) => ({
    name: `${scenario === "social" ? "friend count" : "activity"}, ${level === "nondp" ? "no privacy" : `ε ${level}`}`,
    cell,
  })),
);
const H5_HELD = H5_CELLS.filter((c) => c.cell.all_seeds_improved);

function verdictH1(): Pick<Hypothesis, "verdict" | "tone"> {
  if (H1_LARGE.met && H1_SMALL.met) return { verdict: "supported", tone: "for" };
  if (!H1_LARGE.met && !H1_SMALL.met) return { verdict: "not supported", tone: "against" };
  return { verdict: "split", tone: "mixed" };
}

function verdictH3(): Pick<Hypothesis, "verdict" | "tone"> {
  if (H3_MIA_HOLDS && H3_SUM_HELD_FROM_README) return { verdict: "supported", tone: "for" };
  if (!H3_MIA_HOLDS && !H3_SUM_HELD_FROM_README) return { verdict: "not supported", tone: "against" };
  return { verdict: "split", tone: "mixed" };
}

function verdictH4(): Pick<Hypothesis, "verdict" | "tone"> {
  if (H4_HOLDS) return { verdict: "supported", tone: "for" };
  return { verdict: H4_LOWER ? "not supported as stated" : "not supported", tone: "against" };
}

function verdictH5(): Pick<Hypothesis, "verdict" | "tone"> {
  if (!H5_HOLDS) return { verdict: "not supported", tone: "against" };
  return H5_HELD.length * 2 < H5_CELLS.length ? { verdict: "weakly supported", tone: "mixed" } : { verdict: "supported", tone: "for" };
}

export const HYPOTHESES: Hypothesis[] = [
  {
    id: "H1",
    statement: `At ε = ${H1_EPS}, the private model keeps at least ${fmt.pct(H1_THRESHOLD, 0)} of the accuracy of the same model without privacy, in both cohort regimes.`,
    ...verdictH1(),
    evidence: `It keeps ${fmt.pct(H1_LARGE.retention, 0)} with large cohorts and ${fmt.pct(H1_SMALL.retention, 0)} with small ones.`,
    derivedFrom: "privacy_utility.json summary/<regime>/h1/met",
    links: [{ id: "dp", label: "Differential privacy" }],
  },
  {
    id: "H2",
    statement: `Gossip between friends with local privacy is less accurate than server-based training with central privacy, both at ε = ${H2_EPS}.`,
    verdict: H2_HOLDS ? "supported" : "not supported",
    tone: H2_HOLDS ? "for" : "against",
    evidence: `Server-based is better by ${fmt.n(H2_GAP, 4)} NDCG@10; the 95% interval, ${fmt.n(H2_CI[0], 4)} to ${fmt.n(H2_CI[1], 4)}, excludes zero.`,
    derivedFrom: "gossip.json results/h2/gap_ci95 (no boolean is exported; the A1.3 rule is applied)",
    links: [{ id: "gossip", label: "Gossip learning" }],
  },
  {
    id: "H3",
    statement: `At ε = ${H3_EPS}, membership inference finds at most ${fmt.pct(H3_LIMIT, 0)} of members at 1% false positives, and a server seeing only sums of ${H3_COHORT} users learns a member's history barely better than popularity does.`,
    ...verdictH3(),
    evidence: `Membership part held: ${fmt.pct(H3_TPR, 1)} found. Sum part missed its threshold: history AUC ${fmt.n(H3_SUM_AUC, 3)} against ${fmt.n(H3_PRIOR_AUC, 3)} for popularity.`,
    derivedFrom: "membership.json results/hypotheses/H3/holds; the sum part from README.md wording (no exported field)",
    links: [
      { id: "mia", label: "Membership inference" },
      { id: "secagg", label: "Secure sum" },
    ],
  },
  {
    id: "H4",
    statement: `With ${H4_SHARES.map((s) => fmt.pct(s, 0)).join(", ")} malicious accounts, trimmed-mean aggregation exposes a promoted item less than the secure sum does, and the gap is largest at the largest share.`,
    ...verdictH4(),
    evidence: `Lower at every share: ${yes(H4_LOWER)}. Gap largest at the largest share: ${yes(H4_LARGEST)}. The trimmed mean also wrecks the model.`,
    derivedFrom: "poisoning.json h4/holds, lower_at_every_share, gap_largest_at_max_share",
    links: [{ id: "poison", label: "Poisoning" }],
  },
  {
    id: "H5",
    statement: "When availability follows activity or friend count, the accuracy gap between the best- and worst-served users is wider than when it is random.",
    ...verdictH5(),
    evidence: `Wider in every seed in ${H5_HELD.length} of ${H5_CELLS.length} cells (${H5_HELD.map((c) => `${c.name}, by ${fmt.n(c.cell.mean_difference, 4)}`).join("; ")}).`,
    derivedFrom: "participation.json results/h5/holds and the all_seeds_improved flag of each cell",
    links: [{ id: "part", label: "Who takes part" }],
  },
];

const WORDS = ["no", "one", "two", "three", "four", "five"];
/** "two" for 2; digits past five. */
export const word = (x: number) => WORDS[x] ?? String(x);

/** Figures the panel text quotes. */
export const FIGURES = { h1Epsilon: H1_EPS, h3Cohort: H3_COHORT, h5Held: H5_HELD.length, h5Cells: H5_CELLS.length };

export const AGAINST = HYPOTHESES.filter((h) => h.tone === "against");
