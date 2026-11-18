import { fmt } from "../../data";
import { Caption, Choice, Controls, H, Note, P, Readout, Readouts, Slider, Tex } from "../../ui";
import {
  aucFromSeparation,
  type Control,
  epsilonPoint,
  GAP_MAX,
  gapForControl,
  rates,
  sigmaFor,
  tprAtFpr,
} from "./sim";
import { THRESHOLD_MAX, THRESHOLD_MIN, useMia } from "./store";

const privacyFormat = (v: number) => (v <= 0 ? "none" : v >= 1 ? "strongest" : `${Math.round(v * 100)}%`);

/* ---------------------------------------------------------------- 5.1 the question */

export function ThresholdPanel() {
  const threshold = useMia((s) => s.threshold);
  const setThreshold = useMia((s) => s.setThreshold);
  const { tpr, fpr } = rates(threshold, GAP_MAX, sigmaFor(1));
  return (
    <>
      <H>A model fits the users it trained on a little too well, and that is enough to give them away.</H>
      <P>
        The question is membership: was this user's history used to train the released model? An outsider holding the
        model can measure its loss on a user, meaning how badly it predicts a fixed half of that user's history. Members
        were trained on, so their loss tends to be lower.
      </P>
      <P>
        The attack is a threshold: call everyone below it a member. It tests a whole user, which is exactly what
        user-level privacy promises to hide. Drag the pink plane in the scene, or use the slider.
      </P>
      <Controls>
        <Slider
          label="Threshold on the loss"
          value={threshold}
          min={THRESHOLD_MIN}
          max={THRESHOLD_MAX}
          step={0.05}
          onChange={setThreshold}
          format={(v) => v.toFixed(1)}
        />
        <Readouts>
          <Readout label="members flagged (true positives)" value={fmt.pct(tpr, 0)} role="honest" />
          <Readout label="non-members flagged (false positives)" value={fmt.pct(fpr, 0)} role="noise" />
        </Readouts>
      </Controls>
    </>
  );
}

/* ---------------------------------------------------------------- 5.2 calibration and the 1% figure */

export function CalibrationPanel() {
  const privacy = useMia((s) => s.privacy);
  const calibrated = useMia((s) => s.calibrated);
  const setPrivacy = useMia((s) => s.setPrivacy);
  const setCalibrated = useMia((s) => s.setCalibrated);
  const gap = gapForControl("released", privacy);
  const sep = gap / sigmaFor(calibrated ? 0 : 1);
  return (
    <>
      <H>Calibrating removes each user's own difficulty, and the 1% mark is the figure that counts.</H>
      <P>
        Some users are simply hard to predict, so their loss is high whether or not they trained the model. That spread
        hides the members. The attacker trains reference models on other halves of the users and subtracts, for each
        user, the mean loss of the references that never saw them. What remains is the effect of membership.
      </P>
      <P>
        AUC averages over every threshold, including ones that accuse half the world. An attack that matters names
        members with few mistakes, so the figure of merit is the true-positive rate at 1% false positives.
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
        <Slider
          label="Privacy noise (toy scale)"
          value={privacy}
          min={0}
          max={1}
          step={0.02}
          onChange={setPrivacy}
          format={privacyFormat}
        />
        <Readouts>
          <Readout label="AUC" value={fmt.n(aucFromSeparation(sep), 3)} />
          <Readout
            label="members flagged at 1% false positives"
            value={fmt.pct(tprAtFpr(0.01, sep), 1)}
            role="attacker"
          />
        </Readouts>
      </Controls>
    </>
  );
}

/* ---------------------------------------------------------------- 5.3 controls and the bound */

const CONTROL_NOTE: Record<Control, string> = {
  released: "The released model: the answer depends on how much privacy noise it carries.",
  overfit: "Over-fitted: the attack must catch it. If it did not, a null result on the real model would mean nothing.",
  independent:
    "Independent data: the ridges coincide and the attack must score chance. If it did not, the attack would be fooling itself.",
};

export function ControlsPanel() {
  const control = useMia((s) => s.control);
  const privacy = useMia((s) => s.privacy);
  const setControl = useMia((s) => s.setControl);
  const setPrivacy = useMia((s) => s.setPrivacy);
  const gap = gapForControl(control, privacy);
  const sep = gap;
  const tpr = tprAtFpr(0.01, sep);
  return (
    <>
      <H>Two controls decide whether the attack can be trusted, and what it finds becomes a bound on epsilon.</H>
      <P>
        A null result proves little unless the attack could have found something. So an over-fitted model, trained for
        many more rounds, must be caught, and a model trained on independent data must score chance.
      </P>
      <P>
        If a mechanism is (ε, δ)-private, any test has a true-positive rate of at most{" "}
        <Tex>{String.raw`e^{\varepsilon}`}</Tex> times its false-positive rate, plus δ. So a measured pair gives a lower
        bound on ε, built from the lower 95% Clopper–Pearson limit on the rate of true positives and the upper limit on
        the rate of false positives:
      </P>
      <Tex
        block
      >{String.raw`\varepsilon \;\ge\; \ln\frac{\mathrm{TPR}_{\mathrm{low}} - \delta}{\mathrm{FPR}_{\mathrm{high}}}`}</Tex>
      <Controls>
        <Choice<Control>
          label="Model under attack"
          value={control}
          onChange={setControl}
          options={[
            { value: "released", label: "released model" },
            { value: "overfit", label: "over-fitted" },
            { value: "independent", label: "independent data" },
          ]}
        />
        {control === "released" ? (
          <Slider
            label="Privacy noise (toy scale)"
            value={privacy}
            min={0}
            max={1}
            step={0.02}
            onChange={setPrivacy}
            format={privacyFormat}
          />
        ) : null}
        <Caption>{CONTROL_NOTE[control]}</Caption>
        <Readouts>
          <Readout label="AUC" value={fmt.n(aucFromSeparation(sep), 3)} />
          <Readout label="flagged at 1% false positives" value={fmt.pct(tpr, 1)} role="attacker" />
          <Readout label="bound on epsilon, rough" value={fmt.n(epsilonPoint(tpr, 0.01), 2)} role="protected" />
        </Readouts>
      </Controls>
      <Note>In the toy the bound is just ln(TPR / FPR); the real one adds the confidence limits and δ.</Note>
    </>
  );
}
