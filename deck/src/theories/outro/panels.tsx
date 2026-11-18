import { fmt } from "../../data";
import { Button, Buttons, Choice, Controls, H, Note, P, Readout, Readouts, Slider } from "../../ui";
import { ATTACK_SHARE, GROUP_CONCEPT, GROUP_NAME, GROUP_ROLE, POINTS, pointById, REPLAY, SETTINGS } from "./figures";
import { LiveChart } from "./LiveChart";
import { type Aggregator, fakeCount, MAX_SHARE, N_GROUPS, N_ITEMS, N_USERS, TOP_K } from "./sim";
import { MAX_ROUNDS, POPULAR, useOutro } from "./store";

/* ---------------------------------------------------------------- 14.1 the sandbox */

export function SandboxPanel() {
  const settings = useOutro((s) => s.settings);
  const running = useOutro((s) => s.running);
  const round = useOutro((s) => s.round);
  const accuracy = useOutro((s) => s.accuracy);
  const exposure = useOutro((s) => s.exposure);
  const set = useOutro((s) => s.set);
  const toggle = useOutro((s) => s.toggle);
  const resetSandbox = useOutro((s) => s.resetSandbox);
  const fakes = fakeCount(settings.share);
  return (
    <>
      <H>Your turn: attack the federation, then defend it.</H>
      <P>
        {N_USERS} users in {N_GROUPS} taste groups train a shared recommender over {N_ITEMS} items, round by round, as in
        concept 2. Fake accounts push one item nobody chose. Add them, then defend with a robust aggregator, noise or
        another cohort size. Defences prevent rather than repair: choose one, then press Reset.
      </P>
      <Note tone="warn">
        A toy running in your browser: its numbers are not the project's results. The noise slider sets the noise
        multiplier only; the real privacy accounting is in concept 7.
      </Note>
      <Controls>
        <Buttons>
          <Button onClick={toggle}>{running ? "Pause" : round >= MAX_ROUNDS ? "Start again" : "Start"}</Button>
          <Button kind="quiet" onClick={resetSandbox}>
            Reset
          </Button>
        </Buttons>
        <Slider label="Noise multiplier z" value={settings.noise} min={0} max={3} step={0.1} onChange={(noise) => set({ noise })} format={(v) => fmt.n(v, 1)} />
        <Slider
          label="Fake accounts"
          value={settings.share}
          min={0}
          max={MAX_SHARE}
          step={0.05}
          onChange={(share) => set({ share })}
          format={(v) => `${fmt.pct(v, 0)}, ${fakeCount(v)}`}
        />
        <Slider
          label="Sampling rate q"
          value={settings.q}
          min={0}
          max={1}
          step={0.05}
          onChange={(q) => set({ q })}
          format={(v) => `${fmt.pct(v, 0)}, ~${fmt.n(v * (N_USERS + fakes), 0)}`}
        />
        <Choice<Aggregator>
          label="Aggregator"
          value={settings.aggregator}
          onChange={(aggregator) => set({ aggregator })}
          options={[
            { value: "sum", label: "sum" },
            { value: "trimmed", label: `trimmed mean, ${fmt.pct(settings.trim, 0)} each end` },
            { value: "median", label: "median" },
          ]}
        />
        <Readouts>
          <Readout label="rounds run" value={String(round)} />
          <Readout label={`held-out items in top ${TOP_K}`} value={fmt.pct(accuracy, 0)} role="model" />
          <Readout label="most-popular list" value={fmt.pct(POPULAR, 0)} role="noise" />
          <Readout label="users shown the promoted item" value={fmt.pct(exposure, 0)} role="attacker" />
        </Readouts>
        <LiveChart />
      </Controls>
    </>
  );
}

/* ---------------------------------------------------------------- 14.2 the trade-offs */

const chip = { padding: "3px 10px", minHeight: 0, fontSize: "0.82em" } as const;

