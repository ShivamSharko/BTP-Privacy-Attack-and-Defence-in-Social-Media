"""Friendship-link inference: score user pairs by similarity of their vectors."""

from __future__ import annotations

import numpy as np
import numpy.typing as npt

from prism.attacks.membership import auc_score, tpr_at_fpr
from prism.data.social import SocialGraph


def pair_cosine(
    vectors: npt.NDArray[np.floating],
    rows_a: npt.NDArray[np.int64],
    rows_b: npt.NDArray[np.int64],
) -> npt.NDArray[np.float64]:
    """Cosine similarity of row pairs; a zero vector gives 0.0."""
    a = vectors[rows_a].astype(np.float64)
    b = vectors[rows_b].astype(np.float64)
    denom = np.linalg.norm(a, axis=1) * np.linalg.norm(b, axis=1)
    dots = np.einsum("ij,ij->i", a, b)
    return np.asarray(np.where(denom > 0, dots / np.where(denom > 0, denom, 1.0), 0.0))


def link_inference(
    vectors: npt.NDArray[np.floating],
    users: npt.NDArray[np.int64],
    graph: SocialGraph,
    rng: np.random.Generator,
    max_pairs: int = 100_000,
) -> dict[str, float]:
    """AUC of cosine similarity separating friend pairs from non-friend pairs."""
    pos, neg = graph.sample_pairs(users, rng, max_pairs)
    if pos.shape[0] == 0:
        return {
            "auc": float("nan"),
            "tpr_at_1pct_fpr": float("nan"),
            "pairs": 0.0,
            "mean_cosine_friends": float("nan"),
            "mean_cosine_non_friends": float("nan"),
        }
    row_of = np.full(graph.n_users, -1, dtype=np.int64)
    row_of[users] = np.arange(users.size)
    friends = pair_cosine(vectors, row_of[pos[:, 0]], row_of[pos[:, 1]])
    others = pair_cosine(vectors, row_of[neg[:, 0]], row_of[neg[:, 1]])
    return {
        "auc": auc_score(friends, others),
        "tpr_at_1pct_fpr": tpr_at_fpr(friends, others, 0.01),
        "pairs": float(pos.shape[0]),
        "mean_cosine_friends": float(friends.mean()),
        "mean_cosine_non_friends": float(others.mean()),
    }
