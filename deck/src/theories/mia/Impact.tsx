import { useState } from "react";
import { fmt, raw } from "../../data";
import { Caption, Choice, GroupedBars, H, Note, P, Table, Without } from "../../ui";
import { claimed, controls, h3Limit, LEVEL_NAME, LEVELS, level, type LevelKey, settings } from "./figures";

/* ---------------------------------------------------------------- 5.4 attack success */

export function SuccessPanel() {
  const nondp = {
    auc: level("nondp", "auc"),
    tpr: level("nondp", "tpr_at_1pct_fpr"),
    rawAuc: level("nondp", "raw_auc"),
    rawTpr: level("nondp", "raw_tpr_at_1pct_fpr"),
  };
  const eps8 = {
    auc: level("eps8", "auc"),
    tpr: level("eps8", "tpr_at_1pct_fpr"),
  };
  const eps1 = {
    auc: level("eps1", "auc"),
    tpr: level("eps1", "tpr_at_1pct_fpr"),
  };
  const mean8 = raw<number>("membership", "results/hypotheses/H3/mean_tpr_at_1pct_fpr");
  const limit = h3Limit();
  return (
    <>
      <H>
        Without privacy the attack finds {fmt.pct(nondp.tpr.mean, 0)} of members at 1% false positives. With privacy it is
        close to chance.
      </H>
      <P>
        Each of {settings.seeds()} target models is trained on a random half of the {fmt.int(settings.users())} users
        and attacked on all of them; each epsilon is that {fmt.int(settings.members())}-user model&apos;s. Chance is an
        AUC of 0.5 and 1% flagged.
      </P>
      <P>
        Calibrated, with no privacy: AUC {fmt.n(nondp.auc.mean, 3)}, {fmt.pct(nondp.tpr.mean, 1)} flagged. Epsilon 8:{" "}
        {fmt.n(eps8.auc.mean, 3)}, {fmt.pct(eps8.tpr.mean, 1)}. Epsilon 1: {fmt.n(eps1.auc.mean, 3)},{" "}
        {fmt.pct(eps1.tpr.mean, 1)}.
      </P>
      <P>
        Raw loss gives {fmt.n(nondp.rawAuc.mean, 3)} and {fmt.pct(nondp.rawTpr.mean, 1)} without privacy, and no gain
        from calibrating once noise is added. At epsilon 8 the attack half of H3 holds: a mean of {fmt.pct(mean8, 2)}{" "}
        against the {fmt.pct(limit, 0)} allowed, though the lowest AUC over seeds, {fmt.n(eps8.auc.lo, 3)}, is still above chance.
      </P>
      <Note tone="warn">
        This bounds one attack, a loss threshold with reference models, not the strongest possible. Only{" "}
        {settings.seeds()} seeds, so the spreads are rough.
      </Note>
    </>
  );
}

type View = "tpr" | "auc";

export function SuccessStage() {
  const [view, setView] = useState<View>("tpr");
  const c = controls();
  const metric = view === "tpr" ? "tpr_at_1pct_fpr" : "auc";
  const rawMetric = view === "tpr" ? "raw_tpr_at_1pct_fpr" : "raw_auc";
  const format = view === "tpr" ? (v: number) => fmt.pct(v, 1) : (v: number) => fmt.n(v, 3);
  const groups = LEVELS.map((key) => {
    const cal = level(key, metric);
    const rawLevel = level(key, rawMetric);
    return {
      label: LEVEL_NAME[key],
      bars: [
        {
          name: "calibrated",
          value: cal.mean,
          lo: cal.lo,
          hi: cal.hi,
          role: "attacker" as const,
        },
        {
          name: "raw loss",
          value: rawLevel.mean,
          lo: rawLevel.lo,
          hi: rawLevel.hi,
          role: "noise" as const,
        },
      ],
    };
  });
  const chance = view === "tpr" ? 0.01 : 0.5;
  const summary =
    view === "tpr"
      ? `Share of members flagged at 1% false positives: ${fmt.pct(level("nondp", metric).mean, 1)} without privacy, ${fmt.pct(level("eps8", metric).mean, 1)} at epsilon 8 and ${fmt.pct(level("eps1", metric).mean, 1)} at epsilon 1, against 1% for chance.`
      : `AUC of the attack: ${fmt.n(level("nondp", metric).mean, 3)} without privacy, ${fmt.n(level("eps8", metric).mean, 3)} at epsilon 8 and ${fmt.n(level("eps1", metric).mean, 3)} at epsilon 1, against 0.5 for chance.`;
  return (
    <>
      <Choice<View>
        label="Figure"
        value={view}
        onChange={setView}
        options={[
          {
            value: "tpr",
            label: "members flagged at 1% false positives",
          },
          { value: "auc", label: "AUC" },
        ]}
      />
      <GroupedBars
        groups={groups}
        yLabel={view === "tpr" ? "true-positive rate at 1% false positives" : "AUC"}
        format={format}
        threshold={{ value: chance, label: "" }}
        summary={summary}
      />
      <Without slide="mia/2">
        <Caption>
          Calibrated: each user's loss is compared with reference models that never saw that user, which removes how
          hard the user is to predict. Raw loss skips that step.
        </Caption>
      </Without>
      <Table
        caption={`Bars show the mean over ${settings.seeds()} seeds, whiskers the lowest and highest seed, the dashed line chance (${view === "tpr" ? "1%" : "0.5"}). Below: the two controls.`}
        head={["Control", "Result", "Passes if", "Verdict"]}
        rows={[
          [
            `Over-fitted model, ${settings.overfitFactor()} times the rounds`,
            `${fmt.pct(c.overfitTpr, 1)} flagged, AUC ${fmt.n(c.overfitAuc, 3)}`,
            `at least ${fmt.pct(c.minTpr, 0)} and AUC ${c.minAuc}`,
            c.overfitPassed ? "passed" : "failed",
          ],
          [
            "Independent data",
            `AUC ${fmt.n(c.independentAuc, 4)}`,
            `within ${c.tolerance} of 0.5`,
            c.independentPassed ? "passed" : "failed",
          ],
        ]}
      />
    </>
  );
}

