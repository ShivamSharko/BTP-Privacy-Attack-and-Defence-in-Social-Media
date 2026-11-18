import { BufferAttribute, BufferGeometry, type Color } from "three";
import { normalPdf } from "./sim";

/** Scene units per loss unit along the x axis. */
export const XS = 0.7;
/** Height of the floor the ridges stand on. */
export const BASE_Y = -1.3;
/** Scene height of a density of 1. */
export const HS = 7.2;
/** The member ridge stands in front, the non-member ridge behind it. */
export const Z_MEMBER = 1.45;
export const Z_NON = -1.45;
/** Depth of each ridge. */
export const DEPTH = 2.1;
/** The loss range the ridges are drawn over. */
export const LOSS_RANGE = 5.4;
export const N_POINTS = 121;

/** What the scene is showing right now, eased towards its targets every frame. */
export interface FrameState {
  /** Gap between the member and non-member means, in loss units. */
  gap: number;
  /** How much per-user difficulty is still in the loss: 1 raw, 0 calibrated. */
  mix: number;
  /** The attacker's threshold, in loss units. */
  threshold: number;
}

/* ----------------------------------------------------------------- ridge */

/** A closed ridge: front face, crest and back face, each a strip of N_POINTS pairs of vertices. */
export function makeRidgeGeometry(): BufferGeometry {
  const n = N_POINTS;
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(6 * n * 3), 3));
  geometry.setAttribute("color", new BufferAttribute(new Float32Array(6 * n * 4), 4));
  const index: number[] = [];
  for (let strip = 0; strip < 3; strip++) {
    const o = strip * 2 * n;
    for (let i = 0; i < n - 1; i++) {
      const a = o + 2 * i;
      index.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  geometry.setIndex(index);
  return geometry;
}

export interface RidgeParams {
  mean: number;
  sigma: number;
  /** z of the ridge's middle. */
  z: number;
  threshold: number;
  base: Color;
  flagged: Color;
}

const lossAt = (i: number) => -LOSS_RANGE + (2 * LOSS_RANGE * i) / (N_POINTS - 1);
const smooth = (edge0: number, edge1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

/** Rewrites positions and colours. Users below the threshold are tinted and drawn brighter. */
export function updateRidge(geometry: BufferGeometry, p: RidgeParams): void {
  const n = N_POINTS;
  const pos = geometry.getAttribute("position") as BufferAttribute;
  const col = geometry.getAttribute("color") as BufferAttribute;
  const zf = p.z + DEPTH / 2;
  const zb = p.z - DEPTH / 2;
  for (let i = 0; i < n; i++) {
    const loss = lossAt(i);
    const x = loss * XS;
    const top = BASE_Y + normalPdf(loss, p.mean, p.sigma) * HS;
    const lit = 1 - smooth(p.threshold - 0.05, p.threshold + 0.05, loss);
    const colour = lit > 0.5 ? p.flagged : p.base;
    // low parts of the ridge fade out, so only the mass of the distribution reads as a solid
    const rel = Math.min(1, (top - BASE_Y) / 1.1);
    const alphaTop = 0.05 + rel * (0.4 + 0.22 * lit);
    const alphaFloor = 0.02 + rel * 0.06;
    // strip 0: front face (floor, crest). strip 1: top (front edge, back edge). strip 2: back face.
    const v0 = 2 * i;
    const v1 = 2 * n + 2 * i;
    const v2 = 4 * n + 2 * i;
    pos.setXYZ(v0, x, BASE_Y, zf);
    pos.setXYZ(v0 + 1, x, top, zf);
    pos.setXYZ(v1, x, top, zf);
    pos.setXYZ(v1 + 1, x, top, zb);
    pos.setXYZ(v2, x, BASE_Y, zb);
    pos.setXYZ(v2 + 1, x, top, zb);
    col.setXYZW(v0, colour.r, colour.g, colour.b, alphaFloor);
    col.setXYZW(v0 + 1, colour.r, colour.g, colour.b, alphaTop);
    col.setXYZW(v1, colour.r, colour.g, colour.b, alphaTop);
    col.setXYZW(v1 + 1, colour.r, colour.g, colour.b, alphaTop);
    col.setXYZW(v2, colour.r, colour.g, colour.b, alphaFloor);
    col.setXYZW(v2 + 1, colour.r, colour.g, colour.b, alphaTop);
  }
  pos.needsUpdate = true;
  col.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
}

/* ----------------------------------------------------------------- ribbons */

/** A flat ribbon along a polyline in the xy plane: thicker than any line the GPU would draw. */
export function makeRibbonGeometry(points: number, withColours = false): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(points * 2 * 3), 3));
  if (withColours) geometry.setAttribute("color", new BufferAttribute(new Float32Array(points * 2 * 3), 3));
  const index: number[] = [];
  for (let i = 0; i < points - 1; i++) index.push(2 * i, 2 * i + 2, 2 * i + 1, 2 * i + 1, 2 * i + 2, 2 * i + 3);
  geometry.setIndex(index);
  return geometry;
}

/** Writes the polyline (xs, ys) at depth z with the given width. */
export function updateRibbon(
  geometry: BufferGeometry,
  xs: ArrayLike<number>,
  ys: ArrayLike<number>,
  z: number,
  width: number,
  /** Optional per-point width multiplier, for a ribbon that fades away at its ends. */
  taper?: ArrayLike<number>,
): void {
  const pos = geometry.getAttribute("position") as BufferAttribute;
  const n = pos.count / 2;
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1);
    const b = Math.min(n - 1, i + 1);
    let tx = xs[b] - xs[a];
    let ty = ys[b] - ys[a];
    const len = Math.hypot(tx, ty) || 1;
    tx /= len;
    ty /= len;
    const w = taper ? width * taper[i] : width;
    const nx = (-ty * w) / 2;
    const ny = (tx * w) / 2;
    pos.setXYZ(2 * i, xs[i] - nx, ys[i] - ny, z);
    pos.setXYZ(2 * i + 1, xs[i] + nx, ys[i] + ny, z);
  }
  pos.needsUpdate = true;
  geometry.computeBoundingSphere();
}

/** Colours a crest ribbon: the flagged colour left of the threshold, the base colour right of it. */
export function paintCrest(geometry: BufferGeometry, threshold: number, base: Color, flagged: Color): void {
  const col = geometry.getAttribute("color") as BufferAttribute;
  for (let i = 0; i < N_POINTS; i++) {
    const c = lossAt(i) <= threshold ? flagged : base;
    col.setXYZ(2 * i, c.r, c.g, c.b);
    col.setXYZ(2 * i + 1, c.r, c.g, c.b);
  }
  col.needsUpdate = true;
}

/** The crest of a ridge as polyline coordinates, for `updateRibbon`. */
export function crestPoints(
  mean: number,
  sigma: number,
  xs: Float32Array,
  ys: Float32Array,
  taper: Float32Array,
): void {
  for (let i = 0; i < N_POINTS; i++) {
    const loss = lossAt(i);
    const h = normalPdf(loss, mean, sigma) * HS;
    xs[i] = loss * XS;
    ys[i] = BASE_Y + h;
    taper[i] = smooth(0.03, 0.4, h);
  }
}

export { lossAt };
