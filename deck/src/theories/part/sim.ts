import { gaussian, rng } from "../../sim/random";

/**
 * A toy city of users, for the participation slides. Every user has an activity level and a few
 * friends; each scenario turns that into the probability that the user's phone is free to train
 * at a given hour. The real scenarios are in src/prism/fl/availability.py; the three that use a
 * recorded device trace are stood in for here by a day and night curve, because the trace itself
 * is not part of the deck.
 */

export const SCENARIOS = ["always", "independent", "activity", "social", "trace", "trace_activity", "trace_replay"] as const;
export type Scenario = (typeof SCENARIOS)[number];

export interface Config {
  /** Mean availability of the synthetic scenarios (the project's availability_mean). */
  mean: number;
  /** Lowest availability anyone gets (the project's availability_floor). */
  floor: number;
  /** Mean active share of the stand-in device trace. */
  traceMean: number;
}

export const DEFAULT_CONFIG: Config = { mean: 0.5, floor: 0.05, traceMean: 0.21 };

/** Users drawn in the scene. */
export const N_USERS = 240;
const DISTRICTS = 12;
const COLUMNS = 4;
const TAU = Math.PI * 2;

export interface World {
  n: number;
  cfg: Config;
  /** Rank of each user's activity, 0 (least) to 1 (most). */
  activity: Float64Array;
  degree: Int32Array;
  friends: [number, number][];
  district: Int32Array;
  /** Hour at which each district's phones tend to be free: friends are online together. */
  districtPeak: Float64Array;
  /** Static availability of each scenario that does not follow a clock, and the base of those that do. */
  base: Record<Scenario, Float64Array>;
  /** Per-user shift of the stand-in trace, in hours. */
  devicePhase: Float64Array;
  /** City position, xyz per user, and the height of the building under each light. */
  pos: Float32Array;
  height: Float32Array;
  /** A fixed number in [0, 1) per user: lit when it is below the probability (used by the bands). */
  coin: Float64Array;
}

/** Hour of day folded into [0, 24): hour 24 is hour 0. */
export function wrapHour(hour: number): number {
  const h = hour % 24;
  return h < 0 ? h + 24 : h;
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

/** Rank mapped onto [0, 1] (unique values: ties are broken by position). */
function rankFraction(values: ArrayLike<number>): Float64Array {
  const n = values.length;
  const out = new Float64Array(n);
  if (n <= 1) return out.fill(0.5);
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => values[a] - values[b] || a - b);
  order.forEach((user, rank) => {
    out[user] = rank / (n - 1);
  });
  return out;
}

export function makeWorld(seed: number, n: number = N_USERS, cfg: Config = DEFAULT_CONFIG): World {
  const r = rng(seed * 7919 + 13);
  const district = new Int32Array(n);
  const pos = new Float32Array(n * 3);
  const rows = DISTRICTS / COLUMNS;
  for (let i = 0; i < n; i++) {
    const d = i % DISTRICTS;
    district[i] = d;
    const cx = ((d % COLUMNS) - (COLUMNS - 1) / 2) * 1.95;
    const cz = (Math.floor(d / COLUMNS) - (rows - 1) / 2) * 1.75;
    pos[i * 3] = cx + (r() - 0.5) * 1.5;
    pos[i * 3 + 1] = -2.65;
    pos[i * 3 + 2] = cz + (r() - 0.5) * 1.3;
  }

  const raw = Array.from({ length: n }, () => Math.exp(0.9 * gaussian(r)));
  const activity = rankFraction(raw);

  // Friends: mostly inside a district, a few across the city.
  const friends: [number, number][] = [];
  const degree = new Int32Array(n);
  const seen = new Set<number>();
  for (let i = 0; i < n && n > 1; i++) {
    const wanted = 1 + Math.floor(r() * r() * 3.4);
    for (let k = 0; k < wanted; k++) {
      let j = Math.floor(r() * n);
      if (r() < 0.8) j = (Math.floor(r() * Math.ceil(n / DISTRICTS)) * DISTRICTS + district[i]) % n;
      if (j === i) continue;
      const key = Math.min(i, j) * n + Math.max(i, j);
      if (seen.has(key)) continue;
      seen.add(key);
      friends.push([Math.min(i, j), Math.max(i, j)]);
      degree[i] += 1;
      degree[j] += 1;
    }
  }

  const districtPeak = new Float64Array(DISTRICTS);
  for (let d = 0; d < DISTRICTS; d++) districtPeak[d] = 13 + r() * 9;
  const devicePhase = new Float64Array(n);
  const shares = new Float64Array(n);
  const coin = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    devicePhase[i] = (r() - 0.5) * 6;
    shares[i] = clamp(-Math.log(1 - r() * 0.999) * cfg.traceMean, cfg.floor, 1);
    coin[i] = r();
  }

  const { mean, floor } = cfg;
  const high = Math.min(1, 2 * mean - floor);
  const ranked = (rank: Float64Array) => rank.map((x) => floor + (high - floor) * x);

  // Social: rank of friend count, blended with the district average so that friends look alike.
  const degreeRank = rankFraction(Array.from(degree));
  const districtMean = new Float64Array(DISTRICTS);
  const districtCount = new Float64Array(DISTRICTS);
  for (let i = 0; i < n; i++) {
    districtMean[district[i]] += degreeRank[i];
    districtCount[district[i]] += 1;
  }
  const socialRank = degreeRank.map((x, i) => 0.5 * x + 0.5 * (districtMean[district[i]] / districtCount[district[i]]));

  // The stand-in trace: each user draws one device, either at random or matched to activity by rank.
  const sorted = Array.from(shares).sort((a, b) => a - b);
  const activityOrder = Array.from({ length: n }, (_, i) => i).sort((a, b) => activity[a] - activity[b] || a - b);
  const matched = new Float64Array(n);
  activityOrder.forEach((user, k) => {
    matched[user] = sorted[k];
  });

  return {
    n,
    cfg,
    activity,
    degree,
    friends,
    district,
    districtPeak,
    base: {
      always: new Float64Array(n).fill(1),
      independent: new Float64Array(n).fill(mean),
      activity: ranked(activity),
      social: ranked(socialRank),
      trace: shares,
      trace_activity: matched,
      trace_replay: shares,
    },
    devicePhase,
    pos,
    height: Float32Array.from(activity, (a) => 0.18 + a * 1.0),
    coin,
  };
}

