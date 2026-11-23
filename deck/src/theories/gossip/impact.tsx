import { fmt, m, raw } from "../../data";
import { BarChart, GroupedBars, H, Note, P, StatRow } from "../../ui";

const NP = "results/by_epsilon/nonprivate";
const E8 = "results/by_epsilon/8.0";
const SEEDS = raw<number[]>("gossip", "settings/seeds").length;

function mb(bytes: number): string {
  return `${fmt.n(bytes / 1e6, 1)} MB`;
}

/* ---------------------------------------------------------------- 10.4 accuracy and H2 */

export function AccuracyPanel() {
  const gossip8 = m("gossip", `${E8}/gossip_ndcg10/mean`);
  const fed8 = m("gossip", `${E8}/federated_ndcg10/mean`);
  return (
    <>
      <H>At epsilon 8, gossip keeps about {fmt.pct(gossip8 / fed8, 0)} of the federated accuracy, and H2 was supported.</H>
      <P>
        H2 claimed that gossip with local differential privacy shows a substantial utility gap against federated
        training with central privacy, at equal epsilon. At epsilon 8 on {fmt.int(m("gossip", "results/nodes"))} users and{" "}
        {SEEDS} seeds, NDCG@10 is {fmt.ndcg(gossip8)} for gossip and {fmt.ndcg(fed8)} for
        federated: gossip loses {fmt.pct(m("gossip", "results/h2/relative_gap"), 0)} of the federated score. In the one seed with a
        per-node interval the gap is {fmt.ndcg(m("gossip", "results/h2/gap_mean"))}, 95% interval{" "}
        {fmt.ndcg(m("gossip", "results/h2/gap_ci95/0"))} to {fmt.ndcg(m("gossip", "results/h2/gap_ci95/1"))}, which excludes zero.
      </P>
      <P>
        Without privacy noise gossip still reaches {fmt.pct(m("gossip", "controls/gossip_share_of_federated/ratio"), 0)} of
        federated: removing the server alone has a price.
      </P>
      <Note tone="warn">
        Both private scores are below the MostPopular baseline, {fmt.ndcg(m("gossip", `${E8}/most_popular_ndcg10`))}. Averaged over
        seeds the gap is {fmt.ndcg(m("gossip", `${E8}/gap/mean_over_seeds`))}.
      </Note>
    </>
  );
}

export function AccuracyStage() {
  const bars = (key: string) => {
    const g = `${key}/gossip_ndcg10`;
    const f = `${key}/federated_ndcg10`;
    return [
      { name: "gossip", value: m("gossip", `${g}/mean`), lo: m("gossip", `${g}/min`), hi: m("gossip", `${g}/max`), role: "honest" as const },
      { name: "federated", value: m("gossip", `${f}/mean`), lo: m("gossip", `${f}/min`), hi: m("gossip", `${f}/max`), role: "protected" as const },
    ];
  };
  const floor = m("gossip", `${E8}/most_popular_ndcg10`);
  const gap = m("gossip", "results/h2/gap_mean");
  const lo = m("gossip", "results/h2/gap_ci95/0");
  const hi = m("gossip", "results/h2/gap_ci95/1");
  return (
    <>
      <StatRow
        items={[
          { label: "gap at epsilon 8", value: fmt.ndcg(gap), role: "attacker", note: `95% interval ${fmt.ndcg(lo)} to ${fmt.ndcg(hi)}, over nodes, seed 0` },
          { label: "gap without noise", value: fmt.ndcg(m("gossip", `${NP}/gap/mean_over_seeds`)), role: "honest", note: `mean over ${SEEDS} seeds` },
          { label: "gossip, epsilon 8", value: fmt.ndcg(m("gossip", `${E8}/gossip_ndcg10/mean`)), role: "honest" },
          { label: "federated, epsilon 8", value: fmt.ndcg(m("gossip", `${E8}/federated_ndcg10/mean`)), role: "protected" },
        ]}
      />
      <GroupedBars
        yLabel="NDCG@10"
        format={(v) => v.toFixed(3)}
        threshold={{ value: floor, label: "MostPopular" }}
        groups={[
          { label: "no privacy noise", bars: bars(NP) },
          { label: "epsilon 8", bars: bars(E8) },
        ]}
        summary={`NDCG@10 on ${m("gossip", "results/nodes")} users, mean of ${SEEDS} seeds with the range of seeds. Without privacy noise gossip scores ${fmt.ndcg(m("gossip", `${NP}/gossip_ndcg10/mean`))} and federated ${fmt.ndcg(m("gossip", `${NP}/federated_ndcg10/mean`))}. At epsilon 8 gossip scores ${fmt.ndcg(m("gossip", `${E8}/gossip_ndcg10/mean`))} and federated ${fmt.ndcg(m("gossip", `${E8}/federated_ndcg10/mean`))}. The MostPopular baseline is ${fmt.ndcg(floor)}.`}
      />
    </>
  );
}

