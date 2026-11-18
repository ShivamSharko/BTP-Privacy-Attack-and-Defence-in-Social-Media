import { useThree } from "@react-three/fiber";
import { type Ref, useEffect, useImperativeHandle, useMemo } from "react";
import { BufferAttribute, BufferGeometry } from "three";

export interface WhiskersApi {
  /** Moves the tip of line i and sets its colour (rgb 0 to 1). Every line starts at the origin. */
  set(i: number, x: number, y: number, z: number, r: number, g: number, b: number): void;
  commit(): void;
}

/** Many thin lines from the origin to moving tips, drawn in one call: a cloud of small arrows. */
export function Whiskers({ count, apiRef, opacity = 0.5 }: { count: number; apiRef?: Ref<WhiskersApi>; opacity?: number }) {
  const invalidate = useThree((s) => s.invalidate);
  const { geometry, positions, colors, posAttr, colAttr } = useMemo(() => {
    const positions = new Float32Array(count * 6);
    const colors = new Float32Array(count * 6);
    const posAttr = new BufferAttribute(positions, 3);
    const colAttr = new BufferAttribute(colors, 3);
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", posAttr);
    geometry.setAttribute("color", colAttr);
    geometry.boundingSphere = null;
    return { geometry, positions, colors, posAttr, colAttr };
  }, [count]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  useImperativeHandle(
    apiRef,
    () => ({
      set(i, x, y, z, r, g, b) {
        if (i < 0 || i >= count) return;
        positions[i * 6 + 3] = x;
        positions[i * 6 + 4] = y;
        positions[i * 6 + 5] = z;
        for (let k = 0; k < 2; k++) {
          colors[i * 6 + k * 3] = r;
          colors[i * 6 + k * 3 + 1] = g;
          colors[i * 6 + k * 3 + 2] = b;
        }
      },
      commit() {
        posAttr.needsUpdate = true;
        colAttr.needsUpdate = true;
        invalidate();
      },
    }),
    [count, positions, colors, posAttr, colAttr, invalidate],
  );

  return (
    <lineSegments geometry={geometry} frustumCulled={false}>
      <lineBasicMaterial vertexColors transparent opacity={opacity} toneMapped={false} depthWrite={false} />
    </lineSegments>
  );
}
