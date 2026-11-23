import { create } from "zustand";

/** The six gates of the order of work, left to right. */
export const GATES = [
  { title: "Pre-register", detail: "Hypotheses and decision rules are written down before the reported model is tested." },
  { title: "Tune on validation", detail: "Settings are chosen on the validation split only." },
  { title: "Freeze", detail: "The chosen settings are written to a file and not changed again." },
  { title: "Run once", detail: "Train on train plus validation, evaluate once on test, ranking the full catalogue." },
  { title: "Control check", detail: "A positive and a negative control decide VALID or INVALID." },
  { title: "Report", detail: "Every verdict is reported, including the ones against the hypothesis." },
] as const;

export const MAX_SEEDS = 12;
export const MAX_COMPARISONS = 30;

interface MethodState {
  /** Gates passed on the order-of-work slide, 0 to 6. */
  stage: number;
  /** The two controls on the controls slide: did each behave as the rule demands? */
  positiveOk: boolean;
  negativeOk: boolean;
  /** Bumped by "Run the controls" so the scene replays the travel. */
  runNonce: number;
  /** Statistics slide. */
  seeds: number;
  comparisons: number;
  setStage(stage: number): void;
  next(): void;
  back(): void;
  setPositive(ok: boolean): void;
  setNegative(ok: boolean): void;
  run(): void;
  setSeeds(n: number): void;
  setComparisons(n: number): void;
  reset(): void;
}

const INITIAL = { stage: 0, positiveOk: true, negativeOk: true, runNonce: 0, seeds: 10, comparisons: 1 };

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(v)));

export const useMethod = create<MethodState>((set) => ({
  ...INITIAL,
  setStage: (stage) => set({ stage: clamp(stage, 0, GATES.length) }),
  next: () => set((s) => ({ stage: Math.min(GATES.length, s.stage + 1) })),
  back: () => set((s) => ({ stage: Math.max(0, s.stage - 1) })),
  setPositive: (positiveOk) => set((s) => ({ positiveOk, runNonce: s.runNonce + 1 })),
  setNegative: (negativeOk) => set((s) => ({ negativeOk, runNonce: s.runNonce + 1 })),
  run: () => set((s) => ({ runNonce: s.runNonce + 1 })),
  setSeeds: (n) => set({ seeds: clamp(n, 1, MAX_SEEDS) }),
  setComparisons: (n) => set({ comparisons: clamp(n, 1, MAX_COMPARISONS) }),
  reset: () => set({ ...INITIAL }),
}));
