import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { Color, CylinderGeometry, type InstancedMesh, Object3D, Quaternion, Vector3 } from "three";
import { Crowd, Label, useRoles } from "../../world/kit";
import { useNetwork } from "./derived";
import { useLeak } from "./store";

const UP = new Vector3(0, 1, 0);

/**
 * Scene 3.3: fourteen people, their real friendships as lines, recoloured by what the attacker
 * guessed at the chosen threshold. Pink: found. Amber: a friendship the attacker missed. Lavender: a guess that was wrong.
 */
export function Network({ labels }: { labels: boolean }) {
  const roles = useRoles();
  const { net, guesses } = useNetwork();
  const threshold = useLeak((s) => s.threshold);

  const mesh = useRef<InstancedMesh>(null);
  const geometry = useMemo(() => new CylinderGeometry(1, 1, 1, 8, 1, true), []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const scratch = useMemo(() => ({ o: new Object3D(), a: new Vector3(), b: new Vector3(), q: new Quaternion(), c: new Color() }), []);

  useLayoutEffect(() => {
    const m = mesh.current;
    if (!m) return;
    const { o, a, b, q, c } = scratch;
    net.pairs.forEach((p, i) => {
      const said = p.cos >= threshold;
      const show = p.friend || said;
      a.set(net.layout[p.a * 3], net.layout[p.a * 3 + 1], net.layout[p.a * 3 + 2]);
      b.set(net.layout[p.b * 3], net.layout[p.b * 3 + 1], net.layout[p.b * 3 + 2]);
      const d = b.clone().sub(a);
      const length = d.length();
      o.position.copy(a).addScaledVector(d, 0.5);
      q.setFromUnitVectors(UP, d.normalize());
      o.quaternion.copy(q);
      const radius = p.friend && said ? 0.055 : p.friend ? 0.032 : 0.016;
      o.scale.set(radius, show ? length : 0.0001, radius);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
      c.copy(p.friend && said ? roles.attacker : p.friend ? roles.honest : roles.noise);
      if (!p.friend) c.multiplyScalar(0.6);
      m.setColorAt(i, c);
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [net, threshold, roles, scratch]);

  return (
    <group>
      <instancedMesh ref={mesh} args={[geometry, undefined, net.pairs.length]} key={net.pairs.length} frustumCulled={false} raycast={() => null}>
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      <Crowd count={net.people} positions={net.layout} size={0.2} />
      {labels ? (
        <Label position={[0, -0.4, 3.1]} tone="attacker" small>
          {guesses.hits} of {guesses.hits + guesses.missed} friendships found, {guesses.falseAlarms} wrong guesses
        </Label>
      ) : null}
    </group>
  );
}
