import { fmt, m } from "../../data";
import { BarChart, Button, Buttons, Caption, Controls, H, Note, P, Readout, Readouts, StatRow, Tex } from "../../ui";
import { DP_EPS, DP_Z, H3_MARGIN, ladder, LARGE, priorAuc, SMALL } from "./ladder";
import { runFor, signed } from "./ringModel";
import { RING_PHASES, useSecAgg } from "./store";

/* ---------------------------------------------------------------- brief: the secure sum */

export function BriefRingPanel() {
  const phase = useSecAgg((s) => s.phase);
  const setPhase = useSecAgg((s) => s.setPhase);
  const run = runFor(-1);
  return (
    <>
      <H>A secure sum masks every update in pairs, so the masks cancel and the server sees only the total.</H>
      <P>
        Every two users share a secret and both derive the same random-looking mask from it. The user with the lower
        number adds it to its update, the other subtracts it. Alone, a masked update looks like noise. In the sum each
        mask is added once and subtracted once, so only the true total is left.
      </P>
      <Tex block>{String.raw`\tilde{x}_i = x_i + \sum_{j>i} m_{ij} - \sum_{j<i} m_{ij}`}</Tex>
      <P>
        If a user drops out, every survivor reveals the seed it shared with that user, and the server rebuilds those
        masks and removes them.
      </P>
      <Note tone="warn">
        The sum itself stays visible, so a small cohort still leaks. This is a simulation of the arithmetic in one
        process.
      </Note>
      <Controls>
        <Buttons>
          <Button onClick={() => setPhase(1)}>Mask</Button>
          <Button onClick={() => setPhase(2)}>Send</Button>
          <Button onClick={() => setPhase(3)}>Sum</Button>
          <Button kind="quiet" onClick={() => setPhase(0)}>
            Start over
          </Button>
        </Buttons>
        <Readouts>
          <Readout label="state" value={RING_PHASES[phase]} />
          <Readout label="true sum" value={signed(run.truth[0])} role="honest" />
          <Readout label="server decodes" value={phase >= 3 ? signed(run.decoded[0]) : "not yet"} role="protected" />
        </Readouts>
      </Controls>
    </>
  );
}

/* ---------------------------------------------------------------- brief: the defence ladder */

export function BriefLadderPanel() {
  const rows = ladder();
  const by = Object.fromEntries(rows.map((r) => [r.key, r]));
  const limit = priorAuc() + H3_MARGIN;
  return (
    <>
      <H>A sum of {LARGE} users still leaks histories; only server noise on top brings it back to chance.</H>
      <P>
        The score is AUC, how well the attacker ranks a user&apos;s own items above the rest; 0.5 is chance. One masked
        update scores {fmt.n(by.masked.auc, 3)}. A sum of {SMALL} scores {fmt.n(by[`sum_${SMALL}`].auc, 3)} and a sum
        of {LARGE} scores {fmt.n(by[`sum_${LARGE}`].auc, 3)}, above the limit of {fmt.n(limit, 3)} that hypothesis H3
        sets (the popularity prior plus {fmt.n(H3_MARGIN, 2)}). That part of H3 is not met.
      </P>
      <P>
        Noise added by the server after unmasking, {fmt.n(DP_Z, 2)} times the clip (the longest an update may be) at
        epsilon {fmt.n(DP_EPS, 0)}, brings the sum of {LARGE} to {fmt.n(by[`sum_${LARGE}_dp`].auc, 3)}.
      </P>
      <Note tone="warn">One trained model, one seed, a simulated secure sum and a server that follows the protocol.</Note>
    </>
  );
}

export function BriefLadderStage() {
  const rows = ladder();
  const limit = priorAuc() + H3_MARGIN;
  return (
    <>
      <StatRow
        items={[
          { label: "popularity prior alone", value: fmt.n(priorAuc(), 3), role: "noise", note: "history recovery, AUC" },
          { label: `H3 limit: prior plus ${fmt.n(H3_MARGIN, 2)}`, value: fmt.n(limit, 3), role: "model" },
          { label: `sum of ${LARGE} users`, value: fmt.n(rows[3].auc, 3), role: "attacker", note: "limit exceeded: not met" },
        ]}
      />
      <BarChart
        yLabel="history recovery, AUC"
        format={(v) => fmt.n(v, 3)}
        data={rows.map((r) => ({ label: r.label, value: r.auc, lo: r.lo, hi: r.hi, role: r.role }))}
        threshold={{ value: limit, label: `H3 limit ${fmt.n(limit, 3)}` }}
        summary={`Recovery AUC is ${fmt.n(rows[0].auc, 3)} for a raw update, ${fmt.n(rows[1].auc, 3)} masked, ${fmt.n(rows[2].auc, 3)} for a sum of ${SMALL}, ${fmt.n(rows[3].auc, 3)} for a sum of ${LARGE}, above the H3 limit of ${fmt.n(limit, 3)}, and ${fmt.n(rows[4].auc, 3)} with server noise.`}
      />
      <Caption>
        Whiskers are 95% intervals over the target users sampled. The link attack, which compares two users&apos;
        updates, scores {fmt.n(m("update_leakage", "results/masked/link/auc"), 3)} on masked updates against{" "}
        {fmt.n(m("update_leakage", "results/raw/link/auc"), 3)} raw, and under a sum it has no pair to compare.
      </Caption>
    </>
  );
}
