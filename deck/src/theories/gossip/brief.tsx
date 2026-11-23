import { fmt, m, raw } from "../../data";
import { Caption, Controls, GroupedBars, H, Note, P, Slider, StatRow } from "../../ui";
import { MAX_DEGREE } from "./sim";
import { useGossip } from "./store";

const NP = "results/by_epsilon/nonprivate";
const E8 = "results/by_epsilon/8.0";
const SEEDS = () => raw<number[]>("gossip", "settings/seeds").length;
const nodes = () => fmt.int(m("gossip", "results/nodes"));
const ratio = () => fmt.n(m("gossip", `${E8}/bytes/gossip_over_federated_total`), 0);

function mb(bytes: number): string {
  return `${fmt.n(bytes / 1e6, 1)} MB`;
}

/* ---------------------------------------------------------------- how gossip works */

export function BriefGossipPanel() {
  const degree = useGossip((s) => s.degree);
  const setDegree = useGossip((s) => s.setDegree);
  const eps = raw<(number | null)[]>("gossip", "settings/epsilons").find((e): e is number => e !== null) ?? Number.NaN;
  const local = m("gossip", `results/by_epsilon/${eps.toFixed(1)}/local_noise_multiplier`);
  return (
    <>
      <H>Gossip has no server: every user averages with a few peers and adds their own noise.</H>
      <P>
        Each light is a user with a model of its own. In a round the user takes a step on their own data, then replaces
        their model with the average of their own and their peers'. Peers are real friends first
        ({fmt.pct(m("gossip", "results/friend_peer_share"), 0)} of slots in the runs), random contacts otherwise.
      </P>
      <P>
        No one may see a raw update, so every node adds noise to its own before sending: {fmt.n(local, 2)} times the
        clip length at epsilon {eps}, on every update, with no sampling to cut the privacy cost.
      </P>
      <Controls>
        <Slider label="Peers per round" value={degree} min={0} max={MAX_DEGREE} step={1} onChange={setDegree} format={(v) => String(v)} />
      </Controls>
    </>
  );
}

/* ---------------------------------------------------------------- what it costs */

export function BriefGossipResultPanel() {
  const gossip8 = m("gossip", `${E8}/gossip_ndcg10/mean`);
  const fed8 = m("gossip", `${E8}/federated_ndcg10/mean`);
  return (
    <>
      <H>At epsilon 8, gossip loses {fmt.pct(m("gossip", "results/h2/relative_gap"), 0)} of the accuracy of server-based training and sends {ratio()} times the bytes.</H>
      <P>
        At epsilon 8 on {nodes()} users, NDCG@10 is {fmt.ndcg(gossip8)} for gossip and {fmt.ndcg(fed8)} for server-based
        training, so H2, a substantial gap at equal epsilon, was supported. Without noise gossip reaches{" "}
        {fmt.pct(m("gossip", "controls/gossip_share_of_federated/ratio"), 0)} of server-based training, so dropping the server has a price of its own.
      </P>
      <P>
        A node sends its model and both Adam moments to every peer, {mb(m("gossip", `${E8}/bytes/gossip_total_per_node`))} over the
        run, against {mb(m("gossip", `${E8}/bytes/federated_total_per_node_expected`))} for a client in server-based training.
      </P>
      <Note tone="warn">
        Both private scores are below MostPopular, {fmt.ndcg(m("gossip", `${E8}/most_popular_ndcg10`))}, on these users.
      </Note>
    </>
  );
}

export function BriefGossipResultStage() {
  const bars = (key: string) => {
    const g = `${key}/gossip_ndcg10`;
    const f = `${key}/federated_ndcg10`;
    return [
      { name: "gossip", value: m("gossip", `${g}/mean`), lo: m("gossip", `${g}/min`), hi: m("gossip", `${g}/max`), role: "honest" as const },
      { name: "server-based", value: m("gossip", `${f}/mean`), lo: m("gossip", `${f}/min`), hi: m("gossip", `${f}/max`), role: "protected" as const },
    ];
  };
  const floor = m("gossip", `${E8}/most_popular_ndcg10`);
  const gossip = m("gossip", `${E8}/bytes/gossip_total_per_node`);
  const federated = m("gossip", `${E8}/bytes/federated_total_per_node_expected`);
  return (
    <>
      <StatRow
        items={[
          { label: "gap at epsilon 8", value: fmt.ndcg(m("gossip", "results/h2/gap_mean")), role: "attacker" },
          { label: "gap without noise", value: fmt.ndcg(m("gossip", `${NP}/gap/mean_over_seeds`)), role: "honest" },
          { label: "bytes, gossip over federated", value: `${ratio()}x`, role: "attacker", note: `${mb(gossip)} against ${mb(federated)} per node` },
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
        summary={`NDCG@10 on ${nodes()} users, mean of ${SEEDS()} seeds with the range of seeds. Without noise gossip scores ${fmt.ndcg(m("gossip", `${NP}/gossip_ndcg10/mean`))} and server-based training ${fmt.ndcg(m("gossip", `${NP}/federated_ndcg10/mean`))}. At epsilon 8 gossip scores ${fmt.ndcg(m("gossip", `${E8}/gossip_ndcg10/mean`))} and server-based ${fmt.ndcg(m("gossip", `${E8}/federated_ndcg10/mean`))}. MostPopular scores ${fmt.ndcg(floor)}.`}
      />
      <Caption>
        Only {nodes()} of the project's users are simulated, so these scores are not on the scale of the full population. Range of {SEEDS()} seeds.
      </Caption>
    </>
  );
}
