import { describe, expect, it } from "vitest";
import { fmt, m } from "../../data";
import { checkTheory } from "../../deck/checkTheory";
import { briefOf, longPanels, renderAllSlides } from "../../test/renderTheory";
import { demo } from "./store";
import { theory } from "./index";

describe("theory 12: the transparency ledger", () => {
  it("follows the deck rules", () => {
    expect(checkTheory(theory)).toEqual([]);
    expect(theory.slides.length).toBeGreaterThanOrEqual(5);
  });

  it("renders every slide and shows the measured figures", () => {
    const text = renderAllSlides(theory);
    const r = "results";
    expect(text).toContain(`${m("ledger_audit", `${r}/verification/verified`)} / ${m("ledger_audit", `${r}/verification/ledgers`)}`);
    expect(text).toContain(`${m("ledger_audit", `${r}/tamper_detection/detected`)} / ${m("ledger_audit", `${r}/tamper_detection/flips`)}`);
    expect(text).toContain(fmt.pct(m("ledger_audit", `${r}/coverage/coverage`), 0));
    expect(text).toContain(fmt.n(m("ledger_audit", `${r}/costs/append_ms_per_receipt`), 1));
    expect(text).toContain(`${m("ledger_audit", `${r}/costs/inclusion_proof_hashes`)} hashes`);
    expect(text).toContain(`${m("ledger_audit", `${r}/costs/inclusion_proof_bytes`)} bytes`);
    expect(text).toContain(fmt.pct(m("ledger_audit", `${r}/receipt_overhead/mean_share_of_run_time`), 2));
    expect(text).toContain(String(m("ledger_audit", `${r}/blocked_release_demo/rounds_asked`)));
    expect(text).toContain(String(m("ledger_audit", `${r}/blocked_release_demo/rounds_allowed`)));
    expect(text).toContain("src/prism/ledger/merkle.py");
  });

  it("keeps every panel short enough to read from the back of a room", () => {
    expect(longPanels(theory)).toEqual([]);
  });

  it("has a brief slide that carries the audit, the costs and the blocked run", () => {
    const brief = briefOf(theory);
    expect(brief.slides.length).toBe(1);
    const text = renderAllSlides(brief);
    const r = "results";
    expect(text).toContain(`${m("ledger_audit", `${r}/verification/verified`)} / ${m("ledger_audit", `${r}/verification/ledgers`)}`);
    expect(text).toContain(`${m("ledger_audit", `${r}/tamper_detection/detected`)} / ${m("ledger_audit", `${r}/tamper_detection/flips`)}`);
    expect(text).toContain(fmt.n(m("ledger_audit", `${r}/costs/append_ms_per_receipt`), 1));
    expect(text).toContain(`${demo.completed} of ${demo.asked}`);
    expect(text).toContain(fmt.n(demo.released, 3));
    expect(longPanels(brief, 130)).toEqual([]);
  });
});
