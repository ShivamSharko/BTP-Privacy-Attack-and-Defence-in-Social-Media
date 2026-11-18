import { fmt, m, raw } from "../../data";
import { Button, Buttons, Choice, Controls, H, Note, P, Readout, Readouts, Slider, Tex } from "../../ui";
import { disagreement, distanceToGoal, MAX_DEGREE, type Optimiser } from "./sim";
import { GOAL, MAX_TRAIN_ROUNDS, START_RANGE, tableFor, useGossip } from "./store";

/* ---------------------------------------------------------------- 10.1 averaging with peers */

export function AveragingPanel() {
  const degree = useGossip((s) => s.degree);
  const values = useGossip((s) => s.values);
  const round = useGossip((s) => s.round);
  const playing = useGossip((s) => s.playing);
  const setDegree = useGossip((s) => s.setDegree);
  const step = useGossip((s) => s.step);
  const setPlaying = useGossip((s) => s.setPlaying);
  const restart = useGossip((s) => s.restart);
  const flags = tableFor(degree).isFriend.flat();
  const friendShare = flags.length === 0 ? 0 : flags.filter(Boolean).length / flags.length;
  return (
    <>
      <H>With no server, every user averages their model with a few peers each round.</H>
      <P>
        Each light is a user holding a model of their own; its colour is that model. In a round the user takes a local
        step on their own data (next slide), then replaces their model with the average of their own and their peers'
        models. Nothing is collected anywhere.
      </P>
      <P>
        Peers come from the friend graph: real friends first (amber lines), and random contacts (grey lines) only for
        users with fewer friends than peers. Friends keep a community's models alike; random contacts carry them
        across. In the project's runs {fmt.pct(m("gossip", "results/friend_peer_share"), 0)} of peer slots were real
        friends.
      </P>
      <Note>Click a light to overwrite that user's model, then watch the change spread.</Note>
      <Controls>
        <Slider label="Peers per round" value={degree} min={0} max={MAX_DEGREE} step={1} onChange={setDegree} format={(v) => String(v)} />
        <Buttons>
          <Button
            onClick={() => {
              setPlaying(false);
              step();
            }}
          >
            Step
          </Button>
          <Button kind="quiet" onClick={() => setPlaying(!playing)}>
            {playing ? "Pause" : "Play"}
          </Button>
          <Button kind="quiet" onClick={restart}>
            Restart
          </Button>
        </Buttons>
        <Readouts>
          <Readout label="round" value={String(round)} />
          <Readout label="still disagree, share of the start" value={fmt.pct(disagreement(values) / START_RANGE, 0)} role="model" />
          <Readout label="peer slots that are friends" value={fmt.pct(friendShare, 0)} role="honest" />
        </Readouts>
      </Controls>
    </>
  );
}

/* ---------------------------------------------------------------- 10.2 the optimiser */

export function OptimiserPanel() {
  const optimiser = useGossip((s) => s.optimiser);
  const rounds = useGossip((s) => s.trainRounds);
  const train = useGossip((s) => s.train);
  const playing = useGossip((s) => s.trainPlaying);
  const setOptimiser = useGossip((s) => s.setOptimiser);
  const setPlaying = useGossip((s) => s.setTrainPlaying);
  const restartTrain = useGossip((s) => s.restartTrain);
  const stepTrain = useGossip((s) => s.stepTrain);
  return (
    <>
      <H>Plain gossip did not learn on the real data. Adam with shared moments did.</H>
      <P>
        Each node clips its raw gradient to a fixed length, then steps. A plain step moves a parameter by its gradient,
        so parameters with small gradients barely move: here the lower of two parameters crawls. Adam rescales each
        step by the recent size of that parameter's gradient:
      </P>
      <Tex block>{String.raw`\theta \leftarrow \theta - \eta \, \frac{\hat m}{\sqrt{\hat v} + \epsilon}`}</Tex>
      <P>
        where m is the running average of the gradient and v of its square. Every round each node also averages both
        moments with its peers, so they approach the network's. In the project's tuning, per-node Adam and plain steps
        did not learn. This toy shows the mechanism only.
      </P>
      <Controls>
        <Choice<Optimiser>
          label="Local step"
          value={optimiser}
          onChange={setOptimiser}
          options={[
            { value: "plain", label: "plain averaging" },
            { value: "adam", label: "Adam, moments gossiped" },
          ]}
        />
        <Buttons>
          <Button onClick={() => setPlaying(!playing)}>{playing ? "Pause" : "Play"}</Button>
          <Button
            kind="quiet"
            onClick={() => {
              setPlaying(false);
              stepTrain();
            }}
          >
            Step
          </Button>
          <Button kind="quiet" onClick={() => restartTrain(true)}>
            Restart
          </Button>
        </Buttons>
        <Readouts>
          <Readout label={`round, of ${MAX_TRAIN_ROUNDS}`} value={String(rounds)} />
          <Readout label="average distance from the goal" value={fmt.pct(distanceToGoal(train, GOAL), 0)} role="model" />
        </Readouts>
      </Controls>
    </>
  );
}

