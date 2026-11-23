import { fmt, m } from "../../data";
import type { TheoryDef } from "../../deck/types";
import { Button, Buttons, Caption, Choice, CodeView, Controls, H, Note, P, Readout, Readouts, Slider, StatRow, Tex } from "../../ui";
import { BriefInversionPanel, BriefMeasuredPanel, BriefMeasuredStage } from "./brief";
import { useInversion, useNetwork, usePair } from "./derived";
import { Fallback } from "./Fallback";
import { Ladder } from "./Ladder";
import { Scene } from "./Scene";
import { linkAuc } from "./sim";
import { useLeak } from "./store";

const raw = (path: string) => m("update_leakage", `results/${path}`);

/* ---------------------------------------------------------------- 3.1 history inversion */

function InversionPanel() {
  const user = useLeak((s) => s.user);
  const size = useLeak((s) => s.size);
  const spill = useLeak((s) => s.spill);
  const setUser = useLeak((s) => s.setUser);
  const setSize = useLeak((s) => s.setSize);
  const setSpill = useLeak((s) => s.setSpill);
  const { recovery, k, count } = useInversion();
  return (
    <>
      <H>One update moves the user's own items most, so it reads like the history.</H>
      <P>
        Each column is the size of the update at one item. The items in the user's history (amber tiles) get a large
        change. The loss is a softmax over the whole catalogue, so every other item gets a little spill-over too. The attacker ranks items by that size and takes the top ones as
        the history, with no other knowledge.
      </P>
      <P>
        The real attack adds two standardised numbers per item: the change in its bias, and the size of the change in
        its embedding row. It needs one user's individual update.
      </P>
      <Controls>
        <Choice<string>
          label="User"
          value={String(user)}
          onChange={(v) => setUser(Number(v))}
          options={["A", "B", "C", "D"].map((name, i) => ({ value: String(i), label: name }))}
        />
        <Slider label="Items in the history" value={size} min={0} max={30} step={1} onChange={setSize} format={(v) => String(v)} />
        <Slider label="Spill-over" value={spill} min={0} max={0.8} step={0.02} onChange={setSpill} format={(v) => fmt.n(v, 2)} />
        <Readouts>
          <Readout label="attack AUC" value={fmt.n(recovery.auc, 3)} role="attacker" />
          <Readout label={`precision at ${k}`} value={fmt.n(recovery.precision, 2)} role="attacker" />
          <Readout label="popularity prior AUC" value={fmt.n(recovery.priorAuc, 3)} role="noise" />
        </Readouts>
        <Caption>
          Click a tile to add or remove an item. AUC is the chance that a real history item outscores another item; 0.5
          is guessing.
        </Caption>
      </Controls>
      {count === 0 || count === 30 ? (
        <Note>With an empty history, or every item in it, there is nothing to tell apart. The toy shows 0.5; the Python returns not a number.</Note>
      ) : null}
    </>
  );
}

/* ---------------------------------------------------------------- 3.2 cosine */

function CosinePanel() {
  const angle = useLeak((s) => s.angle);
  const threshold = useLeak((s) => s.threshold);
  const setAngle = useLeak((s) => s.setAngle);
  const setThreshold = useLeak((s) => s.setThreshold);
  const { cos, friends } = usePair();
  return (
    <>
      <H>Friends visit similar places, so their updates point the same way.</H>
      <P>
        This is the leak only a social platform has. Two friends tend to check in at similar places, so their updates
        lean in the same direction. The attacker scores a pair by the cosine of the angle between the two update
        vectors: 1 when they point the same way, 0 when unrelated, -1 when opposite.
      </P>
      <Tex block>{String.raw`\cos(u,v) = \frac{u \cdot v}{\lVert u \rVert \, \lVert v \rVert}`}</Tex>
      <P>
        Pairs at or above a chosen threshold are called friends. In the real data the effect is faint: friends average
        a cosine of {fmt.n(raw("raw/link/mean_cosine_friends"), 3)}, strangers {fmt.n(raw("raw/link/mean_cosine_non_friends"), 3)}.
      </P>
      <Controls>
        <Slider label="Angle between the updates" value={Math.round(angle)} min={0} max={180} step={1} onChange={setAngle} format={(v) => `${v} degrees`} />
        <Slider label="Threshold" value={threshold} min={-1} max={1} step={0.05} onChange={setThreshold} format={(v) => fmt.n(v, 2)} />
        <Readouts>
          <Readout label="cosine" value={fmt.n(cos, 2)} role="attacker" />
          <Readout label="the attacker guesses" value={friends ? "friends" : "not friends"} role={friends ? "attacker" : "muted"} />
        </Readouts>
        <Caption>Drag the tip of user B's arrow, or use the slider. A zero vector scores 0.</Caption>
      </Controls>
    </>
  );
}

