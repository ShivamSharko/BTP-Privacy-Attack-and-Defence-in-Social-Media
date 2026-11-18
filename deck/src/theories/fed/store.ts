import { create } from "zustand";
import { addRound, cohortForRound, emptyHistogram, type Histogram } from "./sim";

export type Regime = "large" | "small";

/** The five moments of one round, in order. 0 is the pause before a round starts. */
export const PHASES = ["Waiting for a round", "1. Sample", "2. Compute on the device", "3. Send the update", "4. Average and apply"];

export const MAX_HISTOGRAM_ROUNDS = 300;

interface FedState {
  /** Sampling rate on the round-by-round slide. */
  q: number;
  phase: number;
  round: number;
  /** Which frozen regime the histogram slide replays. */
  regime: Regime;
  hist: Histogram;
  /** Cohort of the latest histogram round, for the flash in the scene. */
  histCohort: number[];
  setQ(q: number): void;
  advance(): void;
  setRegime(regime: Regime): void;
  /** One more round on the histogram slide, at the given sampling rate. */
  tick(q: number): void;
  resetHistogram(): void;
  reset(): void;
}

export const useFed = create<FedState>((set) => ({
  q: 0.3,
  phase: 0,
  round: 0,
  regime: "small",
  hist: emptyHistogram(),
  histCohort: [],
  setQ: (q) => set({ q, phase: 0 }),
  advance: () => set((s) => (s.phase >= 4 ? { phase: 1, round: s.round + 1 } : { phase: s.phase + 1 })),
  setRegime: (regime) => set({ regime, hist: emptyHistogram(), histCohort: [] }),
  tick: (q) =>
    set((s) => {
      if (s.hist.rounds >= MAX_HISTOGRAM_ROUNDS) return s;
      const cohort = cohortForRound(10_000 + s.hist.rounds, q);
      return { hist: addRound(s.hist, cohort.length), histCohort: cohort };
    }),
  resetHistogram: () => set({ hist: emptyHistogram(), histCohort: [] }),
  reset: () => set({ q: 0.3, phase: 0, round: 0, hist: emptyHistogram(), histCohort: [] }),
}));
