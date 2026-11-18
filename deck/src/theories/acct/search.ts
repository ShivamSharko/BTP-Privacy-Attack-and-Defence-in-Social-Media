import { grid, raw } from "../../data";
import { bisectTrace, epsilonAt } from "./sim";
import { type Regime, regimeSetting } from "./store";

/** The search of `calibrate_noise` run on the exported grid, for one regime and one target epsilon. */
export function calibrationTrace(regime: Regime, target: number) {
  const s = regimeSetting(regime);
  return bisectTrace((z) => epsilonAt(grid, s.rateIdx, z, s.rounds), grid.noise[0], grid.noise[grid.noise.length - 1], target);
}

/** The noise multiplier the project's own calibration found for this regime and target (results/calibration.json). */
export function projectNoise(regime: Regime, target: number): number | undefined {
  const s = regimeSetting(regime);
  const key = `v1-max-prv-pld|q=${s.rate}|T=${s.rounds}|n=${grid.users}|eps=${target.toFixed(1)}`;
  const value = raw<Record<string, number>>("calibration", "")[key];
  return typeof value === "number" ? value : undefined;
}
