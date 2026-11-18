import { useFrame, useThree } from "@react-three/fiber";
import gsap from "gsap";
import { useEffect, useRef } from "react";
import { MathUtils, type PerspectiveCamera, Spherical, Vector3 } from "three";
import type { Pose } from "../deck/types";
import { orbitLock } from "./kit/drag";

export type Travel = "cut" | "step" | "fly";

const DURATION: Record<Travel, number> = { cut: 0, step: 0.7, fly: 1.2 };
const MAX_AZIMUTH = 1.0;
const MAX_POLAR = 0.45;

/**
 * Half the width in pixels of the text column, so the scene can be centred in what is left of
 * the window. Mirrors --u, --panel-w and --gutter in styles/base.css.
 */
export function panelShift(width: number, height: number): number {
  const u = Math.min(width / 100, height * 0.017778);
  return ((33.33 + 2.5 * 2) * u) / 2;
}

interface RigState {
  px: number;
  py: number;
  pz: number;
  tx: number;
  ty: number;
  tz: number;
  /** Extra height at the middle of a flight between stations. */
  lift: number;
  /** Orbit offsets added by dragging; they ease back to zero on every slide change. */
  az: number;
  pol: number;
  zoom: number;
}

/**
 * Owns the camera. A slide change tweens position and look-at target to the slide's pose;
 * a new change during a flight retargets from wherever the camera is. Dragging orbits
 * around the target, the wheel zooms, and both reset on the next slide.
 */
export function CameraRig({ pose, travel }: { pose: Pose; travel: Travel }) {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const gl = useThree((s) => s.gl);
  const size = useThree((s) => s.size);
  const invalidate = useThree((s) => s.invalidate);

  const state = useRef<RigState | null>(null);
  if (state.current === null) {
    state.current = {
      px: pose.position[0],
      py: pose.position[1],
      pz: pose.position[2],
      tx: pose.target[0],
      ty: pose.target[1],
      tz: pose.target[2],
      lift: 0,
      az: 0,
      pol: 0,
      zoom: 1,
    };
  }
  const scratch = useRef({ v: new Vector3(), s: new Spherical() });

  const [px, py, pz] = pose.position;
  const [tx, ty, tz] = pose.target;

  useEffect(() => {
    const s = state.current!;
    gsap.killTweensOf(s);
    const goal = { px, py, pz, tx, ty, tz, az: 0, pol: 0, zoom: 1 };
    const duration = DURATION[travel];
    if (duration === 0) {
      Object.assign(s, goal, { lift: 0 });
      invalidate();
      return;
    }
    gsap.to(s, { ...goal, duration, ease: "power3.inOut", onUpdate: () => invalidate() });
    if (travel === "fly") {
      const distance = Math.hypot(px - s.px, py - s.py, pz - s.pz);
      const height = Math.min(distance * 0.06, 14);
      gsap.to(s, { lift: height, duration: duration / 2, ease: "power2.out" });
      gsap.to(s, { lift: 0, duration: duration / 2, delay: duration / 2, ease: "power2.in" });
    } else {
      gsap.to(s, { lift: 0, duration: 0.2 });
    }
    return () => {
      gsap.killTweensOf(s);
    };
  }, [px, py, pz, tx, ty, tz, travel, invalidate]);

  // Centre the scene in the area right of the text column.
  useEffect(() => {
    camera.setViewOffset(size.width, size.height, -panelShift(size.width, size.height), 0, size.width, size.height);
    invalidate();
    return () => camera.clearViewOffset();
  }, [camera, size.width, size.height, invalidate]);

  // Drag to orbit, wheel to zoom. The orbit starts only after a small movement, so clicks on
  // scene objects and drags that a scene has claimed (orbitLock) are left alone.
  useEffect(() => {
    const el = gl.domElement;
    let down = false;
    let orbiting = false;
    let startX = 0;
    let startY = 0;
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      down = true;
      orbiting = false;
      startX = e.clientX;
      startY = e.clientY;
    };
    const onMove = (e: PointerEvent) => {
      if (!down || orbitLock.locked) return;
      if (!orbiting && Math.hypot(e.clientX - startX, e.clientY - startY) < 4) return;
      orbiting = true;
      const s = state.current!;
      gsap.killTweensOf(s, "az,pol");
      s.az = MathUtils.clamp(s.az - e.movementX * 0.005, -MAX_AZIMUTH, MAX_AZIMUTH);
      s.pol = MathUtils.clamp(s.pol + e.movementY * 0.004, -MAX_POLAR, MAX_POLAR);
      invalidate();
    };
    const onUp = () => {
      down = false;
      orbiting = false;
    };
    const onWheel = (e: WheelEvent) => {
      const s = state.current!;
      gsap.killTweensOf(s, "zoom");
      s.zoom = MathUtils.clamp(s.zoom * (1 + Math.sign(e.deltaY) * 0.06), 0.6, 1.7);
      invalidate();
    };
    el.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    el.addEventListener("wheel", onWheel, { passive: true });
    return () => {
      el.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      el.removeEventListener("wheel", onWheel);
    };
  }, [gl, invalidate]);

  useFrame(() => {
    const s = state.current!;
    const { v, s: sph } = scratch.current;
    v.set(s.px - s.tx, s.py - s.ty, s.pz - s.tz);
    sph.setFromVector3(v);
    sph.theta += s.az;
    sph.phi = MathUtils.clamp(sph.phi - s.pol, 0.15, Math.PI - 0.15);
    sph.radius *= s.zoom;
    v.setFromSpherical(sph);
    camera.position.set(s.tx + v.x, s.ty + v.y + s.lift, s.tz + v.z);
    camera.lookAt(s.tx, s.ty + s.lift * 0.5, s.tz);
  }, -1);

  return null;
}
