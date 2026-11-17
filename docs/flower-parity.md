# Flower parity

Script: `scripts/flower_parity.py`. Result: `results/flower_parity.json` (status VALID).

## What parity means here

The main experiments train with the project's own single-process federated engine
(`prism.fl.server.train`). This check shows that the same algorithm, run through the Flower
framework, gives the same model as an in-process reference built from the same prism building
blocks: the client update (`make_delta_fn`, `split_history`), clipping (`clip_rows`) and the
aggregation rule (sum of clipped updates, divided by the expected cohort size, then an SGD step
`new = old + server_lr x mean`).

## How it was run

- Flower 1.43.0, simulation runtime (`flwr.simulation.run_simulation`) with the Ray backend, on
  Windows 11 without WSL, Python 3.12. Ray on Windows is documented as experimental; it worked
  here. The message-based API was used: a custom `Strategy`, a `ServerApp` and a `ClientApp`.
- Synthetic data: 400 users, 300 items, `ModelConfig(dim=8)` (2,764 parameters), 5 rounds,
  sample rate 0.1 (expected cohort 40; realised 43, 35, 42, 41, 47), SGD with server learning
  rate 1.0, momentum 0, clip norm 0.5.
- Fixed cohorts: precomputed with the engine's own stream (`stream(seed, "sampling")` and
  `poisson_cohort`). The strategy first asks all 400 simulated nodes for their partition id
  (a query message), then in each round sends the training message only to the nodes of that
  round's cohort, and checks that exactly those clients replied.
- Fixed split: each client's visible/hidden split is seeded from (seed, round, client id), in
  both implementations.
- The clients return raw updates. The custom strategy clips them on the server, sums in float64,
  divides by the expected cohort and takes the SGD step.
- Optional variant: Gaussian noise (multiplier 1.0) added once per round on the server, from
  the same seeded noise stream on both sides.
- A unit check confirms the reference's aggregation step equals `noisy_mean` plus the engine's
  SGD step on the same inputs (identical, difference 0.0, with and without noise).

## Numbers (final model, round 5; tolerance rtol 1e-5, atol 1e-6)

| Variant | Max abs difference | Relative L2 difference | allclose |
|---|---|---|---|
| No noise | 5.96e-08 | 4.31e-08 | yes |
| Gaussian noise | 5.96e-08 | 4.80e-08 | yes |

Every round also passes `allclose`; per-round values are in the result file (max absolute
difference 7e-09 after round 1, growing to 6e-08 by round 4). The runs are not bit-identical:
the remaining differences are at float32 rounding level (about one unit in the last place).
Runtime: reference about 13 to 31 s, Flower about 94 to 109 s (Ray start-up and per-message
overhead dominate).

## What it shows and does not show

Shows: the federated plumbing (selection of a cohort, shipping parameters to clients, returning
updates, server-side clipping and aggregation, server step) behaves the same in a standard
framework as in the in-process engine, for this algorithm.

Does not show:

- Anything about scale. The problem is a small synthetic dataset and five rounds.
- Equivalence of the client mathematics: the same prism client function runs on both sides.
- Equivalence to `prism.fl.server.train` itself, whose history split uses one shared random
  stream. Only its aggregation step is checked directly.
- Anything about Flower's built-in differential-privacy wrappers; clipping and noise are
  implemented in a custom strategy.
- That cohort selection and splits are equivalent under Flower's own random selection: these
  were fixed on purpose.

The main experiments still use the in-process engine.

## How to reproduce

Create a separate environment (the project environment is not touched), then run the script
from the repository root:

```
uv venv _workspace/flower-env --python 3.12
uv pip install --python _workspace/flower-env/Scripts/python.exe torch --index-url https://download.pytorch.org/whl/cpu
uv pip install --python _workspace/flower-env/Scripts/python.exe numpy scipy pandas pydantic rfc8785 "flwr[simulation]"
uv pip install --python _workspace/flower-env/Scripts/python.exe --no-deps -e .
_workspace/flower-env/Scripts/python.exe scripts/flower_parity.py
```

The run takes about four minutes with two CPU threads and writes `results/flower_parity.json`.
Add `--skip-noise` to run only the noise-free variant.
