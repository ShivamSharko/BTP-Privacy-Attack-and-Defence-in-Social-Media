import { type RootState, useFrame, useThree } from "@react-three/fiber";
import gsap from "gsap";
import { useEffect, useMemo, useRef } from "react";
import { Color } from "three";
import { useDeck } from "../../deck/store";
import { ROLE_HEX, ROLES, type Role } from "../../styles/roles";

/** The role colours of the current theme as three.js colours. */
export function useRoles(): Record<Role, Color> {
  const theme = useDeck((s) => s.theme);
  return useMemo(() => {
    const out = {} as Record<Role, Color>;
    for (const role of ROLES) out[role] = new Color(ROLE_HEX[theme][role]);
    return out;
  }, [theme]);
}

/**
 * Runs a GSAP timeline whenever the slide's step changes.
 *
 * Write `build` so that each step tweens to that step's complete state with `.to(...)`:
 * the previous timeline is killed where it stands, not reverted, so a step must not assume
 * where the last one ended. Under reduced motion the timeline jumps straight to its end.
 * The timeline is killed on unmount.
 */
export function useStepTimeline(
  step: number,
  build: (tl: gsap.core.Timeline, step: number) => void,
  deps: readonly unknown[] = [],
): void {
  const reduced = useDeck((s) => s.reducedMotion);
  const invalidate = useThree((s) => s.invalidate);
  const buildRef = useRef(build);
  buildRef.current = build;

  useEffect(() => {
    const tl = gsap.timeline({ onUpdate: () => invalidate() });
    buildRef.current(tl, step);
    if (reduced) tl.progress(1);
    invalidate();
    return () => {
      tl.kill();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, reduced, invalidate, ...deps]);
}

/** Runs `fn` when the presenter presses R while this station is on screen. */
export function useOnReset(fn: () => void, active = true): void {
  const nonce = useDeck((s) => s.resetNonce);
  const first = useRef(nonce);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  useEffect(() => {
    if (nonce === first.current) return;
    first.current = nonce;
    if (active) fnRef.current();
  }, [nonce, active]);
}

/** useFrame that does nothing while the station is off screen, so neighbours cost nothing. */
export function useActiveFrame(active: boolean, callback: (state: RootState, delta: number) => void): void {
  const ref = useRef(callback);
  ref.current = callback;
  useFrame((state, delta) => {
    if (active) ref.current(state, Math.min(delta, 0.05));
  });
}
