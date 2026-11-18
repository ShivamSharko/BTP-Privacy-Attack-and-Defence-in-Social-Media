import { gaussian, rng } from "../../sim/random";

/**
 * A toy of the loss-threshold membership attack. Every user has a "loss": how badly the model
 * predicts the user's hidden history. Members were in the training set, so their loss is lower
 * on average. Both groups are drawn as normal distributions with the same spread; the gap
 * between their means and that spread are the only parameters. Nothing here is measured.
 */

/** Gap between the member and non-member means for a model with no privacy, in loss units. */
export const GAP_MAX = 2;
/** Spread of the user-to-user difficulty that raw loss carries and calibrated loss does not. */
export const DIFFICULTY_SD = Math.sqrt(1.25);
/** Spread of one user's loss around its own expected value. */
export const NOISE_SD = 1;

/* ----------------------------------------------------------------- the normal curve */

/**
 * Complementary error function. A power series below 3 (all terms positive, so nothing
 * cancels) and a continued fraction above it, which keeps the tails accurate to many digits.
 */
function erfc(x: number): number {
  if (Number.isNaN(x)) return 1;
  const z = Math.abs(x);
  let upper: number;
  if (z < 3) {
    let term = z;
    let sum = z;
    for (let n = 1; n < 80; n++) {
      term *= (2 * z * z) / (2 * n + 1);
      sum += term;
    }
    upper = 1 - (2 / Math.sqrt(Math.PI)) * Math.exp(-z * z) * sum;
  } else if (z > 40) {
    upper = 0;
  } else {
    let k = z;
    for (let i = 60; i >= 1; i--) k = z + i / 2 / k;
    upper = Math.exp(-z * z) / (Math.sqrt(Math.PI) * k);
  }
  return x >= 0 ? upper : 2 - upper;
}

/** P(Z <= x) for a standard normal Z. */
export function normalCdf(x: number): number {
  if (Number.isNaN(x)) return 0.5;
  return Math.min(1, Math.max(0, 0.5 * erfc(-x / Math.SQRT2)));
}

