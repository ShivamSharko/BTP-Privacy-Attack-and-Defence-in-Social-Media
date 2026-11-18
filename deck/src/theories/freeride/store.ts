import { create } from "zustand";
import type { Behaviour } from "./sim";

export const DEFAULT_SHARE = 0.25;

interface FreeRideState {
  /** Share of devices that free-ride, 0 to 1. */
  share: number;
  behaviour: Behaviour;
  /** True when the server only ever sees the sum of the updates. */
  secure: boolean;
  /** Device the presenter clicked, or null. */
  picked: number | null;
  setShare(share: number): void;
  setBehaviour(behaviour: Behaviour): void;
  setSecure(secure: boolean): void;
  pick(device: number | null): void;
  reset(): void;
}

export const useFreeRide = create<FreeRideState>((set) => ({
  share: DEFAULT_SHARE,
  behaviour: "zero",
  secure: false,
  picked: null,
  setShare: (share) => set({ share }),
  setBehaviour: (behaviour) => set({ behaviour }),
  setSecure: (secure) => set({ secure }),
  pick: (picked) => set((s) => ({ picked: s.picked === picked ? null : picked })),
  reset: () => set({ share: DEFAULT_SHARE, behaviour: "zero", secure: false, picked: null }),
}));
