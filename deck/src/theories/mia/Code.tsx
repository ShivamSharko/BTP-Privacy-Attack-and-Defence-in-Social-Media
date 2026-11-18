import { CodeView, H, Note, P } from "../../ui";
import { m } from "../../data";

const REFS = [
  "attacks/membership.py::losses_for_models",
  "attacks/membership.py::calibrate_scores",
  "attacks/membership.py::summarise_scores",
  "eval/stats.py::clopper_pearson",
  "eval/stats.py::epsilon_lower_bound",
];

export function CodePanel() {
  return (
    <>
      <H>The attack and its bound in code: five functions.</H>
      <P>
        <strong>1. Losses.</strong> <code>losses_for_models</code> scores every user under every model without
        gradients. Half of each user's history is hidden by a fixed split that depends only on the attack seed and the
        user, never on a model.
      </P>
      <P>
        <strong>2. Calibrate.</strong> <code>calibrate_scores</code> subtracts the user's own loss from the mean over
        the reference models that did not train on them, so higher means more likely a member.
      </P>
      <P>
        <strong>3. Summarise.</strong> <code>summarise_scores</code> puts the threshold at the 99th percentile of
        non-member scores, then counts true and false positives, at 1% and 0.1%.
      </P>
      <P>
        <strong>4. Bound.</strong> <code>clopper_pearson</code> gives exact one-sided limits;{" "}
        <code>epsilon_lower_bound</code> returns zero when the lower true-positive limit does not exceed delta, and
        floors the false-positive limit at 1 over the number of non-members.
      </P>
      <Note>
        PyTorch for the losses, NumPy for the scores, SciPy for the rank-based AUC and the beta quantiles.{" "}
        {m("membership", "settings/n_reference")} reference models, all non-private.
      </Note>
    </>
  );
}

export function CodeStage() {
  return (
    <CodeView
      refs={REFS}
      highlight={{
        "attacks/membership.py::calibrate_scores": [[148, 153]],
        "attacks/membership.py::summarise_scores": [[171, 172]],
        "eval/stats.py::epsilon_lower_bound": [[109, 114]],
        "eval/stats.py::clopper_pearson": [[89, 96]],
      }}
    />
  );
}
