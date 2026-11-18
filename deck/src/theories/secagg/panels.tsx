import { fmt } from "../../data";
import { Button, Buttons, Caption, Choice, Controls, H, Note, P, Readout, Readouts, Slider, Steps, Tex } from "../../ui";
import { pipeValues } from "./PipelineScene";
import { hexLabel, runFor, signed } from "./ringModel";
import { buildCohortTable, cohortView, GRID_ITEMS, MAX_COHORT, OTHER_ITEMS, TARGET_ITEMS } from "./sim";
import { GRID_SEED } from "./GridScene";
import { DROP_PHASES, MAX_ROUND, MAX_STAGE, RING_PHASES, STAGES, type View, useSecAgg } from "./store";

/* ---------------------------------------------------------------- 4.1 pairwise masks */

export function RingPanel() {
  const phase = useSecAgg((s) => s.phase);
  const view = useSecAgg((s) => s.view);
    const setPhase = useSecAgg((s) => s.setPhase);
  const setView = useSecAgg((s) => s.setView);
  const run = runFor(-1);
  return (
    <>
      <H>Pairwise masks cancel only in the sum.</H>
      <P>
        Every two users share a secret. From it both compute the same list of random-looking numbers, a mask. The user
        with the lower number adds it to its update; the other subtracts it.
      </P>
      <P>
        Alone, a masked update looks like noise. In the sum each mask is added once and subtracted once, so the masks
        cancel and only the true sum is left. The arithmetic is on 64-bit words that wrap round, modulo 2 to the power
        64.
      </P>
      <Tex block>{String.raw`\tilde{x}_i = x_i + \sum_{j>i} m_{ij} - \sum_{j<i} m_{ij} \pmod{2^{64}}`}</Tex>
      <Caption>
        x is a user's update as a whole number, m the mask of a pair, the tilde what is sent. Click a user to see its masks.
      </Caption>
      <Controls>
        <Buttons>
          <Button onClick={() => setPhase(1)}>Mask</Button>
          <Button onClick={() => setPhase(2)}>Send</Button>
          <Button onClick={() => setPhase(3)}>Sum</Button>
          <Button kind="quiet" onClick={() => setPhase(0)}>
            Start over
          </Button>
        </Buttons>
        <Choice<View>
          label="Whose view"
          value={view}
          onChange={setView}
          options={[
            { value: "users", label: "the users'" },
            { value: "server", label: "the server's" },
          ]}
        />
        <Readouts>
          <Readout label="state" value={RING_PHASES[phase]} />
          <Readout label="true sum of the updates" value={signed(run.truth[0])} role="honest" />
          <Readout label="what the server decodes" value={phase >= 3 ? signed(run.decoded[0]) : "not yet"} role="protected" />
        </Readouts>
      </Controls>
    </>
  );
}

/* ---------------------------------------------------------------- 4.2 where the secret comes from */

export function PipelinePanel() {
  const stage = useSecAgg((s) => s.stage);
  const round = useSecAgg((s) => s.round);
  const setStage = useSecAgg((s) => s.setStage);
  const setRound = useSecAgg((s) => s.setRound);
  const v = pipeValues(round);
  return (
    <>
      <H>The secret behind each mask is made from four standard pieces.</H>
      <Steps
        items={[
          <>
            <strong>Key agreement, X25519.</strong> Each user keeps a private key and shares the public half. Your
            private key with the other's public key gives both of you the same shared secret.
          </>,
          <>
            <strong>Key derivation, HKDF.</strong> The secret, the round number and the two user numbers become a
            32-byte seed. A new round gives a new seed.
          </>,
          <>
            <strong>Mask stream, ChaCha20.</strong> The seed drives a stream cipher; its output, read as 64-bit words,
            is the mask.
          </>,
          <>
            <strong>Fixed point.</strong> Each coordinate is multiplied by a power of two divided by the clip norm
            and rounded to an integer, so masks add exactly. A negative value is stored as two's complement.
          </>,
        ]}
      />
      <Note>The toy here uses a seeded generator for the first three; the project uses the real ones.</Note>
      <Controls>
        <Slider label="Stage" value={stage} min={0} max={MAX_STAGE} step={1} onChange={setStage} format={(x) => String(x)} />
        <Slider label="Round" value={round} min={1} max={MAX_ROUND} step={1} onChange={setRound} format={(x) => String(x)} />
        <Buttons>
          <Button onClick={() => setStage(stage >= MAX_STAGE ? 0 : stage + 1)}>{stage >= MAX_STAGE ? "Start over" : "Next piece"}</Button>
        </Buttons>
        <Readouts>
          <Readout label="now" value={STAGES[stage]} />
          <Readout label={`seed for round ${round}`} value={stage >= 2 ? `0x${v.seed.toString(16).padStart(8, "0")}` : "not made yet"} role="protected" />
          <Readout label="first mask word" value={stage >= 3 ? hexLabel(v.words[0]) : "not made yet"} role="noise" />
        </Readouts>
      </Controls>
    </>
  );
}

