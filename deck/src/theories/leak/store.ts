import { create } from "zustand";
import { historyMask, N_ITEMS, userHistory } from "./sim";

export const DEFAULTS = { user: 0, size: 8, spill: 0.12, angle: 40, threshold: 0.55, networkSeed: 0 };

interface LeakState {
  /** Which of the four toy users is shown on the inversion slide. */
  user: number;
  size: number;
  /** The user's history as a flag per item. Clicking an item in the scene flips one. */
  mask: boolean[];
  /** Spill-over: how much of the update lands on items the user never touched. */
  spill: number;
  /** Angle between two users' updates, in degrees. */
  angle: number;
  /** Cosine at or above which the attacker calls two users friends. */
  threshold: number;
  networkSeed: number;
  setUser(user: number): void;
  setSize(size: number): void;
  setSpill(spill: number): void;
  toggleItem(item: number): void;
  setAngle(angle: number): void;
  setThreshold(threshold: number): void;
  nextNetwork(): void;
  reset(): void;
}

const maskFor = (user: number, size: number) => historyMask(userHistory(user, size));

export const useLeak = create<LeakState>((set) => ({
  ...DEFAULTS,
  mask: maskFor(DEFAULTS.user, DEFAULTS.size),
  setUser: (user) => set((s) => ({ user, mask: maskFor(user, s.size) })),
  setSize: (size) => set((s) => ({ size, mask: maskFor(s.user, size) })),
  setSpill: (spill) => set({ spill }),
  toggleItem: (item) =>
    set((s) => {
      if (item < 0 || item >= N_ITEMS) return s;
      const mask = s.mask.slice();
      mask[item] = !mask[item];
      return { mask, size: mask.filter(Boolean).length };
    }),
  setAngle: (angle) => set({ angle: Math.max(0, Math.min(180, angle)) }),
  setThreshold: (threshold) => set({ threshold: Math.max(-1, Math.min(1, threshold)) }),
  nextNetwork: () => set((s) => ({ networkSeed: (s.networkSeed + 1) % 6 })),
  reset: () => set({ ...DEFAULTS, mask: maskFor(DEFAULTS.user, DEFAULTS.size) }),
}));
