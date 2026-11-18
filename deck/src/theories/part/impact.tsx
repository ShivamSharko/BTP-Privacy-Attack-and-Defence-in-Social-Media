import { fmt, m, raw } from "../../data";
import { BarChart, Caption, Choice, GroupedBars, H, Note, P, StatRow } from "../../ui";
import { degreeGapPerSeed, gapMean, gapPerSeed, overallNdcg, overallRange, SCENARIO_SHORT, trace } from "./measured";
import { SCENARIOS } from "./sim";
import { type Level, usePart } from "./store";

const seeds = () => raw<number[]>("participation", "settings/seeds");
const rounds = () => m("participation", "settings/rounds");
const rate = () => m("participation", "settings/sample_rate");
const readout = (path: string) => m("participation", `results/trace_readout/${path}`);

/* ---------------------------------------------------------------- 11.3 accuracy by scenario */

export function NdcgPanel() {
  const t = trace();
  return (
    <>
      <H>
        Realistic availability costs accuracy: {fmt.ndcg(overallNdcg("trace", "8"))} on the device trace, against{" "}
        {fmt.ndcg(overallNdcg("always", "8"))} with everyone always on.
      </H>
      <P>
        Each figure is the mean NDCG@10 over {seeds().length} seeds, {rounds()} rounds, sampling rate {rate()}. At epsilon
        8, always, independent, trace and trace replay score {fmt.ndcg(overallNdcg("always", "8"))},{" "}
        {fmt.ndcg(overallNdcg("independent", "8"))}, {fmt.ndcg(overallNdcg("trace", "8"))} and{" "}
        {fmt.ndcg(overallNdcg("trace_replay", "8"))}. Without privacy noise: {fmt.ndcg(overallNdcg("always", "nondp"))},{" "}
        {fmt.ndcg(overallNdcg("independent", "nondp"))}, {fmt.ndcg(overallNdcg("trace", "nondp"))} and{" "}
        {fmt.ndcg(overallNdcg("trace_replay", "nondp"))}.
      </P>
      <P>
        Trace devices are free about {fmt.pct(t.meanShare, 0)} of the time, against {fmt.pct(m("participation", "settings/availability_mean"), 0)} in the synthetic scenarios, so
        each round has fewer users. The loss shows with and without noise.
      </P>
      <Note tone="warn">
        The trace comes from a different population of devices, handed to Yelp users at random. One round is taken as{" "}
        {t.secondsPerRound / 60} minutes: an assumption, not a measurement.
      </Note>
    </>
  );
}

const roleOf = (level: Level) => (level === "8" ? ("protected" as const) : ("honest" as const));

function LevelChoice() {
  const level = usePart((s) => s.level);
  const setLevel = usePart((s) => s.setLevel);
  return (
    <Choice<Level>
      label="Result shown"
      value={level}
      onChange={setLevel}
      options={[
        { value: "8", label: "private, epsilon 8" },
        { value: "nondp", label: "non-private" },
      ]}
    />
  );
}

export function NdcgStage() {
  const level = usePart((s) => s.level);
  return (
    <>
      <StatRow
        items={[
          { label: "trace minus always, epsilon 8", value: fmt.n(readout("overall_ndcg10/8/trace_minus_always"), 4), role: "protected" },
          { label: "trace replay minus always, epsilon 8", value: fmt.n(readout("overall_ndcg10/8/trace_replay_minus_always"), 4), role: "protected" },
          { label: "trace minus always, non-private", value: fmt.n(readout("overall_ndcg10/nondp/trace_minus_always"), 4), role: "honest" },
          { label: "trace replay minus always, non-private", value: fmt.n(readout("overall_ndcg10/nondp/trace_replay_minus_always"), 4), role: "honest" },
        ]}
      />
      <LevelChoice />
      <BarChart
        yLabel="NDCG@10"
        format={fmt.ndcg}
        data={SCENARIOS.map((s) => {
          const [lo, hi] = overallRange(s, level);
          return { label: SCENARIO_SHORT[s], value: overallNdcg(s, level), lo, hi, role: roleOf(level) };
        })}
        summary={`NDCG@10 for seven availability scenarios, ${level === "8" ? "private at epsilon 8" : "non-private"}. Always is ${fmt.ndcg(overallNdcg("always", level))}; the device trace is ${fmt.ndcg(overallNdcg("trace", level))}. Whiskers show the lowest and highest seed.`}
      />
      <Caption>
        {seeds().length} seeds; whiskers are the lowest and highest seed. Epsilon is nominal for activity, social and trace tied to
        activity.
      </Caption>
    </>
  );
}

/* ---------------------------------------------------------------- 11.4 the gap between groups */

