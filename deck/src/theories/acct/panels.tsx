import { fmt, grid } from "../../data";
import { Button, Buttons, Choice, Controls, H, Note, P, Readout, Readouts, Slider, Tex, Without } from "../../ui";
import { calibrationTrace, projectNoise } from "./search";
import { CALIBRATION_HIGH, CALIBRATION_LOW, CALIBRATION_TOLERANCE, epsilonAt, gate, GATE_ABSOLUTE, GATE_RELATIVE, movedNeedles, RDP_SLACK } from "./sim";
import { BUDGET, LEVELS, type Needle, type Regime, regimeSetting, TOY_BASE, useAcct } from "./store";

const ln = Math.log;
const NOISE_LO = grid.noise[0];
const NOISE_HI = grid.noise[grid.noise.length - 1];
const ROUNDS_LO = grid.rounds[0];
const ROUNDS_HI = grid.rounds[grid.rounds.length - 1];

const rateLabel = (rate: number) => {
  const regime = (["small", "large"] as Regime[]).find((r) => regimeSetting(r).rate === rate);
  return regime ? `${rate}, the ${regime} regime` : String(rate);
};

/* ---------------------------------------------------------------- 7.1 the surface */

export function SurfacePanel() {
  const rateIdx = useAcct((s) => s.rateIdx);
  const noise = useAcct((s) => s.noise);
  const rounds = useAcct((s) => s.rounds);
  const setRate = useAcct((s) => s.setRate);
  const setNoise = useAcct((s) => s.setNoise);
  const setRounds = useAcct((s) => s.setRounds);
  const eps = epsilonAt(grid, rateIdx, noise, rounds);
  const within = eps <= BUDGET;
  const rate = grid.rates[rateIdx];
  return (
    <>
      <H>Every round spends privacy budget, and the noise, the sampling and the rounds set the bill.</H>
      <P>
        Each round adds Gaussian noise, scaled by the noise multiplier z, to the sum of clipped updates. Rounds
        compose: the privacy loss epsilon after T rounds is that of T noisy steps put together. A random cohort
        helps, because a user is in a round only with probability q, and that amplifies the privacy of the step.
      </P>
      <Tex block>{String.raw`\varepsilon = f(z,\ q,\ T)\ \text{ at }\ \delta = \tfrac{1}{10n} \approx ${grid.delta.toExponential(2).replace("e-", String.raw`\times 10^{-`)}}`}</Tex>
      <P>
        The surface is computed with the project's PLD accountant over {grid.users.toLocaleString("en-US")} users. It is
        not the value of record, which is the larger of PRV and PLD<Without slide="acct/2">, two accountants from separate code bases</Without>. Drag the marker or click the surface.
      </P>
      <Controls>
        <Choice<string>
          label="Sampling rate q"
          value={String(rate)}
          onChange={(v) => setRate(grid.rates.indexOf(Number(v)))}
          options={grid.rates.map((r) => ({ value: String(r), label: rateLabel(r) }))}
        />
        <Slider label="Noise z" value={ln(noise)} min={ln(NOISE_LO)} max={ln(NOISE_HI)} step={0.01} onChange={(v) => setNoise(Math.exp(v))} format={(v) => Math.exp(v).toFixed(2)} />
        <Slider label="Rounds T" value={ln(rounds)} min={ln(ROUNDS_LO)} max={ln(ROUNDS_HI)} step={0.01} onChange={(v) => setRounds(Math.exp(v))} format={(v) => String(Math.round(Math.exp(v)))} />
        <Readouts>
          <Readout label="epsilon" value={eps.toFixed(2)} role={within ? "protected" : "attacker"} />
          <Readout label={`against a budget of ${BUDGET}`} value={within ? "within" : "over"} role={within ? "protected" : "attacker"} />
          <Readout label="users per round, on average" value={fmt.int(rate * grid.users)} role="honest" />
        </Readouts>
      </Controls>
    </>
  );
}

/* ---------------------------------------------------------------- 7.2 the gate */

const needleName: Record<Needle, string> = { prv: "PRV", pld: "PLD", rdp: "RDP" };

export function GatePanel() {
  const moved = useAcct((s) => s.moved);
  const shift = useAcct((s) => s.shift);
  const setMoved = useAcct((s) => s.setMoved);
  const setShift = useAcct((s) => s.setShift);
  const v = movedNeedles(TOY_BASE, moved, shift);
  const result = gate(v.prv, v.pld, v.rdp);
  return (
    <>
      <H>Three accountants compute epsilon independently, and the run is refused if they disagree.</H>
      <P>
        PRV and RDP come from Opacus; PLD comes from dp-accounting, a separate code base. PRV and PLD are tight
        numerical accountants. RDP is a looser bound, kept as a sanity check.
      </P>
      <P>
        The gate passes only if PRV and PLD differ by at most the larger of {fmt.pct(GATE_RELATIVE, 0)} of the bigger
        one and {GATE_ABSOLUTE}, and RDP is not below the bigger one by more than {RDP_SLACK}. The value of record is
        the larger of PRV and PLD. A run that fails is recorded as inconsistent and left out.
      </P>
      <Note>The needles are a toy, started from the small regime's epsilon {BUDGET} run. RDP is drawn a little looser than PLD.</Note>
      <Controls>
        <Choice<Needle>
          label="Move the needle for"
          value={moved}
          onChange={setMoved}
          options={(["pld", "prv", "rdp"] as Needle[]).map((k) => ({ value: k, label: needleName[k] }))}
        />
        <Slider label="Disagreement" value={shift} min={-0.2} max={0.2} step={0.005} onChange={setShift} format={(x) => `${x > 0 ? "+" : ""}${fmt.pct(x, 1)}`} />
        <Readouts>
          <Readout label="gap between PRV and PLD" value={result.gap.toFixed(3)} />
          <Readout label="allowed" value={result.tolerance.toFixed(3)} role="protected" />
          <Readout label="gate" value={result.ok ? "open" : "closed"} role={result.ok ? "protected" : "attacker"} />
        </Readouts>
      </Controls>
    </>
  );
}

/* ---------------------------------------------------------------- 7.3 calibration */

export function CalibrationPanel() {
  const regime = useAcct((s) => s.calibRegime);
  const target = useAcct((s) => s.calibTarget);
  const step = useAcct((s) => s.calibStep);
  const setRegime = useAcct((s) => s.setCalibRegime);
  const setTarget = useAcct((s) => s.setCalibTarget);
  const setStep = useAcct((s) => s.setCalibStep);
  const trace = calibrationTrace(regime, target);
  const total = trace.steps.length;
  const shown = Math.min(step, total);
  const current = shown > 0 ? trace.steps[shown - 1] : null;
  const project = projectNoise(regime, target);
  const s = regimeSetting(regime);
  return (
    <>
      <H>The noise is searched for: the smallest multiplier whose epsilon fits the target.</H>
      <P>
        Epsilon only falls as noise grows, so the search can bracket the answer. It tries the geometric middle of
        the bracket, keeps the half where epsilon still crosses the target, and stops when the bracket is narrower
        than {fmt.pct(CALIBRATION_TOLERANCE / 4, 2)}. It then nudges the noise up until the value of record, the
        larger of PRV and PLD, also fits.
      </P>
      <P>
        The real search covers noise from {CALIBRATION_LOW} to {CALIBRATION_HIGH}. This picture uses the exported
        grid, PLD only, from {grid.noise[0]} to {grid.noise[grid.noise.length - 1]}, so a target can be out of reach
        here; the green dot is the project's own value from the calibration file.
      </P>
      <Controls>
        <Choice<Regime>
          label="Regime"
          value={regime}
          onChange={setRegime}
          options={(["small", "large"] as Regime[]).map((r) => ({ value: r, label: `${r}: q ${regimeSetting(r).rate}, ${regimeSetting(r).rounds} rounds` }))}
        />
        <Choice<string> label="Target epsilon" value={String(target)} onChange={(v) => setTarget(Number(v))} options={LEVELS.map((e) => ({ value: String(e), label: String(e) }))} />
        <Buttons>
          <Button onClick={() => setStep(Math.min(total, shown + 1))}>Try the middle</Button>
          <Button kind="quiet" onClick={() => setStep(total)}>
            Run to the end
          </Button>
          <Button kind="quiet" onClick={() => setStep(0)}>
            Start again
          </Button>
        </Buttons>
        <Readouts>
          <Readout label="steps" value={trace.reachable ? `${shown} of ${total}` : "none"} />
          <Readout label="bracket" value={current ? `${current.lo.toFixed(2)} to ${current.hi.toFixed(2)}` : `${grid.noise[0]} to ${grid.noise[grid.noise.length - 1]}`} role="protected" />
          <Readout label={`project, q ${s.rate}`} value={project === undefined ? "not stored" : String(project)} role="ledger" />
        </Readouts>
      </Controls>
    </>
  );
}
