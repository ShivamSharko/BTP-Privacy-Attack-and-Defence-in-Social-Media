import { create } from "zustand";
import { m } from "../../data";

export type Regime = "large" | "small";
export type Cohort = "all" | "minus" | "empty";

/** The project's values, used as the sliders' starting points. */
export const PROJECT_C = m("privacy_utility", "frozen/regimes/large/clip_norm");
export const H1_EPSILON = m("privacy_utility", "summary/large/h1/epsilon");
export const PROJECT_Z = m("privacy_utility", "summary/large/levels/eps8/noise_multiplier");

/** What-if population multipliers: 1 is the real run at epsilon 8. */
export const MULTIPLIERS = [1, 2, 5, 10] as const;

/** Where the window S starts on the output axis, in noise widths, and how wide it is. */
export const WINDOW_WIDTH = 1.2;
const WINDOW_START = 0.5;

interface DpState {
  epsilon: number;
  windowStart: number;
  C: number;
  z: number;
  cohort: Cohort;
  regime: Regime;
  multiplier: number;
  setEpsilon(epsilon: number): void;
  setWindowStart(start: number): void;
  setC(C: number): void;
  setZ(z: number): void;
  setCohort(cohort: Cohort): void;
  setRegime(regime: Regime): void;
  setMultiplier(index: number): void;
  reset(): void;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

const initial = {
  epsilon: H1_EPSILON,
  windowStart: WINDOW_START,
  C: PROJECT_C,
  z: PROJECT_Z,
  cohort: "all" as Cohort,
  regime: "large" as Regime,
  multiplier: 0,
};

export const useDp = create<DpState>((set) => ({
  ...initial,
  setEpsilon: (epsilon) => set({ epsilon: clamp(epsilon, 0.1, 10) }),
  setWindowStart: (windowStart) => set({ windowStart: clamp(windowStart, -4, 4 - WINDOW_WIDTH) }),
  setC: (C) => set({ C: clamp(C, 0, 10) }),
  setZ: (z) => set({ z: clamp(z, 0, 4) }),
  setCohort: (cohort) => set({ cohort }),
  setRegime: (regime) => set({ regime }),
  setMultiplier: (multiplier) => set({ multiplier: clamp(Math.round(multiplier), 0, MULTIPLIERS.length - 1) }),
  reset: () => set(initial),
}));
