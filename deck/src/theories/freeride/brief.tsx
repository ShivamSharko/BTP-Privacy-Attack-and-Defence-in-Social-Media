import { fmt, raw } from "../../data";
import { BarChart, Caption, H, P, StatRow } from "../../ui";
import { auc, clean, drop, FRACTIONS, KINDS, meanGain, ndcg, range, settings, type Fraction } from "./figures";

/** The largest free-rider share measured, as a result-file key. */
const HIGH = String(Math.max(...raw<number[]>("free_riding", "settings/fractions"))) as Fraction;

const normRange = () => range(KINDS.flatMap((k) => FRACTIONS.map((f) => auc(k, f, "norm").mean)));

/* ---------------------------------------------------------------- brief for freeride/3 */

export function BriefFreeRidePanel() {
  const costs = KINDS.map((k) => drop(k, HIGH));
  const [lo, hi] = normRange();
  return (
    <>
      <H>Free-riders cost the others little, and a server that sees each update catches them by size.</H>
      <P>
        A free-rider takes the model every round but skips the work. It sends zeros, or random noise sized like an honest
        update, so each hollow update replaces a useful one in the sum.
      </P>
      <P>
        With {fmt.pct(Number(HIGH), 0)} free-riders, NDCG@10 falls by only {fmt.pct(Math.min(...costs))} to{" "}
        {fmt.pct(Math.max(...costs))}, and the free-riders gain nothing. The size of an update, its norm, exposes them:
        the AUC is {fmt.n(lo)} to {fmt.n(hi)}, where 1 is perfect and 0.5 a coin flip. Under a secure sum the server sees
        only the total and cannot check.
      </P>
    </>
  );
}

export function BriefFreeRideStage() {
  const costs = KINDS.map((k) => drop(k, HIGH));
  const [lo, hi] = normRange();
  const name = (k: (typeof KINDS)[number]) => (k === "zero" ? "zeros" : "noise");
  return (
    <>
      <StatRow
        items={[
          { label: `NDCG@10 lost, zeros, ${fmt.pct(Number(HIGH), 0)}`, value: fmt.pct(costs[0]), role: "protected" },
          { label: `NDCG@10 lost, noise, ${fmt.pct(Number(HIGH), 0)}`, value: fmt.pct(costs[1]), role: "noise" },
          { label: "norm score, AUC", value: `${fmt.n(lo)} to ${fmt.n(hi)}`, role: "model", note: "free-riders caught" },
          { label: "free-riders' own gain", value: fmt.ndcg(Math.abs(meanGain())), role: "honest", note: "NDCG@10 below contributors" },
        ]}
      />
      <BarChart
        yLabel="NDCG@10"
        format={(v) => v.toFixed(4)}
        data={[
          { label: "no free-riders", value: clean.mean(), lo: clean.min(), hi: clean.max(), role: "honest" },
          ...KINDS.map((k) => {
            const n = ndcg(k, HIGH);
            return { label: `${name(k)}, ${fmt.pct(Number(HIGH), 0)}`, value: n.mean, lo: n.min, hi: n.max, role: k === "zero" ? ("muted" as const) : ("noise" as const) };
          }),
        ]}
        summary={`NDCG@10 is ${fmt.ndcg(clean.mean())} with no free-riders and ${fmt.ndcg(ndcg("zero", HIGH).mean)} or ${fmt.ndcg(ndcg("noise", HIGH).mean)} with ${fmt.pct(Number(HIGH), 0)} free-riders.`}
      />
      <Caption>
        Small-cohort regime, {settings.rounds()} rounds, {settings.seeds()} seeds. Whiskers span the lowest and highest seed.
      </Caption>
    </>
  );
}
