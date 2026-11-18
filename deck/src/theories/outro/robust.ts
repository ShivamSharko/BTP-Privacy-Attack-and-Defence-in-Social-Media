/** Robust statistics for the sandbox's aggregators. */

const clamp = (x: number, lo: number, hi: number) => (Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : lo);

/** The middle value of a sorted run; 0 for none. */
export function sortedMedian(a: ArrayLike<number>, n: number): number {
  if (n <= 0) return 0;
  return n % 2 === 1 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2;
}

export function sortedTrimmedMean(a: ArrayLike<number>, n: number, trim: number): number {
  if (n <= 0) return 0;
  let k = Math.floor(clamp(trim, 0, 0.5) * n);
  if (2 * k >= n) k = Math.floor((n - 1) / 2);
  let s = 0;
  for (let i = k; i < n - k; i++) s += a[i];
  return s / (n - 2 * k);
}

/** The middle value; 0 for no values. */
export function median(values: ArrayLike<number>): number {
  return sortedMedian(Float64Array.from(values).sort(), values.length);
}

/**
 * Mean after cutting floor(trim * n) values from each end. A trim that would remove
 * everyone keeps the middle one or two values instead, which is the median.
 */
export function trimmedMean(values: ArrayLike<number>, trim: number): number {
  return sortedTrimmedMean(Float64Array.from(values).sort(), values.length, trim);
}
