import { fmt, m } from "../../data";
import { Button, Buttons, Choice, Controls, H, P, Readout, Readouts } from "../../ui";
import { expectedCohort, meanSize, N_DEVICES, probabilityEmpty } from "./sim";
import { MAX_HISTOGRAM_ROUNDS, type Regime, useFed } from "./store";

/* The brief edition's slide for fed/1: one round, and the two regimes it is run in. */

const setting = (regime: Regime, key: "sample_rate" | "rounds") => m("privacy_utility", `frozen/regimes/${regime}/${key}`);

export function BriefRoundPanel() {
  const regime = useFed((s) => s.regime);
  const hist = useFed((s) => s.hist);
  const setRegime = useFed((s) => s.setRegime);
  const resetHistogram = useFed((s) => s.resetHistogram);
  const rate = setting(regime, "sample_rate");
  return (
    <>
      <H>Each round samples users at random, clips their updates and takes one step on the sum.</H>
      <P>
        Every device flips its own coin to join a round. A sampled device takes one local step on its own history and
        sends back only the change, the update. The update is clipped to a fixed length, the server sums the clipped
        updates and steps. Histories never leave the device.
      </P>
      <P>
        The project froze two regimes: a large cohort, {fmt.pct(setting("large", "sample_rate"), 0)} of users for{" "}
        {setting("large", "rounds")} rounds, and a small cohort, {fmt.pct(setting("small", "sample_rate"), 0)} for{" "}
        {setting("small", "rounds")} rounds. Cohort size varies, and an empty round still counts: with privacy on, the
        model then moves by noise alone.
      </P>
      <Controls>
        <Choice<Regime>
          label="Regime"
          value={regime}
          onChange={setRegime}
          options={[
            { value: "large", label: `large: ${fmt.pct(setting("large", "sample_rate"), 0)}` },
            { value: "small", label: `small: ${fmt.pct(setting("small", "sample_rate"), 0)}` },
          ]}
        />
        <Readouts>
          <Readout label={`rounds run of ${MAX_HISTOGRAM_ROUNDS}`} value={String(hist.rounds)} />
          <Readout label="mean cohort" value={fmt.n(meanSize(hist), 1)} role="honest" />
          <Readout label="expected" value={fmt.n(expectedCohort(N_DEVICES, rate), 1)} role="protected" />
          <Readout label={`empty rounds (chance ${fmt.pct(probabilityEmpty(N_DEVICES, rate))})`} value={String(hist.empty)} role="noise" />
        </Readouts>
        <Buttons>
          <Button kind="quiet" onClick={resetHistogram}>
            Run again
          </Button>
        </Buttons>
      </Controls>
    </>
  );
}