/* ---------------------------------------------------------------- 3.3 the graph */

function NetworkPanel() {
  const threshold = useLeak((s) => s.threshold);
  const setThreshold = useLeak((s) => s.setThreshold);
  const nextNetwork = useLeak((s) => s.nextNetwork);
  const { net, guesses } = useNetwork();
  return (
    <>
      <H>A threshold turns scores into guesses: friendships found, missed, and invented.</H>
      <P>
        Pink lines are real friendships the attacker found, amber lines are real friendships it missed, and lavender
        lines are pairs it wrongly called friends. Lower the threshold and it finds more friendships, but calls more
        strangers friends as well.
      </P>
      <P>
        The AUC summarises every threshold at once: the chance that a random friend pair scores above a random
        non-friend pair. In this toy network it is {fmt.n(linkAuc(net), 2)}. The real attack scores {fmt.int(raw("raw/link/pairs"))} friend
        pairs and as many non-friend pairs among {fmt.int(m("update_leakage", "settings/n_targets"))} users.
      </P>
      <Controls>
        <Slider label="Threshold" value={threshold} min={-1} max={1} step={0.05} onChange={setThreshold} format={(v) => fmt.n(v, 2)} />
        <Readouts>
          <Readout label="found" value={String(guesses.hits)} role="attacker" />
          <Readout label="missed" value={String(guesses.missed)} role="honest" />
          <Readout label="wrong guesses" value={String(guesses.falseAlarms)} role="noise" />
        </Readouts>
        <Buttons>
          <Button kind="quiet" onClick={nextNetwork}>
            Another network
          </Button>
        </Buttons>
      </Controls>
    </>
  );
}

/* ---------------------------------------------------------------- 3.4 impact */

function ImpactPanel() {
  return (
    <>
      <H>With nothing protecting it, one update gives the history away almost completely.</H>
      <P>
        A curious server took one update from each of {fmt.int(m("update_leakage", "settings/n_targets"))} users, each
        from a single local step on the trained non-private model, and ranked the items. Its ten best guesses were real
        history {fmt.pct(raw("raw/recovery/precision_at_10/mean"), 2)} of the time, against {fmt.pct(raw("raw/recovery/prior_precision_at_10/mean"), 1)} for
        guessing popular items.
      </P>
      <P>
        Friendships leak much less: updates give a link AUC of {fmt.n(raw("raw/link/auc"), 3)}, where the histories
        themselves would give {fmt.n(raw("reference_histories/link/auc"), 3)}.
      </P>
      <Note tone="warn">
        These are single local steps at one model state, seen by an honest-but-curious server. The attack needs the
        individual update, not a securely aggregated sum.
      </Note>
    </>
  );
}

function ImpactStage() {
  const rawAuc = raw("raw/recovery/auc/mean");
  const rawPrecision = raw("raw/recovery/precision_at_10/mean");
  const priorAuc = raw("raw/recovery/prior_auc/mean");
  const priorPrecision = raw("raw/recovery/prior_precision_at_10/mean");
  const linkRaw = raw("raw/link/auc");
  const linkHistories = raw("reference_histories/link/auc");
  return (
    <>
      <StatRow
        items={[
          { label: "history AUC, raw update", value: fmt.n(rawAuc, 4), role: "attacker", note: `popularity prior ${fmt.n(priorAuc, 3)}` },
          { label: "precision at 10", value: fmt.n(rawPrecision, 4), role: "attacker", note: `popularity prior ${fmt.n(priorPrecision, 3)}` },
          { label: "link AUC from updates", value: fmt.n(linkRaw, 3), role: "attacker", note: "0.5 is guessing" },
          { label: "link AUC from histories", value: fmt.n(linkHistories, 3), role: "honest", note: "the ceiling for this score" },
        ]}
      />
      <Ladder
        panels={[
          { title: "Which items are in the history", raw: rawAuc, rawRole: "attacker", digits: 4, reference: { value: priorAuc, label: "popularity prior", role: "noise" } },
          { title: "Which pairs are friends", raw: linkRaw, rawRole: "attacker", digits: 3, reference: { value: linkHistories, label: "histories", role: "honest" } },
        ]}
        summary={`With the raw update the history is recovered with AUC ${fmt.n(rawAuc, 4)}, above the popularity prior of ${fmt.n(priorAuc, 3)}. Friend pairs are separated with AUC ${fmt.n(linkRaw, 3)}, against ${fmt.n(linkHistories, 3)} from the histories themselves. Only the unprotected rung is shown.`}
      />
      <Caption>
        One trained model, one seed: the figures average over the{" "}
        {fmt.int(m("update_leakage", "settings/n_targets"))} target users sampled, with no spread across training runs. AUC, higher is more leakage. Only the first rung of the defence ladder is drawn; the next concept adds the
        protections.
      </Caption>
    </>
  );
}

