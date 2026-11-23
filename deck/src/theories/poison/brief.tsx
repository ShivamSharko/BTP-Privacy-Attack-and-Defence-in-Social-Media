import { useMemo } from "react";
import { fmt, raw } from "../../data";
import { Choice, Controls, H, Note, P, Readout, Readouts } from "../../ui";
import { at, exposure, F1, F2, F3, ndcg, pct, PEAK, PER_FRACTION } from "./impact";
import { aggregate, honestMean, makePopulation, N_USERS, signalKept, targetPush } from "./sim";
import { type Aggregator, usePoison } from "./store";

const signed = (x: number) => (x >= 0 ? "" : "-") + Math.abs(x).toFixed(2);
const KIND_NAME: Record<Aggregator, string> = { sum: "average", trimmed: "trimmed mean", median: "median" };

/* ---------------------------------------------------------------- brief for poison/1 */

export function BriefAttackPanel() {
  const share = usePoison((s) => s.share);
  const aggregator = usePoison((s) => s.aggregator);
  const setAggregator = usePoison((s) => s.setAggregator);
  const trim = raw<number>("poisoning", "settings/trim_fraction");
  const pop = useMemo(() => makePopulation(N_USERS, share), [share]);
  const agg = aggregate(pop, aggregator, trim);
  return (
    <>
      <H>Fake accounts can push one business, and robust defences need to see every update.</H>
      <P>
        The attackers are existing accounts. All send the largest update the server accepts, aimed at one business. Each
        arrow is one user's update, and together they tilt the average. A secure sum shows the server only the total, so
        it cannot pick the attackers out.
      </P>
      <P>
        A trimmed mean or median cuts the extreme values, but that needs every update in plaintext. On sparse data the
        median is zero for most businesses and erases the honest signal along with the attack.
      </P>
      <Note>
        Committees keep a secure sum inside small groups and take the median of the group totals. One attacker spoils a
        committee.
      </Note>
      <Controls>
        <Choice<Aggregator>
          label="Aggregator"
          value={aggregator}
          onChange={setAggregator}
          options={[
            { value: "sum", label: "average" },
            { value: "trimmed", label: "trimmed mean" },
            { value: "median", label: "median" },
          ]}
        />
        <Readouts>
          <Readout label={`target push, ${KIND_NAME[aggregator]}`} value={signed(targetPush(agg))} role="model" />
          <Readout label="target push, no attackers" value={signed(targetPush(honestMean(pop)))} role="honest" />
          <Readout label="honest signal kept" value={fmt.pct(signalKept(agg, pop), 0)} role="honest" />
        </Readouts>
      </Controls>
    </>
  );
}

/* ---------------------------------------------------------------- brief for poison/5 */

export function BriefExposurePanel() {
  return (
    <>
      <H>
        Under a secure sum, {pct(F1)} attackers put the target in {fmt.pct(exposure("secure_sum_norm_bound", F1))} of
        top-10 lists. Only the trimmed mean and median keep it low.
      </H>
      <P>
        Exposure is the share of other users whose top 10 holds the promoted business. A norm bound alone gives no
        protection: it is {fmt.pct(exposure("secure_sum_norm_bound", F3))} at {pct(F3)}. The trimmed mean allows{" "}
        {fmt.pct(exposure("plaintext_trimmed_mean", F1), 2)} at {pct(F1)} and {fmt.pct(exposure("plaintext_trimmed_mean", F3), 1)} at{" "}
        {pct(F3)}, the median {fmt.pct(exposure("plaintext_median", F3), 0)} at {pct(F3)}.
      </P>
      <P>
        Committees of 4 hold at {pct(F1)} ({fmt.pct(exposure("committee_median_size4", F1), 2)}) and give way at {pct(F2)} (
        {fmt.pct(exposure("committee_median_size4", F2), 0)}), where only{" "}
        {fmt.pct(at("committee_median_size4", F2, "clean_committee_share"), 0)} of committees are clean. Committees of 20
        fail already at {pct(F1)} ({fmt.pct(exposure("committee_median_size20", F1), 0)}).
      </P>
      <Note>No privacy noise in these runs, and the attackers do not adapt to the defence.</Note>
    </>
  );
}

/* ---------------------------------------------------------------- brief for poison/6 */

export function BriefCostPanel() {
  const cleanSum = ndcg("secure_sum_norm_bound", "0.0");
  const cleanTrim = ndcg("plaintext_trimmed_mean", "0.0");
  const cleanMedian = ndcg("plaintext_median", "0.0");
  return (
    <>
      <H>The trimmed mean and median leave an almost useless model, and H4 is not supported as stated.</H>
      <P>
        With no attackers, NDCG@10 is {fmt.ndcg(cleanSum)} under a secure sum, {fmt.ndcg(cleanTrim)} under the trimmed
        mean ({fmt.pct(1 - cleanTrim / cleanSum, 0)} lost) and {fmt.ndcg(cleanMedian)} under the median. Honest updates
        are sparse, so the cut that removes the attack removes most of their signal too.
      </P>
      <P>
        H4 predicted that the trimmed mean beats the secure sum at every attacker share, by the most at the largest
        share. The first part held. The second did not: the gap peaked at {fmt.pct(PER_FRACTION[PEAK].fraction, 0)}, not
        at {pct(F3)}.
      </P>
      <Note tone="warn">
        Committees of 4 cost as much as the median: NDCG@10 {fmt.ndcg(ndcg("committee_median_size4", "0.0"))} with no
        attackers.
      </Note>
    </>
  );
}

