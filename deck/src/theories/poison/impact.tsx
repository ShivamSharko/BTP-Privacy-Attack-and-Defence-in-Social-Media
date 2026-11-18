import { fmt, m, raw } from "../../data";
import { BarChart, Caption, H, LineChart, Note, P, StatRow, Table } from "../../ui";
import type { Role } from "../../ui";

const MODES = [
  { key: "secure_sum_norm_bound", name: "secure sum", role: "protected" },
  { key: "plaintext_trimmed_mean", name: "trimmed mean", role: "model" },
  { key: "plaintext_median", name: "median", role: "noise" },
  { key: "committee_median_size4", name: "committees of 4", role: "ledger" },
  { key: "committee_median_size20", name: "committees of 20", role: "muted" },
] as const satisfies readonly { key: string; name: string; role: Role }[];

/** The attacker shares the experiment ran, as numbers and as the keys of the result file ("0.1"). */
const SHARES = raw<number[]>("poisoning", "settings/fractions");
const FRACTIONS = SHARES.map((f) => f.toFixed(1));
const [, F1, F2, F3] = FRACTIONS;
const pct = (f: string) => fmt.pct(Number(f), 0);
/** The H4 row (index into h4/per_fraction) where the trimmed mean's lead over the secure sum is largest. */
const PER_FRACTION = raw<{ fraction: number; gap: number }[]>("poisoning", "h4/per_fraction");
const PEAK = PER_FRACTION.reduce((best, row, i) => (row.gap > PER_FRACTION[best].gap ? i : best), 0);

type Mode = (typeof MODES)[number]["key"];

const at = (mode: Mode, f: string, what: string) => m("poisoning", `results/${mode}/${f}/${what}`);
const exposure = (mode: Mode, f: string) => at(mode, f, "exposure/mean");
const ndcg = (mode: Mode, f: string) => at(mode, f, "ndcg/mean");

/* ---------------------------------------------------------------- 8.5 exposure */

export function ExposurePanel() {
  const users = m("poisoning", "settings/users");
  const rounds = m("poisoning", "settings/rounds");
  const seeds = raw<number[]>("poisoning", "settings/seeds").length;
  const cleanWorst = m("poisoning", "controls/1/measured");
  return (
    <>
      <H>Under a secure sum, {pct(F1)} attackers put the target in {fmt.pct(exposure("secure_sum_norm_bound", F1))} of top-10 lists.</H>
      <P>
        Exposure is the share of other users whose top 10 contains the target business. {fmt.int(users)} users,{" "}
        {rounds} rounds, mean of {seeds} seeds, no privacy noise. With no attackers it is at most{" "}
        {fmt.pct(cleanWorst, 2)} in every mode.
      </P>
      <P>
        The trimmed mean holds: {fmt.pct(exposure("plaintext_trimmed_mean", F1), 2)},{" "}
        {fmt.pct(exposure("plaintext_trimmed_mean", F2), 2)} and {fmt.pct(exposure("plaintext_trimmed_mean", F3), 1)} at {pct(F1)},{" "}
        {pct(F2)} and {pct(F3)}. Committees of 4 hold at {pct(F1)} ({fmt.pct(exposure("committee_median_size4", F1), 2)}) and
        give way at {pct(F2)} ({fmt.pct(exposure("committee_median_size4", F2), 1)}), where only{" "}
        {fmt.pct(at("committee_median_size4", F2, "clean_committee_share"), 0)} of
        committees are clean: under half.
      </P>
      <Note tone="warn">
        Means hide wide spreads. The median at {pct(F3)} ran from {fmt.pct(at("plaintext_median", F3, "exposure/min"), 1)} to{" "}
        {fmt.pct(at("plaintext_median", F3, "exposure/max"), 0)} across the {seeds} seeds.
      </Note>
    </>
  );
}