/* ---------------------------------------------------------------- 3.5 code */

function CodePanel() {
  return (
    <>
      <H>The two attacks in code: a score per item, and a cosine per pair.</H>
      <P>
        <strong>1. history_scores</strong> standardises the bias change and the size of each embedding-row change across
        items and adds them.
      </P>
      <P>
        <strong>2. recovery_metrics</strong> turns scores into AUC and precision at 10, and does the same for a
        popularity-only prior.
      </P>
      <P>
        <strong>3. pair_cosine</strong> scores row pairs; a zero vector gives 0.
      </P>
      <P>
        <strong>4. link_inference</strong> draws as many non-friend pairs as friend pairs and reports the AUC of the
        cosine.
      </P>
      <P>
        <strong>5. run</strong> scores the raw updates first. Two controls guard it: raw must recover histories, and a
        masked payload must sit at chance.
      </P>
      <Note>NumPy and SciPy score the attacks (rank-based AUC); PyTorch computes the updates.</Note>
    </>
  );
}

function CodeStage() {
  return (
    <CodeView
      refs={[
        "attacks/inversion.py::history_scores",
        "attacks/inversion.py::recovery_metrics",
        "attacks/links.py::pair_cosine",
        "attacks/links.py::link_inference",
        "experiments/update_leakage.py::run",
      ]}
      highlight={{
        "attacks/inversion.py::history_scores": [[48, 48]],
        "attacks/inversion.py::recovery_metrics": [[81, 82]],
        "attacks/links.py::pair_cosine": [[20, 22]],
        "attacks/links.py::link_inference": [[44, 45], [47, 47]],
        "experiments/update_leakage.py::run": [[297, 297], [333, 333], [335, 335]],
      }}
    />
  );
}

/* ---------------------------------------------------------------- theory */

export const theory: TheoryDef = {
  id: "leak",
  number: 3,
  title: "Attack: what one update reveals",
  short: "Update leak",
  Scene,
  Fallback,
  slides: [
    {
      id: "leak/1",
      kind: "theory",
      title: "History inversion",
      badge: "illustration",
      pose: { position: [0, 7.6, 10.2], target: [0, -0.5, 0.8] },
      step: 0,
      Panel: InversionPanel,
      brief: { title: "What one update gives away", Panel: BriefInversionPanel, step: 0 },
    },
    {
      id: "leak/2",
      kind: "theory",
      title: "Friendship links from update angles",
      badge: "illustration",
      pose: { position: [0, 0.6, 11.5], target: [0, -0.2, 0] },
      step: 1,
      Panel: CosinePanel,
    },
    {
      id: "leak/3",
      kind: "theory",
      title: "Guessing a friend network",
      badge: "illustration",
      pose: { position: [0, 8.2, 8.6], target: [0, 0, 0.2] },
      step: 2,
      Panel: NetworkPanel,
    },
    {
      id: "leak/4",
      kind: "impact",
      title: "Raw updates leak the history",
      badge: "measured",
      sources: ["update_leakage"],
      pose: { position: [4, 5, 13], target: [0, 0, 0] },
      step: 0,
      layout: "stage",
      Panel: ImpactPanel,
      Stage: ImpactStage,
      brief: {
        title: "Measured: a raw update gives the history away",
        Panel: BriefMeasuredPanel,
        Stage: BriefMeasuredStage,
        badge: "measured",
        sources: ["update_leakage"],
      },
    },
    {
      id: "leak/5",
      kind: "code",
      title: "The attacks in code",
      badge: "source",
      pose: { position: [-4, 5, 13], target: [0, 0, 0] },
      step: 2,
      layout: "stage",
      Panel: CodePanel,
      Stage: CodeStage,
    },
  ],
};
