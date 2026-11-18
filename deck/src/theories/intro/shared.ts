import { useLayoutEffect, useRef } from "react";
import type { Group, LineSegments, Material } from "three";

/** Animation values shared by the parts of the scene. GSAP writes them; frames read them. */
export interface IntroAnim {
  /** 0 the lights stand in the city, 1 they form the friend graph. */
  assemble: number;
  /** Graph rotation about the vertical axis. */
  rot: number;
  /** 1 while the graph spins on its own. */
  spin: number;
  /** 1 when the graph steps back for the problem slide. */
  dim: number;
  /** 1 when the graph is put away for the pipeline. */
  hide: number;
  /** Growth of the upload and of each leak, 0 to 1. */
  upload: number;
  leakUpdate: number;
  leakModel: number;
  leakCrowd: number;
  /** 0 to 1: the pipeline shows. */
  pipe: number;
  /** Packet position along the pipeline, in stops. */
  packet: number;
}

/** Finds the material of the line mesh inside a group, so its opacity can be set per frame. */
export function useLineMaterial() {
  const group = useRef<Group>(null);
  const material = useRef<Material | null>(null);
  useLayoutEffect(() => {
    group.current?.traverse((o) => {
      if ((o as LineSegments).isLineSegments) material.current = (o as LineSegments).material as Material;
    });
  });
  return { group, material };
}

/** Where the followed user ends up on the problem slide: front left, seen from the camera. */
export const YOU_AZIMUTH = -0.95;

