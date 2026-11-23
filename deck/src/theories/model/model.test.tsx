import { describe, expect, it } from "vitest";
import { fmt, m } from "../../data";
import { checkTheory } from "../../deck/checkTheory";
import { briefOf, longPanels, renderAllSlides } from "../../test/renderTheory";
import { theory } from "./index";
import { bars, blockSizes } from "./results";

describe("theory 1: the hybrid recommender", () => {
  it("follows the deck rules", () => {
    expect(checkTheory(theory)).toEqual([]);
    expect(theory.slides.length).toBeGreaterThanOrEqual(4);
  });

  it("renders every slide and shows the measured figures", () => {
    const text = renderAllSlides(theory);
    expect(text).toContain(fmt.int(m("dataset_card", "items")));
    expect(text).toContain("models/hybrid.py");
    expect(text).toContain(fmt.ndcg(m("privacy_utility", "baselines/item_ridge/ndcg@10")));
  }, 30000);

  it("splits the parameters 101,104 / 256 / 6,319", () => {
    const s = blockSizes();
    expect(s.total).toBe(s.emb + s.umap + s.bias);
    expect([s.emb, s.umap, s.bias]).toEqual([101104, 256, 6319]);
  });

  it("keeps the impact headline true: federated beats popularity and friends, trails ItemKNN", () => {
    const v = (label: string) => bars("ndcg@10").find((b) => b.label === label)!.value;
    for (const fed of [v("Fed. large"), v("Fed. small")]) {
      expect(fed).toBeGreaterThan(v("MostPopular"));
      expect(fed).toBeGreaterThan(v("Friends"));
      expect(fed).toBeLessThan(v("ItemKNN"));
      expect(fed).toBeLessThan(v("Item ridge"));
    }
  });

  it("renders the brief slide with the ranking and the model size", () => {
    const brief = briefOf(theory);
    expect(brief.slides).toHaveLength(1);
    const text = renderAllSlides(brief);
    expect(text).toContain(fmt.ndcg(m("privacy_utility", "baselines/item_ridge/ndcg@10")));
    expect(text).toContain(fmt.ndcg(m("privacy_utility", "baselines/most_popular/ndcg@10")));
    expect(text).toContain(fmt.int(blockSizes().total));
    expect(longPanels(brief, 130)).toEqual([]);
    expect(checkTheory(theory)).toEqual([]);
  }, 30000);

  it("keeps every panel short enough to read from the back of a room", () => {
    expect(longPanels(theory)).toEqual([]);
  });
});
