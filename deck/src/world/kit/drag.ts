import type { ThreeEvent } from "@react-three/fiber";
import { useMemo, useRef } from "react";

/** While a scene object is being dragged, the camera must not orbit. */
export const orbitLock = { locked: false };

export interface DragHandlers {
  onPointerDown(e: ThreeEvent<PointerEvent>): void;
  onPointerMove(e: ThreeEvent<PointerEvent>): void;
  onPointerUp(e: ThreeEvent<PointerEvent>): void;
  onPointerOver(): void;
  onPointerOut(): void;
}

/**
 * Makes a mesh draggable. Spread the returned handlers on the mesh; `onDrag` receives the
 * pointer movement in pixels since the last event, and the scene decides what that changes.
 */
export function useDrag(onDrag: (dx: number, dy: number) => void, onEnd?: () => void): DragHandlers {
  const dragging = useRef(false);
  const callbacks = useRef({ onDrag, onEnd });
  callbacks.current = { onDrag, onEnd };

  return useMemo<DragHandlers>(
    () => ({
      onPointerDown(e) {
        e.stopPropagation();
        dragging.current = true;
        orbitLock.locked = true;
        (e.target as Element).setPointerCapture?.(e.pointerId);
      },
      onPointerMove(e) {
        if (!dragging.current) return;
        e.stopPropagation();
        callbacks.current.onDrag(e.nativeEvent.movementX, e.nativeEvent.movementY);
      },
      onPointerUp(e) {
        if (!dragging.current) return;
        dragging.current = false;
        orbitLock.locked = false;
        (e.target as Element).releasePointerCapture?.(e.pointerId);
        callbacks.current.onEnd?.();
      },
      onPointerOver() {
        document.body.style.cursor = "grab";
      },
      onPointerOut() {
        document.body.style.cursor = "";
      },
    }),
    [],
  );
}