/* ---------------------------------------------------------------- 4.3 dropouts */

export function DropPanel() {
  const dropPhase = useSecAgg((s) => s.dropPhase);
  const dropped = useSecAgg((s) => s.dropped);
  const advance = useSecAgg((s) => s.advanceDrop);
  const resetDrop = useSecAgg((s) => s.resetDrop);
  const run = runFor(dropped);
  const sent = dropPhase >= 1;
  const closed = sent && (dropped < 0 || dropPhase >= 2);
  return (
    <>
      <H>If a user drops out, the survivors hand over their shared seeds and the sum still closes.</H>
      <P>
        Say one user vanishes before sending. Every survivor holds a mask shared with it, and the other half never
        arrives, so the total decodes to noise.
      </P>
      <P>
        Each survivor reveals the seed it shared with the missing user. The server rebuilds each mask and takes it
        out the way the survivor put it in. What is left is the survivors' sum.
      </P>
      <Note tone="warn">
        Limit: the seeds are not secret-shared and there is no second mask layer, so a user who sent and was then
        declared dropped would be exposed. This is a simulation of the arithmetic.
      </Note>
      <Controls>
        <Caption>Click a user in the scene to knock it out.</Caption>
        <Buttons>
          <Button onClick={advance}>{["Send updates", "Reveal the seeds", "Start over"][dropPhase]}</Button>
          <Button kind="quiet" onClick={resetDrop}>
            Reset
          </Button>
        </Buttons>
        <Readouts>
          <Readout label="state" value={DROP_PHASES[dropPhase]} />
          <Readout
            label="what the server decodes"
            value={!sent ? "not yet" : closed ? signed(run.decoded[0]) : run.naive[0].toExponential(2)}
            role={closed ? "protected" : "noise"}
          />
          <Readout label="true sum of survivors" value={signed(run.truth[0])} role="honest" />
        </Readouts>
      </Controls>
    </>
  );
}

/* ---------------------------------------------------------------- 4.4 what the sum still shows */

export function CohortPanel() {
  const cohort = useSecAgg((s) => s.cohort);
  const setCohort = useSecAgg((s) => s.setCohort);
  const play = useSecAgg((s) => s.play);
  const view = cohortView(buildCohortTable(GRID_SEED), cohort);
  return (
    <>
      <H>A secure sum hides each update but not the sum, so a small cohort still leaks.</H>
      <P>
        The server never sees one user's update, but it does see the total, and the total contains that update. In a
        cohort of one, the total is the update.
      </P>
      <P>
        Here one user touched {TARGET_ITEMS} of {GRID_ITEMS} items and each other user touched {OTHER_ITEMS}, favouring
        popular ones. An attacker who knows item popularity subtracts it from the total and takes the top {TARGET_ITEMS}.
      </P>
      <P>As the cohort grows, the user's share of each bar thins out, but it never reaches zero.</P>
      <Note>A toy with one random draw, not a measurement. The measured result is on the next slide.</Note>
      <Controls>
        <Slider label="Users in the sum" value={cohort} min={1} max={MAX_COHORT} step={1} onChange={setCohort} />
        <Buttons>
          <Button onClick={play}>Grow from one</Button>
        </Buttons>
        <Readouts>
          <Readout label="user's share of its bars" value={fmt.pct(view.share, 0)} role="honest" />
          <Readout label={`of ${TARGET_ITEMS} items, found by the attacker`} value={String(view.hits)} role="attacker" />
        </Readouts>
      </Controls>
    </>
  );
}
