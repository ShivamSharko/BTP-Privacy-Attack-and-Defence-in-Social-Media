import { fmt, m, raw } from "../../data";
import { Button, Buttons, Choice, Controls, H, Note, P, Readout, Readouts, Slider, Tex } from "../../ui";
import { hypothesisOutcomes, seedCounts } from "./evidence";
import { ALPHA, canSurviveHolm, formatP, controlVerdict, minSignTestP } from "./sim";
import { GATES, MAX_COMPARISONS, MAX_SEEDS, useMethod } from "./store";

const sci = formatP;

/* ---------------------------------------------------------------- 13.1 order of work */

export function OrderPanel() {
  const stage = useMethod((s) => s.stage);
  const next = useMethod((s) => s.next);
  const back = useMethod((s) => s.back);
  const setStage = useMethod((s) => s.setStage);
  const seeds = seedCounts().main;
  const outcomes = hypothesisOutcomes();
  const gate = GATES[Math.min(stage, GATES.length - 1)];
  return (
    <>
      <H>The order of work is fixed before the first result exists.</H>
      <P>
        Hypotheses and their decision rules are written down before the reported model is evaluated on the test split. Settings are tuned on
        the validation split only, then frozen in a file. Final models train on train plus validation and are
        evaluated once on test, ranking every item in the catalogue rather than a sample.
      </P>
      <P>
        {outcomes.failed.join(" and ")} did not hold and {outcomes.split.join(" and ")} was split, and the report says so. A pipeline that bent its rules to please its
        authors would not publish those.
      </P>
      <Note>
        The pre-registration also discloses that test results of the earlier model were seen first, and that none
        existed for the new model when Amendment 1 was written.
      </Note>
      <Controls>
        <Buttons>
          <Button kind="quiet" onClick={back}>
            Back
          </Button>
          <Button onClick={stage >= GATES.length ? () => setStage(0) : next}>
            {stage >= GATES.length ? "Start again" : stage === 0 ? "Send the result packet" : "Next gate"}
          </Button>
        </Buttons>
        <Readouts>
          <Readout label="gates passed" value={`${stage} of ${GATES.length}`} role="protected" />
          <Readout label="seeds in the run" value={String(seeds)} role="ledger" />
        </Readouts>
        <P>
          {stage < GATES.length ? `Next, ${gate.title.toLowerCase()}: ` : "Done: "}
          {stage < GATES.length ? gate.detail : "the packet leaves with its verdict attached."}
        </P>
      </Controls>
    </>
  );
}

/* ---------------------------------------------------------------- 13.2 controls */

export function ControlsPanel() {
  const positiveOk = useMethod((s) => s.positiveOk);
  const negativeOk = useMethod((s) => s.negativeOk);
  const setPositive = useMethod((s) => s.setPositive);
  const setNegative = useMethod((s) => s.setNegative);
  const run = useMethod((s) => s.run);
  const verdict = controlVerdict(positiveOk, negativeOk);

  const free = "free_riding";
  const rate = m(free, "settings/sample_rate");
  const rounds = m(free, "settings/rounds");
  const threshold = m(free, "controls/1/threshold");
  const measured = m(free, "controls/1/measured");
  return (
    <>
      <H>A run counts only if its controls behave. A failed control makes it INVALID.</H>
      <P>
        A positive control gives the method an effect it must find, such as a membership attack on a deliberately
        overfitted model. A negative control gives it nothing to find, such as the same attack on a model trained on
        independent data. If either misbehaves the run is stamped INVALID, whatever the headline numbers say.
      </P>
      <Note tone="warn">
        The free-riding run first used a short training budget and failed its own sanity control, so it was not
        believed. It was rerun with the frozen budget of the small regime ({rate} sampling, {rounds} rounds), and the
        threshold of {threshold} did not move. It now measures {fmt.n(measured, 2)}.
      </Note>
      <Controls>
        <Choice<"yes" | "no">
          label="Positive control"
          value={positiveOk ? "yes" : "no"}
          onChange={(v) => setPositive(v === "yes")}
          options={[
            { value: "yes", label: "finds the effect" },
            { value: "no", label: "misses it" },
          ]}
        />
        <Choice<"yes" | "no">
          label="Negative control"
          value={negativeOk ? "yes" : "no"}
          onChange={(v) => setNegative(v === "yes")}
          options={[
            { value: "yes", label: "finds nothing" },
            { value: "no", label: "finds something" },
          ]}
        />
        <Buttons>
          <Button kind="quiet" onClick={run}>
            Run again
          </Button>
        </Buttons>
        <Readouts>
          <Readout label="verdict" value={verdict} role={verdict === "VALID" ? "protected" : "attacker"} />
          <Readout
            label={`overfitted model, attack AUC (at least ${m("membership", "controls/positive_overfit/threshold/auc_min")})`}
            value={fmt.n(m("membership", "controls/positive_overfit/values/auc"), 3)}
            role="protected"
          />
          <Readout
            label={`independent model, attack AUC (${m("membership", "controls/negative_independent/threshold/auc_target")} plus or minus ${m("membership", "controls/negative_independent/threshold/tolerance")})`}
            value={fmt.n(m("membership", "controls/negative_independent/values/auc"), 3)}
            role="protected"
          />
        </Readouts>
      </Controls>
    </>
  );
}

/* ---------------------------------------------------------------- 13.3 statistics */

export function StatsPanel() {
  const seeds = useMethod((s) => s.seeds);
  const comparisons = useMethod((s) => s.comparisons);
  const setSeeds = useMethod((s) => s.setSeeds);
  const setComparisons = useMethod((s) => s.setComparisons);
  const minP = minSignTestP(seeds);
  const ok = canSurviveHolm(seeds, comparisons);
  const counts = seedCounts();
  const fewSeeds = raw<number[]>("participation", "settings/seeds").length;
  return (
    <>
      <H>
        {counts.main} seeds can show what {fewSeeds} seeds never can.
      </H>
      <P>
        The main grid runs {counts.main} seeds and other experiments run {counts.min} to {counts.max}. A bootstrap interval resamples the seeds with replacement many times and keeps the middle 95% of the
        means. Paired tests, a sign test and the Wilcoxon signed-rank test, compare seeds that differ only in the
        treatment. When several comparisons are tested together, Holm&apos;s correction makes the smallest p-value
        beat {ALPHA} divided by the number of comparisons.
      </P>
      <Tex block>{String.raw`p_{\min} = 2 \times 0.5^{\,n}`}</Tex>
      <Note tone="warn">
        Here n is the number of seeds, and p is the smallest two-sided sign-test value possible when all n seeds move
        the same way. With {fewSeeds} seeds that is {sci(minSignTestP(fewSeeds))}, so H5 was decided by the sign pattern and its
        test reported as underpowered.
      </Note>
      <Controls>
        <Slider label="Seeds" value={seeds} min={1} max={MAX_SEEDS} step={1} onChange={setSeeds} />
        <Slider label="Comparisons tested together" value={comparisons} min={1} max={MAX_COMPARISONS} step={1} onChange={setComparisons} />
        <Readouts>
          <Readout label="smallest possible p" value={sci(minP)} role={minP < ALPHA ? "protected" : "noise"} />
          <Readout label="Holm bar for it" value={sci(ALPHA / comparisons)} />
          <Readout label="can pass" value={ok ? "yes" : "no"} role={ok ? "protected" : "attacker"} />
        </Readouts>
      </Controls>
    </>
  );
}
