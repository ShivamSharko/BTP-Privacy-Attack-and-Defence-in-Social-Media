import { create } from "zustand";
import type { Theme } from "../styles/roles";
import { EDITIONS, type Edition, type EditionId, inEdition, topicInEdition } from "./editions";

export interface DeckState {
  index: number;
  count: number;
  theme: Theme;
  overview: boolean;
  /** Bumped when the presenter presses R; scenes listen through useOnReset. */
  resetNonce: number;
  reducedMotion: boolean;
  webgl: boolean;
  /** Which edition of the deck is on screen. */
  edition: EditionId;
  /** Slides in the full edition, whichever edition is on screen. */
  fullCount: number;
  setCount(count: number): void;
  setEdition(edition: EditionId, fullCount: number): void;
  go(index: number): void;
  next(): void;
  prev(): void;
  first(): void;
  last(): void;
  toggleTheme(): void;
  toggleOverview(): void;
  reset(): void;
  setReducedMotion(value: boolean): void;
  setWebgl(value: boolean): void;
}

const clamp = (i: number, count: number) => Math.max(0, Math.min(Math.max(count - 1, 0), Math.trunc(i)));

export const useDeck = create<DeckState>((set) => ({
  index: 0,
  count: 0,
  theme: "dark",
  overview: false,
  resetNonce: 0,
  reducedMotion: false,
  webgl: true,
  edition: "full",
  fullCount: 0,
  setEdition: (edition, fullCount) => set({ edition, fullCount }),
  setCount: (count) => set((s) => ({ count, index: clamp(s.index, count) })),
  go: (index) => set((s) => (Number.isFinite(index) ? { index: clamp(index, s.count), overview: false } : s)),
  next: () => set((s) => ({ index: clamp(s.index + 1, s.count) })),
  prev: () => set((s) => ({ index: clamp(s.index - 1, s.count) })),
  first: () => set({ index: 0 }),
  last: () => set((s) => ({ index: clamp(s.count - 1, s.count) })),
  toggleTheme: () => set((s) => ({ theme: s.theme === "dark" ? "light" : "dark" })),
  toggleOverview: () => set((s) => ({ overview: !s.overview })),
  reset: () => set((s) => ({ resetNonce: s.resetNonce + 1 })),
  setReducedMotion: (reducedMotion) => set({ reducedMotion }),
  setWebgl: (webgl) => set({ webgl }),
}));

/** The edition on screen. */
export function useEdition(): Edition {
  return EDITIONS[useDeck((s) => s.edition)];
}

/** True when the edition on screen shows the slide, so a button never points at a slide that is not there. */
export function useInDeck(slideId: string): boolean {
  return inEdition(useEdition(), slideId);
}

/** True when the edition on screen shows at least one slide of the topic, so a button can open it. */
export function useTopicShown(topic: string): boolean {
  return topicInEdition(useEdition(), topic);
}
