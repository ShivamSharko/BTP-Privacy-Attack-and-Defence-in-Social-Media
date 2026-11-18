/** Seeded randomness, so every simulation in the deck plays the same way each time. */

/** mulberry32: a small, fast generator with values in [0, 1). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One standard normal draw (Box-Muller). */
export function gaussian(r: () => number): number {
  let u = 0;
  while (u === 0) u = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
}

/** A shuffled copy (Fisher-Yates). */
export function shuffle<T>(xs: readonly T[], r: () => number): T[] {
  const out = xs.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** n independent coin flips with probability p: Poisson sampling of a cohort. */
export function bernoulliMask(n: number, p: number, r: () => number): boolean[] {
  const out = new Array<boolean>(n);
  for (let i = 0; i < n; i++) out[i] = r() < p;
  return out;
}
