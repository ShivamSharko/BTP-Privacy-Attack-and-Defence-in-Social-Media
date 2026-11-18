import { useMemo } from "react";
import { cosine, itemPopularity, linkGuesses, makeNetwork, type Network, recover, type Recovery, TOP_K, unitPair, updateVector, type Guesses } from "./sim";
import { useLeak } from "./store";

/** Everything the inversion slide shows, worked out once for the scene and the panel. */
export interface Inversion {
  update: number[];
  recovery: Recovery;
  /** How many top guesses are scored: the history size, at most ten. */
  k: number;
  count: number;
}

const POPULARITY = itemPopularity();

export function useInversion(): Inversion {
  const user = useLeak((s) => s.user);
  const mask = useLeak((s) => s.mask);
  const spill = useLeak((s) => s.spill);
  return useMemo(() => {
    const count = mask.filter(Boolean).length;
    const k = Math.min(TOP_K, count);
    const update = updateVector(mask, spill, user);
    return { update, recovery: recover(update, mask, POPULARITY, k), k, count };
  }, [mask, spill, user]);
}

/** The cosine of the two arrows on the angle slide, and whether the attacker calls them friends. */
export function usePair(): { cos: number; friends: boolean } {
  const angle = useLeak((s) => s.angle);
  const threshold = useLeak((s) => s.threshold);
  return useMemo(() => {
    const [a, b] = unitPair(angle);
    const cos = cosine(a, b);
    return { cos, friends: cos >= threshold };
  }, [angle, threshold]);
}

export function useNetwork(): { net: Network; guesses: Guesses } {
  const seed = useLeak((s) => s.networkSeed);
  const threshold = useLeak((s) => s.threshold);
  const net = useMemo(() => makeNetwork(seed), [seed]);
  const guesses = useMemo(() => linkGuesses(net, threshold), [net, threshold]);
  return { net, guesses };
}