/* ---------------------------------------------------------------- 10.5 bytes and limits */

export function CostPanel() {
  const parameters = m("gossip", `${E8}/bytes/parameters`);
  const perRound = m("gossip", `${E8}/bytes/gossip_per_node_per_round`);
  const vectors = Math.round(perRound / (parameters * 4));
  const uploads = Math.round(m("gossip", `${E8}/bytes/federated_total_per_node_expected`) / m("gossip", `${E8}/bytes/federated_upload_per_participation`));
  return (
    <>
      <H>Without a server, each node sends {fmt.n(m("gossip", `${E8}/bytes/gossip_over_federated_total`), 0)} times the bytes a federated client does.</H>
      <P>
        Each round a node sends its model and both Adam moments to each of its {m("gossip", "settings/degree")} peers: {vectors}{" "}
        vectors of {fmt.int(parameters)} numbers. Over {m("gossip", "settings/rounds")} rounds that is{" "}
        {mb(m("gossip", `${E8}/bytes/gossip_total_per_node`))}. A federated client uploads one vector when it is sampled,
        about {uploads} times in {m("gossip", "settings/federated_rounds")} rounds: {mb(m("gossip", `${E8}/bytes/federated_total_per_node_expected`))}.
      </P>
      <Note tone="warn">
        Limits: {fmt.int(m("gossip", "results/nodes"))} of the {fmt.int(m("dataset_card", "users"))} users are simulated, so each has fewer real
        friends than on the full platform. Rounds are synchronous. Only {SEEDS} seeds were run. The epsilon is per node, and
        the optimiser and learning rate were chosen on validation data that epsilon does not cover.
      </Note>
    </>
  );
}

export function CostStage() {
  const gossip = m("gossip", `${E8}/bytes/gossip_total_per_node`);
  const federated = m("gossip", `${E8}/bytes/federated_total_per_node_expected`);
  return (
    <>
      <StatRow
        items={[
          { label: "gossip, per node over the run", value: mb(gossip), role: "honest" },
          { label: "federated, per node over the run", value: mb(federated), role: "protected", note: "expected, sampling rate times uploads" },
          { label: "gossip over federated", value: `${fmt.n(m("gossip", `${E8}/bytes/gossip_over_federated_total`), 0)}x`, role: "attacker" },
          { label: "gossip, per round", value: mb(m("gossip", `${E8}/bytes/gossip_per_node_per_round`)), note: "model and two moments, all peers" },
        ]}
      />
      <BarChart
        yLabel="MB per node"
        format={(v) => `${v < 100 ? v.toFixed(1) : v.toFixed(0)} MB`}
        data={[
          { label: "gossip", value: gossip / 1e6, role: "honest", note: `${m("gossip", "settings/rounds")} rounds, ${m("gossip", "settings/degree")} peers` },
          { label: "federated", value: federated / 1e6, role: "protected", note: "one upload each time it is sampled" },
        ]}
        summary={`Over one run a gossip node sends ${mb(gossip)} and a federated client ${mb(federated)}, ${fmt.n(m("gossip", `${E8}/bytes/gossip_over_federated_total`), 0)} times less.`}
      />
    </>
  );
}
