import { rng } from "../../sim/random";
import { GROUP_SIZES, MAX_FAKES, N_GROUPS, N_USERS } from "./sim";

/** Fixed positions for the scene: real users in four arcs by taste group, fakes in a block behind. */
export function accountLayout(): Float32Array {
  const out = new Float32Array((N_USERS + MAX_FAKES) * 3);
  const r = rng(29);
  let index = 0;
  GROUP_SIZES.forEach((size, g) => {
    const start = (g / N_GROUPS) * Math.PI * 2 + 0.12;
    const span = (Math.PI * 2) / N_GROUPS - 0.5;
    for (let k = 0; k < size; k++) {
      const angle = start + (span * (k + 0.5)) / size;
      const radius = 3.6 + (r() - 0.5) * 0.7;
      out[index * 3] = Math.cos(angle) * radius;
      out[index * 3 + 1] = (r() - 0.5) * 0.8;
      out[index * 3 + 2] = Math.sin(angle) * radius;
      index++;
    }
  });
  // Fake accounts gather in a block behind the model, above the real users, two rows deep.
  for (let f = 0; f < MAX_FAKES; f++) {
    const column = Math.floor(f / 2);
    const angle = Math.PI * 1.5 + (column - (MAX_FAKES / 2 - 1) / 2) * 0.075;
    const radius = 4.5 + (f % 2) * 0.45;
    out[index * 3] = Math.cos(angle) * radius;
    out[index * 3 + 1] = 1.5 + (f % 2) * 0.3 + (r() - 0.5) * 0.15;
    out[index * 3 + 2] = Math.sin(angle) * radius;
    index++;
  }
  return out;
}
