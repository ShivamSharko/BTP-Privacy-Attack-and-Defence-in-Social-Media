import { create } from "zustand";
import type { Theme } from "../styles/roles";

export interface DeckState {
  index: number;
  count: number;
  theme: Theme;
  overview: boolean;
  /** Bumped when the presenter presses R; scenes listen through useOnReset. */
  resetNonce: number;
  reducedMotion: boolean;
  webgl: boolean;
  setCount(count: number): void;
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
