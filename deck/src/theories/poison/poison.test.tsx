import { describe, expect, it } from "vitest";
import { fmt, m, raw } from "../../data";
import { checkTheory } from "../../deck/checkTheory";
import { longPanels, renderAllSlides } from "../../test/renderTheory";
import { theory } from "./index";

describe("theory 8: poisoning and robust aggregation", () => {
  it("follows the deck rules", () => {
    expect(checkTheory(theory)).toEqual([]);
    expect(theory.slides.length).toBeGreaterThanOrEqual(5);
  });

  it("renders every slide and shows the measured figures", () => {
    const text = renderAllSlides(theory);
    expect(text).toContain(fmt.pct(m("poisoning", "results/secure_sum_norm_bound/0.1/exposure/mean")));
    expect(text).toContain(fmt.ndcg(m("poisoning", "results/secure_sum_norm_bound/0.0/ndcg/mean")));
    expect(text).toContain(fmt.ndcg(m("poisoning", "results/plaintext_trimmed_mean/0.0/ndcg/mean")));
    expect(raw<boolean>("poisoning", "h4/holds")).toBe(false);
    expect(text).toContain("Not supported as stated");
    expect(text).toContain("src/prism/attacks/poisoning.py");
    expect(text).toContain("robust_total");
  });

  it("keeps every panel short enough to read from the back of a room", () => {
    expect(longPanels(theory)).toEqual([]);
  });
});
