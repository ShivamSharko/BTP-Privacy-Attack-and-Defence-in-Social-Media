import type { CSSProperties } from "react";
import { fact, fmt, m } from "../../data";
import type { TheoryDef } from "../../deck/types";
import { Button, Buttons, Caption, Choice, Controls, H, List, Note, P, Readout, Readouts } from "../../ui";
import { Fallback } from "./Fallback";
import { HUB_SHARE, introGraph, MEASURED } from "./graph";
import { Scene } from "./Scene";
import { Scoreboard } from "./Scoreboard";
import { ASIDES, goTo, type Highlight, type Leak, STAGES, useIntro } from "./store";
import { AGAINST, FIGURES, HYPOTHESES, word } from "./verdicts";

const TITLE: CSSProperties & Record<"--t-head", string> = { "--t-head": "calc(3.65 * var(--u))" };

/** Named as the project's own pre-registration names them; the export checks the quote. */
const GUIDE = String(fact("people.guide").value);
const PRESENTERS = String(fact("people.owners").value);

/* ---------------------------------------------------------------- 0.1 title */

function TitlePanel() {
  const reassemble = useIntro((s) => s.reassemble);
  return (
    <>
      <div style={TITLE}>
        <H>Privacy attack and defence in social media</H>
      </div>
      <P>
        PRISM-Rec: a place recommender for a social check-in app, trained across its users' phones, then attacked and
        defended, with every result measured.
      </P>
      <P>
        <strong>{PRESENTERS}</strong>
        <br />
        B.Tech project, guided by <strong>{GUIDE}</strong>
      </P>
      <Controls>
        <Buttons>
          <Button kind="quiet" onClick={reassemble}>
            Assemble again
          </Button>
        </Buttons>
        <Caption>
          The lights are generated in this browser to match the measured friend graph and show no real user. Drag the
          scene to look around it.
        </Caption>
      </Controls>
    </>
  );
}

/* ---------------------------------------------------------------- 0.2 introduction */

function IntroductionPanel() {
  return (
    <>
      <H>A social app recommends well because it knows where you go and who your friends are.</H>
      <P>
        A check-in app suggests places from your reviews and your friends. The usual way to train its recommender is
        to copy every user's history to one server, which then holds a map of everyone's habits and friendships, open
        to a breach or a curious insider.
      </P>
      <P>
        Federated learning promises a way out. The model travels to the phones, each phone trains on its own history,
        and only a small change to the model comes back.
      </P>
      <P>
        This project builds that system, attacks it the way a real adversary would, adds the standard defences one at
        a time, and measures what each one protects and what it costs in accuracy.
      </P>
      <Note tone="warn">
        The promise is not a proof: keeping data on the phone does not by itself keep it private.
      </Note>
    </>
  );
}

/* ---------------------------------------------------------------- 0.3 problem statement */

function StatementPanel() {
  const count = word(HYPOTHESES.length);
  return (
    <>
      <H>
        Problem statement: train a social recommender without collecting its users' data, and measure how private it
        really is.
      </H>
      <P>
        Given a check-in app whose users each hold their own review history and friend list, train one shared
        recommender so that:
      </P>
      <List
        items={[
          <>no history is uploaded, and the server cannot read one back from what it does receive;</>,
          <>an outsider holding the released model cannot tell who was in the training set;</>,
          <>a group of malicious accounts cannot push a chosen business into everyone's recommendations;</>,
          <>the recommendations stay useful, and anyone can check that the rules were followed.</>,
        ]}
      />
      <P>
        These goals pull against each other. The project measures, for each defence, how much it protects and how much
        accuracy it costs, on real data.
      </P>
      <Note>
        {count.charAt(0).toUpperCase() + count.slice(1)} hypotheses and their pass marks were written down before the
        test data were touched. The scoreboard at the end of this opening shows how each one came out.
      </Note>
    </>
  );
}

/* ---------------------------------------------------------------- 0.5 the data */

