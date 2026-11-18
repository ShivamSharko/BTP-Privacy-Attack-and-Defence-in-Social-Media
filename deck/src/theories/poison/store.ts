import { create } from "zustand";

export type Aggregator = "sum" | "trimmed" | "median";
export type View = "plaintext" | "secure";

export const DEFAULTS = {
  share: 0.1,
  aggregator: "sum" as Aggregator,
  view: "plaintext" as View,
  coord: 1 as 0 | 1,
  committeeSize: 8,
  committeeShare: 0.1,
  dealSeed: 1,
};

interface PoisonState {
  /** Share of the cohort that is attacking, on the first three slides. */
  share: number;
  aggregator: Aggregator;
  /** What the server can see on the first slide: every update, or only the secure sum. */
  view: View;
  /** Which business the sorted bars show: 0 is the target, 1 is another one. */
  coord: 0 | 1;
  committeeSize: number;
  /** Attacker share on the committee slide. */
  committeeShare: number;
  dealSeed: number;
  setShare(v: number): void;
  setAggregator(v: Aggregator): void;
  setView(v: View): void;
  setCoord(v: 0 | 1): void;
  setCommitteeSize(v: number): void;
  setCommitteeShare(v: number): void;
  redeal(): void;
  reset(): void;
}

export const usePoison = create<PoisonState>((set) => ({
  ...DEFAULTS,
  setShare: (share) => set({ share }),
  setAggregator: (aggregator) => set({ aggregator }),
  setView: (view) => set({ view }),
  setCoord: (coord) => set({ coord }),
  setCommitteeSize: (committeeSize) => set({ committeeSize }),
  setCommitteeShare: (committeeShare) => set({ committeeShare }),
  redeal: () => set((s) => ({ dealSeed: s.dealSeed + 1 })),
  reset: () => set({ ...DEFAULTS }),
}));
