import { fmt, m } from "../../data";
import { Caption, Controls, H, Note, P, Readout, Readouts, Slider, StatRow } from "../../ui";
import { useInversion } from "./derived";
import { Ladder } from "./Ladder";
import { useLeak } from "./store";

const raw = (path: string) => m("update_leakage", `results/${path}`);

/* ---------------------------------------------------------------- leak/1: what one update gives away */

export function BriefInversionPanel() {
  const size = useLeak((s) => s.size);
  const setSize = useLeak((s) => s.setSize);
  const { recovery } = useInversion();
  return (
    <>
      <H>One update shows the history in its largest changes, and friends' updates point the same way.</H>
      <P>
        Each column is the size of the update at one item. The items in the user's history change most, so an attacker
        who ranks items by that size reads the history back. The real attack adds the change in each item's bias and
        in its embedding row, the two things the model learns about a place.
      </P>
      <P>
        Friends visit similar places, so their updates lean the same way. The attacker scores a pair by the cosine of
        the angle between the two updates: 1 when they agree, 0 when unrelated. On real data the effect is faint:
        friends average {fmt.n(raw("raw/link/mean_cosine_friends"), 3)}, strangers {fmt.n(raw("raw/link/mean_cosine_non_friends"), 3)}.
      </P>
      <Controls>
        <Slider label="Items in the history" value={size} min={0} max={30} step={1} onChange={setSize} format={(v) => String(v)} />
        <Readouts>
          <Readout label="toy attack AUC" value={fmt.n(recovery.auc, 3)} role="attacker" />
        </Readouts>
      </Controls>
    </>
  );
}

/* ---------------------------------------------------------------- leak/4: the measured leak */

export function BriefMeasuredPanel() {
  return (
    <>
      <H>With nothing protecting it, one update gives the history away almost completely.</H>
      <P>
        A curious server took one update from each of {fmt.int(m("update_leakage", "settings/n_targets"))} users and
        ranked the items. AUC is the chance that a real history item outscores another item; 0.5 is guessing. Its ten
        best guesses were real history {fmt.pct(raw("raw/recovery/precision_at_10/mean"), 2)} of the time, against{" "}
        {fmt.pct(raw("raw/recovery/prior_precision_at_10/mean"), 1)} for guessing popular items.
      </P>
      <P>
        Friendships leak less. The link attack separates friend pairs from strangers with AUC {fmt.n(raw("raw/link/auc"), 3)} from
        updates, where the full histories would give {fmt.n(raw("reference_histories/link/auc"), 3)}.
      </P>
      <Note tone="warn">Single local steps on the trained non-private model, seen by an honest-but-curious server.</Note>
    </>
  );
}

export function BriefMeasuredStage() {
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
        One trained model, one seed: the figures average over the {fmt.int(m("update_leakage", "settings/n_targets"))} target
        users sampled. Higher AUC is more leakage.
      </Caption>
    </>
  );
}
