import { fmt, m } from "../../data";
import { H, List, Note, P } from "../../ui";
import { HYPOTHESES, type Tone } from "../intro/verdicts";
import { type LimitGroup, Group, limitation } from "./limits";
import { REPLAY } from "./figures";

/* ---------------------------------------------------------------- brief 28: what we found */

const TONE_COLOUR: Record<Tone, string> = { for: "var(--protected)", against: "var(--attacker)", mixed: "var(--noise)" };

const EPS = m("privacy_utility", "summary/large/h1/epsilon");
const THRESHOLD = m("privacy_utility", "summary/large/h1/threshold");
const KEPT_LARGE = m("privacy_utility", "summary/large/h1/retention");
const KEPT_SMALL = m("privacy_utility", "summary/small/h1/retention");

/** Marker for a verdict: full for supported, empty for not, half for a split or weak result. */
function Mark({ tone }: { tone: Tone }) {
  const c = TONE_COLOUR[tone];
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" style={{ flex: "none", marginTop: 3 }}>
      <circle cx="9" cy="9" r="7" fill={tone === "for" ? c : "none"} stroke={c} strokeWidth="2.2" />
      {tone === "mixed" ? <path d="M9 2 A7 7 0 0 1 9 16 Z" fill={c} /> : null}
    </svg>
  );
}

export function BriefFoundPanel() {
  const r = REPLAY.robust;
  return (
    <>
      <H>Privacy cost more accuracy than the target allowed, and hiding updates removed the defence against fake accounts.</H>
      <P>
        <strong>Privacy against accuracy.</strong> At ε {fmt.n(EPS, 0)} the private model keeps {fmt.pct(KEPT_LARGE, 0)} of
        its no-privacy accuracy with large cohorts and {fmt.pct(KEPT_SMALL, 0)} with small ones, short of the{" "}
        {fmt.pct(THRESHOLD, 0)} target.
      </P>
      <P>
        <strong>Hidden updates against filtering attackers.</strong> A trimmed mean or median must see every update, so
        it cannot run under a secure sum. With no attackers, the trimmed mean scores NDCG@10 {fmt.ndcg(r.trimmed)} and
        the median {fmt.ndcg(r.median)}, against {fmt.ndcg(r.sum)} for the plain sum.
      </P>
    </>
  );
}

export function BriefFoundStage() {
  return (
    <div>
      <h2>Five hypotheses, written before the reported model was tested</h2>
      <div role="list">
        {HYPOTHESES.map((h) => (
          <div
            role="listitem"
            key={h.id}
            style={{
              display: "grid",
              gridTemplateColumns: "2.4em 1fr",
              gap: "0 12px",
              alignItems: "start",
              padding: "20px 0",
              borderBottom: "1px solid var(--rule)",
            }}
          >
            <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "var(--t-lead)" }}>{h.id}</span>
            <div>
              <span style={{ display: "flex", gap: 8, fontWeight: 700, color: TONE_COLOUR[h.tone] }}>
                <Mark tone={h.tone} />
                {h.verdict}
                <span style={{ fontWeight: 400, color: "var(--ink-soft)" }}>{h.links.map((l) => l.label).join(" and ")}</span>
              </span>
              <div style={{ color: "var(--ink-soft)", marginTop: 4 }}>{h.evidence}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- brief 29: limits */

const BRIEF_LIMITS: LimitGroup[] = [
  {
    title: "Data and simulation",
    items: [
      limitation("dataset_card", "k-core removes"),
      limitation("dataset_card", "Dataset vintage"),
      limitation("participation", "synthetic (rank-based", "Availability in four participation scenarios is synthetic, not measured from device traces."),
      limitation("poisoning", "Committees are simulated", "Committees are simulated: their sums are computed in the clear and no secure-aggregation protocol runs."),
    ],
  },
  {
    title: "What each result covers",
    items: [
      limitation(
        "privacy_utility",
        "Hyperparameters were tuned",
        "Hyperparameters were tuned on the validation split of the same users, and that tuning is not counted in epsilon.",
      ),
      limitation("poisoning", "One attack strategy"),
      limitation("free_riding", "Free-riders do not adapt", "Free-riders do not adapt to detection; an adaptive one could imitate honest updates."),
      limitation(
        "membership",
        "loss-threshold test",
        "Membership inference is a loss-threshold test with reference models: a negative result bounds this attack only.",
      ),
    ],
  },
];

export function BriefLimitsPanel() {
  return (
    <>
      <H>These results come from a simulation on one city, and each attack is a single method.</H>
      <P>
        Everything ran in one process on one city&apos;s reviews from one dataset release: no network, no real phones, no
        second operator.
      </P>
      <List
        items={[
          "The secure sum is a simulation of its arithmetic, not a protocol.",
          "Each epsilon covers one stated mechanism and counts a whole user. It excludes the tuning.",
          "Each attack is one method, and the attackers do not adapt to a defence.",
          "A defence that held, held against that one attack only.",
        ]}
      />
      <Note tone="warn">The dataset provider&apos;s pre-publication review has not been requested.</Note>
    </>
  );
}

export function BriefLimitsStage() {
  return (
    <div style={{ fontSize: "1.1em" }}>
      {BRIEF_LIMITS.map((g) => (
        <Group key={g.title} group={g} />
      ))}
    </div>
  );
}
