# ADR-043: Hybrid model with item ID embeddings and a fixed content projection

- Status: Approved (CHANGE-023)
- Date: 17 November 2026

## Context
ADR-019 fixed the model to frozen text embeddings only. On the validation split, untrained content similarity scored NDCG@10 0.0031 against MostPopular 0.0174, and a trained content-only projection reached 0.0205 with 251 distinct items recommended. A model of the same size with item ID embeddings reached 0.0345 with over 3,000 distinct items (design section 1.3, item 1).

## Decision
Item vector = normalise(ID embedding + fixed content base). The base is the top 16 principal directions of the public text embeddings; it is not trained. The user vector is a 16 x 16 map of the mean item vector over the user's own history, computed on the device. Score = temperature x cosine + item bias. Parameters: 107,679 (embedding 101,104, user map 256, bias 6,319). Item embeddings start at zero, so initialisation uses no private data. The fixed projection matched the trained one on validation (0.0347 against 0.0345). Dimension 16 is chosen because DP noise grows with the square root of the parameter count.

## Consequences
The model can personalise. `use_ids=False` stays as the content-only ablation. The 180 earlier runs are archived under `results/archive/v1-content-only/`. The temperature is now frozen at 20.0 in `experiments/frozen.json`.

## Supersedes
ADR-019. Restores the intent of ADR-005. Amends ADR-038 (temperature) and ADR-040 (one server learning rate per regime).
