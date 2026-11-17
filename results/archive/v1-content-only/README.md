# Archived results: content-only model (steps 7 to 10, 16-17 November 2026)

These files were produced by the first model, a two-tower network over frozen text embeddings
(ADR-019), and are kept as a record. They are **not** current results.

| File | Status |
|---|---|
| `runs/` (180 files), `summary.json`, `summary_table.csv` | Valid measurements of a model that ranks like MostPopular (25 to 46 distinct items in all top-10 lists). They show what DP costs when the model has only popularity to learn. Hyperparameters for these runs were tuned on the test split. |
| `attacks_inversion.json` | **INVALID.** The attack read the wrong block of the parameter vector (the item bias instead of the first layer of the user tower). Do not cite. |
| `attacks_membership.json` | Uninformative. Interaction-level attack whose score is the same with and without DP, because it reads the model input. |
| `baselines.json` | MostPopular and ItemKNN on the test split with training items masked only (validation items were not masked). Superseded by `results/baselines.json`. |
| `clip_calibration.json`, `noise_calibration.json`, `learning_tuning.json`, `grid_log*.txt` | Working files of those runs. |

The replacement model, protocol and results are described in
`docs/superpowers/specs/2026-11-17-prism-rebuild-design.md` and `PREREGISTRATION.md` (Amendment 1).
