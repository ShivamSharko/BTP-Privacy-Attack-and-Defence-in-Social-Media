import { create } from "zustand";
import { grid, m, raw } from "../../data";
import { epsilonAt } from "./sim";

export type Regime = "small" | "large";
export type Needle = "prv" | "pld" | "rdp";
export type Convention = "record" | "n2";

/** The two frozen regimes, read from the result file. */
export function regimeSetting(regime: Regime): { rate: number; rounds: number; rateIdx: number; noise: number } {
  const rate = m("privacy_utility", `frozen/regimes/${regime}/sample_rate`);
  return {
    rate,
    rounds: m("privacy_utility", `frozen/regimes/${regime}/rounds`),
    rateIdx: grid.rates.indexOf(rate),
    noise: m("privacy_utility", `summary/${regime}/levels/eps8/noise_multiplier`),
  };
}

/** The privacy levels the project reports, in order (1, 2, 4, 8, 16). */
export const LEVELS: number[] = raw<number[]>("privacy_utility", "frozen/epsilons");
/** The budget drawn as a contour: the headline level, epsilon 8. */
export const BUDGET: number = LEVELS[3];

const START = regimeSetting("small");

/** How much looser than PLD the toy RDP needle sits (an illustration; the real RDP is not exported). */
export const TOY_RDP_LOOSENESS = 1.12;
/**
 * Starting values of the three needles on the gate slide: the small regime's epsilon-8 run.
 * PLD is read off the grid, PRV is the value of record (the larger of the two), RDP is a toy.
 */
export const TOY_BASE = (() => {
  const pld = epsilonAt(grid, START.rateIdx, START.noise, START.rounds);
  const prv = Math.max(m("privacy_utility", "summary/small/levels/eps8/epsilon_of_record"), pld);
  return { prv, pld, rdp: pld * TOY_RDP_LOOSENESS };
})();

interface AcctState {
  /** 7.1: the point on the surface. */
  rateIdx: number;
  noise: number;
  rounds: number;
  /** 7.2: which needle the slider moves, and by how much (a share, so 0.05 is five per cent). */
  moved: Needle;
  shift: number;
  /** 7.3: calibration search. */
  calibRegime: Regime;
  calibTarget: number;
  calibStep: number;
  /** 7.4: delta convention and regime on the impact slide. */
  regime: Regime;
  convention: Convention;
  setPoint(noise: number, rounds: number): void;
  setNoise(noise: number): void;
  setRounds(rounds: number): void;
  setRate(rateIdx: number): void;
  setMoved(moved: Needle): void;
  setShift(shift: number): void;
  setCalibRegime(regime: Regime): void;
  setCalibTarget(target: number): void;
  setCalibStep(step: number): void;
  setRegime(regime: Regime): void;
  setConvention(convention: Convention): void;
  reset(): void;
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const NOISE_LO = grid.noise[0];
const NOISE_HI = grid.noise[grid.noise.length - 1];
const ROUNDS_LO = grid.rounds[0];
const ROUNDS_HI = grid.rounds[grid.rounds.length - 1];

const INITIAL = {
  rateIdx: START.rateIdx,
  noise: START.noise,
  rounds: START.rounds,
  moved: "pld" as Needle,
  shift: 0,
  calibRegime: "small" as Regime,
  calibTarget: BUDGET,
  calibStep: 0,
};

export const useAcct = create<AcctState>((set) => ({
  ...INITIAL,
  regime: "small",
  convention: "record",
  setPoint: (noise, rounds) => set({ noise: clamp(noise, NOISE_LO, NOISE_HI), rounds: clamp(rounds, ROUNDS_LO, ROUNDS_HI) }),
  setNoise: (noise) => set({ noise: clamp(noise, NOISE_LO, NOISE_HI) }),
  setRounds: (rounds) => set({ rounds: clamp(rounds, ROUNDS_LO, ROUNDS_HI) }),
  setRate: (rateIdx) => set({ rateIdx }),
  setMoved: (moved) => set({ moved }),
  setShift: (shift) => set({ shift }),
  setCalibRegime: (calibRegime) => set({ calibRegime, calibStep: 0 }),
  setCalibTarget: (calibTarget) => set({ calibTarget, calibStep: 0 }),
  setCalibStep: (calibStep) => set({ calibStep }),
  setRegime: (regime) => set({ regime }),
  setConvention: (convention) => set({ convention }),
  reset: () => set({ ...INITIAL }),
}));
