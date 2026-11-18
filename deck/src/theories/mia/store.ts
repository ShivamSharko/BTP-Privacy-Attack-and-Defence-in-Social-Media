import { create } from "zustand";
import type { Control } from "./sim";

/** Where the presenter's threshold starts on the first slide, in loss units. */
export const START_THRESHOLD = -0.4;
/** The loss range the threshold can be dragged across. */
export const THRESHOLD_MIN = -4.5;
export const THRESHOLD_MAX = 4.5;

interface MiaState {
  /** The attacker's threshold on slide 1: users whose loss is below it are called members. */
  threshold: number;
  /** Privacy level on slide 2, 0 for no privacy noise to 1 for the strongest. An illustration scale. */
  privacy: number;
  /** Slide 2: false draws the raw loss, true the loss after reference models are subtracted. */
  calibrated: boolean;
  /** Slide 3: which model the attack is pointed at. */
  control: Control;
  setThreshold(value: number): void;
  setPrivacy(value: number): void;
  setCalibrated(value: boolean): void;
  setControl(value: Control): void;
  reset(): void;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number.isNaN(v) ? lo : v));

export const useMia = create<MiaState>((set) => ({
  threshold: START_THRESHOLD,
  privacy: 0,
  calibrated: false,
  control: "released",
  setThreshold: (value) => set({ threshold: clamp(value, THRESHOLD_MIN, THRESHOLD_MAX) }),
  setPrivacy: (value) => set({ privacy: clamp(value, 0, 1) }),
  setCalibrated: (value) => set({ calibrated: value }),
  setControl: (value) => set({ control: value }),
  reset: () =>
    set({
      threshold: START_THRESHOLD,
      privacy: 0,
      calibrated: false,
      control: "released",
    }),
}));
