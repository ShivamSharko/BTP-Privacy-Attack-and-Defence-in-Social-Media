import type { CSSProperties } from "react";
import { raw, type ResultFile } from "../../data";
import { Caption } from "../../ui";
import { goTo } from "./store";
import { HYPOTHESES, type Tone } from "./verdicts";

const TONE_COLOUR: Record<Tone, string> = { for: "var(--protected)", against: "var(--attacker)", mixed: "var(--noise)" };

const FILES: ResultFile[] = ["privacy_utility", "gossip", "membership", "update_leakage", "poisoning", "participation"];
const STATUSES = FILES.map((f) => ({ file: f, status: raw<string>(f, "status") }));

const row: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "3.2em 1fr 11.5em",
  gap: "0 18px",
  alignItems: "start",
  padding: "12px 0",
  borderBottom: "1px solid var(--rule)",
};

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

/** The five hypotheses, their verdicts as derived from the result files, and a way to the evidence. */
export function Scoreboard() {
  return (
    <div>
      <h2>Five hypotheses, written before the test data were touched</h2>
      <div role="list">
        {HYPOTHESES.map((h) => (
          <div role="listitem" key={h.id} style={row}>
            <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "var(--t-lead)" }}>{h.id}</span>
            <div>
              <div style={{ marginBottom: 4 }}>{h.statement}</div>
              <div style={{ fontSize: "var(--t-small)", color: "var(--ink-soft)" }}>{h.evidence}</div>
            </div>
            <div style={{ display: "grid", gap: 8, justifyItems: "start" }}>
              <span style={{ display: "flex", gap: 8, fontWeight: 700, color: TONE_COLOUR[h.tone] }}>
                <Mark tone={h.tone} />
                {h.verdict}
              </span>
              <span style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {h.links.map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    className="btn"
                    data-kind="quiet"
                    style={{ minHeight: 30, padding: "3px 10px", fontSize: "var(--t-small)" }}
                    onClick={() => goTo(l.id)}
                    aria-label={`${h.id} evidence: open ${l.label}`}
                  >
                    {l.label}
                  </button>
                ))}
              </span>
            </div>
          </div>
        ))}
      </div>
      <Caption>
        Verdicts are read from {HYPOTHESES.map((h) => `${h.id}: ${h.derivedFrom}`).join(". ")}. Experiment status:{" "}
        {STATUSES.map((s) => `${s.file} ${s.status}`).join(", ")}.
      </Caption>
    </div>
  );
}
