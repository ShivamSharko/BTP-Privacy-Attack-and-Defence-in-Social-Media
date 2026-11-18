import { create } from "zustand";
import type { Role } from "../../world/kit";

/** What the title slide picks out of the crowd. */
export type Highlight = "all" | "hubs" | "alone";
/** Which leak the problem slide shows. */
export type Leak = "all" | "update" | "model" | "crowd";

export interface Stage {
  name: string;
  /** Concept that explains the stage; always opened at its first slide. */
  concept: string;
  role: Role;
  /** One sentence for the walk-through. */
  says: string;
}

/** The system end to end, in the order an update travels. */
export const STAGES: Stage[] = [
  { name: "Device", concept: "fed", role: "honest", says: "Your check-in history stays on your phone. A round asks a random sample of phones to take part." },
  { name: "Local update", concept: "leak", role: "honest", says: "The phone trains on its own history and works out a change to the model: the update." },
  { name: "Clip", concept: "dp", role: "protected", says: "The whole update is scaled down to a fixed length, so no one user can move the model far." },
  { name: "Mask", concept: "secagg", role: "protected", says: "A random mask, agreed in pairs with other phones, hides the update before it leaves." },
  { name: "Secure sum", concept: "secagg", role: "protected", says: "The masks cancel only in the total: the server learns nothing beyond what the total reveals, which for a small cohort is still a lot." },
  { name: "Noise", concept: "dp", role: "noise", says: "Gaussian noise is added to the sum, sized so that any one user's presence barely shows." },
  { name: "Model", concept: "model", role: "model", says: "The noisy average updates the shared recommender, which ranks places for everyone." },
  { name: "Ledger", concept: "ledger", role: "ledger", says: "Each round writes a receipt into an append-only log; a signed checkpoint seals the log at release, so anyone can check it." },
  { name: "Release", concept: "acct", role: "model", says: "The model is released only if the privacy budget, epsilon, allows it and every receipt is there." },
];

/** Concepts that are not a stage of the pipeline: attacks on it, alternatives to it, and how it was judged. */
export const ASIDES: { concept: string; label: string }[] = [
  { concept: "mia", label: "Membership inference" },
  { concept: "poison", label: "Poisoning" },
  { concept: "freeride", label: "Free-riding" },
  { concept: "gossip", label: "Gossip learning" },
  { concept: "part", label: "Who takes part" },
  { concept: "method", label: "How we know" },
];

/** Opens the first slide of a concept. */
export function goTo(concept: string): void {
  window.location.hash = `#/${concept}/1`;
}

/** Seconds the walk-through waits at each stage. */
export const STAGE_SECONDS = 2.6;

interface IntroState {
  highlight: Highlight;
  /** Bumped to assemble the city again. */
  assembly: number;
  leak: Leak;
  stage: number;
  playing: boolean;
  setHighlight(h: Highlight): void;
  reassemble(): void;
  setLeak(l: Leak): void;
  setStage(i: number): void;
  nextStage(): void;
  togglePlay(): void;
  reset(): void;
}

const initial = { highlight: "all" as Highlight, leak: "all" as Leak, stage: 0, playing: true };

export const useIntro = create<IntroState>((set) => ({
  ...initial,
  assembly: 0,
  setHighlight: (highlight) => set({ highlight }),
  reassemble: () => set((s) => ({ assembly: s.assembly + 1, highlight: "all" })),
  setLeak: (leak) => set({ leak }),
  setStage: (i) => set({ stage: Math.max(0, Math.min(STAGES.length - 1, i)), playing: false }),
  nextStage: () => set((s) => ({ stage: (s.stage + 1) % STAGES.length })),
  togglePlay: () => set((s) => ({ playing: !s.playing })),
  reset: () => set((s) => ({ ...initial, assembly: s.assembly + 1 })),
}));
