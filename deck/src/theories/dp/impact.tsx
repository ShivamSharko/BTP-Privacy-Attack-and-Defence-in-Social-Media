import { fmt, m, raw } from "../../data";
import { Caption, Choice, Controls, GroupedBars, H, Note, P, Readout, Readouts, Slider, StatRow, Table } from "../../ui";
import { MULTIPLIERS, type Regime, useDp } from "./store";
import { type CurvePoint, type CurveSeries, UtilityChart } from "./UtilityChart";

const PU = "privacy_utility";
const EPSILONS = raw<number[]>(PU, "frozen/epsilons");
const lv = (regime: Regime, level: string, field: string) => m(PU, `summary/${regime}/levels/${level}/${field}`);
const ci = (regime: Regime, level: string, field: string) => raw<[number, number]>(PU, `summary/${regime}/levels/${level}/${field}`);
const h1 = (regime: Regime, field: string) => m(PU, `summary/${regime}/h1/${field}`);
const threshold = h1("large", "threshold");
const SEEDS = raw<number[]>(PU, "frozen/seeds").length;
const range = (pair: [number, number], f: (v: number) => string) => `${f(pair[0])} to ${f(pair[1])}`;

function pairedLine(regime: Regime, level: string): string {
  const paired = raw<{ seeds_degraded: number; wilcoxon_two_sided_p: number; min_possible_two_sided_p: number }>(
    PU,
    `summary/${regime}/levels/${level}/paired`,
  );
  const seeds = lv(regime, level, "seeds");
  const floor = paired.wilcoxon_two_sided_p <= paired.min_possible_two_sided_p ? ", the smallest possible" : "";
  return `below non-private in ${paired.seeds_degraded} of ${seeds} seeds; Wilcoxon p = ${fmt.n(paired.wilcoxon_two_sided_p, 4)}${floor}`;
}

/** The target epsilons whose private model scores above MostPopular. */
function beatsPopular(regime: Regime): number[] {
  const popular = m(PU, `summary/${regime}/most_popular_ndcg@10`);
  return EPSILONS.filter((eps) => lv(regime, `eps${eps}`, "ndcg@10_mean") > popular);
}

/* ---------------------------------------------------------------- 6.5 the curve */

export function CurvePanel() {
  const regime = useDp((s) => s.regime);
  const setRegime = useDp((s) => s.setRegime);
  return (
    <>
      <H>Privacy costs accuracy, and at epsilon {h1("large", "epsilon")} it cost more than hypothesis H1 allowed.</H>
      <P>
        Each point is the test NDCG@10 of {SEEDS} seeds at one target epsilon. H1 required that at epsilon{" "}
        {h1("large", "epsilon")} the private model keep at least {fmt.n(threshold, 2)} of the non-private model's score,
        in each regime. It kept {fmt.n(h1("large", "retention"))} in the large regime and{" "}
        {fmt.n(h1("small", "retention"))} in the small one. <strong>H1 is not supported.</strong>
      </P>
      <P>
        Clipping alone, with no noise, already keeps only {fmt.n(lv("large", "cliponly", "retention"))} and{" "}
        {fmt.n(lv("small", "cliponly", "retention"))}. In the {regime} regime only epsilon{" "}
        {beatsPopular(regime).join(" and ")} {beatsPopular(regime).length === 1 ? "beats" : "beat"} MostPopular, which recommends the same popular places to everyone.
      </P>
      <Note tone="warn">
        The clip-only level is a diagnostic and is not private. Settings were tuned on validation data of the same users,
        and that tuning is not covered by epsilon.
      </Note>
      <Controls>
        <Choice<Regime>
          label="Regime"
          value={regime}
          onChange={setRegime}
          options={[
            { value: "large", label: `large: q ${m(PU, "frozen/regimes/large/sample_rate")}, ${m(PU, "frozen/regimes/large/rounds")} rounds` },
            { value: "small", label: `small: q ${m(PU, "frozen/regimes/small/sample_rate")}, ${m(PU, "frozen/regimes/small/rounds")} rounds` },
          ]}
        />
      </Controls>
    </>
  );
}

