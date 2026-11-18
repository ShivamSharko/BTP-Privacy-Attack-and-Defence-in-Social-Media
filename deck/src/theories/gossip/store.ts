import { create } from "zustand";
import { rng } from "../../sim/random";
import {
  DEFAULT_DEGREE,
  disagreement,
  GRAPH,
  goalOf,
  gossipRound,
  initialValues,
  initTrain,
  makeTargets,
  ORDER,
  type Optimiser,
  type PeerTable,
  takePeers,
  TOY,
  trainRound,
  type TrainState,
} from "./sim";

/** Rounds the training slides run before they stop by themselves. */
export const MAX_TRAIN_ROUNDS = 160;
/** Peers per round on the training slides: the value the project's runs used. */
export const TRAIN_DEGREE = DEFAULT_DEGREE;

export const START_VALUES = initialValues(GRAPH, 2);
export const START_RANGE = disagreement(START_VALUES);
export const TARGETS = makeTargets(GRAPH, 6);
export const GOAL = goalOf(TARGETS);

const tables = new Map<number, PeerTable>();
/** The peer table for a number of peers per round; the prefix of one fixed order. */
export function tableFor(degree: number): PeerTable {
  const d = Math.max(0, Math.round(degree));
  let table = tables.get(d);
  if (!table) {
    table = takePeers(ORDER, d);
    tables.set(d, table);
  }
  return table;
}

interface GossipState {
  /** Peers per round on the first slide. */
  degree: number;
  values: number[];
  round: number;
  playing: boolean;

  optimiser: Optimiser;
  noise: boolean;
  train: TrainState;
  trainRounds: number;
  trainPlaying: boolean;

  setDegree(degree: number): void;
  step(): void;
  setPlaying(playing: boolean): void;
  /** Overwrite one user's model: the other end of the scale from where it is now. */
  kick(node: number): void;
  restart(): void;

  setOptimiser(optimiser: Optimiser): void;
  setNoise(noise: boolean): void;
  stepTrain(): void;
  setTrainPlaying(playing: boolean): void;
  restartTrain(playing?: boolean): void;
  reset(): void;
}

const freshTrain = () => initTrain(GRAPH.n);

export const useGossip = create<GossipState>((set, get) => ({
  degree: DEFAULT_DEGREE,
  values: START_VALUES,
  round: 0,
  playing: false,

  optimiser: "adam",
  noise: false,
  train: freshTrain(),
  trainRounds: 0,
  trainPlaying: false,

  setDegree: (degree) => set({ degree }),
  step: () => set((s) => ({ values: gossipRound(s.values, tableFor(s.degree).peers), round: s.round + 1 })),
  setPlaying: (playing) => set({ playing }),
  kick: (node) =>
    set((s) => {
      if (node < 0 || node >= s.values.length) return s;
      const values = s.values.slice();
      values[node] = values[node] < 0.5 ? 1 : 0;
      return { values };
    }),
  restart: () => set({ values: START_VALUES, round: 0, playing: false }),

  setOptimiser: (optimiser) => set({ optimiser, train: freshTrain(), trainRounds: 0, trainPlaying: true }),
  setNoise: (noise) => set({ noise, train: freshTrain(), trainRounds: 0, trainPlaying: true }),
  stepTrain: () =>
    set((s) => {
      if (s.trainRounds >= MAX_TRAIN_ROUNDS) return { trainPlaying: false };
      const r = rng(9000 + s.trainRounds);
      const next = trainRound(
        s.train,
        TARGETS,
        tableFor(TRAIN_DEGREE).peers,
        { optimiser: s.optimiser, noise: s.noise ? TOY.noiseShown : 0 },
        r,
      );
      return { train: next, trainRounds: s.trainRounds + 1 };
    }),
  setTrainPlaying: (trainPlaying) => set({ trainPlaying }),
  restartTrain: (playing = true) => set({ train: freshTrain(), trainRounds: 0, trainPlaying: playing }),
  reset: () => {
    get().restart();
    get().restartTrain(false);
    set({ degree: DEFAULT_DEGREE, optimiser: "adam", noise: false });
  },
}));