/** The x with P(Z <= x) = p, by bisection. p is clamped away from 0 and 1. */
export function normalInv(p: number): number {
  const q = Math.min(1 - 1e-12, Math.max(1e-12, Number.isNaN(p) ? 0.5 : p));
  let lo = -10;
  let hi = 10;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (normalCdf(mid) < q) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Density of a normal distribution. A zero spread is treated as a very narrow one. */
export function normalPdf(x: number, mean: number, sigma: number): number {
  const s = Math.max(sigma, 1e-6);
  const z = (x - mean) / s;
  return Math.exp(-0.5 * z * z) / (s * Math.sqrt(2 * Math.PI));
}

/* ----------------------------------------------------------------- the attack */

export interface Rates {
  /** Share of members the attack flags. */
  tpr: number;
  /** Share of non-members the attack wrongly flags. */
  fpr: number;
}

/**
 * The attack flags every user whose loss is below `threshold`. Members are centred at
 * -gap/2 and non-members at +gap/2, both with spread `sigma`.
 */
export function rates(threshold: number, gap: number, sigma = 1): Rates {
  const s = Math.max(sigma, 1e-9);
  return {
    tpr: normalCdf((threshold + gap / 2) / s),
    fpr: normalCdf((threshold - gap / 2) / s),
  };
}

/** Area under the ROC curve for two equal-spread normals `sep` standard deviations apart. */
export function aucFromSeparation(sep: number): number {
  return normalCdf(sep / Math.SQRT2);
}

/** The threshold at which the attack wrongly flags the share `fpr` of non-members. */
export function thresholdForFpr(fpr: number, gap: number, sigma = 1): number {
  return gap / 2 + Math.max(sigma, 1e-9) * normalInv(fpr);
}

/** Share of members caught when the false-positive rate is held to `fpr`. */
export function tprAtFpr(fpr: number, sep: number): number {
  if (fpr <= 0) return 0;
  if (fpr >= 1) return 1;
  return normalCdf(sep + normalInv(fpr));
}

export interface RocPoint {
  fpr: number;
  tpr: number;
}

/** The ROC curve as `points` + 1 samples from (0, 0) to (1, 1). The false-positive rate rises. */
export function rocCurve(sep: number, points = 60): RocPoint[] {
  const out: RocPoint[] = [{ fpr: 0, tpr: 0 }];
  for (let i = 1; i < points; i++) {
    // equal steps in the threshold would crowd the middle; space the points by z instead
    const z = -4 + (8 * i) / points;
    const fpr = normalCdf(z);
    out.push({ fpr, tpr: normalCdf(z + sep) });
  }
  out.push({ fpr: 1, tpr: 1 });
  return out;
}

/* ----------------------------------------------------------------- the two sliders */

/** An illustration, not a model of differential privacy: more privacy noise, smaller gap. */
export function gapForPrivacy(level: number): number {
  const l = Math.min(1, Math.max(0, Number.isNaN(level) ? 0 : level));
  return GAP_MAX * (1 - l) * (1 - l);
}

/** What the attack is pointed at on the controls slide. */
export type Control = "released" | "overfit" | "independent";

/** Gap for an over-fitted model, which remembers its members much more clearly. */
export const OVERFIT_GAP = 3.4;

/**
 * The released model uses the privacy slider; the over-fitted control has a wide gap; the
 * independent-data control has none, because its "members" were never trained on.
 */
export function gapForControl(control: Control, privacy: number): number {
  if (control === "overfit") return OVERFIT_GAP;
  if (control === "independent") return 0;
  return gapForPrivacy(privacy);
}

/**
 * The point estimate of the epsilon lower bound, ln(TPR / FPR). The real bound also uses a
 * confidence limit on each rate and subtracts delta; this is the shape without those.
 */
export function epsilonPoint(tpr: number, fpr: number): number {
  if (!(fpr > 0) || !(tpr > fpr)) return 0;
  return Math.log(tpr / fpr);
}

/**
 * Spread of the loss when `mix` of the per-user difficulty is still in it: 1 is the raw loss,
 * 0 is the calibrated score with the difficulty subtracted away.
 */
export function sigmaFor(mix: number): number {
  const k = mix * DIFFICULTY_SD;
  return Math.sqrt(NOISE_SD * NOISE_SD + k * k);
}

/* ----------------------------------------------------------------- the users in the scene */

export interface Population {
  /** Members first, then the same number of non-members. */
  count: number;
  members: number;
  /** Standard normal draw for each user's own noise. */
  noise: Float32Array;
  /** Standard normal draw for each user's difficulty, which reference models can predict. */
  difficulty: Float32Array;
  /** Uniform draw in (0, 1) that decides how high inside the ridge the user's light sits. */
  height: Float32Array;
  /** Uniform draw in (0, 1) that decides how far into the ridge's depth the light sits. */
  depth: Float32Array;
}

export function makePopulation(eachGroup: number, seed: number): Population {
  const r = rng(seed);
  const count = eachGroup * 2;
  const noise = new Float32Array(count);
  const difficulty = new Float32Array(count);
  const height = new Float32Array(count);
  const depth = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    noise[i] = gaussian(r);
    difficulty[i] = gaussian(r);
    height[i] = 0.06 + 0.88 * r();
    depth[i] = r();
  }
  return { count, members: eachGroup, noise, difficulty, height, depth };
}

/** Loss of user i. `mix` is how much of the difficulty is left in it (1 raw, 0 calibrated). */
export function populationLoss(pop: Population, i: number, gap: number, mix: number): number {
  const centre = i < pop.members ? -gap / 2 : gap / 2;
  return centre + NOISE_SD * pop.noise[i] + mix * DIFFICULTY_SD * pop.difficulty[i];
}