export function CurveStage() {
  const regime = useDp((s) => s.regime);
  const nondp = lv(regime, "nondp", "ndcg@10_mean");
  const points: CurvePoint[] = EPSILONS.map((eps) => {
    const key = `eps${eps}`;
    const band = ci(regime, key, "ndcg@10_ci95");
    return {
      x: eps,
      y: lv(regime, key, "ndcg@10_mean"),
      lo: band[0],
      hi: band[1],
      emphasis: eps === h1(regime, "epsilon"),
      title: `Epsilon ${eps} (of record ${fmt.n(lv(regime, key, "epsilon_of_record"), 2)})`,
      lines: [
        `95% interval ${range(band, fmt.ndcg)}`,
        `retention ${fmt.n(lv(regime, key, "retention"))}`,
        `noise multiplier z = ${fmt.n(lv(regime, key, "noise_multiplier"), 2)}`,
        pairedLine(regime, key),
      ],
    };
  });
  const clipBand = ci(regime, "cliponly", "ndcg@10_ci95");
  const nondpBand = ci(regime, "nondp", "ndcg@10_ci95");
  const eps8 = `eps${h1(regime, "epsilon")}`;
  return (
    <>
      <StatRow
        items={[
          { label: `retention at epsilon ${h1(regime, "epsilon")}`, value: fmt.n(h1(regime, "retention")), role: "attacker", note: `95%: ${range(raw<[number, number]>(PU, `summary/${regime}/h1/retention_ci95`), (v) => fmt.n(v))}` },
          { label: "H1 needed", value: fmt.n(threshold, 2), role: "model", note: raw<boolean>(PU, `summary/${regime}/h1/met`) ? "met" : "not met" },
          { label: `NDCG@10 at epsilon ${h1(regime, "epsilon")}`, value: fmt.ndcg(lv(regime, eps8, "ndcg@10_mean")), role: "protected", note: `non-private ${fmt.ndcg(nondp)}` },
          { label: "noise multiplier z", value: fmt.n(lv(regime, eps8, "noise_multiplier"), 2), role: "noise", note: `C = ${m(PU, `frozen/regimes/${regime}/clip_norm`)}` },
        ]}
      />
      <UtilityChart
        series={[{ name: "private", role: "protected", points }]}
        xFormat={(v) => String(v)}
        levels={[
          { label: "non-private", value: nondp, lo: nondpBand[0], hi: nondpBand[1], role: "model", strong: true },
          { label: "clip only, not private", value: lv(regime, "cliponly", "ndcg@10_mean"), lo: clipBand[0], hi: clipBand[1], role: "honest", dashed: true },
          { label: `H1 line, ${fmt.n(threshold, 2)} of non-private`, value: threshold * nondp, role: "attacker", dashed: true },
          { label: "MostPopular", value: m(PU, `summary/${regime}/most_popular_ndcg@10`), role: "noise", dashed: true },
        ]}
        xLabel="target epsilon (log scale)"
        yLabel="test NDCG@10"
        format={fmt.ndcg}
        summary={`In the ${regime} regime NDCG@10 rises from ${fmt.ndcg(points[0].y)} at epsilon ${points[0].x} to ${fmt.ndcg(points[points.length - 1].y)} at epsilon ${points[points.length - 1].x}, against ${fmt.ndcg(nondp)} without privacy.`}
      />
      <Caption>
        {SEEDS} seeds per point, test split, shaded bands are 95% intervals over seeds. Hover a point for its noise
        multiplier and the paired test against the non-private model.
      </Caption>
    </>
  );
}

/* ---------------------------------------------------------------- 6.6 what would change it */

const whatIfKey = (k: number) => (k === 1 ? `eps${h1("large", "epsilon")}` : `whatif-x${k}`);
const zKey = (k: number) => (k === 1 ? "noise_multiplier" : "simulated_noise_multiplier");