export function TradeoffPanel() {
  const hovered = useOutro((s) => s.hovered);
  const setHovered = useOutro((s) => s.setHovered);
  const focus = pointById(hovered);
  return (
    <>
      <H>No configuration we measured is private, accurate and robust at once.</H>
      <P>
        Each point is one measured configuration. Up is NDCG@10, the ranking quality. Right is more privacy: every
        halving of ε moves a point one step right, and no noise sits at the left end. Towards you is robustness: one
        minus the share of users shown the promoted item at {fmt.pct(Number(ATTACK_SHARE), 0)} attackers.
      </P>
      <Note>
        The points come from different experiments: the poisoning runs used q = {SETTINGS.poisonRate} and{" "}
        {SETTINGS.poisonRounds} rounds without noise, so compare heights within one colour. Robustness was never
        measured with privacy noise; those points sit on the grey back plane.
      </Note>
      <Controls>
        <Readouts>
          <Readout label={focus ? focus.label : "hover or focus a point"} value={focus ? fmt.ndcg(focus.ndcg) : "NDCG@10"} role={focus ? GROUP_ROLE[focus.group] : undefined} />
          <Readout label="epsilon" value={focus ? (focus.epsilon === null ? "no noise" : fmt.n(focus.epsilon, 2)) : "none"} role="protected" />
          <Readout
            label="users shown the target"
            value={focus ? (focus.exposure === null ? "not measured" : fmt.pct(focus.exposure, 1)) : "none"}
            role="attacker"
          />
        </Readouts>
        {(["dp", "poison", "gossip"] as const).map((group) => (
          <div key={group} role="group" aria-label={GROUP_NAME[group]} style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {POINTS.filter((p) => p.group === group).map((p) => (
              <button
                key={p.id}
                type="button"
                className="btn"
                data-kind="quiet"
                style={{ ...chip, borderColor: `var(--${GROUP_ROLE[group]})`, outlineColor: `var(--${GROUP_ROLE[group]})` }}
                aria-pressed={hovered === p.id}
                aria-label={`${p.label}. Opens ${GROUP_CONCEPT[group]}.`}
                onMouseEnter={() => setHovered(p.id)}
                onFocus={() => setHovered(p.id)}
                onClick={() => {
                  window.location.hash = p.hash;
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
        ))}
      </Controls>
    </>
  );
}

/* ---------------------------------------------------------------- 14.3 failure modes */

const REPLAYS = ["Small cohorts", "Robust aggregator", "Gossip", "Blocked release"];

function replayText(replay: number) {
  const c = REPLAY.cohort;
  const r = REPLAY.robust;
  const g = REPLAY.gossip;
  const l = REPLAY.ledger;
  switch (replay) {
    case 0:
      return (
        <P>
          <strong>Small cohorts without amplification.</strong> The small regime samples q = {c.rate} of users for{" "}
          {c.rounds} rounds at noise multiplier {fmt.n(c.noise, 3)}. Counted with the sampling, that is ε{" "}
          {fmt.n(c.amplified, 2)}. Count it as if everyone took part in every round and the same noise is worth ε{" "}
          {fmt.n(c.unamplified, 0)}: the guarantee rests on the sampling being real.
        </P>
      );
    case 1:
      return (
        <P>
          <strong>A robust aggregator that erases the model.</strong> With no attackers at all, the median reaches
          NDCG@10 {fmt.ndcg(r.median)} and the trimmed mean {fmt.ndcg(r.trimmed)}, against {fmt.ndcg(r.sum)} for the
          plain sum. Each item is pushed by a few users, so sorting each coordinate cuts that signal away as if it were
          an attack.
        </P>
      );
    case 2:
      return (
        <P>
          <strong>Gossip under local noise.</strong> Without a server, every device noises every message it sends. At
          local ε {fmt.n(g.epsilon, 0)} gossip reaches NDCG@10 {fmt.ndcg(g.gossip)}, against {fmt.ndcg(g.federated)}{" "}
          for the server with central noise on the same users, and {fmt.ndcg(g.popular)} for a most-popular list.
        </P>
      );
    default:
      return (
        <P>
          <strong>A run that asked for too much.</strong> With a budget of ε {fmt.n(l.budget, 1)}, the release gate
          allowed {l.allowed} of the {l.asked} rounds asked for, wrote {l.refusals} refusal receipt and stopped at ε{" "}
          {fmt.n(l.released, 2)}. Here the defence worked: the failure is the request. The demonstration runs on the
          synthetic dataset.
        </P>
      );
  }
}

export function ReplayPanel() {
  const replay = useOutro((s) => s.replay);
  const play = useOutro((s) => s.play);
  return (
    <>
      <H>Four failures, replayed from the measurements.</H>
      {replayText(replay)}
      <Controls>
        <Buttons>
          {REPLAYS.map((name, i) => (
            <Button key={name} kind={i === replay ? "primary" : "quiet"} onClick={() => play(i)}>
              {name}
            </Button>
          ))}
        </Buttons>
        <Buttons>
          <Button kind="quiet" onClick={() => play(replay)}>
            Play again
          </Button>
        </Buttons>
      </Controls>
    </>
  );
}
