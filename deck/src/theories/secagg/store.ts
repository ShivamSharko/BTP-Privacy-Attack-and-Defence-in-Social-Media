import { create } from "zustand";
import { MAX_COHORT } from "./sim";

/** Ring slide: 0 plain, 1 masked, 2 sent, 3 summed. */
export const RING_PHASES = ["plain", "masked", "sent", "summed"];
/** Dropout slide: 0 masks agreed, 1 survivors send, 2 survivors reveal their seeds with the dropped user. */
export const DROP_PHASES = ["masks agreed", "survivors sent", "seeds revealed"];
/** Pipeline slide: how far through the four ingredients we are. */
export const STAGES = ["Two users, no secret yet", "1. Key agreement", "2. Key derivation", "3. Mask stream", "4. Fixed point and masking"];
export const MAX_STAGE = STAGES.length - 1;
export const MAX_ROUND = 9;

export type View = "users" | "server";

interface SecAggState {
  phase: number;
  view: View;
  /** The user whose threads are highlighted on the ring slide, or -1. */
  focus: number;
  stage: number;
  round: number;
  /** The user knocked out on the dropout slide, or -1. */
  dropped: number;
  dropPhase: number;
  cohort: number;
  /** True while the cohort slide grows the cohort by itself. */
  playing: boolean;
  /** True while the pipeline slide steps through its four pieces by itself. */
  auto: boolean;
  setPhase(phase: number): void;
  setView(view: View): void;
  setFocus(user: number): void;
  setStage(stage: number): void;
  setRound(round: number): void;
  toggleDropped(user: number): void;
  advanceDrop(): void;
  resetDrop(): void;
  setCohort(n: number): void;
  play(): void;
  tick(): void;
  startAuto(): void;
  autoStep(): void;
  reset(): void;
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

export const useSecAgg = create<SecAggState>((set) => ({
  phase: 0,
  view: "users",
  focus: -1,
  stage: 0,
  round: 1,
  dropped: -1,
  dropPhase: 0,
  cohort: 1,
  playing: false,
  auto: false,
  setPhase: (phase) => set({ phase: clamp(phase, 0, 3) }),
  setView: (view) => set({ view }),
  setFocus: (user) => set((s) => ({ focus: s.focus === user ? -1 : user })),
  setStage: (stage) => set({ stage: clamp(Math.round(stage), 0, MAX_STAGE), auto: false }),
  startAuto: () => set({ stage: 0, auto: true }),
  autoStep: () => set((s) => (s.stage >= MAX_STAGE ? { auto: false } : { stage: s.stage + 1 })),
  setRound: (round) => set({ round: clamp(Math.round(round), 1, MAX_ROUND) }),
  toggleDropped: (user) => set((s) => ({ dropped: s.dropped === user ? -1 : user, dropPhase: 0 })),
  advanceDrop: () => set((s) => ({ dropPhase: s.dropPhase >= 2 ? 0 : s.dropPhase + 1 })),
  resetDrop: () => set({ dropped: -1, dropPhase: 0 }),
  setCohort: (n) => set({ cohort: clamp(Math.round(n), 1, MAX_COHORT), playing: false }),
  play: () => set({ cohort: 1, playing: true }),
  tick: () => set((s) => (s.cohort >= MAX_COHORT ? { playing: false } : { cohort: s.cohort + 1 })),
  reset: () => set({ phase: 0, view: "users", focus: -1, stage: 0, round: 1, dropped: -1, dropPhase: 0, cohort: 1, playing: false, auto: false }),
}));
