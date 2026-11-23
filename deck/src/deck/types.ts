import type { ComponentType } from "react";
import type { ResultFile } from "../data";

export type SlideKind = "theory" | "impact" | "code" | "extra";
export type Badge = "measured" | "computed" | "illustration" | "source";
export type Vec3 = [number, number, number];

/** A camera pose in station-local units: where the camera sits and what it looks at. */
export interface Pose {
  position: Vec3;
  target: Vec3;
}

export const DEFAULT_POSE: Pose = { position: [0, 2, 14], target: [0, 0, 0] };

/**
 * What the brief edition shows in place of a slide: its own headline, text and figure, written to
 * carry the main points of the slides around it that the edition leaves out. A field left out is
 * taken from the slide.
 */
export interface BriefDef {
  title: string;
  Panel: ComponentType;
  Stage?: ComponentType;
  /** Defaults to "stage" when a Stage is given and to "split" otherwise. */
  layout?: "split" | "stage";
  badge?: Badge;
  sources?: ResultFile[];
  pose?: Pose;
  step?: number;
}

export interface SlideDef {
  /** `${theoryId}/${n}` with n counted from 1. */
  id: string;
  kind: SlideKind;
  title: string;
  badge: Badge;
  /** Result files behind a measured or computed badge. Required on impact slides. */
  sources?: ResultFile[];
  pose: Pose;
  /** Scene state handed to the theory's Scene. */
  step: number;
  /** split: text left, live scene right. stage: text left, Stage card over a dimmed scene. */
  layout?: "split" | "stage";
  Panel: ComponentType;
  Stage?: ComponentType;
  /** The slide as the brief edition shows it. Without it the brief edition shows the slide unchanged. */
  brief?: BriefDef;
}

export interface SceneProps {
  step: number;
  /** True while this station is the one on screen. */
  active: boolean;
}

export interface TheoryDef {
  id: string;
  /** 0 is the opening, 1 to 13 are the concepts, 14 is the closing. */
  number: number;
  title: string;
  /** Rail label, at most 14 characters. */
  short: string;
  slides: SlideDef[];
  Scene: ComponentType<SceneProps>;
  Fallback: ComponentType;
}

export interface FlatSlide {
  slide: SlideDef;
  theory: TheoryDef;
  /** Index of the slide inside its theory. */
  local: number;
}
