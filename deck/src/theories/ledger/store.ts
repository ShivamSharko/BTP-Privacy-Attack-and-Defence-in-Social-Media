import { create } from "zustand";
import { m } from "../../data";
import { gateRun, MAX_LEAVES } from "./sim";

export const START_LEAVES = 5;

/** The measured blocked-release demonstration in results/ledger_audit.json. */
const DEMO = "results/blocked_release_demo";
export const demo = {
  asked: m("ledger_audit", `${DEMO}/rounds_asked`),
  allowed: m("ledger_audit", `${DEMO}/rounds_allowed`),
  completed: m("ledger_audit", `${DEMO}/rounds_completed`),
  budget: m("ledger_audit", `${DEMO}/budget_epsilon`),
  released: m("ledger_audit", `${DEMO}/epsilon_released`),
};

/**
 * The gate for a run asking for `asked` rounds. The accountant turns the budget into a round
 * count before training (max_rounds_within); the bar is drawn in those units, so each round
 * spends budget / allowed of it and the measured allowance is reproduced exactly.
 */
export const runFor = (asked: number) => gateRun(asked, demo.budget, demo.budget / demo.allowed);

/** Upper end of the rounds-asked slider. */
export const MAX_ASKED = Math.ceil(demo.asked * 1.25);

interface LedgerState {
  /** Receipts in the toy log; receipt i is round i + 1. */
  size: number;
  /** Bumped on every append, so the scene can play the hash wave once more. */
  appends: number;
  /** Leaf whose inclusion proof is shown. */
  selected: number;
  /** Bumped when a leaf is picked, to replay the verification wave. */
  checks: number;
  /** Whether one byte of the selected receipt is flipped. */
  tampered: boolean;
  /** Release gate: rounds asked for, rounds processed so far, and whether it is running. */
  asked: number;
  progress: number;
  playing: boolean;
  append(): void;
  clear(): void;
  select(index: number): void;
  setTampered(on: boolean): void;
  setAsked(asked: number): void;
  play(): void;
  tick(last: number): void;
  resetGate(): void;
  reset(): void;
}

const initial = { size: START_LEAVES, appends: 0, selected: 2, checks: 0, tampered: false, progress: 0, playing: false };

export const useLedger = create<LedgerState>((set) => ({
  ...initial,
  asked: demo.asked,
  append: () => set((s) => (s.size >= MAX_LEAVES ? s : { size: s.size + 1, appends: s.appends + 1, tampered: false })),
  clear: () => set((s) => ({ size: 0, appends: s.appends + 1, tampered: false, selected: 0 })),
  select: (index) =>
    set((s) => (index >= 0 && index < s.size ? { selected: index, checks: s.checks + 1, tampered: false } : s)),
  setTampered: (on) => set((s) => ({ tampered: on && s.size > 0, checks: s.checks + 1 })),
  setAsked: (asked) => set({ asked, progress: 0, playing: false }),
  play: () => set({ progress: 0, playing: true }),
  tick: (last) => set((s) => (s.progress >= last ? { playing: false } : { progress: s.progress + 1 })),
  resetGate: () => set({ progress: 0, playing: false }),
  reset: () => set({ ...initial, asked: demo.asked }),
}));