export function WhatIfPanel() {
  const index = useDp((s) => s.multiplier);
  const setIndex = useDp((s) => s.setMultiplier);
  const k = MULTIPLIERS[index];
  const top = MULTIPLIERS[MULTIPLIERS.length - 1];
  return (
    <>
      <H>More users would dilute the noise; ten times as many only just reach the bar, and in one regime only.</H>
      <P>
        Noise is added once to a sum over the whole cohort, so with more users the same noise is shared by more
        updates. To estimate this, the epsilon {h1("large", "epsilon")} noise was divided by k, as if the population
        were k times larger.
      </P>
      <P>
        At ten times the users, the large regime keeps {fmt.n(lv("large", `whatif-x${top}`, "retention"))}, just over{" "}
        {fmt.n(threshold, 2)}, though its interval reaches down to {fmt.n(ci("large", `whatif-x${top}`, "retention_ci95")[0])}.
        The small regime keeps {fmt.n(lv("small", `whatif-x${top}`, "retention"))}: there, clipping alone already keeps
        only {fmt.n(lv("small", "cliponly", "retention"))}, so less noise cannot close the gap.
      </P>
      <Note tone="warn">
        These are noise simulations with {lv("large", `whatif-x${top}`, "seeds")} seeds. They make no privacy claim on
        this population and are not a guarantee.
      </Note>
      <Controls>
        <Slider label="Users, times today" value={index} min={0} max={MULTIPLIERS.length - 1} step={1} onChange={setIndex} format={(v) => `${MULTIPLIERS[v]}x`} />
        <Readouts>
          <Readout label="retention, large" value={fmt.n(lv("large", whatIfKey(k), "retention"))} role="protected" />
          <Readout label="retention, small" value={fmt.n(lv("small", whatIfKey(k), "retention"))} role="model" />
        </Readouts>
      </Controls>
    </>
  );
}

export function WhatIfStage() {
  const index = useDp((s) => s.multiplier);
  const k = MULTIPLIERS[index];
  const series = (regime: Regime, role: "protected" | "model"): CurveSeries => ({
    name: `${regime} regime`,
    role,
    points: MULTIPLIERS.map((mult) => {
      const key = whatIfKey(mult);
      const band = ci(regime, key, "retention_ci95");
      return {
        x: mult,
        y: lv(regime, key, "retention"),
        lo: band[0],
        hi: band[1],
        emphasis: mult === k,
        title: `${regime} regime, ${mult}x users`,
        lines: [
          `95% interval ${range(band, (v) => fmt.n(v))}`,
          mult === 1
            ? `the real epsilon ${h1(regime, "epsilon")} run, ${lv(regime, key, "seeds")} seeds, z = ${fmt.n(lv(regime, key, zKey(mult)), 3)}`
            : `simulated z = ${fmt.n(lv(regime, key, zKey(mult)), 3)}, ${lv(regime, key, "seeds")} seeds, no privacy claim`,
        ],
      };
    }),
  });
  return (
    <>
      <StatRow
        items={[
          { label: `retention, large, ${k}x users`, value: fmt.n(lv("large", whatIfKey(k), "retention")), role: "protected", note: `noise multiplier ${fmt.n(lv("large", whatIfKey(k), zKey(k)), 3)}` },
          { label: `retention, small, ${k}x users`, value: fmt.n(lv("small", whatIfKey(k), "retention")), role: "model", note: `noise multiplier ${fmt.n(lv("small", whatIfKey(k), zKey(k)), 3)}` },
          { label: "clip only, large", value: fmt.n(lv("large", "cliponly", "retention")), role: "honest", note: "the ceiling without noise" },
          { label: "clip only, small", value: fmt.n(lv("small", "cliponly", "retention")), role: "honest", note: "the ceiling without noise" },
        ]}
      />
      <UtilityChart
        series={[series("large", "protected"), series("small", "model")]}
        levels={[
          { label: `H1 needs ${fmt.n(threshold, 2)}`, value: threshold, role: "attacker", dashed: true, strong: true },
          { label: "clip only, large", value: lv("large", "cliponly", "retention"), role: "honest", dashed: true },
          { label: "clip only, small", value: lv("small", "cliponly", "retention"), role: "honest", dashed: true },
        ]}
        xLabel="users, as a multiple of today's (log scale)"
        yLabel="retention of non-private NDCG@10"
        xFormat={(v) => `${v}x`}
        format={(v) => fmt.n(v, 2)}
        summary={`Retention rises with simulated population size: large regime from ${fmt.n(lv("large", whatIfKey(1), "retention"))} to ${fmt.n(lv("large", "whatif-x10", "retention"))}, small regime from ${fmt.n(lv("small", whatIfKey(1), "retention"))} to ${fmt.n(lv("small", "whatif-x10", "retention"))}.`}
      />
      <Caption>
        1x is the real epsilon {h1("large", "epsilon")} run ({SEEDS} seeds). 2x, 5x and 10x divide its noise by that
        factor ({lv("large", "whatif-x10", "seeds")} seeds each). Shaded bands are 95% intervals; hover a point for its
        noise multiplier.
      </Caption>
    </>
  );
}