function DataPanel() {
  const highlight = useIntro((s) => s.highlight);
  const setHighlight = useIntro((s) => s.setHighlight);
  const drawn = introGraph();
  return (
    <>
      <H>The data is real: reviews, businesses and friendships from one metropolitan area.</H>
      <P>
        The experiments use the Philadelphia area of the Yelp Open Dataset: {fmt.int(m("dataset_card", "users"))} users,{" "}
        {fmt.int(m("dataset_card", "items"))} businesses, {fmt.int(m("dataset_card", "interactions"))} reviews and{" "}
        {fmt.int(m("social_graph", "edges"))} friendships. A review stands in for a check-in.
      </P>
      <Note>
        The picture is generated in this browser to match the measured friend graph and shows no real user. Measured:
        a mean of {fmt.n(MEASURED.meanDegree, 1)} friends, a median of {MEASURED.medianDegree}, and{" "}
        {fmt.pct(MEASURED.isolatedShare, 0)} with none. {fmt.int(drawn.degree.length)} lights keep those per-user
        figures; the biggest hub shrinks in proportion.
      </Note>
      <Controls>
        <Choice<Highlight>
          label="Light up"
          value={highlight}
          onChange={setHighlight}
          options={[
            { value: "all", label: "everyone" },
            { value: "hubs", label: `the best-connected ${fmt.pct(HUB_SHARE, 0)}` },
            { value: "alone", label: "users with no friends" },
          ]}
        />
        <Readouts>
          <Readout label="mean friends, drawn" value={fmt.n(drawn.stats.mean, 1)} role="honest" />
          <Readout label="median, drawn" value={fmt.n(drawn.stats.median, 0)} role="honest" />
          <Readout label="with none, drawn" value={fmt.pct(drawn.stats.isolatedShare, 0)} role="honest" />
          <Readout label="most friends, drawn" value={fmt.int(drawn.stats.max)} role="honest" />
        </Readouts>
      </Controls>
    </>
  );
}

/* ---------------------------------------------------------------- 0.4 the three leaks */

const LEAK_CONCEPT: Record<Exclude<Leak, "all">, { id: string; label: string }> = {
  update: { id: "leak", label: "Open: what an update reveals" },
  model: { id: "mia", label: "Open: membership inference" },
  crowd: { id: "poison", label: "Open: poisoning" },
};

function ProblemPanel() {
  const leak = useIntro((s) => s.leak);
  const setLeak = useIntro((s) => s.setLeak);
  return (
    <>
      <H>To recommend places, the model must learn where you go, and three things can give it away.</H>
      <P>
        Federated training keeps your history on your phone. Only a model update travels to the server, and the server
        publishes the trained model. Each of these is a way in.
      </P>
      <List
        items={[
          <>
            <strong>The update.</strong> It moves the model towards the places you visited, so it can be read back as
            your history. Friends' updates point the same way, which exposes friendships.
          </>,
          <>
            <strong>The model.</strong> It fits its own training users a little better than strangers, so an outsider
            can test whether you were one of them: membership inference.
          </>,
          <>
            <strong>The crowd.</strong> Malicious accounts send crafted updates that push one business into everyone's
            recommendations: poisoning.
          </>,
        ]}
      />
      <Controls>
        <Choice<Leak>
          label="Show"
          value={leak}
          onChange={setLeak}
          options={[
            { value: "all", label: "all three" },
            { value: "update", label: "the update" },
            { value: "model", label: "the model" },
            { value: "crowd", label: "the crowd" },
          ]}
        />
        <Buttons>
          {(leak === "all" ? (["update", "model", "crowd"] as const) : [leak]).map((k) => (
            <Button key={k} kind="quiet" onClick={() => goTo(LEAK_CONCEPT[k].id)}>
              {LEAK_CONCEPT[k].label}
            </Button>
          ))}
        </Buttons>
      </Controls>
    </>
  );
}

/* ---------------------------------------------------------------- 0.6 the system */

function SystemPanel() {
  const stage = useIntro((s) => s.stage);
  const playing = useIntro((s) => s.playing);
  const setStage = useIntro((s) => s.setStage);
  const togglePlay = useIntro((s) => s.togglePlay);
  const current = STAGES[stage];
  return (
    <>
      <H>Every defence sits on the path one update travels, from your phone to the released model.</H>
      <P>
        The moving light is one user's update in one round. It is computed on the phone, cut down to a fixed size,
        hidden under a mask, added up with everyone else's, blurred with noise, and only then allowed to change the
        model. The round is logged; the model leaves under a signed checkpoint, within its privacy budget.
      </P>
      <P>Each stop has its own part of this talk. Click a stop in the scene, or a button below, to open it.</P>
      <Controls>
        <Readouts>
          <Readout label={`stop ${stage + 1} of ${STAGES.length}`} value={current.name} role={current.role} />
        </Readouts>
        <Caption>{current.says}</Caption>
        <Buttons>
          <Button onClick={togglePlay}>{playing ? "Pause" : "Play"}</Button>
          <Button kind="quiet" onClick={() => setStage(stage - 1)}>
            Back
          </Button>
          <Button kind="quiet" onClick={() => setStage(stage + 1)}>
            Next stop
          </Button>
        </Buttons>
        <Buttons>
          {STAGES.map((s) => (
            <Button key={s.name} kind="quiet" onClick={() => goTo(s.concept)}>
              {s.name}
            </Button>
          ))}
        </Buttons>
        <Caption>Attacks on the path, an alternative to it, and how it was judged:</Caption>
        <Buttons>
          {ASIDES.map((a) => (
            <Button key={a.concept} kind="quiet" onClick={() => goTo(a.concept)}>
              {a.label}
            </Button>
          ))}
        </Buttons>
      </Controls>
    </>
  );
}

