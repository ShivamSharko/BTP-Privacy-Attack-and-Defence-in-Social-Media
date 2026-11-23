import { fact, fmt, m, raw } from "../../data";
import { BarChart, Caption, H, Note, P, StatRow } from "../../ui";
import type { Role } from "../../ui";

/* ---------------------------------------------------------------- 4.5 the defence ladder */

/** The margin in hypothesis H3, from PREREGISTRATION.md (Amendment 1, A1.3): the popularity prior plus 0.05 AUC. */
export const H3_MARGIN = Number(fact("h3.margin").value);

/** The two cohort sizes the leakage study summed over, smaller first. */
export const [SMALL, LARGE] = raw<number[]>("update_leakage", "settings/cohort_sizes");
export const TARGETS = m("update_leakage", "settings/n_targets");
/** The server's own noise on the larger sum: the large regime's per-round multiplier for its epsilon-8 run. */
export const DP_Z = m("update_leakage", `results/sum_${LARGE}_dp/noise_multiplier`);
export const DP_EPS = m("update_leakage", `results/sum_${LARGE}_dp/target_epsilon`);

const RUNGS: { key: string; label: string; role: Role }[] = [
  { key: "raw", label: "raw update", role: "honest" },
  { key: "masked", label: "masked update", role: "protected" },
  { key: `sum_${SMALL}`, label: `sum of ${SMALL}`, role: "attacker" },
  { key: `sum_${LARGE}`, label: `sum of ${LARGE}`, role: "attacker" },
  { key: `sum_${LARGE}_dp`, label: `sum of ${LARGE}, server noise`, role: "protected" },
];

export function ladder() {
  return RUNGS.map((r) => {
    const [lo, hi] = raw<[number, number]>("update_leakage", `results/${r.key}/recovery/auc/ci95`);
    return {
      ...r,
      auc: m("update_leakage", `results/${r.key}/recovery/auc/mean`),
      lo,
      hi,
      precision: m("update_leakage", `results/${r.key}/recovery/precision_at_10/mean`),
    };
  });
}

export function priorAuc() {
  return m("update_leakage", `results/sum_${LARGE}/recovery/prior_auc/mean`);
}

const cell = { padding: "3px 10px" } as const;

/** A compact copy of the ladder numbers, small enough to share the panel with the text at 1280 by 720. */
function LadderTable() {
  const rows = ladder();
  const priorP = m("update_leakage", `results/sum_${LARGE}/recovery/prior_precision_at_10/mean`);
  const body = [
    ...rows.map((r) => [r.label, fmt.n(r.auc, 3), fmt.n(r.precision, 4)]),
    ["popularity prior alone", fmt.n(priorAuc(), 3), fmt.n(priorP, 4)],
  ];
  return (
    <table className="table" style={{ fontSize: "0.86em", marginBottom: 0 }}>
      <thead>
        <tr>
          {["Rung", "AUC", "Precision at 10"].map((h) => (
            <th key={h} scope="col" style={cell}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {body.map((row) => (
          <tr key={row[0]}>
            {row.map((c, k) =>
              k === 0 ? (
                <th key={k} scope="row" style={{ ...cell, paddingLeft: 0 }}>
                  {c}
                </th>
              ) : (
                <td key={k} style={cell}>
                  {c}
                </td>
              ),
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function ImpactPanel() {
  const rows = ladder();
  const limit = priorAuc() + H3_MARGIN;
  const byKey = Object.fromEntries(rows.map((r) => [r.key, r]));
  const priorP = m("update_leakage", `results/sum_${LARGE}/recovery/prior_precision_at_10/mean`);
  return (
    <>
      <H>A sum of {LARGE} users still lets the server recover histories: this part of H3 was not met.</H>
      <P>
        H3 says a server seeing only sums of {LARGE} should recover a member's history no better than the popularity
        prior plus {fmt.n(H3_MARGIN, 2)} AUC. The prior scores {fmt.n(priorAuc(), 3)}, so the limit is{" "}
        {fmt.n(limit, 3)}. The sum of {LARGE} scored {fmt.n(byKey[`sum_${LARGE}`].auc, 3)}: not met.
      </P>
      <P>
        One masked update is at chance, {fmt.n(byKey.masked.auc, 3)}. A sum of {SMALL} is nearly as bad as raw. The server&apos;s own noise, {fmt.n(DP_Z, 2)} times the clip norm (the per-round noise of the large regime&apos;s
        epsilon {fmt.n(DP_EPS, 0)} run), brings the sum of {LARGE} to {fmt.n(byKey[`sum_${LARGE}_dp`].auc, 3)}. It is
        added after unmasking, so it protects what is released, not the sum from that server.
      </P>
      <Note tone="warn">
        Precision at 10 for the sum of {LARGE} is {fmt.n(byKey[`sum_${LARGE}`].precision, 4)}, below the prior's{" "}
        {fmt.n(priorP, 4)}. Limits: single local steps at one model state; an honest-but-curious server; a simulated
        secure sum.
      </Note>
      <LadderTable />
    </>
  );
}

export function ImpactStage() {
  const rows = ladder();
  const limit = priorAuc() + H3_MARGIN;
  return (
    <>
      <StatRow
        items={[
          { label: "popularity prior alone", value: fmt.n(priorAuc(), 3), role: "noise", note: "history recovery, AUC" },
          { label: `H3 limit: prior plus ${fmt.n(H3_MARGIN, 2)}`, value: fmt.n(limit, 3), role: "model" },
          { label: `sum of ${LARGE} users`, value: fmt.n(rows[3].auc, 3), role: "attacker", note: "limit exceeded: not met" },
        ]}
      />
      <BarChart
        yLabel="history recovery, AUC"
        format={(v) => fmt.n(v, 3)}
        data={rows.map((r) => ({ label: r.label, value: r.auc, lo: r.lo, hi: r.hi, role: r.role }))}
        threshold={{ value: limit, label: `H3 limit ${fmt.n(limit, 3)}` }}
        summary={`Recovery AUC falls from ${fmt.n(rows[0].auc, 3)} for a raw update to ${fmt.n(rows[1].auc, 3)} when masked, rises to ${fmt.n(rows[2].auc, 3)} for a sum of ${SMALL} and ${fmt.n(rows[3].auc, 3)} for a sum of ${LARGE}, above the H3 limit of ${fmt.n(limit, 3)}, and returns to ${fmt.n(rows[4].auc, 3)} with noise the server adds after unmasking.`}
      />
      <Caption>
        One trained model, one seed. Whiskers are 95% intervals over the {fmt.int(TARGETS)} target users sampled, not
        over training runs.
      </Caption>
      <Caption>
        Friendships: the link attack compares two users' individual updates. On masked updates its AUC is{" "}
        {fmt.n(m("update_leakage", "results/masked/link/auc"), 3)}, against {fmt.n(m("update_leakage", "results/raw/link/auc"), 3)} raw, and a
        sum leaves it no pair to compare.
      </Caption>
    </>
  );
}
