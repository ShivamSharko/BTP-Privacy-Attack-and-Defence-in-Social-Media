"""Build frozen item features and train-only user vectors.

Outputs .npz arrays under data/processed/ (Yelp derivative works, git-ignored)
and an aggregate-only card at results/features_card.json.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Final

import numpy as np
import pandas as pd  # type: ignore[import-untyped]

from prism.data.dataset import load_split
from prism.data.features import (
    CONTENT_MODEL,
    EMBED_DIM,
    build_item_text,
    encode_items,
    pool_user_vectors,
    tfidf_features,
)
from prism.environment import collect_environment_report, file_sha256

PROCESSED: Final[Path] = Path("data/processed")
CARD: Final[Path] = Path("results/features_card.json")
DATASET_CARD: Final[Path] = Path("results/dataset_card.json")


def main() -> int:
    """Encode items twice (primary and ablation) and pool user vectors."""
    dataset_card = json.loads(DATASET_CARD.read_text(encoding="utf-8"))
    n_users = int(dataset_card["users"])
    n_items = int(dataset_card["items"])

    item_map = json.loads((PROCESSED / "item_index.json").read_text(encoding="utf-8"))
    ordered_ids = [None] * n_items
    for business_id, index in item_map.items():
        ordered_ids[int(index)] = business_id
    businesses = pd.read_csv(PROCESSED / "philly_businesses.csv.gz", dtype=str).set_index(
        "business_id"
    )
    texts: list[str] = []
    for business_id in ordered_ids:
        row = businesses.loc[str(business_id)]
        texts.append(
            build_item_text(
                str(row.get("name") or ""),
                str(row.get("categories") or ""),
                str(row.get("attributes_json") or "{}"),
            )
        )

    train = load_split("train", PROCESSED)
    train_user = train["user_idx"].to_numpy(dtype=np.int64)
    train_item = train["item_idx"].to_numpy(dtype=np.int64)

    variants: dict[str, Any] = {}
    print("Encoding items with TF-IDF + SVD (ablation) ...", flush=True)
    tfidf_items = tfidf_features(texts)
    print("Encoding items with " + CONTENT_MODEL + " (primary) ...", flush=True)
    semantic_items = encode_items(texts)

    for label, item_vectors in (("tfidf", tfidf_items), ("semantic", semantic_items)):
        user_vectors = pool_user_vectors(train_user, train_item, item_vectors, n_users)
        target = PROCESSED / ("features_" + label + ".npz")
        np.savez_compressed(target, items=item_vectors, users=user_vectors)
        variants[label] = {
            "file": target.name,
            "item_shape": list(item_vectors.shape),
            "user_shape": list(user_vectors.shape),
            "size_bytes": target.stat().st_size,
            "sha256": file_sha256(target),
            "zero_user_vectors": int(np.count_nonzero(np.linalg.norm(user_vectors, axis=1) == 0)),
        }
        print("  wrote " + target.name, flush=True)

    env = collect_environment_report()
    card = {
        "schema_version": 1,
        "primary_variant": "semantic",
        "content_model": CONTENT_MODEL,
        "embedding_dim": EMBED_DIM,
        "items": n_items,
        "users": n_users,
        "train_interactions_used_for_pooling": len(train),
        "review_text_used": False,
        "variants": variants,
        "provenance": {
            "git_commit": env.git_commit,
            "uv_lock_sha256": env.uv_lock_sha256,
        },
    }
    CARD.parent.mkdir(parents=True, exist_ok=True)
    CARD.write_text(
        json.dumps(card, indent=2, sort_keys=True) + "\n", encoding="utf-8", newline="\n"
    )
    print("\nFeatures card written to " + str(CARD))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
