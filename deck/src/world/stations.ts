import type { Pose, Vec3 } from "../deck/types";

/** Distance between neighbouring stations, far enough that neighbours never overlap on screen. */
export const STATION_GAP = 70;

/** Where a theory's scene sits in the one shared world: along a shallow arc, rising and falling slowly. */
export function stationOrigin(number: number): Vec3 {
  const x = number * STATION_GAP;
  const z = -18 * Math.sin(number * 0.9);
  const y = 4 * Math.sin(number * 0.55);
  return [x, y, z];
}

/** Turns a station-local pose into world coordinates. */
export function worldPose(number: number, pose: Pose): Pose {
  const [ox, oy, oz] = stationOrigin(number);
  return {
    position: [pose.position[0] + ox, pose.position[1] + oy, pose.position[2] + oz],
    target: [pose.target[0] + ox, pose.target[1] + oy, pose.target[2] + oz],
  };
}
