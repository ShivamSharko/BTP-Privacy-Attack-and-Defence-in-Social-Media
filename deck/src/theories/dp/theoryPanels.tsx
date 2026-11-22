import { fmt } from "../../data";
import { Choice, Controls, H, Note, P, Readout, Readouts, Slider, Tex, Without } from "../../ui";
import { clip, clippedShare, distanceFor, eventProbability, N_UPDATES, norm, overlap } from "./sim";
import { type Cohort, PROJECT_C, useDp, WINDOW_WIDTH } from "./store";
import { DELTA, removedIndex, TOY_UPDATES, USERS } from "./toy";

/** delta written for people: 1.01 × 10^-5. */
export function deltaTex(): string {
  const exponent = Math.floor(Math.log10(DELTA));
  const mantissa = DELTA / 10 ** exponent;
  return String.raw`${mantissa.toFixed(2)} \times 10^{${exponent}}`;
}

/* ---------------------------------------------------------------- 6.1 the promise */

export function PromisePanel() {
  const epsilon = useDp((s) => s.epsilon);
  const setEpsilon = useDp((s) => s.setEpsilon);
  const d = distanceFor(epsilon, DELTA);
  return (
    <>
      <H>Your whole history in or out, what comes out looks almost the same.</H>
      <P>
        Picture two worlds that differ in one user. In the left one, your entire history is in the training data; in
        the right one, it never was. Training is deliberately random, so each world produces a cloud of possible
        models, not one. Differential privacy promises that the two clouds nearly coincide, so nobody who sees the
        result can tell which world they are in.
      </P>
      <P>
        Epsilon (<Tex>{String.raw`\varepsilon`}</Tex>) sets how far apart the clouds may drift: smaller is closer and
        more private. Delta (<Tex>{String.raw`\delta`}</Tex>) is a tiny probability with which the promise may fail.
        <Without slide="dp/2"> This is user-level privacy: what is protected is a whole history, not one check-in.</Without>
      </P>
      <Note>
        Illustration: a single noisy release at <Tex>{String.raw`\delta = ${deltaTex()}`}</Tex>. The project's
        epsilon covers every round of training and comes from the accountant, in the Privacy accounting topic.
      </Note>
      <Controls>
        <Slider label="Epsilon" value={epsilon} min={0.1} max={10} step={0.1} onChange={setEpsilon} format={(v) => fmt.n(v, 1)} />
        <Readouts>
          <Readout label="shared area of the two clouds" value={fmt.pct(overlap(d), 0)} role="protected" />
          <Readout label="gap between centres, in noise widths" value={fmt.n(d, 2)} role="honest" />
        </Readouts>
      </Controls>
    </>
  );
}

/* ---------------------------------------------------------------- 6.2 the definition */

export function DefinitionPanel() {
  const epsilon = useDp((s) => s.epsilon);
  const start = useDp((s) => s.windowStart);
  const setEpsilon = useDp((s) => s.setEpsilon);
  const setStart = useDp((s) => s.setWindowStart);
  const d = distanceFor(epsilon, DELTA);
  const pWith = eventProbability(-d / 2, start, start + WINDOW_WIDTH);
  const pWithout = eventProbability(d / 2, start, start + WINDOW_WIDTH);
  const ratio = Math.max(pWith, pWithout) / Math.max(Math.min(pWith, pWithout), 1e-300);
  const allowed = Math.exp(epsilon);
  return (
    <>
      <H>For every possible outcome, one user changes its chance by at most a factor of e to the epsilon.</H>
      <Tex block>{String.raw`\Pr[M(D) \in S] \;\le\; e^{\varepsilon}\, \Pr[M(D') \in S] + \delta`}</Tex>
      <P>
        <Tex>M</Tex> is the whole training procedure, which is random. <Tex>D</Tex> is the training data and{" "}
        <Tex>D'</Tex> the same data with one user removed. <Tex>S</Tex> is any set of outcomes someone might test
        for, such as "the model ranks this café first". The inequality must hold for every <Tex>S</Tex>, and with{" "}
        <Tex>D</Tex> and <Tex>D'</Tex> swapped.
      </P>
      <P>
        User-level means <Tex>D</Tex> and <Tex>D'</Tex> differ by one user's entire history across all rounds, not by
        a single check-in. With <Tex>n</Tex> = {fmt.int(USERS)} users the project sets{" "}
        <Tex>{String.raw`\delta = 1/(10n) = ${deltaTex()}`}</Tex>, well below <Tex>1/n</Tex>.
      </P>
      <Controls>
        <Slider label="Epsilon" value={epsilon} min={0.1} max={10} step={0.1} onChange={setEpsilon} format={(v) => fmt.n(v, 1)} />
        <Slider label="Window S" value={start} min={-4} max={4 - WINDOW_WIDTH} step={0.05} onChange={setStart} format={(v) => fmt.n(v, 2)} />
        <Readouts>
          <Readout label="chance with you" value={fmt.pct(pWith, 1)} role="honest" />
          <Readout label="chance without you" value={fmt.pct(pWithout, 1)} role="model" />
          <Readout label="ratio, larger over smaller" value={`${fmt.n(ratio, 2)}x`} role="attacker" />
          <Readout label="allowed, e to the epsilon" value={`${allowed < 100 ? fmt.n(allowed, 2) : fmt.int(allowed)}x`} role="protected" />
          {ratio > allowed && (
            <Readout
              label="excess, within delta"
              value={(Math.max(pWith, pWithout) - allowed * Math.min(pWith, pWithout)).toExponential(1)}
              role="noise"
            />
          )}
        </Readouts>
      </Controls>
    </>
  );
}

