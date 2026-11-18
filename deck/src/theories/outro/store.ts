import { create } from "zustand";
import { raw } from "../../data";
import { createSandbox, evaluate, popularityAccuracy, runRound, type Sandbox, type Settings } from "./sim";

export const SEED = 1;
/** Rounds run per timer tick, and the tick period: about twenty rounds a second. */
export const ROUNDS_PER_TICK = 2;
export const TICK_MS = 100;
/** The sandbox stops by itself here, so the chart has a fixed width. */
export const MAX_ROUNDS = 400;

export interface HistoryPoint {
  round: number;
  accuracy: number;
  exposure: number;
}

/** The live training state is a mutable object outside React; the store holds what the screen shows. */
let sandbox: Sandbox = createSandbox(SEED);

function defaults(): Settings {
  return { noise: 0, share: 0, q: 0.3, aggregator: "sum", trim: raw<number>("poisoning", "settings/trim_fraction") };
}

function snapshot(sb: Sandbox) {
  const metrics = evaluate(sb);
  return { round: sb.round, accuracy: metrics.accuracy, exposure: metrics.exposure };
}

export const POPULAR = popularityAccuracy(sandbox.world);

interface OutroState {
  settings: Settings;
  running: boolean;
  round: number;
  accuracy: number;
  exposure: number;
  history: HistoryPoint[];
  /** Accounts sampled in the latest round, for the flash in the scene. */
  cohort: number[];
  /** Increases with every tick, so the scene knows a round happened. */
  tickId: number;
  /** Trade-off slide: the point being inspected. */
  hovered: string | null;
  /** Failure-mode slide: which replay, and a counter to play it again. */
  replay: number;
  replayNonce: number;
  set(patch: Partial<Settings>): void;
  toggle(): void;
  tick(): void;
  resetSandbox(): void;
  setHovered(id: string | null): void;
  play(replay: number): void;
  reset(): void;
}

const fresh = () => {
  sandbox = createSandbox(SEED);
  const first = snapshot(sandbox);
  return { running: false, ...first, history: [first], cohort: [] as number[] };
};

export const useOutro = create<OutroState>((set, get) => ({
  settings: defaults(),
  ...fresh(),
  tickId: 0,
  hovered: null,
  replay: 0,
  replayNonce: 0,
  set: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
  toggle: () =>
    set((s) => {
      if (s.running) return { running: false };
      // Pressing start after the run finished begins a new one.
      return s.round >= MAX_ROUNDS ? { ...fresh(), running: true } : { running: true };
    }),
  tick: () => {
    const s = get();
    if (!s.running) return;
    let cohort: number[] = [];
    for (let i = 0; i < ROUNDS_PER_TICK && sandbox.round < MAX_ROUNDS; i++) cohort = runRound(sandbox, s.settings).cohort;
    const point = snapshot(sandbox);
    set({
      ...point,
      history: [...s.history, point],
      cohort,
      tickId: s.tickId + 1,
      running: sandbox.round < MAX_ROUNDS,
    });
  },
  resetSandbox: () => set({ ...fresh(), tickId: get().tickId + 1 }),
  setHovered: (hovered) => set({ hovered }),
  play: (replay) => set((s) => ({ replay, replayNonce: s.replayNonce + 1 })),
  reset: () => set({ settings: defaults(), ...fresh(), hovered: null, replay: 0, replayNonce: get().replayNonce + 1 }),
}));
