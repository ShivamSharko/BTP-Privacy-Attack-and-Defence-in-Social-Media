import { fmt, m, raw } from "../../data";
import { Caption, GroupedBars, H, P, StatRow } from "../../ui";
import { gapMean, overallNdcg, overallRange, SCENARIO_SHORT, trace } from "./measured";
import { SCENARIOS, type Scenario } from "./sim";

const seeds = () => raw<number[]>("participation", "settings/seeds");
const h5 = (path: string) => m("participation", `results/h5/${path}`);
const readout = (path: string) => m("participation", `results/trace_readout/${path}`);
const SHOWN: Scenario[] = ["always", "independent", "trace", "trace_replay"];
const NAME: Partial<Record<Scenario, string>> = {
  always: "always on",
  independent: "random half",
  trace: "device trace",
  trace_replay: "trace replayed",
};

function gapRange(): [number, number] {
  const all = SCENARIOS.flatMap((s) => [gapMean(s, "8"), gapMean(s, "nondp")]);
  return [Math.min(...all), Math.max(...all)];
}

export function BriefPartPanel() {
  const t = trace();
  const [lo, hi] = gapRange();
  return (
    <>
      <H>Realistic availability costs accuracy, but the gap between the most and least active users stays about the same.</H>
      <P>
        A phone trains only when idle, charging and on Wi-Fi. A user joins a round with the sampling rate times their availability as the chance.
        The project compares everyone always on, a random {fmt.pct(m("participation", "settings/availability_mean"), 0)}, a trace of{" "}
        {fmt.int(t.devices)} real devices (free {fmt.pct(t.meanShare, 0)} of the time) and that trace replayed over time.
      </P>
      <P>
        At epsilon 8, NDCG@10 is {fmt.ndcg(overallNdcg("always", "8"))} when everyone is on and {fmt.ndcg(overallNdcg("trace", "8"))} on
        the trace. The gap between the most and least active third runs only from {fmt.ndcg(lo)} to {fmt.ndcg(hi)} in every
        scenario. H5, that correlated availability widens it, is weakly supported.
      </P>
    </>
  );
}

export function BriefPartStage() {
  const bars = (s: Scenario) => {
    const [loP, hiP] = overallRange(s, "8");
    const [loN, hiN] = overallRange(s, "nondp");
    return [
      { name: "non-private", value: overallNdcg(s, "nondp"), lo: loN, hi: hiN, role: "honest" as const },
      { name: "epsilon 8", value: overallNdcg(s, "8"), lo: loP, hi: hiP, role: "protected" as const },
    ];
  };
  const [lo, hi] = gapRange();
  return (
    <>
      <StatRow
        items={[
          { label: "trace minus always, epsilon 8", value: fmt.n(readout("overall_ndcg10/8/trace_minus_always"), 4), role: "protected" },
          { label: "gap between activity thirds", value: `${fmt.ndcg(lo)} to ${fmt.ndcg(hi)}`, role: "attacker" },
          { label: "H5, social, epsilon 8", value: `${h5("social/8/seeds_improved")} of ${h5("social/8/seeds")} seeds`, role: "protected", note: "one cell of four" },
        ]}
      />
      <GroupedBars
        yLabel="NDCG@10"
        format={fmt.ndcg}
        groups={SHOWN.map((s) => ({ label: NAME[s] ?? SCENARIO_SHORT[s], bars: bars(s) }))}
        summary={`NDCG@10 for four availability scenarios, non-private and at epsilon 8. Always on scores ${fmt.ndcg(overallNdcg("always", "nondp"))} and ${fmt.ndcg(overallNdcg("always", "8"))}; the device trace ${fmt.ndcg(overallNdcg("trace", "nondp"))} and ${fmt.ndcg(overallNdcg("trace", "8"))}. Whiskers show the lowest and highest of ${seeds().length} seeds.`}
      />
      <Caption>
        Mean of {seeds().length} seeds with the lowest and highest. One round is assumed to be {trace().secondsPerRound / 60} minutes. H5 holds by the
        sign rule in one cell of four, a small effect with {seeds().length} seeds.
      </Caption>
    </>
  );
}
