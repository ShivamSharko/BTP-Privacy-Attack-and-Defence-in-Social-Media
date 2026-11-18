import { useFrame } from "@react-three/fiber";
import { type ReactNode, useEffect, useMemo, useRef } from "react";
import { type Object3D, Vector3 } from "three";
import { create } from "zustand";
import type { Vec3 } from "../../deck/types";
import type { Role } from "../../styles/roles";

/**
 * Text labels in the 3D scene, drawn as ordinary HTML on a layer above the canvas.
 *
 * A <Label> inside the canvas registers an anchor object and its content; <LabelLayer>
 * outside the canvas renders the text; <LabelProjector> inside the canvas moves each piece
 * of text to its anchor's place on screen every frame. One React tree for all labels, no
 * font download, and labels far from the camera fade out with the fog.
 */

interface LabelContent {
  node: ReactNode;
  tone?: Role;
  small: boolean;
}

const useLabels = create<{ labels: Record<number, LabelContent> }>(() => ({ labels: {} }));
const anchors = new Map<number, Object3D>();
const elements = new Map<number, HTMLDivElement>();
let nextId = 1;

export interface LabelProps {
  position: Vec3;
  children: ReactNode;
  tone?: Role;
  small?: boolean;
}

export function Label({ position, children, tone, small = false }: LabelProps) {
  const id = useMemo(() => nextId++, []);
  const anchor = useRef<Object3D>(null);

  useEffect(() => {
    if (anchor.current) anchors.set(id, anchor.current);
    return () => {
      anchors.delete(id);
      useLabels.setState((s) => {
        const labels = { ...s.labels };
        delete labels[id];
        return { labels };
      });
    };
  }, [id]);

  useEffect(() => {
    useLabels.setState((s) => ({ labels: { ...s.labels, [id]: { node: children, tone, small } } }));
  }, [id, children, tone, small]);

  return <object3D ref={anchor} position={position} />;
}

/** Rendered once, outside the canvas and on top of it. */
export function LabelLayer() {
  const labels = useLabels((s) => s.labels);
  return (
    <div className="labels" aria-hidden="true">
      {Object.entries(labels).map(([key, label]) => {
        const id = Number(key);
        return (
          <div
            key={id}
            className="label3d"
            data-small={label.small}
            style={{ color: label.tone ? `var(--${label.tone})` : undefined, opacity: 0 }}
            ref={(el) => {
              if (el) elements.set(id, el);
              else elements.delete(id);
            }}
          >
            {label.node}
          </div>
        );
      })}
    </div>
  );
}

const FADE_START = 34;
const FADE_END = 46;

/**
 * Rendered once, inside the canvas. It must keep the default frame priority: a positive
 * priority would switch off automatic rendering for the whole canvas.
 */
export function LabelProjector() {
  const v = useMemo(() => new Vector3(), []);
  useFrame(({ camera, size }) => {
    for (const [id, anchor] of anchors) {
      const el = elements.get(id);
      if (!el) continue;
      anchor.getWorldPosition(v);
      const distance = v.distanceTo(camera.position);
      v.project(camera);
      const behind = v.z > 1 || v.z < -1;
      const fade = Math.max(0, Math.min(1, (FADE_END - distance) / (FADE_END - FADE_START)));
      const x = (v.x * 0.5 + 0.5) * size.width;
      const y = (-v.y * 0.5 + 0.5) * size.height;
      el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -50%)`;
      el.style.opacity = behind ? "0" : fade.toFixed(2);
    }
  });
  return null;
}