/* ---------------------------------------------------------------- 10.3 local noise */

export function NoisePanel() {
  const noise = useGossip((s) => s.noise);
  const rounds = useGossip((s) => s.trainRounds);
  const train = useGossip((s) => s.train);
  const playing = useGossip((s) => s.trainPlaying);
  const setNoise = useGossip((s) => s.setNoise);
  const setPlaying = useGossip((s) => s.setTrainPlaying);
  const restartTrain = useGossip((s) => s.restartTrain);
  const eps = raw<(number | null)[]>("gossip", "settings/epsilons").find((e): e is number => e !== null) ?? Number.NaN;
  const byEps = `results/by_epsilon/${eps.toFixed(1)}`;
  const local = m("gossip", `${byEps}/local_noise_multiplier`);
  const rate = m("gossip", "settings/federated_sample_rate");
  // The federated comparison's calibration, keyed as acct/search.ts builds it.
  const central = m(
    "calibration",
    `v1-max-prv-pld|q=${rate}|T=${m("gossip", "settings/federated_rounds")}|n=${m("gossip", "settings/n_nodes")}|eps=${eps.toFixed(1)}`,
  );
  const cohort = rate * m("gossip", "results/nodes");
  const addOrRemove = m("gossip", `${byEps}/epsilon_claimed/gossip_local`);
  const replace = m("gossip", `${byEps}/epsilon_claimed/gossip_local_replace_adjacency`);
  return (
    <>
      <H>With no trusted server, every node adds its own noise, and that costs far more.</H>
      <P>
        A federated server adds noise once, to the sum of about {fmt.int(cohort)} clipped updates, at{" "}
        {fmt.n(central, 2)} times the clip length. In gossip no one may see a raw update, so every node noises its own
        clipped gradient before sending it: {fmt.n(local, 2)} times the clip length at epsilon {eps}, on every update,
        with no help from sampling. The signal is lost in it.
      </P>
      <P>
        The statement is weaker too. The local epsilon of {fmt.n(addOrRemove, 2)} treats a node with no data as the
        neighbouring input. If any two datasets of one device count as neighbours, the sensitivity doubles and the
        same noise gives epsilon {fmt.n(replace, 1)}.
      </P>
      <Controls>
        <Choice<"off" | "on">
          label="Local noise at every node"
          value={noise ? "on" : "off"}
          onChange={(v) => setNoise(v === "on")}
          options={[
            { value: "off", label: "off" },
            { value: "on", label: "on" },
          ]}
        />
        <Buttons>
          <Button onClick={() => setPlaying(!playing)}>{playing ? "Pause" : "Play"}</Button>
          <Button kind="quiet" onClick={() => restartTrain(true)}>
            Restart
          </Button>
        </Buttons>
        <Readouts>
          <Readout label={`round, of ${MAX_TRAIN_ROUNDS}`} value={String(rounds)} />
          <Readout label="average distance from the goal" value={fmt.pct(distanceToGoal(train, GOAL), 0)} role="model" />
          <Readout label="noise at each node, in clip lengths" value={noise ? fmt.n(local, 2) : "0"} role="noise" />
        </Readouts>
      </Controls>
    </>
  );
}