export function GapPanel() {
  const all = SCENARIOS.flatMap((s) => [gapMean(s, "8"), gapMean(s, "nondp")]);
  return (
    <>
      <H>The gap between activity groups is about the same size in every scenario.</H>
      <P>
        The gap is the mean NDCG@10 of the most active third of users minus that of the least active third. Across all
        seven scenarios and both privacy levels it runs from {fmt.ndcg(Math.min(...all))} to {fmt.ndcg(Math.max(...all))}.
      </P>
      <P>
        So uneven availability is not what creates the gap. It is there when everyone is always available:{" "}
        {fmt.ndcg(gapMean("always", "8"))} with privacy and {fmt.ndcg(gapMean("always", "nondp"))} without.
      </P>
      <Note>Each bar is the mean over {seeds().length} seeds; the whisker runs from the smallest to the largest seed.</Note>
    </>
  );
}

export function GapStage() {
  const level = usePart((s) => s.level);
  return (
    <>
      <LevelChoice />
      <BarChart
        yLabel="gap in NDCG@10"
        format={fmt.ndcg}
        data={SCENARIOS.map((s) => {
          const per = gapPerSeed(s, level);
          return { label: SCENARIO_SHORT[s], value: gapMean(s, level), lo: Math.min(...per), hi: Math.max(...per), role: roleOf(level) };
        })}
        summary={`Gap in NDCG@10 between the most and least active third for seven scenarios, ${level === "8" ? "private at epsilon 8" : "non-private"}. Always: ${fmt.ndcg(gapMean("always", level))}. Independent: ${fmt.ndcg(gapMean("independent", level))}. Whiskers span the ${seeds().length} seeds.`}
      />
    </>
  );
}

/* ---------------------------------------------------------------- 11.5 hypothesis H5 */

const h5 = (path: string) => m("participation", `results/h5/${path}`);

export function H5Panel() {
  const holdsActivity = raw<boolean>("participation", "results/h5/holds_activity");
  const holdsSocial = raw<boolean>("participation", "results/h5/holds_social");
  return (
    <>
      <H>H5 is weakly supported: one correlated scenario widened the gap in every seed.</H>
      <P>
        H5 says availability tied to activity, or to the number of friends, makes the gap between groups larger than
        independent availability does. The rule fixed in advance: it holds if, for at least one such scenario at either
        privacy level, every seed has a larger gap than under independent availability.
      </P>
      <P>
        The social scenario did, at epsilon 8: {h5("social/8/seeds_improved")} of {h5("social/8/seeds")} seeds, by{" "}
        {fmt.n(h5("social/8/mean_difference"), 4)} on average. The activity scenario did not: {h5("activity/8/seeds_improved")} of{" "}
        {h5("activity/8/seeds")}. The effect is small, and {seeds().length} seeds cannot give a two-sided p below{" "}
        {fmt.n(h5("social/8/min_possible_two_sided_p"), 4)}.
      </P>
      <Note tone="warn">
        Holds for social: {String(holdsSocial)}. Holds for activity: {String(holdsActivity)}. Matching trace devices to
        activity did not widen the gap in every seed either (
        {readout("rank_matching_widens_activity_gap/8/seeds_improved")} of {readout("rank_matching_widens_activity_gap/8/seeds")});
        that check is not part of H5.
      </Note>
    </>
  );
}

export function H5Stage() {
  const names = seeds();
  const independentDegree = degreeGapPerSeed("independent", "8");
  const independentActivity = gapPerSeed("independent", "8");
  const social = degreeGapPerSeed("social", "8").map((v, i) => v - independentDegree[i]);
  const activity = gapPerSeed("activity", "8").map((v, i) => v - independentActivity[i]);
  return (
    <>
      <StatRow
        items={[
          {
            label: "social: seeds with a larger gap",
            value: `${h5("social/8/seeds_improved")} of ${h5("social/8/seeds")}`,
            role: "protected",
            note: "epsilon 8, friend-count groups",
          },
          {
            label: "activity: seeds with a larger gap",
            value: `${h5("activity/8/seeds_improved")} of ${h5("activity/8/seeds")}`,
            role: "protected",
            note: "epsilon 8, activity groups",
          },
          { label: "sign test, social, all seeds larger", value: fmt.n(h5("social/8/sign_test_p_all_improved"), 4), note: "one-sided p" },
        ]}
      />
      <GroupedBars
        yLabel="gap minus gap under independent"
        format={(v) => fmt.n(v, 4)}
        groups={names.map((seed, i) => ({
          label: `seed ${seed}`,
          bars: [
            { name: "social, friend-count groups", role: "protected", value: social[i] },
            { name: "activity, activity groups", role: "model", value: activity[i] },
          ],
        }))}
        summary={`For each of ${names.length} seeds, the gap under a correlated scenario minus the gap under independent availability, at epsilon 8. Social is above zero in ${h5("social/8/seeds_improved")} of ${names.length} seeds; activity is above zero in ${h5("activity/8/seeds_improved")}.`}
      />
      <Caption>Above zero means the correlated scenario had the larger gap in that seed.</Caption>
    </>
  );
}
