"""Frozen item content features and train-only user pooling (ADR-019).

Primary features are sentence-transformer embeddings of business metadata.
The TF-IDF variant is the pre-registered "-semantics" ablation and uses the same
dimensionality so the model code is identical across variants.

Review text is never used. User vectors are pooled from TRAIN interactions only.
All feature arrays are Yelp derivative works and stay in data/processed/.
"""

from __future__ import annotations

import json
from typing import Any, Final

import numpy as np
import numpy.typing as npt

CONTENT_MODEL: Final[str] = "sentence-transformers/all-MiniLM-L6-v2"
EMBED_DIM: Final[int] = 384
TFIDF_DIM: Final[int] = EMBED_DIM
MAX_ATTRIBUTE_TOKENS: Final[int] = 40


def _attribute_tokens(attributes_json: str) -> list[str]:
    """Deterministically flatten business attributes into short tokens."""
    try:
        parsed: Any = json.loads(attributes_json or "{}")
    except json.JSONDecodeError:
        return []
    if not isinstance(parsed, dict):
        return []
    tokens: list[str] = []
    for key in sorted(parsed):
        value = parsed[key]
        if isinstance(value, dict):
            for subkey in sorted(value):
                if value[subkey] is True:
                    tokens.append(f"{key}.{subkey}")
        elif isinstance(value, bool):
            if value:
                tokens.append(str(key))
        elif isinstance(value, str | int | float) and str(value) not in ("", "None", "none"):
            tokens.append(f"{key} {value}")
    return tokens[:MAX_ATTRIBUTE_TOKENS]


def build_item_text(name: str, categories: str, attributes_json: str) -> str:
    """Compose the content description for one business."""
    parts = [str(name or "").strip()]
    if categories:
        parts.append("Categories: " + str(categories).strip())
    tokens = _attribute_tokens(attributes_json)
    if tokens:
        parts.append("Attributes: " + ", ".join(tokens))
    return ". ".join(part for part in parts if part) + "."


def l2_normalize(vectors: npt.NDArray[np.float32]) -> npt.NDArray[np.float32]:
    """Row-wise L2 normalisation; zero rows stay zero."""
    norms = np.linalg.norm(vectors, axis=1, keepdims=True)
    norms = np.where(norms == 0.0, 1.0, norms)
    return np.asarray(vectors / norms, dtype=np.float32)


def encode_items(texts: list[str], model_name: str = CONTENT_MODEL) -> npt.NDArray[np.float32]:
    """Encode item texts with a frozen sentence-transformer. Imports lazily."""
    from sentence_transformers import SentenceTransformer

    model = SentenceTransformer(model_name, device="cpu")
    vectors = model.encode(
        texts,
        batch_size=64,
        show_progress_bar=False,
        convert_to_numpy=True,
        normalize_embeddings=False,
    )
    return l2_normalize(np.asarray(vectors, dtype=np.float32))


def tfidf_features(texts: list[str], dim: int = TFIDF_DIM) -> npt.NDArray[np.float32]:
    """TF-IDF plus truncated SVD, the pre-registered -semantics ablation."""
    from sklearn.decomposition import TruncatedSVD
    from sklearn.feature_extraction.text import TfidfVectorizer

    vectorizer = TfidfVectorizer(lowercase=True, stop_words="english", min_df=2)
    matrix = vectorizer.fit_transform(texts)
    max_components = min(dim, matrix.shape[1] - 1, matrix.shape[0] - 1)
    if max_components < 1:
        return np.zeros((len(texts), dim), dtype=np.float32)
    svd = TruncatedSVD(n_components=max_components, random_state=0)
    reduced = svd.fit_transform(matrix).astype(np.float32)
    if reduced.shape[1] < dim:
        pad = np.zeros((reduced.shape[0], dim - reduced.shape[1]), dtype=np.float32)
        reduced = np.concatenate([reduced, pad], axis=1)
    return l2_normalize(reduced)


def pool_user_vectors(
    train_user_idx: npt.NDArray[np.int64],
    train_item_idx: npt.NDArray[np.int64],
    item_vectors: npt.NDArray[np.float32],
    n_users: int,
) -> npt.NDArray[np.float32]:
    """Mean-pool each user's TRAIN item vectors, then L2 normalise."""
    dim = item_vectors.shape[1]
    totals = np.zeros((n_users, dim), dtype=np.float64)
    counts = np.zeros(n_users, dtype=np.int64)
    np.add.at(totals, train_user_idx, item_vectors[train_item_idx].astype(np.float64))
    np.add.at(counts, train_user_idx, 1)
    safe = np.where(counts == 0, 1, counts).reshape(-1, 1)
    return l2_normalize(np.asarray(totals / safe, dtype=np.float32))
