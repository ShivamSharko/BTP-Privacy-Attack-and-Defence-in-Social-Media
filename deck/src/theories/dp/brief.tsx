import { fmt, m, raw } from "../../data";
import { Caption, Choice, Controls, GroupedBars, H, List, Note, P, Readout, Readouts, Slider, StatRow, Tex } from "../../ui";
import {
  beatsPopular,
  ci,
  EPSILONS,
  h1,
  lv,
  PU,
  range,
  SE,
  SE_EPS,
  SE_KEY,
  SEEDS,
  sv,
  threshold,
  VARIANTS,
  whatIfKey,
} from "./impact";
import { clippedShare, distanceFor, N_UPDATES, overlap } from "./sim";
import { MULTIPLIERS, type Regime, useDp } from "./store";
import { DELTA, TOY_UPDATES } from "./toy";
import { type CurvePoint, UtilityChart } from "./UtilityChart";

const REGIME_NAME: Record<Regime, string> = { large: "large cohort", small: "small cohort" };
const TOP = MULTIPLIERS[MULTIPLIERS.length - 1];

/* ---------------------------------------------------------------- differential privacy */

export function BriefPromisePanel() {
  const epsilon = useDp((s) => s.epsilon);
  const setEpsilon = useDp((s) => s.setEpsilon);
  const d = distanceFor(epsilon, DELTA);
  return (
    <>
      <H>With or without your whole history, what comes out looks almost the same.</H>
      <P>
        Picture two worlds that differ in one user: in one, that user's entire history is in the training data; in the
        other it never was. Training is random, so each world gives a cloud of possible models. Differential privacy
        promises that the two clouds nearly coincide, so nobody who sees the result can tell which world it came from.
      </P>
      <P>
        Epsilon (<Tex>{String.raw`\varepsilon`}</Tex>) bounds how far apart the clouds may drift, and smaller is more
        private. Delta (<Tex>{String.raw`\delta`}</Tex>) is the small chance that the bound fails. What is protected is
        a whole user across all rounds, not a single check-in.
      </P>
      <Controls>
        <Slider label="Epsilon" value={epsilon} min={0.1} max={10} step={0.1} onChange={setEpsilon} format={(v) => fmt.n(v, 1)} />
        <Readouts>
          <Readout label="shared area of the two clouds" value={fmt.pct(overlap(d), 0)} role="protected" />
          <Readout label="delta used" value={DELTA.toExponential(2)} role="noise" />
        </Readouts>
      </Controls>
    </>
  );
}

/* ---------------------------------------------------------------- the mechanism */

export function BriefMechanismPanel() {
  const C = useDp((s) => s.C);
  const setC = useDp((s) => s.setC);
  const share = clippedShare(TOY_UPDATES, C);
  return (
    <>
      <H>Clip every user's update, add noise once to the sum, and one user can move it by at most C.</H>
      <P>
        A user's whole update is one long vector. If its length is above <Tex>C</Tex> it is scaled down to exactly{" "}
        <Tex>C</Tex>, keeping its direction. The server then adds Gaussian noise once to the clipped sum, with width{" "}
        <Tex>z \times C</Tex>.
      </P>
      <List
        items={[
          <>Removing one user changes the sum by at most <Tex>C</Tex>, which is <Tex>1/z</Tex> noise widths.</>,
          "The accountant picks the noise multiplier z that reaches the target epsilon.",
          "Each user joins a round independently with probability q, so most sit out any round.",
          "An empty round still gets noise.",
        ]}
      />
      <Controls>
        <Slider label="Clipping norm C" value={C} min={0} max={10} step={0.1} onChange={setC} format={(v) => fmt.n(v, 1)} />
        <Readouts>
          <Readout label="updates clipped" value={`${Math.round(share * N_UPDATES)} of ${N_UPDATES}`} role="protected" />
          <Readout label="most one user can move the sum" value={fmt.n(C, 1)} role="honest" />
        </Readouts>
      </Controls>
    </>
  );
}

/* ---------------------------------------------------------------- the main result: H1 */

