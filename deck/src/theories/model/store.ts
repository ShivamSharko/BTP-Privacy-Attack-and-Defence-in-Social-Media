import { create } from "zustand";
import { m } from "../../data";
import { CATALOGUE, type Mode, sampleUsers } from "./sim";

export type Metric = "ndcg@10" | "hr@10";

const USERS = sampleUsers(CATALOGUE);

/** The temperature the project froze for the real model. */
export const FROZEN_TEMPERATURE = m("privacy_utility", "frozen/model/temperature");
export const TEMPERATURE_MAX = 30;

interface ModelState {
  /** Items in the user's history, in the order they were added. */
  history: number[];
  /** Which example user the "example user" button shows next. */
  example: number;
  mode: Mode;
  temperature: number;
  /** Seed of the random half that training hides. */
  seed: number;
  metric: Metric;
  toggleItem(i: number): void;
  clear(): void;
  nextExample(): void;
  /** Gives the history an example user if it is too short to split. */
  ensureHistory(minimum: number): void;
  setMode(mode: Mode): void;
  setTemperature(t: number): void;
  rehide(): void;
  setMetric(metric: Metric): void;
  reset(): void;
}

const initial = { history: [...USERS[0]], example: 0, mode: "content" as Mode, temperature: FROZEN_TEMPERATURE, seed: 1 };

export const useModel = create<ModelState>((set) => ({
  ...initial,
  metric: "ndcg@10",
  toggleItem: (i) => set((s) => ({ history: s.history.includes(i) ? s.history.filter((x) => x !== i) : [...s.history, i] })),
  clear: () => set({ history: [] }),
  nextExample: () => set((s) => ({ example: (s.example + 1) % USERS.length, history: [...USERS[(s.example + 1) % USERS.length]] })),
  ensureHistory: (minimum) => set((s) => (s.history.length >= minimum ? s : { history: [...USERS[s.example]] })),
  setMode: (mode) => set({ mode }),
  setTemperature: (temperature) => set({ temperature }),
  rehide: () => set((s) => ({ seed: s.seed + 1 })),
  setMetric: (metric) => set({ metric }),
  reset: () => set({ ...initial, history: [...USERS[0]] }),
}));