/* ---------------------------------------------------------------- 5.5 the bound against the claim */

export function BoundPanel() {
  const nondp = level("nondp", "epsilon_lower_bound");
  const eps8 = level("eps8", "epsilon_lower_bound");
  const eps1 = level("eps1", "epsilon_lower_bound");
  const within =
    raw<boolean>("membership", "results/levels/eps8/bound_within_claim") &&
    raw<boolean>("membership", "results/levels/eps1/bound_within_claim");
  return (
    <>
      <H>The epsilon the attack can prove is tiny next to the epsilon that was claimed.</H>
      <P>
        Each claim is the epsilon of a target model trained on {fmt.int(settings.members())} users, half the
        population, not of the full model. Using the formula from the controls slide, with delta{" "}
        {settings.delta().toExponential(2)}: the non-private model
        has no guarantee, so there is nothing to check, and the bound of {fmt.n(nondp.mean, 2)} (seeds{" "}
        {fmt.n(nondp.lo, 2)} to {fmt.n(nondp.hi, 2)}) is how much the attack proves.
      </P>
      <P>
        At epsilon 8, claimed {fmt.n(claimed("eps8") ?? 0, 2)}, the bound is {fmt.n(eps8.mean, 4)}. At epsilon 1,
        claimed {fmt.n(claimed("eps1") ?? 0, 2)}, it is {fmt.n(eps1.mean, 3)}.{" "}
        {within
          ? "In every seed it stays below the claim."
          : "In some seed it exceeds the claim, which would mean the implementation is broken."}
      </P>
      <Note tone="warn">
        A sanity check, not a proof the claim is tight. Two one-sided 95% limits give a joint confidence nearer 90%;
        levels and seeds are looked at without correction; with {fmt.int(settings.nonMembers())} non-members the
        false-positive rate cannot be resolved below 1 in {fmt.int(settings.nonMembers())}. It can detect only large
        violations.
      </Note>
    </>
  );
}

export function BoundStage() {
  const c = controls();
  const key = (k: LevelKey) => level(k, "epsilon_lower_bound");
  const groups = [
    ...LEVELS.map((k) => {
      const claim = claimed(k);
      const b = key(k);
      const bars = [
        {
          name: "attack's lower bound",
          value: b.mean,
          lo: b.lo,
          hi: b.hi,
          role: "attacker" as const,
        },
      ];
      return {
        label: LEVEL_NAME[k],
        bars:
          claim === null
            ? bars
            : [
                {
                  name: "epsilon claimed",
                  value: claim,
                  role: "protected" as const,
                },
                ...bars,
              ],
      };
    }),
    {
      label: "Over-fitted control",
      bars: [
        {
          name: "attack's lower bound",
          value: c.overfitBound,
          role: "attacker" as const,
        },
      ],
    },
  ];
  return (
    <>
      <GroupedBars
        groups={groups}
        yLabel="epsilon"
        format={(v) => (v < 0.1 ? v.toFixed(4) : v.toFixed(2))}
        summary={`Lower bound on epsilon from the attack: ${fmt.n(key("nondp").mean, 2)} without privacy, ${fmt.n(key("eps8").mean, 4)} at epsilon 8 against a claim of ${fmt.n(claimed("eps8") ?? 0, 2)}, and ${fmt.n(key("eps1").mean, 3)} at epsilon 1 against a claim of ${fmt.n(claimed("eps1") ?? 0, 2)}. The over-fitted control reaches ${fmt.n(c.overfitBound, 2)}.`}
      />
      <Caption>
        Whiskers show the lowest and highest seed. The non-private and over-fitted models have no claimed epsilon, so
        their bar shows only how much the attack proves.
      </Caption>
    </>
  );
}
