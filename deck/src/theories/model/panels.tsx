import { useEffect, useMemo } from "react";
import { fmt, m } from "../../data";
import { Button, Buttons, Choice, Controls, H, Note, P, Readout, Readouts, Slider, Table, Tex } from "../../ui";
import { CATALOGUE as cat, COMPARE_TOP, distinctTopK, hiddenRanks, type Mode, N_ITEMS, scores, sampleUsers, softmaxLoss, splitHistory, TOP, topK, userVector } from "./sim";
import { FROZEN_TEMPERATURE, TEMPERATURE_MAX, useModel } from "./store";

export const MODE_LABELS: Record<Mode, string> = { content: "Content only", ids: "IDs only", hybrid: "Hybrid" };
const KINDS = ["coffee shop", "restaurant", "bar", "shop"];

const items = () => m("dataset_card", "items");
const dim = () => m("privacy_utility", "frozen/model/dim");

/** The kind of place most of a history belongs to. */
function mainKind(history: readonly number[]): number {
  const tally = new Array<number>(KINDS.length).fill(0);
  for (const i of history) tally[cat.cluster[i]]++;
  return tally.indexOf(Math.max(...tally));
}

/* ---------------------------------------------------------------- 1.1 the score */

export function ScorePanel() {
  const history = useModel((s) => s.history);
  const clear = useModel((s) => s.clear);
  const nextExample = useModel((s) => s.nextExample);
  const top = useMemo(
    () => topK(scores(cat, userVector(cat, history, "hybrid"), FROZEN_TEMPERATURE, "hybrid"), TOP, history),
    [history],
  );
  const kind = mainKind(history);
  const same = top.filter((i) => cat.cluster[i] === kind).length;
  return (
    <>
      <H>A user is built from the average of their history, and a place's score is a cosine.</H>
      <P>
        Each place has a fixed text part, which says what kind of place it is, and a trainable ID part, which learns
        who likes it. Their sum, normalised, is a direction: a point on the sphere.
      </P>
      <P>
        A user has no vector of their own. The mean of their history's place vectors is passed through a small
        learned square matrix (<code>umap</code> in the code) and normalised, on the device, never shared. Places already in the history are skipped.
      </P>
      <Tex block>{String.raw`u = \frac{M\bar{v}}{\lVert M\bar{v} \rVert}, \qquad s_i = \tau \cdot \cos(u, v_i) + b_i`}</Tex>
      <P>
        Here v̄ is the history mean, M the learned matrix, τ the temperature, v<sub>i</sub> place i and b<sub>i</sub>{" "}
        its bias, which learns popularity. Toy: {N_ITEMS} places in 3 dimensions, M kept at its starting value, the identity. Real: {fmt.int(items())} places in {dim()} dimensions.
      </P>
      <Controls>
        <P>Click a point to add it to the history or remove it. Drag empty space to turn the sphere.</P>
        <Buttons>
          <Button onClick={nextExample}>Another example user</Button>
          <Button kind="quiet" onClick={clear}>
            Empty the history
          </Button>
        </Buttons>
        <Readouts>
          <Readout label="places in the history" value={String(history.length)} role="honest" />
          <Readout label={`of the top ${TOP}, same kind as the user`} value={history.length ? `${same}` : "none"} role="model" />
        </Readouts>
      </Controls>
    </>
  );
}

/* ---------------------------------------------------------------- 1.2 training */

function TemperatureSlider() {
  const temperature = useModel((s) => s.temperature);
  const setTemperature = useModel((s) => s.setTemperature);
  return (
    <Slider
      label={`Temperature τ (the project froze ${FROZEN_TEMPERATURE})`}
      value={temperature}
      min={0}
      max={TEMPERATURE_MAX}
      step={1}
      onChange={setTemperature}
      format={(v) => v.toFixed(0)}
    />
  );
}

