import { fact, fmt, m, raw } from "../../data";
import type { TheoryDef } from "../../deck/types";
import { BarChart, Button, Buttons, Caption, Choice, CodeView, Controls, H, Note, P, Readout, Readouts, Slider, StatRow, Tex } from "../../ui";
import { BriefRoundPanel } from "./brief";
import { Fallback } from "./Fallback";
import { Scene } from "./Scene";
import { cohortForRound, expectedCohort, meanSize, N_DEVICES, probabilityEmpty } from "./sim";
import { MAX_HISTOGRAM_ROUNDS, PHASES, type Regime, useFed } from "./store";

/* ---------------------------------------------------------------- 2.1 one round */

const OPT_NAME: Record<string, string> = { adam: "Adam", sgd: "SGD with momentum" };
const optName = (key: string) => OPT_NAME[key] ?? key;

/** The server optimiser of each frozen regime, without and with privacy, from privacy_utility.json. */
function optimisers(): string {
  return (["large", "small"] as const)
    .map((r) => {
      const plain = raw<string>("privacy_utility", `frozen/regimes/${r}/server_opt`);
      const priv = raw<string>("privacy_utility", `frozen/regimes/${r}/private_server_opt`);
      return plain === priv
        ? `${optName(plain)} in the ${r} regime`
        : `${optName(plain)} in the ${r} regime, ${optName(priv)} when private`;
    })
    .join("; ");
}

function RoundPanel() {
  const q = useFed((s) => s.q);
  const phase = useFed((s) => s.phase);
  const round = useFed((s) => s.round);
  const setQ = useFed((s) => s.setQ);
  const advance = useFed((s) => s.advance);
  const cohort = cohortForRound(round, q);
  return (
    <>
      <H>The data stays on the device. Only an update leaves.</H>
      <P>
        Each light is a user's device holding that user's check-in history. In a round the server picks a random
        sample of devices and sends them the current model. Each one works out, from its own history, how the model
        should change, and sends back only that change: the update.
      </P>
      <P>
        The server averages the updates it receives and takes one step. Then the next round starts with a new
        sample. No history is ever uploaded.
      </P>
      <Tex block>{String.raw`\theta_{t+1} = \theta_t + \eta \cdot \frac{1}{qn} \sum_{u \in S_t} \Delta_u`}</Tex>
      <Caption>The plain step is the idea. The real server feeds the average to an optimiser: {optimisers()}.</Caption>
      <Controls>
        <Slider label="Sampling rate q" value={q} min={0} max={0.9} step={0.05} onChange={setQ} format={(v) => fmt.pct(v, 0)} />
        <Buttons>
          <Button onClick={advance}>{phase === 0 ? "Start a round" : phase >= 4 ? "Next round" : "Next step"}</Button>
        </Buttons>
        <Readouts>
          <Readout label="now" value={PHASES[phase]} />
          <Readout label="devices sampled" value={phase === 0 ? "none yet" : String(cohort.length)} role="honest" />
          <Readout label="expected, q times n" value={fmt.n(expectedCohort(N_DEVICES, q), 1)} role="protected" />
        </Readouts>
      </Controls>
    </>
  );
}

/* ---------------------------------------------------------------- 2.2 Poisson sampling */