/* ---------------------------------------------------------------- 6.3 clipping */

export function ClipPanel() {
  const C = useDp((s) => s.C);
  const setC = useDp((s) => s.setC);
  const share = clippedShare(TOY_UPDATES, C);
  return (
    <>
      <H>Clipping caps how far any one user can push the model.</H>
      <P>
        A user's whole update, every parameter at once, is treated as one long vector. If its length (the L2 norm) is
        above <Tex>C</Tex>, it is scaled down to exactly <Tex>C</Tex>; if not, it is left alone. Its direction never
        changes.
      </P>
      <Tex block>{String.raw`\bar\Delta_u = \Delta_u \cdot \min\!\left(1,\; \frac{C}{\lVert \Delta_u \rVert_2}\right)`}</Tex>
      <P>
        <Tex>{String.raw`\Delta_u`}</Tex> is user <Tex>u</Tex>'s update and <Tex>C</Tex> the clipping norm. Afterwards,
        adding or removing one user moves the sum of updates by at most <Tex>C</Tex>. That bound, the sensitivity, is
        what the noise on the next slide is sized to.
      </P>
      <Note>
        The project uses <Tex>C</Tex> = {PROJECT_C} in both regimes, chosen on validation data. The update lengths here
        are invented. Drag the sphere, or use the slider.
      </Note>
      <Controls>
        <Slider label="Clipping norm C" value={C} min={0} max={10} step={0.1} onChange={setC} format={(v) => fmt.n(v, 1)} />
        <Readouts>
          <Readout label="updates clipped" value={`${Math.round(share * N_UPDATES)} of ${N_UPDATES}`} role="protected" />
          <Readout label="share clipped" value={fmt.pct(share, 0)} role="protected" />
          <Readout label="most one user can move the sum" value={fmt.n(C, 1)} role="honest" />
        </Readouts>
      </Controls>
    </>
  );
}

/* ---------------------------------------------------------------- 6.4 noise */

export function NoisePanel() {
  const C = useDp((s) => s.C);
  const z = useDp((s) => s.z);
  const cohort = useDp((s) => s.cohort);
  const setZ = useDp((s) => s.setZ);
  const setCohort = useDp((s) => s.setCohort);
  const sigma = z * C;
  const shift = norm(clip(TOY_UPDATES[removedIndex], C));
  return (
    <>
      <H>Noise is added once to the sum, sized to the most one user can change it.</H>
      <Tex block>{String.raw`\tilde\Delta = \frac{1}{qn}\Big(\sum_{u \in S_t} \bar\Delta_u + \mathcal{N}\big(0,\, z^2 C^2 I\big)\Big)`}</Tex>
      <P>
        The server adds Gaussian noise with standard deviation <Tex>z \times C</Tex> to every coordinate of the clipped
        sum over the round's cohort <Tex>S_t</Tex>, once per round, then divides by <Tex>qn</Tex>: the sampling rate
        times the number of users, the expected cohort size. The accountant chooses the noise multiplier <Tex>z</Tex>{" "}
        to reach the target epsilon.
      </P>
      <P>
        Removing one user moves the sum by at most <Tex>C</Tex>, which is <Tex>1/z</Tex> noise widths: lost in the cloud.
      </P>
      <Note>
        An empty cohort still gets noise, so a quiet round looks like any other. The divisor is the public{" "}
        <Tex>qn</Tex>, never the number who took part, which would give that number away.
      </Note>
      <Controls>
        <Slider label="Noise multiplier z" value={z} min={0} max={4} step={0.01} onChange={setZ} format={(v) => fmt.n(v, 2)} />
        <Choice<Cohort>
          label="Cohort"
          value={cohort}
          onChange={setCohort}
          options={[
            { value: "all", label: `all ${N_UPDATES}` },
            { value: "minus", label: "remove one user" },
            { value: "empty", label: "empty" },
          ]}
        />
        <Readouts>
          <Readout label="noise width, z times C" value={fmt.n(sigma, 1)} role="noise" />
          <Readout label="shift from removing that user" value={cohort === "minus" ? fmt.n(shift, 1) : "none"} role="honest" />
          <Readout label="shift in noise widths" value={cohort !== "minus" ? "none" : sigma > 0 ? fmt.n(shift / sigma, 2) : "exposed"} role="protected" />
        </Readouts>
      </Controls>
    </>
  );
}