export function BriefCurvePanel() {
  const regime = useDp((s) => s.regime);
  const setRegime = useDp((s) => s.setRegime);
  const eps = h1("large", "epsilon");
  const better = beatsPopular(regime);
  return (
    <>
      <H>
        H1 is not supported: at epsilon {eps} the private model keeps only {fmt.n(h1("large", "retention"))} and{" "}
        {fmt.n(h1("small", "retention"))} of its non-private accuracy.
      </H>
      <P>
        H1 required the private model to keep at least {fmt.n(threshold, 2)} of the non-private NDCG@10 (the accuracy
        score) at epsilon {eps}, in both cohorts. That ratio is the retention: {fmt.n(h1("large", "retention"))} for the
        large cohort, {fmt.n(h1("small", "retention"))} for the small one.
      </P>
      <P>
        Clipping alone, with no noise, already keeps only {fmt.n(lv("large", "cliponly", "retention"))} and{" "}
        {fmt.n(lv("small", "cliponly", "retention"))}. In the {REGIME_NAME[regime]}, epsilon {better.join(" and ")}{" "}
        {better.length === 1 ? "is" : "are"} the only {better.length === 1 ? "level" : "levels"} above MostPopular, which
        recommends the same popular places to everyone.
      </P>
      <Note tone="warn">Settings were tuned on validation data of the same users, and epsilon does not cover that.</Note>
      <Controls>
        <Choice<Regime>
          label="Sampling regime"
          value={regime}
          onChange={setRegime}
          options={[
            { value: "large", label: "Large cohort" },
            { value: "small", label: "Small cohort" },
          ]}
        />
      </Controls>
    </>
  );
}

export function BriefCurveStage() {
  const regime = useDp((s) => s.regime);
  const nondp = lv(regime, "nondp", "ndcg@10_mean");
  const eps = h1("large", "epsilon");
  const points = EPSILONS.map((e) => {
    const key = `eps${e}`;
    const band = ci(regime, key, "ndcg@10_ci95");
    return {
      x: e,
      y: lv(regime, key, "ndcg@10_mean"),
      lo: band[0],
      hi: band[1],
      emphasis: e === eps,
      title: `Epsilon ${e}`,
      lines: [`95% interval ${range(band, fmt.ndcg)}`, `retention ${fmt.n(lv(regime, key, "retention"))}`],
    };
  });
  const clipBand = ci(regime, "cliponly", "ndcg@10_ci95");
  const nondpBand = ci(regime, "nondp", "ndcg@10_ci95");
  return (
    <>
      <StatRow
        items={[
          { label: `retention at epsilon ${eps}, large cohort`, value: fmt.n(h1("large", "retention")), role: "attacker", note: `95%: ${range(raw<[number, number]>(PU, "summary/large/h1/retention_ci95"), (v) => fmt.n(v))}` },
          { label: `retention at epsilon ${eps}, small cohort`, value: fmt.n(h1("small", "retention")), role: "attacker", note: `95%: ${range(raw<[number, number]>(PU, "summary/small/h1/retention_ci95"), (v) => fmt.n(v))}` },
          { label: "H1 needed", value: fmt.n(threshold, 2), role: "model", note: raw<boolean>(PU, "summary/large/h1/met") || raw<boolean>(PU, "summary/small/h1/met") ? "met in one cohort" : "not met in either" },
        ]}
      />
      <UtilityChartBrief
        regime={regime}
        points={points}
        nondp={nondp}
        nondpBand={nondpBand}
        clipBand={clipBand}
      />
      <Caption>
        Mean test NDCG@10 over {SEEDS} seeds, shaded bands are 95% intervals. The dashed line is H1's bar: {fmt.n(threshold, 2)} of the
        non-private score.
      </Caption>
    </>
  );
}

function UtilityChartBrief({ regime, points, nondp, nondpBand, clipBand }: { regime: Regime; points: CurvePoint[]; nondp: number; nondpBand: [number, number]; clipBand: [number, number] }) {
  return (
    <UtilityChart
      series={[{ name: "private model", role: "protected", points }]}
      xFormat={(v) => String(v)}
      levels={[
        { label: "non-private", value: nondp, lo: nondpBand[0], hi: nondpBand[1], role: "model", strong: true },
        { label: "clip only, not private", value: lv(regime, "cliponly", "ndcg@10_mean"), lo: clipBand[0], hi: clipBand[1], role: "honest", dashed: true },
        { label: `H1 bar, ${fmt.n(threshold, 2)} of non-private`, value: threshold * nondp, role: "attacker", dashed: true, strong: true },
        { label: "MostPopular", value: m(PU, `summary/${regime}/most_popular_ndcg@10`), role: "noise", dashed: true },
      ]}
      xLabel={`target epsilon (log scale), ${REGIME_NAME[regime]}`}
      yLabel="test NDCG@10"
      format={fmt.ndcg}
      summary={`In the ${REGIME_NAME[regime]} NDCG@10 rises from ${fmt.ndcg(points[0].y)} at epsilon ${points[0].x} to ${fmt.ndcg(points[points.length - 1].y)} at epsilon ${points[points.length - 1].x}, against ${fmt.ndcg(nondp)} without privacy; the H1 bar is ${fmt.ndcg(threshold * nondp)}.`}
    />
  );
}

