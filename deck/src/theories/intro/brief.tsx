import { fmt, m } from "../../data";
import { Button, Buttons, Caption, Choice, Controls, H, List, Note, P, Readout, Readouts, Table } from "../../ui";
import { HUB_SHARE, MEASURED } from "./graph";
import { type Highlight, type Leak, STAGES, useIntro } from "./store";

/** The brief edition's own slides of the opening. */

/* ---------------------------------------------------------------- the problem */

const QUESTIONS: [string, string][] = [
  ["Privacy cost", "How much accuracy does privacy cost?"],
  ["Gossip", "Can phones train without a server at all?"],
  ["Attacks", "How much do the defences cut an attack's success?"],
  ["Poisoning", "What protection is left when updates are hidden?"],
  ["Participation", "Who is left out when only some phones are online?"],
  ["Ledger", "What does a checkable record of training cost?"],
];

export function BriefProblemPanel() {
  return (
    <>
      <H>A recommender learns from where you go and who your friends are, and collecting that is the risk.</H>
      <P>
        A check-in app suggests places from your reviews and your friends. Training it usually means copying every
        history to one server, a map of everyone's habits and friendships that a breach or a curious insider could
        read. Federated training keeps each history on its phone and sends back only a small change to the model, the
        update.
      </P>
      <P>
        Even so, the update, the released model and fake accounts each open an attack. This project builds the system,
        attacks it, adds the defences one at a time, and measures six questions.
      </P>
    </>
  );
}

export function BriefProblemStage() {
  return (
    <div>
      <h2>The six questions the project measures</h2>
      <Table head={["Topic", "The question"]} rows={QUESTIONS.map(([topic, question]) => [topic, question])} />
    </div>
  );
}

/* ---------------------------------------------------------------- what leaks */

export function BriefLeaksPanel() {
  const leak = useIntro((s) => s.leak);
  const setLeak = useIntro((s) => s.setLeak);
  return (
    <>
      <H>Three parties can attack a federated recommender, and each attack has its own defence.</H>
      <List
        items={[
          <>
            <strong>A curious server</strong> reads an update back as the user's history. Defence: a secure sum, which
            shows the server only the total of many updates.
          </>,
          <>
            <strong>An outsider</strong> tests the released model to learn who trained it. Defence: differential
            privacy, noise sized by a privacy budget, epsilon (smaller is more private).
          </>,
          <>
            <strong>Fake accounts</strong> send crafted updates to push one business. Defence: robust aggregation,
            which drops extreme updates.
          </>,
        ]}
      />
      <P>Free-riders, accounts that take the model and send nothing useful, also act from inside.</P>
      <Controls>
        <Choice<Leak>
          label="Show"
          value={leak}
          onChange={setLeak}
          options={[
            { value: "all", label: "all three" },
            { value: "update", label: "the server" },
            { value: "model", label: "the outsider" },
            { value: "crowd", label: "fake accounts" },
          ]}
        />
      </Controls>
    </>
  );
}

/* ---------------------------------------------------------------- the data */

export function BriefDataPanel() {
  const highlight = useIntro((s) => s.highlight);
  const setHighlight = useIntro((s) => s.setHighlight);
  const train = m("dataset_card", "split_counts/train");
  const val = m("dataset_card", "split_counts/val");
  const test = m("dataset_card", "split_counts/test");
  const total = train + val + test;
  return (
    <>
      <H>The data is real: Philadelphia reviews and friendships from the Yelp Open Dataset.</H>
      <P>
        There are {fmt.int(m("dataset_card", "users"))} users, {fmt.int(m("dataset_card", "items"))} businesses,{" "}
        {fmt.int(m("dataset_card", "interactions"))} reviews, which stand in for check-ins, and{" "}
        {fmt.int(m("social_graph", "edges"))} friendships. A {m("dataset_card", "k_core")}-core filter keeps only users
        and businesses with at least {m("dataset_card", "k_core")} reviews.
      </P>
      <P>
        Each user's reviews are cut by date: the oldest {fmt.pct(train / total, 0)} train the model, the next{" "}
        {fmt.pct(val / total, 0)} tune it and the newest {fmt.pct(test / total, 0)} test it. The friend network is why
        this dataset: social ties are what a social recommender uses, and what an attack can expose.
      </P>
      <Note>
        The lights are generated to match the measured graph: a mean of {fmt.n(MEASURED.meanDegree, 1)} friends, a
        median of {MEASURED.medianDegree}, and {fmt.pct(MEASURED.isolatedShare, 0)} of users with none.
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
      </Controls>
    </>
  );
}

/* ---------------------------------------------------------------- the system */

export function BriefSystemPanel() {
  const stage = useIntro((s) => s.stage);
  const playing = useIntro((s) => s.playing);
  const setStage = useIntro((s) => s.setStage);
  const togglePlay = useIntro((s) => s.togglePlay);
  const current = STAGES[stage];
  return (
    <>
      <H>One update's trip from a phone to the released model passes every defence in this project.</H>
      <P>
        Follow the moving light. The phone trains on its own history, the update is clipped to a fixed size, masked,
        added to everyone else's, blurred with noise, and only then moves the model.
      </P>
      <P>
        Three accountants then check the privacy budget, every round is signed into a ledger, and a release gate stops
        the model if the budget would be broken. The attacks and the evaluation run against this whole path.
      </P>
      <Note>All of it is a simulation: one program on one computer, with real data and no real phones.</Note>
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
      </Controls>
    </>
  );
}
