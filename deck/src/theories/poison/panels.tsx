import { useMemo } from "react";
import { fmt, m, raw } from "../../data";
import { Button, Buttons, Choice, Controls, H, Note, P, Readout, Readouts, Slider } from "../../ui";
import {
  aggregate,
  attackerCount,
  cleanCommitteeShare,
  committeeMedian,
  coordinateMedian,
  dealCommittees,
  honestMean,
  makePopulation,
  N_USERS,
  realisedCleanShare,
  signalKept,
  SEED,
  sumMean,
  targetPush,
  trimmedMean,
} from "./sim";
import { type Aggregator, usePoison, type View } from "./store";

const signed = (x: number) => (x >= 0 ? "" : "-") + Math.abs(x).toFixed(2);

/** The smallest non-zero attacker share measured, and the user count it is a share of (poisoning.json settings). */
const SMALLEST_SHARE = Math.min(...raw<number[]>("poisoning", "settings/fractions").filter((f) => f > 0));
const POISON_USERS = m("poisoning", "settings/users");

/* ---------------------------------------------------------------- 8.1 the attack */

export function AttackPanel() {
  const share = usePoison((s) => s.share);
  const view = usePoison((s) => s.view);
  const setShare = usePoison((s) => s.setShare);
  const setView = usePoison((s) => s.setView);
  const pop = useMemo(() => makePopulation(N_USERS, share), [share]);
  return (
    <>
      <H>
        Taking over {fmt.pct(SMALLEST_SHARE, 0)} of accounts pushes one business into most users' top 10, and a secure
        sum hides the attackers.
      </H>
      <P>
        Each arrow is one user's update to the model, drawn in three dimensions: the horizontal axis is the target
        business, the other two are other businesses. Honest updates are small and sparse, so most of their
        coordinates are zero. The attackers are existing accounts, {fmt.int(Math.round(SMALLEST_SHARE * POISON_USERS))}{" "}
        of {fmt.int(POISON_USERS)} at the smallest share measured, and all send the same thing: the largest update the norm bound allows,
        pointing straight at the target.
      </P>
      <P>
        No single update looks large, yet together they tilt the average: drag the slider and watch the model's arrow
        lean.
      </P>
      <Note>
        Under a secure sum the server receives only the total. Switch the view to see what it can inspect: masked
        updates that look like noise, honest and malicious alike. It cannot tell attackers apart, so it cannot remove them.
      </Note>
      <Controls>
        <Slider label="Share of attackers" value={share} min={0} max={0.3} step={0.01} onChange={setShare} format={(v) => fmt.pct(v, 0)} />
        <Choice<View>
          label="What the server sees"
          value={view}
          onChange={setView}
          options={[
            { value: "plaintext", label: "every update" },
            { value: "secure", label: "only the secure sum" },
          ]}
        />
        <Readouts>
          <Readout label={`attackers among ${N_USERS}`} value={String(pop.nAttackers)} role="attacker" />
          <Readout label="target push, average" value={signed(targetPush(sumMean(pop)))} role="model" />
          <Readout label="target push, no attackers" value={signed(targetPush(honestMean(pop)))} role="honest" />
        </Readouts>
      </Controls>
    </>
  );
}

/* ---------------------------------------------------------------- 8.2 robust aggregation */

const KIND_NAME: Record<Aggregator, string> = { sum: "average", trimmed: "trimmed mean", median: "median" };

export function RobustPanel() {
  const share = usePoison((s) => s.share);
  const aggregator = usePoison((s) => s.aggregator);
  const setShare = usePoison((s) => s.setShare);
  const setAggregator = usePoison((s) => s.setAggregator);
  const trim = raw<number>("poisoning", "settings/trim_fraction");
  const pop = useMemo(() => makePopulation(N_USERS, share), [share]);
  const agg = aggregate(pop, aggregator, trim);
  return (
    <>
      <H>A robust aggregator ignores the extremes, but to find them it must see every update.</H>
      <P>
        Take each coordinate on its own. The trimmed mean sorts the values, cuts the lowest and highest{" "}
        {fmt.pct(trim, 0)}, and averages the rest. The median takes the middle value. Attackers all sit at one end,
        so they are cut off or outvoted.
      </P>
      <P>
        Sorting needs the individual updates in plaintext. That gives up the secure sum, whose whole purpose is to
        hide them. The project's robust runs also add no privacy noise, so no privacy guarantee comes with them.
      </P>
      <Note tone="warn">Look at the honest arrow too: the robust aggregates lose it as well.</Note>
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
        <Slider label="Share of attackers" value={share} min={0} max={0.3} step={0.01} onChange={setShare} format={(v) => fmt.pct(v, 0)} />
        <Readouts>
          <Readout label={`target push, ${KIND_NAME[aggregator]}`} value={signed(targetPush(agg))} role="model" />
          <Readout label="honest signal kept" value={fmt.pct(signalKept(agg, pop), 0)} role="honest" />
        </Readouts>
      </Controls>
    </>
  );
}

