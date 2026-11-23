import { fmt, raw } from "../../data";
import { Caption, Choice, Controls, GroupedBars, H, Note, P, Readout, Readouts, StatRow } from "../../ui";
import { claimed, h3Limit, LEVEL_NAME, LEVELS, level, settings } from "./figures";
import { aucFromSeparation, gapForControl, sigmaFor, tprAtFpr } from "./sim";
import { useMia } from "./store";

/* ---------------------------------------------------------------- brief: the question and the 1% figure */

export function BriefQuestionPanel() {
  const calibrated = useMia((s) => s.calibrated);
  const setCalibrated = useMia((s) => s.setCalibrated);
  const sep = gapForControl("released", 0) / sigmaFor(calibrated ? 0 : 1);
  return (
    <>
      <H>An outsider who holds the released model can test whether a user's history was used to train it.</H>
      <P>
        Membership inference asks whether a user&apos;s whole history was in the training set. The attacker measures the
        released model&apos;s loss on that user, how badly it predicts a fixed half of their history, and calls low
        loss a member. Users differ in difficulty, so the attacker subtracts the loss of reference models that never
        saw the user.
      </P>
      <P>
        We report the share of members flagged at 1% false positives, since AUC also counts thresholds that accuse half
        the world. Two controls keep the attack honest: an over-fitted model must be caught, and independent data must
        score chance.
      </P>
      <Controls>
        <Choice<"raw" | "calibrated">
          label="Score"
          value={calibrated ? "calibrated" : "raw"}
          onChange={(v) => setCalibrated(v === "calibrated")}
          options={[
            { value: "raw", label: "raw loss" },
            { value: "calibrated", label: "calibrated" },
          ]}
        />
        <Readouts>
          <Readout label="AUC, toy" value={fmt.n(aucFromSeparation(sep), 3)} />
          <Readout label="flagged at 1% false positives, toy" value={fmt.pct(tprAtFpr(0.01, sep), 1)} role="attacker" />
        </Readouts>
      </Controls>
    </>
  );
}

/* ---------------------------------------------------------------- brief: the measured result */

export function BriefResultPanel() {
  const nondp = { auc: level("nondp", "auc"), tpr: level("nondp", "tpr_at_1pct_fpr"), bound: level("nondp", "epsilon_lower_bound") };
  const eps8 = { auc: level("eps8", "auc"), tpr: level("eps8", "tpr_at_1pct_fpr"), bound: level("eps8", "epsilon_lower_bound") };
  const eps1 = { auc: level("eps1", "auc"), tpr: level("eps1", "tpr_at_1pct_fpr"), bound: level("eps1", "epsilon_lower_bound") };
  const mean8 = raw<number>("membership", "results/hypotheses/H3/mean_tpr_at_1pct_fpr");
  return (
    <>
      <H>
        Without privacy the attack flags {fmt.pct(nondp.tpr.mean, 0)} of members at 1% false positives; with privacy it
        is near chance.
      </H>
      <P>
        Chance is an AUC of 0.5 and 1% flagged. Without privacy: AUC {fmt.n(nondp.auc.mean, 3)}, {fmt.pct(nondp.tpr.mean, 1)}{" "}
        flagged. Epsilon 8: {fmt.n(eps8.auc.mean, 3)}, {fmt.pct(eps8.tpr.mean, 1)}. Epsilon 1: {fmt.n(eps1.auc.mean, 3)},{" "}
        {fmt.pct(eps1.tpr.mean, 1)}. The membership part of H3 holds: {fmt.pct(mean8, 2)} at epsilon 8 against the{" "}
        {fmt.pct(h3Limit(), 0)} allowed.
      </P>
      <P>
        The attack also proves a lower bound on epsilon: {fmt.n(eps8.bound.mean, 4)} at epsilon 8 and{" "}
        {fmt.n(eps1.bound.mean, 3)} at epsilon 1. Both stay under the claims of {fmt.n(claimed("eps8") ?? 0, 0)} and{" "}
        {fmt.n(claimed("eps1") ?? 0, 0)}.
      </P>
      <Note tone="warn">One attack, a loss threshold with reference models, and {settings.seeds()} seeds, so spreads are rough.</Note>
    </>
  );
}

export function BriefResultStage() {
  const groups = LEVELS.map((key) => {
    const v = level(key, "tpr_at_1pct_fpr");
    return { label: LEVEL_NAME[key], bars: [{ name: "members flagged", value: v.mean, lo: v.lo, hi: v.hi, role: "attacker" as const }] };
  });
  const b8 = level("eps8", "epsilon_lower_bound");
  const b1 = level("eps1", "epsilon_lower_bound");
  return (
    <>
      <GroupedBars
        groups={groups}
        yLabel="true-positive rate at 1% false positives"
        format={(v) => fmt.pct(v, 1)}
        threshold={{ value: 0.01, label: "" }}
        summary={`Share of members flagged at 1% false positives: ${fmt.pct(level("nondp", "tpr_at_1pct_fpr").mean, 1)} without privacy, ${fmt.pct(level("eps8", "tpr_at_1pct_fpr").mean, 1)} at epsilon 8 and ${fmt.pct(level("eps1", "tpr_at_1pct_fpr").mean, 1)} at epsilon 1, against 1% for chance.`}
      />
      <StatRow
        items={[
          { label: "epsilon 8: claimed", value: fmt.n(claimed("eps8") ?? 0, 0), role: "protected" },
          { label: "epsilon 8: attack proves at least", value: fmt.n(b8.mean, 4), role: "attacker" },
          { label: "epsilon 1: claimed", value: fmt.n(claimed("eps1") ?? 0, 0), role: "protected" },
          { label: "epsilon 1: attack proves at least", value: fmt.n(b1.mean, 3), role: "attacker" },
        ]}
      />
      <Caption>Bars show the mean over {settings.seeds()} seeds, whiskers the lowest and highest seed, the dashed line chance (1%).</Caption>
    </>
  );
}