export function ExposureStage() {
  const series = MODES.map((mode) => ({
    name: mode.name,
    role: mode.role,
    points: FRACTIONS.map((f) => ({
      x: Number(f) * 100,
      y: exposure(mode.key, f),
      note: `lowest seed ${fmt.pct(at(mode.key, f, "exposure/min"), 2)}, highest ${fmt.pct(at(mode.key, f, "exposure/max"), 2)}`,
    })),
  }));
  return (
    <>
      <StatRow
        items={[
          { label: `secure sum, ${pct(F1)} attackers`, value: fmt.pct(exposure("secure_sum_norm_bound", F1)), role: "protected" },
          { label: `trimmed mean, ${pct(F3)} attackers`, value: fmt.pct(exposure("plaintext_trimmed_mean", F3)), role: "model" },
          { label: `committees of 4, ${pct(F1)} attackers`, value: fmt.pct(exposure("committee_median_size4", F1), 2), role: "ledger" },
          { label: `committees of 4, ${pct(F2)} attackers`, value: fmt.pct(exposure("committee_median_size4", F2)), role: "ledger" },
        ]}
      />
      <LineChart
        xLabel="share of attackers (%)"
        yLabel="users shown the target in their top 10"
        format={(v) => (v < -1e-9 || v > 1 + 1e-9 ? "" : fmt.pct(v, 0))}
        series={series}
        summary={`Target exposure rises to about ${fmt.pct(exposure("secure_sum_norm_bound", F1), 0)} under the secure sum at ${pct(F1)} attackers; the trimmed mean and committees of 4 stay low until ${pct(F3)} and ${pct(F2)} respectively; committees of 20 fail at ${pct(F1)}.`}
      />
    </>
  );
}

/* ---------------------------------------------------------------- 8.6 cost and H4 */

export function CostPanel() {
  const cleanSum = ndcg("secure_sum_norm_bound", "0.0");
  const cleanTrim = ndcg("plaintext_trimmed_mean", "0.0");
  const gap = (i: number) => raw<number>("poisoning", `h4/per_fraction/${i}/gap`) * 100;
  return (
    <>
      <H>Every defence costs accuracy, and hypothesis H4 held only in part.</H>
      <P>
        H4 said the plaintext trimmed mean limits promotion better than the secure sum at every attacker share, and
        that the gap is largest at the largest share.
      </P>
      <P>
        Held: it is lower at every share. Did not hold: the gap peaked at {fmt.pct(PER_FRACTION[PEAK].fraction, 0)}. It was{" "}
        {fmt.n(gap(0), 1)} points at {pct(F1)}, {fmt.n(gap(1), 1)} at {pct(F2)} and {fmt.n(gap(2), 1)} at {pct(F3)}, because the
        secure sum's own exposure eased to {fmt.pct(exposure("secure_sum_norm_bound", F3))} while the trimmed mean's rose.
        Not supported as stated.
      </P>
      <Note tone="warn">
        With no attacker the trimmed mean already costs {fmt.pct(1 - cleanTrim / cleanSum, 0)} of NDCG@10:{" "}
        {fmt.ndcg(cleanSum)} falls to {fmt.ndcg(cleanTrim)}.
      </Note>
    </>
  );
}

export function CostStage() {
  const data = MODES.map((mode) => ({
    label: mode.name,
    value: ndcg(mode.key, FRACTIONS[0]),
    role: mode.role,
    lo: at(mode.key, FRACTIONS[0], "ndcg/min"),
    hi: at(mode.key, FRACTIONS[0], "ndcg/max"),
  }));
  const rows = PER_FRACTION.map((_, i) => [
    fmt.pct(raw<number>("poisoning", `h4/per_fraction/${i}/fraction`), 0),
    fmt.pct(exposure("secure_sum_norm_bound", FRACTIONS[i + 1])),
    fmt.pct(exposure("plaintext_trimmed_mean", FRACTIONS[i + 1])),
    `${fmt.n(raw<number>("poisoning", `h4/per_fraction/${i}/gap`) * 100, 1)} points`,
  ]);
  return (
    <>
      <BarChart
        yLabel="NDCG@10, no attackers"
        format={(v) => fmt.ndcg(v)}
        data={data}
        summary={`With no attackers, NDCG@10 is ${fmt.ndcg(ndcg("secure_sum_norm_bound", "0.0"))} with the secure sum, ${fmt.ndcg(ndcg("plaintext_trimmed_mean", "0.0"))} with the trimmed mean and ${fmt.ndcg(ndcg("committee_median_size4", "0.0"))} with committees of 4.`}
      />
      <Table head={["Attackers", "Secure sum", "Trimmed mean", "Gap"]} rows={rows} caption="Target exposure, the quantity H4 compares" />
      <Caption>
        One attack, norm-bounded promotion of a single item. The attackers do not adapt to the defence. The robust and
        committee runs add no privacy noise. Committee sums are computed in the clear in this simulation. The bars show
        the lowest and highest of {raw<number[]>("poisoning", "settings/seeds").length} seeds.
      </Caption>
    </>
  );
}