/* ---------------------------------------------------------------- why, and is it the data */

const CASES = VARIANTS.flatMap((v) => (["large", "small"] as const).map((r) => ({ v, r })));
const OTHER = VARIANTS.filter((v) => v.key !== "k15");

export function BriefWhatIfPanel() {
  const failures = CASES.filter((c) => raw<boolean>(SE, `results/${c.v.key}/${c.r}/h1_met`) === false).length;
  const eps = h1("large", "epsilon");
  return (
    <>
      <H>Less noise reaches the H1 bar in the large cohort only, and H1 fails on every version of the data.</H>
      <P>
        The noise is added once to the round's sum, so more users share it. Dividing it by {TOP}, as if about{" "}
        {TOP} times more users took part, lifts retention to {fmt.n(lv("large", `whatif-x${TOP}`, "retention"))} in the
        large cohort (the interval reaches down to {fmt.n(ci("large", `whatif-x${TOP}`, "retention_ci95")[0])}) but only
        to {fmt.n(lv("small", `whatif-x${TOP}`, "retention"))} in the small one.
      </P>
      <P>
        Rebuilding the data three ways, with at least 10 or 20 reviews per user and place, or only reviews of 4 stars or
        more, changes nothing: H1 fails in {failures} of {CASES.length} cases at epsilon {eps}, the main data included.
      </P>
      <Note tone="warn">The {TOP} times runs are simulations, not guarantees.</Note>
    </>
  );
}

export function BriefWhatIfStage() {
  const top = whatIfKey(TOP);
  const bars = (label: string, large: { v: number; lo?: number; hi?: number }, small: { v: number; lo?: number; hi?: number }) => ({
    label,
    bars: [
      { name: "large cohort", value: large.v, lo: large.lo, hi: large.hi, role: "protected" as const },
      { name: "small cohort", value: small.v, lo: small.lo, hi: small.hi, role: "model" as const },
    ],
  });
  const real = (r: Regime) => {
    const band = ci(r, whatIfKey(1), "retention_ci95");
    return { v: lv(r, whatIfKey(1), "retention"), lo: band[0], hi: band[1] };
  };
  const ten = (r: Regime) => {
    const band = ci(r, top, "retention_ci95");
    return { v: lv(r, top, "retention"), lo: band[0], hi: band[1] };
  };
  const variant = (key: string, r: Regime) => ({ v: sv(key, r, `epsilons/${SE_KEY}/retention`) });
  const failures = CASES.filter((c) => raw<boolean>(SE, `results/${c.v.key}/${c.r}/h1_met`) === false).length;
  return (
    <>
      <StatRow
        items={[
          { label: `large cohort, ${TOP}x users`, value: fmt.n(lv("large", top, "retention")), role: "protected", note: "simulation" },
          { label: `small cohort, ${TOP}x users`, value: fmt.n(lv("small", top, "retention")), role: "model", note: "simulation" },
          { label: "data versions, H1 fails", value: `${failures} of ${CASES.length}`, role: "attacker", note: `epsilon ${SE_EPS}` },
        ]}
      />
      <GroupedBars
        groups={[
          bars("main data", real("large"), real("small")),
          bars(`${TOP}x users`, ten("large"), ten("small")),
          ...OTHER.map((v) => bars(v.key === "stars4" ? "4 stars up" : v.label, variant(v.key, "large"), variant(v.key, "small"))),
        ]}
        yLabel={`retention at epsilon ${SE_EPS}`}
        format={(v) => fmt.n(v, 2)}
        threshold={{ value: threshold, label: `H1 needs ${fmt.n(threshold, 2)}` }}
        summary={`Retention at epsilon ${SE_EPS} for both cohorts on the main data, with ${TOP} times the users in a noise simulation, and on three other versions of the data. Only the large cohort with ${TOP} times the users reaches ${fmt.n(threshold, 2)}.`}
      />
      <Caption>
        Bars show retention of the non-private score; whiskers are 95% intervals where the run has seeds. The {TOP}x bars divide
        the epsilon {SE_EPS} noise by {TOP}; the data variants recalibrate the noise and are not re-tuned.
      </Caption>
    </>
  );
}
