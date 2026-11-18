import { m, raw } from "../../data";
import type { Level } from "./store";
import { type Config, SCENARIOS, type Scenario } from "./sim";

/** Everything the participation slides read from results/participation.json, in one place. */

export const SCENARIO_LABEL: Record<Scenario, string> = {
  always: "Always on",
  independent: "Independent",
  activity: "Tied to activity",
  social: "Friends together",
  trace: "Device trace",
  trace_activity: "Trace tied to activity",
  trace_replay: "Trace replayed over time",
};

export const SCENARIO_SHORT: Record<Scenario, string> = {
  always: "always",
  independent: "independent",
  activity: "activity",
  social: "social",
  trace: "trace",
  trace_activity: "trace, activity",
  trace_replay: "trace replay",
};

export const GROUP_NAME = ["least active third", "middle third", "most active third"];

/** The settings the toy city mirrors. */
export function configFromResults(): Config {
  return {
    mean: m("participation", "settings/availability_mean"),
    floor: m("participation", "settings/availability_floor"),
    traceMean: m("participation", "settings/trace/summary/mean_active_share"),
  };
}

const cell = (s: Scenario, level: Level) => `results/cells/${s}/${level}`;

/** Mean NDCG@10 of the least, middle and most active third of users. */
export function groupNdcg(s: Scenario, level: Level): number[] {
  return [0, 1, 2].map((g) => m("participation", `${cell(s, level)}/activity_groups_ndcg10/${g}`));
}

/** Mean availability of the same three groups (the probability the user is free to train). */
export function groupAvailability(s: Scenario): number[] {
  return [0, 1, 2].map((g) => m("participation", `results/availability/${s}/activity_groups/${g}`));
}

export const overallNdcg = (s: Scenario, level: Level): number => m("participation", `${cell(s, level)}/overall_ndcg10/mean`);
export const overallRange = (s: Scenario, level: Level): [number, number] => [
  m("participation", `${cell(s, level)}/overall_ndcg10/min`),
  m("participation", `${cell(s, level)}/overall_ndcg10/max`),
];

export const gapMean = (s: Scenario, level: Level): number => m("participation", `${cell(s, level)}/activity_gap/mean`);

export function gapPerSeed(s: Scenario, level: Level): number[] {
  const seeds = raw<number[]>("participation", "settings/seeds");
  return seeds.map((seed) => m("participation", `${cell(s, level)}/activity_gap/per_seed/${seed}`));
}

/** Per-seed gap in friend-count groups, the measure the social half of H5 uses. */
export function degreeGapPerSeed(s: Scenario, level: Level): number[] {
  const seeds = raw<number[]>("participation", "settings/seeds");
  return seeds.map((seed) => m("participation", `${cell(s, level)}/degree_gap/per_seed/${seed}`));
}

/** The target epsilon, the one of record, and whether the project marks it nominal (from the result file's own note). */
export function epsilonOf(s: Scenario): { target: number; record: number; nominal: boolean; note: string } {
  const base = cell(s, "8");
  const note = raw<string>("participation", `${base}/epsilon_note`);
  return {
    target: m("participation", `${base}/epsilon_target`),
    record: m("participation", `${base}/epsilon_of_record`),
    nominal: note.includes("NOMINAL"),
    note,
  };
}

/** The tallest band in any scenario and at either privacy level, so the scale never changes. */
export function maxBand(): number {
  let top = 0;
  for (const s of SCENARIOS) for (const level of ["8", "nondp"] as const) top = Math.max(top, ...groupNdcg(s, level));
  return top;
}

export const trace = () => ({
  devices: m("participation", "settings/trace/summary/devices"),
  meanShare: m("participation", "settings/trace/summary/mean_active_share"),
  medianShare: m("participation", "settings/trace/summary/median_active_share"),
  secondsPerRound: m("participation", "settings/trace/seconds_per_round"),
});
