import { describe, expect, it } from "vitest";
import { fmt, m } from "../../data";
import { checkTheory } from "../../deck/checkTheory";
import { longPanels, renderAllSlides } from "../../test/renderTheory";
import { theory } from "./index";

describe("theory 10: gossip learning without a server", () => {
  it("follows the deck rules", () => {
    expect(checkTheory(theory)).toEqual([]);
    expect(theory.slides.length).toBeGreaterThanOrEqual(4);
  });

  it("renders every slide and shows the measured figures", () => {
    const text = renderAllSlides(theory);
    expect(text).toContain(fmt.ndcg(m("gossip", "results/by_epsilon/8.0/gossip_ndcg10/mean")));
    expect(text).toContain(fmt.ndcg(m("gossip", "results/h2/gap_mean")));
    expect(text).toContain(fmt.ndcg(m("gossip", "results/h2/gap_ci95/0")));
    expect(text).toContain(fmt.ndcg(m("gossip", "results/h2/gap_ci95/1")));
    expect(text).toContain("H2");
    expect(text).toContain(fmt.n(m("gossip", "results/by_epsilon/8.0/epsilon_claimed/gossip_local_replace_adjacency"), 1));
    expect(text).toContain("src/prism/data/social.py");
  });

  it("keeps every panel short enough to read from the back of a room", () => {
    expect(longPanels(theory)).toEqual([]);
  });
});
