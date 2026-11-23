import { fmt, grid, m } from "../../data";
import { Caption, Choice, CodeView, GroupedBars, H, Note, P, StatRow, Table } from "../../ui";
import { type Convention, LEVELS, type Regime, regimeSetting, useAcct } from "./store";

export const level = (regime: Regime, eps: number, key: string) => m("privacy_utility", `summary/${regime}/levels/eps${eps}/${key}`);
const REGIMES: Regime[] = ["small", "large"];

/* ---------------------------------------------------------------- 7.4 impact */

export function ImpactPanel() {
  const target = LEVELS[3];
  const nOver = (r: Regime) => fmt.n(level(r, target, "epsilon_at_delta_n2"), 1);
  return (
    <>
      <H>One private run has three epsilons, and the honest one depends on what you assume.</H>
      <P>
        The epsilon of record uses delta = 1/(10n) with n = {fmt.int(grid.users)} users, and the larger of PRV and PLD. At
        the stricter delta = 1/n², also reported because NIST SP 800-226 advises delta far below 1/n and 1/(10n) sits
        at that boundary, the epsilon {target} runs read {nOver("large")} and{" "}
        {nOver("small")}.
      </P>
      <P>
        The unamplified epsilon assumes no random sampling. It is {fmt.n(level("large", target, "epsilon_unamplified"), 0)} for the large
        regime and {fmt.n(level("small", target, "epsilon_unamplified"), 0)} for the small one, which runs {m("privacy_utility", "frozen/regimes/small/rounds")} rounds.
        The small regime is private only because sampling really is Poisson.
      </P>
      <Note tone="warn">
        None of this covers the floating-point noise from a seeded generator, or the clipping norm and settings that
        were tuned on the same users' data.
      </Note>
    </>
  );
}

export function ImpactStage() {
  const regime = useAcct((s) => s.regime);
  const convention = useAcct((s) => s.convention);
  const setRegime = useAcct((s) => s.setRegime);
  const setConvention = useAcct((s) => s.setConvention);
  const target = LEVELS[3];
  const second = convention === "record" ? "epsilon_of_record" : "epsilon_at_delta_n2";
  const secondName = convention === "record" ? "delta 1/(10n), of record" : "delta 1/n squared";
  const pick = (eps: number, key: string) => level(regime, eps, key);
  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.6em", marginBottom: "0.4em" }}>
        <Choice<Regime>
          label="Regime"
          value={regime}
          onChange={setRegime}
          options={REGIMES.map((r) => ({ value: r, label: `${r}: q ${regimeSetting(r).rate}, ${regimeSetting(r).rounds} rounds` }))}
        />
        <Choice<Convention>
          label="Delta convention"
          value={convention}
          onChange={setConvention}
          options={[
            { value: "record", label: "1/(10n), of record" },
            { value: "n2", label: "1/n squared" },
          ]}
        />
      </div>
      <StatRow
        items={[
          { label: `epsilon ${target}, ${secondName}`, value: fmt.n(pick(target, second), 2), role: "protected" },
          { label: "without sampling amplification", value: fmt.n(pick(target, "epsilon_unamplified"), 1), role: "attacker" },
          { label: "noise multiplier to reach it", value: fmt.n(pick(target, "noise_multiplier"), 3), note: `calibrated for the ${regime} regime, ${regimeSetting(regime).rounds} rounds` },
        ]}
      />
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 0.9fr) minmax(0, 1.1fr)", gap: "1.4em", alignItems: "start", marginTop: "0.6em" }}>
        <div>
          <Table
            head={["Target", convention === "record" ? "Of record" : "At 1/n squared", "Unamplified", "Noise z"]}
            rows={LEVELS.map((e) => [e, fmt.n(pick(e, second), 2), fmt.n(pick(e, "epsilon_unamplified"), 1), fmt.n(pick(e, "noise_multiplier"), 3)])}
            caption={`${regime} regime, ${secondName}`}
          />
          <GroupedBars
            yLabel="noise multiplier"
            format={(v) => v.toFixed(1)}
            groups={LEVELS.map((e) => ({
              label: `target ${e}`,
              bars: REGIMES.map((r) => ({ name: `${r} regime`, value: level(r, e, "noise_multiplier"), role: r === "small" ? "honest" : "noise" })),
            }))}
            summary={`Calibrated noise multiplier for each target epsilon. At epsilon ${target} the small regime needs ${fmt.n(level("small", target, "noise_multiplier"), 2)} and the large regime ${fmt.n(level("large", target, "noise_multiplier"), 2)}.`}
          />
        </div>
        <GroupedBars
          yLabel="epsilon"
          format={(v) => v.toFixed(v < 100 ? 1 : 0)}
          groups={LEVELS.map((e) => ({
            label: `target ${e}`,
            bars: [
              { name: secondName, value: pick(e, second), role: "protected" },
              { name: "unamplified", value: pick(e, "epsilon_unamplified"), role: "attacker" },
            ],
          }))}
          summary={`In the ${regime} regime, at the epsilon ${target} target the epsilon is ${fmt.n(pick(target, second), 2)} (${secondName}) and ${fmt.n(pick(target, "epsilon_unamplified"), 0)} without sampling amplification.`}
        />
      </div>
      <Caption>
        No seeds and no error bars: every epsilon and noise multiplier here is a deterministic output of the
        accountants for the stated settings.
      </Caption>
    </>
  );
}

/* ---------------------------------------------------------------- 7.5 code */

export function CodePanel() {
  return (
    <>
      <H>Four functions turn a configuration into an epsilon, a verdict and a noise level.</H>
      <P>
        <strong>epsilon_report</strong> asks three accountants (PRV and RDP from Opacus, PLD from dp-accounting), applies the gate and
        also reports epsilon at delta 1/n² and with no sampling.
      </P>
      <P>
        <strong>check_gate</strong> is the agreement rule. <strong>calibrate_noise</strong> searches on PLD, then raises the noise until the
        value of record fits. <strong>max_rounds_within</strong> does the reverse: the most rounds a budget allows, confirmed by all three.
      </P>
      <Note>
        <code>privacy/dp.py</code> has an older <code>calibrate_noise</code> that bisects PRV alone. The experiments use the one in{" "}
        <code>accounting.py</code>, through the cached wrapper in <code>experiments/calibration.py</code>.
      </Note>
    </>
  );
}

export function CodeStage() {
  return (
    <CodeView
      refs={[
        "privacy/accounting.py::epsilon_report",
        "privacy/accounting.py::check_gate",
        "privacy/accounting.py::calibrate_noise",
        "privacy/accounting.py::max_rounds_within",
      ]}
      highlight={{
        "privacy/accounting.py::check_gate": [[100, 104]],
      }}
    />
  );
}
