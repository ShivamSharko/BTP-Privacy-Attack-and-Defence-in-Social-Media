import type { Vec3 } from "../../deck/types";
import { encodeValue, hexLow, makeToy, N_USERS, pairsOf, secureSum, type SecureSumRun, type Toy } from "./sim";

/** The six users sit on an ellipse in the plane facing the camera; the server is below them. */
export const RING_CENTER_Y = 1.2;
export const RING_RX = 3.0;
export const RING_RY = 1.95;
export const SERVER_POS: Vec3 = [0, -2.55, 0];
export const SLAB_TOP = -2.38;

export const TOY_SEED = 11;
export const toy: Toy = makeToy(N_USERS, 1, TOY_SEED);

export function userPos(i: number): Vec3 {
  const a = (i * Math.PI) / 3;
  return [RING_RX * Math.cos(a), RING_CENTER_Y + RING_RY * Math.sin(a), 0];
}

/** Where a user's label sits: pushed outwards from the ring. */
export function labelPos(i: number): Vec3 {
  const p = userPos(i);
  const a = (i * Math.PI) / 3;
  return [p[0] + Math.cos(a) * 1.0, p[1] + Math.sin(a) * 0.85, 0];
}

export const USER_POS: Vec3[] = Array.from({ length: N_USERS }, (_, i) => userPos(i));
export const PAIRS = pairsOf(N_USERS);

export function lerp3(a: Vec3, b: Vec3, t: number): Vec3 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** Meeting point of pair k on the server slab, where its two masks cancel. */
export function meetingPoint(k: number): Vec3 {
  return [-1.0 + (k % 5) * 0.5, SLAB_TOP + 0.1, -0.3 + Math.floor(k / 5) * 0.3];
}

export const signed = (x: number, digits = 2) => `${x < 0 ? "−" : "+"}${Math.abs(x).toFixed(digits)}`;
export const hexLabel = (w: bigint) => `0x${hexLow(w, 8)}`;

/** What the display shows in each state of each ring slide. */
export interface RingState {
  masked: boolean;
  sent: boolean;
  summed: boolean;
  revealed: boolean;
  dropped: number;
}

export function ringState(step: number, phase: number, dropPhase: number, dropped: number): RingState {
  if (step === 2) return { masked: true, sent: dropPhase >= 1, summed: dropPhase >= 1, revealed: dropPhase >= 2 && dropped >= 0, dropped };
  if (step === 4) return { masked: true, sent: true, summed: true, revealed: false, dropped: -1 };
  return { masked: phase >= 1, sent: phase >= 2, summed: phase >= 3, revealed: false, dropped: -1 };
}

const cache = new Map<number, SecureSumRun>();
/** The real arithmetic for the ring, with nobody dropped (-1) or one user dropped. */
export function runFor(dropped: number): SecureSumRun {
  let run = cache.get(dropped);
  if (!run) {
    run = secureSum(toy, dropped >= 0 ? [dropped] : []);
    cache.set(dropped, run);
  }
  return run;
}

/** The encoded word of a demonstration value, as hex, for the fixed-point slide. */
export const demoHex = (x: number) => encodeValue(x).toString(16).padStart(16, "0");