function SamplingPanel() {
  const regime = useFed((s) => s.regime);
  const hist = useFed((s) => s.hist);
  const setRegime = useFed((s) => s.setRegime);
  const resetHistogram = useFed((s) => s.resetHistogram);
  const rate = m("privacy_utility", `frozen/regimes/${regime}/sample_rate`);
  const rounds = m("privacy_utility", `frozen/regimes/${regime}/rounds`);
  return (
    <>
      <H>Every device flips its own coin, so the cohort size varies.</H>
      <P>
        Sampling is Poisson: each device joins a round independently with probability q. The privacy accounting later
        in this deck assumes exactly this, so the code does exactly this. A fixed-size cohort would be easier to run
        and would break that proof.
      </P>
      <P>
        Two consequences. The server divides by the expected size, q times n, which is public, and never by the
        size that happened, which would leak who took part. And a round can be empty: the model then moves by
        noise alone.
      </P>
      <Note>
        The project froze two regimes on validation data: large cohorts for few rounds, and small cohorts for many.
        Here {N_DEVICES} devices stand in for the real {fmt.int(m("dataset_card", "users"))} users.
      </Note>
      <Controls>
        <Choice<Regime>
          label="Regime"
          value={regime}
          onChange={setRegime}
          options={[
            { value: "small", label: `small: q ${m("privacy_utility", "frozen/regimes/small/sample_rate")}` },
            { value: "large", label: `large: q ${m("privacy_utility", "frozen/regimes/large/sample_rate")}` },
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
        <P>
          In the real {regime} regime: q = {rate}, {rounds} rounds.
        </P>
      </Controls>
    </>
  );
}

/* ---------------------------------------------------------------- 2.3 impact */

function ImpactPanel() {
  const before = Number(fact("speed.before_s").value);
  const after = Number(fact("speed.after_s").value);
  return (
    <>
      <H>The same round, {fmt.n(before / after, 1)} times faster, and checked against Flower.</H>
      <P>
        A user-level private round clips each user's whole update separately. With one gradient per user that took{" "}
        {before} seconds per run. For single-step clients each update's norm has a closed form, so one weighted
        backward pass gives the clipped sum: {after} seconds, with an identical result.
      </P>
      <P>
        Every run first checks the fast path against per-user gradients and refuses to start if they disagree.
      </P>
      <P>
        A small synthetic problem, {m("flower_parity", "settings/clients")} users for{" "}
        {m("flower_parity", "settings/rounds")} rounds, was also run through Flower, and the models agree to within
        floating-point rounding. Both sides share the client code and the reference is a copy of the round, not the
        engine's own loop, so this checks the plumbing and the aggregation, not the client mathematics.
      </P>
      <Note>The timing is one measurement, quoted from {fact("speed.before_s").source}.</Note>
    </>
  );
}

function ImpactStage() {
  const before = Number(fact("speed.before_s").value);
  const after = Number(fact("speed.after_s").value);
  const diff = m("flower_parity", "results/gaussian/final/max_abs_diff");
  const large = m("privacy_utility", "summary/large/levels/nondp/ndcg@10_mean");
  const small = m("privacy_utility", "summary/small/levels/nondp/ndcg@10_mean");
  return (
    <>
      <StatRow
        items={[
          { label: "faster per run", value: `${fmt.n(before / after, 1)}x`, role: "protected" },
          { label: "largest difference from Flower", value: diff.toExponential(2), note: `${m("flower_parity", "settings/rounds")} rounds, with noise` },
          { label: "NDCG@10, large regime", value: fmt.ndcg(large), role: "honest", note: "no privacy noise" },
          { label: "NDCG@10, small regime", value: fmt.ndcg(small), role: "honest", note: "no privacy noise" },
        ]}
      />
      <BarChart
        yLabel="seconds per run"
        format={(v) => `${v.toFixed(0)} s`}
        data={[
          { label: "one gradient per user", value: before, role: "noise", note: "per-user autograd" },
          { label: "closed-form norms", value: after, role: "protected", note: "one weighted backward pass" },
        ]}
        summary={`Run time fell from ${before} seconds with one gradient per user to ${after} seconds with closed-form norms.`}
      />
      <Caption>
        The NDCG figures are means over {raw<number[]>("privacy_utility", "frozen/seeds").length} seeds; the two
        timings are one measurement each. Flower ran only for the parity check.
      </Caption>
    </>
  );
}

/* ---------------------------------------------------------------- 2.4 code */

function CodePanel() {
  return (
    <>
      <H>One round in the code: four functions.</H>
      <P>The tabs on the right follow the round in order.</P>
      <P>
        <strong>1. Sample.</strong> <code>poisson_cohort</code> draws one coin per user from a named, seeded stream and
        returns the chosen users. <code>expected_cohort</code> gives the public divisor.
      </P>
      <P>
        <strong>2. Compute.</strong> <code>make_delta_fn</code> builds the function that turns one user's history into
        an update: hide half the history, take a gradient step, return the difference.
      </P>
      <P>
        <strong>3. Clip and sum.</strong> <code>clipped_sum_fast</code> computes every user's update norm in closed
        form and returns the sum of clipped updates.
      </P>
      <P>
        <strong>4. Step.</strong> <code>train</code> runs the loop: sample, sum, add noise if private, divide, and step
        the server optimiser.
      </P>
      <Note>Python 3.12 and PyTorch on one CPU. Randomness comes from named streams, so a seed reproduces a run exactly.</Note>
    </>
  );
}

function CodeStage() {
  return (
    <CodeView
      refs={["fl/sampling.py::poisson_cohort", "fl/client.py::make_delta_fn", "fl/fast.py::clipped_sum_fast", "fl/server.py::train"]}
    />
  );
}

/* ---------------------------------------------------------------- theory */

export const theory: TheoryDef = {
  id: "fed",
  number: 2,
  title: "A federated round",
  short: "Federated",
  Scene,
  Fallback,
  slides: [
    {
      id: "fed/1",
      kind: "theory",
      title: "One round, step by step",
      badge: "illustration",
      pose: { position: [0, 3.2, 14], target: [0, 0, 0] },
      step: 0,
      Panel: RoundPanel,
      brief: {
        title: "One federated round, and its two regimes",
        Panel: BriefRoundPanel,
        pose: { position: [0, 2.2, 15], target: [0, -0.4, 0] },
        step: 1,
      },
    },
    {
      id: "fed/2",
      kind: "theory",
      title: "Poisson sampling and the empty cohort",
      badge: "illustration",
      pose: { position: [0, 2.2, 15], target: [0, -0.4, 0] },
      step: 1,
      Panel: SamplingPanel,
    },
    {
      id: "fed/3",
      kind: "impact",
      title: "Faster rounds, same result",
      badge: "measured",
      sources: ["flower_parity", "privacy_utility"],
      pose: { position: [5, 4, 16], target: [0, 0, 0] },
      step: 0,
      layout: "stage",
      Panel: ImpactPanel,
      Stage: ImpactStage,
    },
    {
      id: "fed/4",
      kind: "code",
      title: "The round in code",
      badge: "source",
      pose: { position: [-5, 4, 16], target: [0, 0, 0] },
      step: 0,
      layout: "stage",
      Panel: CodePanel,
      Stage: CodeStage,
    },
  ],
};
