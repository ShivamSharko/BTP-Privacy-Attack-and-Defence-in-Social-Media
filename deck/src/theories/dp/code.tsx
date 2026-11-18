import { CodeView, H, Note, P } from "../../ui";

export const CODE_REFS = [
  "privacy/dp.py::clip_l2",
  "fl/aggregate.py::clip_rows",
  "fl/aggregate.py::noisy_mean",
  "fl/fast.py::update_norms",
  "privacy/dp.py::target_delta",
];

export function CodePanel() {
  return (
    <>
      <H>The whole mechanism is a handful of lines.</H>
      <P>
        <code>clip_l2</code> clips one vector: if its norm is above the bound, scale it down; otherwise return a copy.
        <code> clip_rows</code> does the same for a whole cohort at once with one factor per row,{" "}
        <code>min(1, C / norm)</code>, and zeroes any row that is not finite.
      </P>
      <P>
        <code>noisy_mean</code> draws Gaussian noise with standard deviation <code>z * C</code>, adds it to the sum once,
        and divides by the expected cohort size. It refuses noise without a clipping norm.
      </P>
      <P>
        <code>update_norms</code> gives each user's update norm in closed form, so clipping needs no per-user gradient.
        <code> target_delta</code> is <code>1 / (10 n)</code>.
      </P>
      <Note>
        NumPy, PyTorch, and Opacus to choose <code>z</code>. Noise comes from a seeded NumPy generator so runs reproduce;
        a deployment would need an operating-system random source and a discrete mechanism.
      </Note>
    </>
  );
}

export function CodeStage() {
  return (
    <CodeView
      refs={CODE_REFS}
      highlight={{
        "privacy/dp.py::clip_l2": [[43, 46]],
        "fl/aggregate.py::clip_rows": [[41, 42]],
        "fl/aggregate.py::noisy_mean": [[74, 76]],
        "fl/fast.py::update_norms": [[133, 135]],
        "privacy/dp.py::target_delta": [[36, 36]],
      }}
    />
  );
}