export function TrainingPanel() {
  const history = useModel((s) => s.history);
  const seed = useModel((s) => s.seed);
  const temperature = useModel((s) => s.temperature);
  const rehide = useModel((s) => s.rehide);
  const nextExample = useModel((s) => s.nextExample);
  useEffect(() => useModel.getState().ensureHistory(2), []);
  const stats = useMemo(() => {
    const { visible, hidden } = splitHistory(history, seed);
    const ranks = hiddenRanks(cat, visible, hidden, temperature, "hybrid");
    return {
      visible: visible.length,
      hidden: hidden.length,
      loss: softmaxLoss(cat, visible, hidden, temperature, "hybrid"),
      inTop: ranks.filter((r) => r <= TOP).length,
      meanRank: ranks.length ? ranks.reduce((a, b) => a + b, 0) / ranks.length : 0,
      candidates: N_ITEMS - visible.length,
    };
  }, [history, seed, temperature]);
  return (
    <>
      <H>Training hides half of a history and asks the model to find it.</H>
      <P>
        For each user, every place in the history is hidden with probability one half. The user vector is built from
        the visible places only, and the model must give the hidden ones a high probability.
      </P>
      <P>
        The softmax runs over the whole catalogue, not a sample of it, with the visible places masked out, because
        recommending them would be pointless. The loss is the mean of minus log probability over the hidden places; its
        gradient pulls the user vector, and through it the item vectors and biases, toward them.
      </P>
      <Tex block>{String.raw`L = -\frac{1}{|H|} \sum_{i \in H} \log \operatorname{softmax}_i(s)`}</Tex>
      <Note>The toy always hides one place and keeps one. The real code flips a coin per place, so a short history can end up with nothing hidden.</Note>
      <Controls>
        <TemperatureSlider />
        <Buttons>
          <Button onClick={rehide}>Hide a different half</Button>
          <Button kind="quiet" onClick={nextExample}>
            Another example user
          </Button>
        </Buttons>
        <Readouts>
          <Readout label="visible, hidden" value={`${stats.visible}, ${stats.hidden}`} role="honest" />
          <Readout label="loss" value={fmt.n(stats.loss, 2)} role="model" />
          <Readout
            label={`mean rank of hidden, of ${stats.candidates}`}
            value={stats.hidden ? fmt.n(stats.meanRank, 1) : "none hidden"}
          />
          <Readout label={`hidden places in the top ${TOP}`} value={`${stats.inTop} of ${stats.hidden}`} role="model" />
        </Readouts>
      </Controls>
    </>
  );
}

/* ---------------------------------------------------------------- 1.3 why IDs */

export function CollapsePanel() {
  const mode = useModel((s) => s.mode);
  const temperature = useModel((s) => s.temperature);
  const setMode = useModel((s) => s.setMode);
  const slots = sampleUsers(cat).length * COMPARE_TOP;
  const rows = useMemo(
    () => (["content", "ids", "hybrid"] as Mode[]).map((md) => [MODE_LABELS[md], `${distinctTopK(cat, temperature, md, COMPARE_TOP).distinct} of ${slots}`]),
    [temperature, slots],
  );
  return (
    <>
      <H>Text alone cannot tell similar places apart, so popularity decides.</H>
      <P>
        Text says what kind of place something is, not who likes it. With content only, all coffee shops get almost
        the same vector, the cosine barely separates them, and the bias decides: everyone gets the same popular places.
        The project's first model worked this way and ranked about like the most-popular baseline, so it was replaced
        (decision ADR-043).
      </P>
      <P>
        The ID part can learn taste. It starts at zero, so training begins from the content ranking and adds taste on
        top. At temperature 0 the cosine counts for nothing and all three choices give everyone the same list.
      </P>
      <Note>The toy counts different places among the top {COMPARE_TOP} of twelve sample users. It is not the real measure.</Note>
      <Controls>
        <Choice<Mode>
          label="Item vector made of"
          value={mode}
          onChange={setMode}
          options={(["content", "ids", "hybrid"] as Mode[]).map((value) => ({ value, label: MODE_LABELS[value] }))}
        />
        <TemperatureSlider />
        <Table head={["Item vector", "Different places recommended"]} rows={rows} />
      </Controls>
    </>
  );
}
