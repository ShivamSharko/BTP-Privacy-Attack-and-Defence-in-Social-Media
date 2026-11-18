import type { FlatSlide, TheoryDef } from "./types";

type TheoryModule = { theory: TheoryDef };

const loaders = import.meta.glob<TheoryModule>("../theories/*/index.tsx");

export interface Registry {
  theories: TheoryDef[];
  slides: FlatSlide[];
  ids: string[];
  /** Folders that failed to import; the deck runs without them and says so. */
  failed: string[];
}

export function buildRegistry(theories: TheoryDef[], failed: string[] = []): Registry {
  const sorted = [...theories].sort((a, b) => a.number - b.number);
  const slides: FlatSlide[] = sorted.flatMap((theory) => theory.slides.map((slide, local) => ({ slide, theory, local })));
  return { theories: sorted, slides, ids: slides.map((s) => s.slide.id), failed: [...failed].sort() };
}

/** Imports every theory folder. A folder that throws is skipped, so one broken folder cannot blank the deck. */
export async function loadRegistry(): Promise<Registry> {
  const theories: TheoryDef[] = [];
  const failed: string[] = [];
  await Promise.all(
    Object.entries(loaders).map(async ([path, load]) => {
      const folder = path.split("/").at(-2) ?? path;
      try {
        const module = await load();
        if (!module.theory) throw new Error("no `theory` export");
        theories.push(module.theory);
      } catch (error) {
        failed.push(folder);
        console.warn(`[deck] theory folder "${folder}" did not load:`, error);
      }
    }),
  );
  return buildRegistry(theories, failed);
}
