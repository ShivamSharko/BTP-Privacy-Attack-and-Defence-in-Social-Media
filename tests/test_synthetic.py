"""Tests for the synthetic dataset generator."""

from __future__ import annotations

import time
from pathlib import Path

import numpy as np

from prism.data.bundle import load_bundle
from prism.data.synthetic import write_synthetic_dataset
from prism.eval.baselines import knn_score_fn, popularity_score_fn
from prism.eval.metrics import ranking_metrics


def test_round_trip_and_determinism(tmp_path: Path) -> None:
    first = write_synthetic_dataset(tmp_path / "a", seed=3)
    loaded = load_bundle(tmp_path / "a")
    second = write_synthetic_dataset(tmp_path / "b", seed=3)
    other = write_synthetic_dataset(tmp_path / "c", seed=4)
    for left, right in ((first, loaded), (first, second)):
        assert left.n_users == right.n_users and left.n_items == right.n_items
        for name in ("train", "val", "test"):
            for a, b in zip(getattr(left, name), getattr(right, name), strict=True):
                assert np.array_equal(a, b)
        assert np.array_equal(left.item_content, right.item_content)
    assert any(not np.array_equal(a, b) for a, b in zip(first.train, other.train, strict=True))


def test_file_format(tmp_path: Path) -> None:
    import pandas as pd  # type: ignore[import-untyped]

    write_synthetic_dataset(tmp_path)
    frame = pd.read_csv(tmp_path / "dataset_train.csv.gz")
    assert list(frame.columns) == ["user_idx", "item_idx", "rating", "timestamp", "split"]
    assert set(frame["split"]) == {"train"}
    with np.load(tmp_path / "features_semantic.npz") as data:
        assert data["items"].shape == (300, 32) and data["users"].shape == (400, 32)


def test_no_leakage_and_shape(tmp_path: Path) -> None:
    bundle = write_synthetic_dataset(tmp_path)
    for u in range(bundle.n_users):
        tr, va, te = set(bundle.train[u]), set(bundle.val[u]), set(bundle.test[u])
        assert tr and va and te
        assert not (tr & va) and not (tr & te) and not (va & te)
        assert 15 <= len(tr) + len(va) + len(te) <= 60
    final = bundle.history("final")
    assert np.array_equal(final[0], np.union1d(bundle.train[0], bundle.val[0]))
    norms = np.linalg.norm(bundle.item_content, axis=1)
    assert np.allclose(norms, 1.0, atol=1e-5)


def test_popularity_is_skewed(tmp_path: Path) -> None:
    bundle = write_synthetic_dataset(tmp_path)
    pop = np.sort(bundle.popularity("tune"))[::-1]
    assert pop[:30].sum() > 2 * 0.1 * pop.sum()  # top 10% of items hold over 2x uniform share


def test_fast(tmp_path: Path) -> None:
    # A guard against pathological slowness, not a benchmark: generation takes well under a
    # second on an idle machine, but took 2.4 s while experiments had every core busy.
    start = time.perf_counter()
    write_synthetic_dataset(tmp_path)
    assert time.perf_counter() - start < 15.0


def test_learnable(tmp_path: Path) -> None:
    bundle = write_synthetic_dataset(tmp_path)
    train, val = bundle.history("tune"), bundle.targets("tune")
    pop = ranking_metrics(popularity_score_fn(train, bundle.n_items), train, val, bundle.n_items)
    knn = ranking_metrics(knn_score_fn(train, bundle.n_items), train, val, bundle.n_items)
    print(f"MostPopular={pop['ndcg@10']:.4f} ItemKNN={knn['ndcg@10']:.4f}")
    assert knn["ndcg@10"] >= 1.5 * pop["ndcg@10"]


def test_friend_graph_written_and_deterministic(tmp_path: Path) -> None:
    from prism.data.social import FRIENDS_FILE, load_friend_graph

    write_synthetic_dataset(tmp_path / "a", seed=3)
    write_synthetic_dataset(tmp_path / "b", seed=3)
    assert (tmp_path / "a" / FRIENDS_FILE).exists()
    first = load_friend_graph(tmp_path / "a")
    second = load_friend_graph(tmp_path / "b")
    assert (first.adjacency != second.adjacency).nnz == 0
