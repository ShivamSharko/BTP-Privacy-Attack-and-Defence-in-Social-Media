import { gaussian, rng, shuffle } from "../../sim/random";

/**
 * Toy model of user-level differential privacy for the scenes of theory 6.
 *
 * Updates are 3D vectors standing in for a user's whole update (every parameter at once).
 * The mechanism is the project's: clip each user's vector to norm C, sum, add Gaussian noise
 * of standard deviation z * C once, divide by the expected cohort size. The two-world
 * helpers describe one release of a Gaussian mechanism; they are an illustration, not the
 * project's accountant.
 */

export type Vec3 = [number, number, number];

/** Updates drawn in the scene. */
export const N_UPDATES = 18;

/** The divisor in delta = 1 / (10 n), as in src/prism/privacy/dp.py. */
const DELTA_DIVISOR = 10;

export function norm(v: readonly number[]): number {
  return Math.hypot(v[0], v[1], v[2]);
}

/**
 * Seeded toy updates: directions leaning one common way (users mostly agree), lengths spread
 * from about 1 to about 11 so that any clipping norm on the slider clips some and spares some.
 */
export function toyUpdates(n: number, seed: number): Vec3[] {
  const r = rng(seed);
  const lean: Vec3 = [0.82, 0.46, 0.34];
  const lengths = shuffle(
    Array.from({ length: n }, (_, i) => 1.1 + 9.7 * ((i + 0.25 + r() * 0.5) / Math.max(n, 1)) ** 1.25),
    r,
  );
  return lengths.map((length) => {
    const raw: Vec3 = [lean[0] * 1.6 + gaussian(r), lean[1] * 1.6 + gaussian(r), lean[2] * 1.6 + gaussian(r)];
    const size = norm(raw) || 1;
    return [(raw[0] / size) * length, (raw[1] / size) * length, (raw[2] / size) * length];
  });
}

/** Scales v so its norm is at most C; a vector already inside is returned unchanged. C <= 0 gives zero. */
export function clip(v: Vec3, C: number): Vec3 {
  if (!(C > 0)) return [0, 0, 0];
  const size = norm(v);
  if (size <= C) return [v[0], v[1], v[2]];
  const k = C / size;
  return [v[0] * k, v[1] * k, v[2] * k];
}

/** Share of updates longer than C, which clipping shortens. */
export function clippedShare(vectors: readonly Vec3[], C: number): number {
  if (vectors.length === 0) return 0;
  let count = 0;
  for (const v of vectors) if (norm(v) > C) count++;
  return count / vectors.length;
}

/** Sum of the clipped updates: what the server holds before noise. */
export function clippedSum(vectors: readonly Vec3[], C: number): Vec3 {
  const out: Vec3 = [0, 0, 0];
  for (const v of vectors) {
    const c = clip(v, C);
    out[0] += c[0];
    out[1] += c[1];
    out[2] += c[2];
  }
  return out;
}

/** Clipped sum plus Gaussian noise of standard deviation z * C on every coordinate, added once. */
export function noisySum(vectors: readonly Vec3[], C: number, z: number, seed: number): Vec3 {
  const out = clippedSum(vectors, C);
  const sigma = Math.max(0, z) * Math.max(0, C);
  if (sigma === 0) return out;
  const r = rng(seed);
  return [out[0] + sigma * gaussian(r), out[1] + sigma * gaussian(r), out[2] + sigma * gaussian(r)];
}

/** count standard normal 3D offsets (xyz per sample), for drawing a noise cloud. */
export function gaussianOffsets(count: number, seed: number): Float32Array {
  const r = rng(seed);
  const out = new Float32Array(count * 3);
  for (let i = 0; i < out.length; i++) out[i] = gaussian(r);
  return out;
}

/* ------------------------------------------------------------------ the two worlds */

/** Complementary error function, relative error below 1.2e-7 everywhere (Chebyshev fit). */
function erfc(x: number): number {
  const z = Math.abs(x);
  const t = 1 / (1 + 0.5 * z);
  const r =
    t *
    Math.exp(
      -z * z -
        1.26551223 +
        t *
          (1.00002368 +
            t *
              (0.37409196 +
                t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))),
    );
  return x >= 0 ? r : 2 - r;
}

/** Standard normal distribution function. */
export function normalCdf(x: number): number {
  return 0.5 * erfc(-x / Math.SQRT2);
}

/** Standard normal density. */
export function normalPdf(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

/**
 * Overlap of two unit-variance Gaussians whose means are d apart: the shared area under both
 * curves, 1 when they coincide and falling towards 0 as they separate.
 */
export function overlap(d: number): number {
  return 2 * normalCdf(-Math.abs(d) / 2);
}

/**
 * The smallest delta at which one release of a Gaussian mechanism is (epsilon, delta)-private,
 * where d is sensitivity divided by the noise's standard deviation (exact for one release).
 */
export function gaussianDelta(epsilon: number, d: number): number {
  if (d <= 0) return 0;
  const eps = Math.max(0, epsilon);
  const value = normalCdf(-eps / d + d / 2) - Math.exp(eps) * normalCdf(-eps / d - d / 2);
  return Math.max(0, value);
}

/** The distance d (sensitivity over noise) at which one Gaussian release spends exactly epsilon at delta. */
export function distanceFor(epsilon: number, delta: number): number {
  let lo = 0;
  let hi = 60;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (gaussianDelta(epsilon, mid) > delta) hi = mid;
    else lo = mid;
  }
  return lo;
}

/** Chance that a unit-variance Gaussian centred at mu lands in [a, b]. */
export function eventProbability(mu: number, a: number, b: number): number {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  return Math.max(0, normalCdf(hi - mu) - normalCdf(lo - mu));
}

/** delta = 1 / (10 n), as the project sets it. */
export function targetDelta(nUsers: number): number {
  if (!(nUsers > 0)) throw new Error("the number of users must be positive");
  return 1 / (DELTA_DIVISOR * nUsers);
}
