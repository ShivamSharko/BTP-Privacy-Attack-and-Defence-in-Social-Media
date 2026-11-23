import { fmt, grid } from "../../data";
import { Caption, Choice, H, P, StatRow, Table } from "../../ui";
import { level } from "./impact";
import { LEVELS, type Regime, regimeSetting, useAcct } from "./store";

const TARGET = LEVELS[3];
const REGIMES: Regime[] = ["large", "small"];
const NAME: Record<Regime, string> = { large: "large cohort", small: "small cohort" };

export function BriefAccountingPanel() {
  const regime = useAcct((s) => s.regime);
  return (
    <>
      <H>Epsilon is computed from the noise, the sampling rate and the rounds, and three accountants must agree on it.</H>
      <P>
        Every round adds Gaussian noise to the sum of clipped updates. Rounds compose, so epsilon grows with the number of
        rounds and falls with the noise. Sampling helps: a user is in a round only with probability q, which amplifies
        privacy. Delta, the chance the bound fails, is 1/(10n) for n = {fmt.int(grid.users)} users.
      </P>
      <P>
        Three accountants from two separate libraries, Opacus and dp-accounting, compute it, and the run is refused if
        they disagree. The larger of the two tight values is reported. The {NAME[regime]} at epsilon {TARGET} is shown at
        the stricter delta 1/n² and with no sampling amplification.
      </P>
    </>
  );
}

export function BriefAccountingStage() {
  const regime = useAcct((s) => s.regime);
  const setRegime = useAcct((s) => s.setRegime);
  const pick = (eps: number, key: string) => level(regime, eps, key);
  const rounds = regimeSetting(regime).rounds;
  const convName = (c: "record" | "n2") => (c === "record" ? "delta 1/(10n), of record" : "delta 1/n²");
  return (
    <>
      <Choice<Regime>
        label="Sampling regime"
        value={regime}
        onChange={setRegime}
        options={REGIMES.map((r) => ({ value: r, label: `${NAME[r][0].toUpperCase()}${NAME[r].slice(1)}: q ${regimeSetting(r).rate}, ${regimeSetting(r).rounds} rounds` }))}
      />
      <StatRow
        items={[
          { label: `epsilon ${TARGET} at ${convName("record")}`, value: fmt.n(pick(TARGET, "epsilon_of_record"), 2), role: "protected" },
          { label: `epsilon ${TARGET} at the stricter ${convName("n2")}`, value: fmt.n(pick(TARGET, "epsilon_at_delta_n2"), 2), role: "honest" },
          { label: "without sampling amplification", value: fmt.n(pick(TARGET, "epsilon_unamplified"), 0), role: "attacker", note: `${rounds} rounds` },
          { label: "noise multiplier to reach it", value: fmt.n(pick(TARGET, "noise_multiplier"), 3), role: "noise" },
        ]}
      />
      <Table
        head={["Target", "Of record", "At 1/n squared", "Unamplified", "Noise z"]}
        rows={LEVELS.map((e) => [e, fmt.n(pick(e, "epsilon_of_record"), 2), fmt.n(pick(e, "epsilon_at_delta_n2"), 2), fmt.n(pick(e, "epsilon_unamplified"), 1), fmt.n(pick(e, "noise_multiplier"), 3)])}
        caption={`${NAME[regime]}, ${rounds} rounds`}
      />
      <Caption>
        No seeds and no error bars: each value is a deterministic output of the accountants for the stated settings.
      </Caption>
    </>
  );
}