/* ---------------------------------------------------------------- 6.7 sensitivity */

const SE = "sensitivity";
const VARIANTS = [
  { key: "k10", label: "k-core 10" },
  { key: "k15", label: "k-core 15, main" },
  { key: "k20", label: "k-core 20" },
  { key: "stars4", label: "4 stars and up" },
] as const;
const sv = (variant: string, regime: Regime, path: string) => m(SE, `results/${variant}/${regime}/${path}`);
/** The one epsilon the sensitivity runs used, as a number and as its key in the result file. */
const SE_EPS = raw<number[]>(SE, "settings/epsilons")[0];
const SE_KEY = String(SE_EPS);

export function SensitivityPanel() {
  const all = VARIANTS.flatMap((v) => (["large", "small"] as const).map((r) => ({ v, r, value: sv(v.key, r, `epsilons/${SE_KEY}/retention`) })));
  const best = all.reduce((a, b) => (b.value > a.value ? b : a));
  const failures = all.filter((x) => raw<boolean>(SE, `results/${x.v.key}/${x.r}/h1_met`) === false).length;
  return (
    <>
      <H>H1 fails on every version of the data we tried.</H>
      <P>
        Is the result an accident of preprocessing? The data was rebuilt three other ways: keeping users and places with
        at least 10 or at least 20 reviews instead of 15, and keeping only reviews of 4 stars or more. Each was run with
        both regimes, at epsilon {SE_EPS}, noise recalibrated to its own number of users.
      </P>
      <P>
        H1 fails in {failures} of {all.length} cases. The best, {best.v.label} in the {best.r} regime, keeps{" "}
        {fmt.n(best.value)}, still short of {fmt.n(threshold, 2)}.
      </P>
      <Note tone="warn">
        {raw<number[]>(SE, "settings/seeds").length} seeds per variant and settings not re-tuned for any of them. All
        variants come from the same city's reviews, so this tests preprocessing, not the platform.
      </Note>
    </>
  );
}

export function SensitivityStage() {
  return (
    <>
      <GroupedBars
        groups={VARIANTS.map((v) => ({
          label: v.label,
          bars: [
            { name: "large", value: sv(v.key, "large", `epsilons/${SE_KEY}/retention`), role: "protected" as const },
            { name: "small", value: sv(v.key, "small", `epsilons/${SE_KEY}/retention`), role: "model" as const },
          ],
        }))}
        yLabel={`retention at epsilon ${SE_EPS}`}
        format={(v) => fmt.n(v, 3)}
        threshold={{ value: threshold, label: `H1 needs ${fmt.n(threshold, 2)}` }}
        summary={`Retention at epsilon ${SE_EPS} stays below ${fmt.n(threshold, 2)} on every data variant and in both regimes.`}
      />
      <Table
        head={["variant", "users", "places", "non-private, large", "MostPopular"]}
        rows={VARIANTS.map((v) => [
          v.label,
          fmt.int(sv(v.key, "large", "users")),
          fmt.int(sv(v.key, "large", "items")),
          fmt.ndcg(sv(v.key, "large", "nondp_ndcg@10")),
          fmt.ndcg(sv(v.key, "large", "most_popular_ndcg@10")),
        ])}
      />
    </>
  );
}
