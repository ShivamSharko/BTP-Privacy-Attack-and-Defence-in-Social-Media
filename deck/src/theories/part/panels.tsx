import { useMemo } from "react";
import { fmt } from "../../data";
import { Button, Buttons, Choice, Controls, H, Note, P, Readout, Readouts, Slider, Tex } from "../../ui";
import { configFromResults, epsilonOf, gapMean, groupNdcg, SCENARIO_LABEL, trace } from "./measured";
import { isOn, makeWorld, SCENARIOS, type Scenario, shareAvailable } from "./sim";
import { type Level, usePart } from "./store";

const scenarioOptions = SCENARIOS.map((value) => ({ value, label: SCENARIO_LABEL[value] }));

function ScenarioChoice() {
  const scenario = usePart((s) => s.scenario);
  const setScenario = usePart((s) => s.setScenario);
  return <Choice<Scenario> label="Availability scenario" value={scenario} onChange={setScenario} options={scenarioOptions} />;
}

/* ---------------------------------------------------------------- 11.1 the city over a day */

function clock(hour: number): string {
  const h = Math.floor(hour);
  const min = Math.floor((hour - h) * 60);
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

export function DayPanel() {
  const scenario = usePart((s) => s.scenario);
  const hour = usePart((s) => s.hour);
  const playing = usePart((s) => s.playing);
  const setHour = usePart((s) => s.setHour);
  const togglePlay = usePart((s) => s.togglePlay);
  const world = useMemo(() => makeWorld(5, 240, configFromResults()), []);
  const share = shareAvailable(world, scenario, hour);
  let on = 0;
  for (let u = 0; u < world.n; u++) if (isOn(world, scenario, u, hour)) on += 1;
  return (
    <>
      <H>A phone trains only when it is idle, charging and on Wi-Fi, so many users are away.</H>
      <P>
        The project tests seven availability scenarios. Four are synthetic: always available, independent (the same
        chance for everyone), tied to activity, and social, where friends are online together. Three use a recorded
        trace of {fmt.int(trace().devices)} real devices: the trace, the trace matched to activity, and the trace
        replayed over time.
      </P>
      <P>
        Each user has an availability a, a probability. A user joins a round with probability q times a, so the
        expected cohort is q times the sum of the availabilities.
      </P>
      <Tex block>{String.raw`p_u = q \cdot a_u`}</Tex>
      <Note>Here the three trace scenarios are stood in for by a day and night curve. The trace itself is not in this deck.</Note>
      <Controls>
        <ScenarioChoice />
        <Slider label="Time of day" value={hour} min={0} max={24} step={0.25} onChange={setHour} format={clock} />
        <Buttons>
          <Button onClick={togglePlay}>{playing ? "Pause the clock" : "Play the day"}</Button>
        </Buttons>
        <Readouts>
          <Readout label="average chance of being free" value={fmt.pct(share, 0)} role="honest" />
          <Readout label="lights on now" value={`${on} of ${world.n}`} role="honest" />
        </Readouts>
      </Controls>
    </>
  );
}

/* ---------------------------------------------------------------- 11.2 the fairness question */

export function FairnessPanel() {
  const scenario = usePart((s) => s.scenario);
  const level = usePart((s) => s.level);
  const setLevel = usePart((s) => s.setLevel);
  const eps = epsilonOf(scenario);
  const bands = groupNdcg(scenario, level);
  const gapAlways = gapMean("always", "8");
  return (
    <>
      <H>The least active third gets the worse model, even when everyone is always available.</H>
      <P>
        Users are sorted into thirds by the length of their history. A band's height is that third's mean NDCG@10,
        measured; its lights show the third's mean availability. The gap is the top third minus the bottom third,
        reported with a bootstrap interval over users. With every phone always free it is already {fmt.ndcg(gapAlways)}{" "}
        at epsilon 8.
      </P>
      {eps.nominal ? (
        <Note tone="warn">
          In this scenario epsilon {eps.target} is nominal, and the accounting does not hold for anyone. Availability is a
          rank over all users, so adding or removing one user moves other users' chances of joining, which the
          analysis assumes are fixed. The record shows {fmt.n(eps.record, 2)}.
        </Note>
      ) : (
        <Note tone="good">
          Epsilon {eps.target} holds here ({fmt.n(eps.record, 2)} of record): who is available does not depend on any
          user's data, and selection is still Poisson.
        </Note>
      )}
      <Controls>
        <ScenarioChoice />
        <Choice<Level>
          label="Result shown"
          value={level}
          onChange={setLevel}
          options={[
            { value: "8", label: "private, epsilon 8" },
            { value: "nondp", label: "non-private" },
          ]}
        />
        <Readouts>
          <Readout label="least active third" value={fmt.ndcg(bands[0])} role={level === "8" ? "protected" : "honest"} />
          <Readout label="most active third" value={fmt.ndcg(bands[2])} role={level === "8" ? "protected" : "honest"} />
          <Readout label="gap" value={fmt.ndcg(bands[2] - bands[0])} role="attacker" />
        </Readouts>
      </Controls>
    </>
  );
}