const EVENING = 19;

/** The probability that user `u` can train at `hour`, in [floor, 1] (exactly 1 for "always"). */
export function availability(world: World, scenario: Scenario, u: number, hour: number): number {
  const base = world.base[scenario][u];
  if (base === undefined) return 0;
  const h = wrapHour(hour);
  const { floor } = world.cfg;
  switch (scenario) {
    case "always":
      return 1;
    case "social":
      return clamp(base + 0.22 * Math.cos((TAU * (h - world.districtPeak[world.district[u]])) / 24), floor, 1);
    case "trace_replay":
      return clamp(base * (1 + 0.9 * Math.cos((TAU * (h - EVENING - world.devicePhase[u])) / 24)), floor, 1);
    default:
      return base;
  }
}

/** Share of users that are available on average at this hour (the mean probability). */
export function shareAvailable(world: World, scenario: Scenario, hour: number): number {
  if (world.n === 0) return 0;
  let sum = 0;
  for (let u = 0; u < world.n; u++) sum += availability(world, scenario, u, hour);
  return sum / world.n;
}

/** A deterministic number in [0, 1) for a user and a one-hour slot. */
export function slotCoin(u: number, slot: number): number {
  let x = Math.imul(u + 1, 0x9e3779b1) ^ Math.imul(slot + 17, 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 15), 0x2c1b3c6d);
  x = Math.imul(x ^ (x >>> 12), 0x297a2d39);
  x ^= x >>> 15;
  return (x >>> 0) / 4294967296;
}

/** Whether the user's light is on: the same coin for the whole hour, so lights change on the hour. */
export function isOn(world: World, scenario: Scenario, u: number, hour: number): boolean {
  return slotCoin(u, Math.floor(wrapHour(hour))) < availability(world, scenario, u, hour);
}

/** Share of the lights that are actually on at this hour. */
export function litShare(world: World, scenario: Scenario, hour: number): number {
  if (world.n === 0) return 0;
  let on = 0;
  for (let u = 0; u < world.n; u++) if (isOn(world, scenario, u, hour)) on += 1;
  return on / world.n;
}

/** 0 = least active third, 2 = most active third. */
export function groupsByActivity(activity: ArrayLike<number>): Uint8Array {
  const n = activity.length;
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => activity[a] - activity[b] || a - b);
  const groups = new Uint8Array(n);
  order.forEach((user, k) => {
    groups[user] = Math.floor((3 * k) / Math.max(n, 1));
  });
  return groups;
}

/** Mean of `values` in each group. A group with no members gives 0, never NaN. */
export function groupMeans(values: ArrayLike<number>, groups: ArrayLike<number>, nGroups = 3): number[] {
  const sums = new Array<number>(nGroups).fill(0);
  const counts = new Array<number>(nGroups).fill(0);
  for (let i = 0; i < values.length; i++) {
    const g = groups[i];
    if (g >= 0 && g < nGroups && Number.isFinite(values[i])) {
      sums[g] += values[i];
      counts[g] += 1;
    }
  }
  return sums.map((s, g) => (counts[g] === 0 ? 0 : s / counts[g]));
}

/** Mean of the top group minus mean of the bottom group, as the project measures the gap. */
export function groupGap(values: ArrayLike<number>, groups: ArrayLike<number>, nGroups = 3): number {
  const means = groupMeans(values, groups, nGroups);
  return means[nGroups - 1] - means[0];
}