/* ---------------------------------------------------------------- 8.3 why the median erases a sparse signal */

export function SparsePanel() {
  const share = usePoison((s) => s.share);
  const coord = usePoison((s) => s.coord);
  const setShare = usePoison((s) => s.setShare);
  const setCoord = usePoison((s) => s.setCoord);
  const trim = raw<number>("poisoning", "settings/trim_fraction");
  const pop = useMemo(() => makePopulation(N_USERS, share), [share]);
  const mean = sumMean(pop)[coord];
  const trimmed = trimmedMean(pop, trim)[coord];
  const median = coordinateMedian(pop)[coord];
  const cleanSum = m("poisoning", "results/secure_sum_norm_bound/0.0/ndcg/mean");
  const cleanTrim = m("poisoning", "results/plaintext_trimmed_mean/0.0/ndcg/mean");
  return (
    <>
      <H>On sparse data the median throws away the honest signal together with the attack.</H>
      <P>
        Each bar is one user's value on one business, lowest first. Most users never touched most businesses, so most
        bars are zero, and the middle user is a zero. The median is then exactly zero, attack or no attack: the
        signal lives in the minority who did touch the business, and the median never looks at them.
      </P>
      <P>
        The trimmed mean keeps some of it, because it averages what survives the cut. The plain mean keeps it all,
        and the attack with it.
      </P>
      <Note tone="warn">
        The measured cost: without any attacker, NDCG@10 falls from {fmt.ndcg(cleanSum)} with the secure sum to{" "}
        {fmt.ndcg(cleanTrim)} with the trimmed mean.
      </Note>
      <Controls>
        <Choice<"0" | "1">
          label="Business shown"
          value={coord === 0 ? "0" : "1"}
          onChange={(v) => setCoord(v === "0" ? 0 : 1)}
          options={[
            { value: "1", label: "another business" },
            { value: "0", label: "the target" },
          ]}
        />
        <Slider label="Share of attackers" value={share} min={0} max={0.3} step={0.01} onChange={setShare} format={(v) => fmt.pct(v, 0)} />
        <Readouts>
          <Readout label="plain mean" value={signed(mean)} role="model" />
          <Readout label="trimmed mean" value={signed(trimmed)} role="model" />
          <Readout label="median" value={signed(median)} role="model" />
        </Readouts>
      </Controls>
    </>
  );
}

/* ---------------------------------------------------------------- 8.4 committee median */

export function CommitteePanel() {
  const size = usePoison((s) => s.committeeSize);
  const share = usePoison((s) => s.committeeShare);
  const seed = usePoison((s) => s.dealSeed);
  const setSize = usePoison((s) => s.setCommitteeSize);
  const setShare = usePoison((s) => s.setCommitteeShare);
  const redeal = usePoison((s) => s.redeal);
  const pop = useMemo(() => makePopulation(N_USERS, share, SEED), [share]);
  const deal = dealCommittees(N_USERS, size, seed);
  const agg = committeeMedian(pop, size, seed);
  return (
    <>
      <H>Committees keep the secure sum, but a committee holding one attacker is lost.</H>
      <P>
        Deal the users at random into committees. Inside each one a secure sum hides the individual updates, so the
        server sees only the committee totals. It then takes the median of the totals, coordinate by coordinate. A
        committee turns red if it holds an attacker, and the median holds only while most committees are clean.
      </P>
      <P>
        Small committees are more often clean, but each hides an update among few others and the measured accuracy
        suffers: NDCG@10 {fmt.ndcg(m("poisoning", "committee_tradeoff/committee_median_size4/clean_ndcg_at_fraction_0"))} for committees of 4,{" "}
        {fmt.ndcg(m("poisoning", "committee_tradeoff/committee_median_size20/clean_ndcg_at_fraction_0"))} for 20. Large committees keep
        accuracy and are nearly always contaminated.
      </P>
      <Note>
        The clean figure is the exact chance for a random committee. The project's code uses the approximation of one
        minus the share, to the power of the size.
      </Note>
      <Controls>
        <Slider label="Committee size" value={size} min={4} max={20} step={1} onChange={setSize} />
        <Slider label="Share of attackers" value={share} min={0} max={0.3} step={0.01} onChange={setShare} format={(v) => fmt.pct(v, 0)} />
        <Buttons>
          <Button kind="quiet" onClick={redeal}>
            Deal again
          </Button>
        </Buttons>
        <Readouts>
          <Readout label={`committees of about ${size}`} value={String(deal.count)} />
          <Readout label="clean, chance" value={fmt.pct(cleanCommitteeShare(N_USERS, attackerCount(N_USERS, share), size), 0)} role="protected" />
          <Readout label="clean, this deal" value={fmt.pct(realisedCleanShare(pop, deal), 0)} role="protected" />
          <Readout label="target push" value={signed(targetPush(agg))} role="attacker" />
        </Readouts>
      </Controls>
    </>
  );
}