/* ---------------------------------------------------------------- 0.7 what we found */

function FoundPanel() {
  const against = word(AGAINST.length);
  return (
    <>
      <H>
        {against.charAt(0).toUpperCase() + against.slice(1)} of the {word(HYPOTHESES.length)} hypotheses went against
        the project. That is a result too.
      </H>
      <P>
        Each hypothesis and the rule that decides it were written down in <code>PREREGISTRATION.md</code> before the
        test data were touched. The verdicts on the right are read from the result files, not typed in.
      </P>
      <P>
        H1 says where user-level privacy stops at this population size: at ε = {FIGURES.h1Epsilon} the model loses more accuracy than
        hoped. H4 failed on how the gap grows, not on whether the trimmed mean helps; it helps, but it ruins the model
        and cannot be combined with a secure sum.
      </P>
      <P>
        H3 is split: membership inference stayed near chance, but a sum of {FIGURES.h3Cohort} users still leaks history. H5
        holds in {word(FIGURES.h5Held)} setting of {word(FIGURES.h5Cells)}, by a small margin.
      </P>
      <Caption>Click a row's button to open the evidence.</Caption>
    </>
  );
}

/* ---------------------------------------------------------------- theory */

export const theory: TheoryDef = {
  id: "intro",
  number: 0,
  title: "Privacy attack and defence in social media",
  short: "Opening",
  Scene,
  Fallback,
  // Scene steps: 0 the friend graph, 1 the three leaks, 2 the pipeline, 3 the graph behind the scoreboard.
  slides: [
    {
      id: "intro/1",
      kind: "extra",
      title: "Privacy attack and defence in social media",
      badge: "illustration",
      pose: { position: [0, 3.6, 13.2], target: [0, -0.4, 0] },
      step: 0,
      Panel: TitlePanel,
    },
    {
      id: "intro/2",
      kind: "extra",
      title: "Introduction",
      badge: "illustration",
      pose: { position: [-3.4, 1.9, 11.4], target: [0, 0.1, 0] },
      step: 0,
      Panel: IntroductionPanel,
    },
    {
      id: "intro/3",
      kind: "extra",
      title: "Problem statement",
      badge: "illustration",
      pose: { position: [-1.2, 2.8, 14.6], target: [0, 0.9, 0] },
      step: 1,
      Panel: StatementPanel,
    },
    {
      id: "intro/4",
      kind: "extra",
      title: "What a recommender learns, and what leaks",
      badge: "illustration",
      pose: { position: [0.6, 3.6, 13.6], target: [0, 0.9, 0] },
      step: 1,
      Panel: ProblemPanel,
    },
    {
      id: "intro/5",
      kind: "extra",
      title: "The data",
      badge: "measured",
      sources: ["dataset_card", "social_graph"],
      pose: { position: [0, 7.4, 11.2], target: [0, -0.8, 0] },
      step: 0,
      Panel: DataPanel,
    },
    {
      id: "intro/6",
      kind: "extra",
      title: "The system end to end",
      badge: "illustration",
      pose: { position: [0, 1.6, 12], target: [0, 0, 0] },
      step: 2,
      Panel: SystemPanel,
    },
    {
      id: "intro/7",
      kind: "extra",
      title: "What we found",
      badge: "measured",
      sources: ["privacy_utility", "gossip", "membership", "update_leakage", "poisoning", "participation"],
      pose: { position: [6, 6, 16], target: [0, 0, 0] },
      step: 3,
      layout: "stage",
      Panel: FoundPanel,
      Stage: Scoreboard,
    },
  ],
};
