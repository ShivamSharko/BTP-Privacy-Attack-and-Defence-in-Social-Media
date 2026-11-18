import { create } from "zustand";
import type { Scenario } from "./sim";

/** Which privacy level the bands and charts show: the private run at epsilon 8, or the non-private one. */
export type Level = "8" | "nondp";

export const DEFAULT_HOUR = 9;

interface PartState {
  scenario: Scenario;
  /** Hour of the day, 0 to 24. */
  hour: number;
  playing: boolean;
  level: Level;
  setScenario(s: Scenario): void;
  setHour(h: number): void;
  /** Move the clock on while playing, without stopping it. */
  advance(hours: number): void;
  togglePlay(): void;
  setLevel(l: Level): void;
  reset(): void;
}

export const usePart = create<PartState>((set) => ({
  scenario: "independent",
  hour: DEFAULT_HOUR,
  playing: false,
  level: "8",
  setScenario: (scenario) => set({ scenario }),
  setHour: (hour) => set({ hour: ((hour % 24) + 24) % 24, playing: false }),
  advance: (hours) => set((s) => ({ hour: (((s.hour + hours) % 24) + 24) % 24 })),
  togglePlay: () => set((s) => ({ playing: !s.playing })),
  setLevel: (level) => set({ level }),
  reset: () => set({ scenario: "independent", hour: DEFAULT_HOUR, playing: false, level: "8" }),
}));
