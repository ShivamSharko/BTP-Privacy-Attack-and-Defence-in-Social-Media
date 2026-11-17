"""History-inversion scores and recovery metrics against one model update."""

from __future__ import annotations

import numpy as np
import pytest
import torch

from prism.attacks.inversion import history_scores, recovery_metrics
from prism.config import ModelConfig
from prism.data.synthetic import write_synthetic_dataset
from prism.fl.client import make_delta_fn, split_history
from prism.fl.secagg import FixedPoint, SecAggClient
from prism.models.hybrid import Layout, content_base, init_flat, make_layout
from prism.seeding import stream, torch_generator


def _hand_update(layout: Layout) -> np.ndarray:
    update = np.zeros(layout.total)
    bias = update[layout.slices["bias"]]  # views into ``update``
    bias[1] = 3.0
    emb = update[layout.slices["emb"]].reshape(layout.shape("emb"))
    emb[4] = [2.0, -2.0]
    return update


def test_history_scores_rank_changed_items_first() -> None:
    layout = make_layout(8, 2)
    scores = history_scores(_hand_update(layout), layout)
    assert scores.shape == (8,)
    top_two = set(np.argsort(-scores)[:2].tolist())
    assert top_two == {1, 4}


def test_history_scores_use_blocks_by_name_not_position() -> None:
    layout = Layout(("bias", "umap", "emb"), ((8,), (2, 2), (8, 2)))
    update = np.zeros(layout.total)
    update[layout.slices["bias"]] = np.eye(8)[6] * 5.0
    scores = history_scores(update, layout)
    assert int(np.argmax(scores)) == 6


def test_constant_blocks_give_zeros_not_nan() -> None:
    layout = make_layout(8, 2)
    assert np.array_equal(history_scores(np.zeros(layout.total), layout), np.zeros(8))
    flat = np.zeros(layout.total)
    flat[layout.slices["bias"]] = 0.3  # constant bias block, emb block constant zero
    out = history_scores(flat, layout)
    assert not np.isnan(out).any()
    assert np.allclose(out, 0.0)


def test_history_scores_rejects_wrong_length() -> None:
    layout = make_layout(8, 2)
    with pytest.raises(ValueError):
        history_scores(np.zeros(layout.total + 1), layout)


def test_recovery_metrics_hand_built() -> None:
    scores = np.arange(20, dtype=np.float64)  # item 19 ranks first
    history = np.array([19, 18, 17, 0], dtype=np.int64)
    popularity = np.arange(20, dtype=np.int64)[::-1]  # item 0 most popular
    out = recovery_metrics(scores, history, popularity)
    # items 19,18,17 outrank all 16 non-history items; item 0 outranks none
    assert out["auc"] == pytest.approx(3 / 4)
    assert out["precision_at_10"] == pytest.approx(0.3)
    # popularity ranks item 0 first and 17,18,19 last: AUC 1/4, top-10 holds only item 0
    assert out["prior_auc"] == pytest.approx(1 / 4)
    assert out["prior_precision_at_10"] == pytest.approx(0.1)


def test_recovery_metrics_ties_are_not_rewarded() -> None:
    out = recovery_metrics(np.zeros(40), np.arange(4, dtype=np.int64), np.zeros(40, dtype=np.int64))
    assert out["auc"] == pytest.approx(0.5)
    assert out["precision_at_10"] == pytest.approx(0.1)  # 4 of 40 are history


def test_recovery_metrics_empty_history_is_nan() -> None:
    out = recovery_metrics(np.zeros(5), np.array([], dtype=np.int64), np.zeros(5, dtype=np.int64))
    assert set(out) == {"auc", "precision_at_10", "prior_auc", "prior_precision_at_10"}
    assert all(np.isnan(v) for v in out.values())


@pytest.fixture(scope="module")
def real_updates(tmp_path_factory: pytest.TempPathFactory) -> dict[str, object]:
    bundle = write_synthetic_dataset(tmp_path_factory.mktemp("inv") / "processed")
    model = ModelConfig(dim=8)
    layout = make_layout(bundle.n_items, model.dim)
    base = content_base(bundle.item_content, model)
    flat = init_flat(layout, model, stream(0, "init"))
    users = np.arange(60, dtype=np.int64)
    rows = torch.from_numpy(bundle.history_matrix("final", users))
    visible, target = split_history(rows, 1, 0.5, torch_generator(stream(0, "attack")))
    deltas = make_delta_fn(layout, base, model, 1, 1.0)(flat, visible, target)
    return {
        "bundle": bundle,
        "layout": layout,
        "deltas": deltas.numpy(),
        "visible": visible[:, 0].numpy(),
        "target": target[:, 0].numpy(),
    }


def test_real_update_has_the_two_signals(real_updates: dict[str, object]) -> None:
    layout: Layout = real_updates["layout"]  # type: ignore[assignment]
    deltas: np.ndarray = real_updates["deltas"]  # type: ignore[assignment]
    visible: np.ndarray = real_updates["visible"]  # type: ignore[assignment]
    target: np.ndarray = real_updates["target"]  # type: ignore[assignment]
    bias_gain, row_gain = [], []
    for i in range(deltas.shape[0]):
        if target[i].sum() == 0 or visible[i].sum() == 0:
            continue
        bias = deltas[i][layout.slices["bias"]]
        rows = np.linalg.norm(deltas[i][layout.slices["emb"]].reshape(layout.shape("emb")), axis=1)
        other = (target[i] == 0) & (visible[i] == 0)
        bias_gain.append(bias[target[i] > 0].mean() - bias[other].mean())
        row_gain.append(rows[visible[i] > 0].mean() - rows[other].mean())
    assert min(bias_gain) > 0.0  # hidden items: positive bias change
    assert np.mean(row_gain) > 0.0  # visible items: extra row change


def test_real_update_beats_popularity_prior(real_updates: dict[str, object]) -> None:
    layout: Layout = real_updates["layout"]  # type: ignore[assignment]
    deltas: np.ndarray = real_updates["deltas"]  # type: ignore[assignment]
    bundle = real_updates["bundle"]
    pop = bundle.popularity("final")  # type: ignore[attr-defined]
    hist = bundle.history("final")  # type: ignore[attr-defined]
    metrics = [
        recovery_metrics(history_scores(deltas[i], layout), hist[i], pop)
        for i in range(deltas.shape[0])
    ]
    auc = float(np.nanmean([m["auc"] for m in metrics]))
    prior = float(np.nanmean([m["prior_auc"] for m in metrics]))
    assert auc > 0.85
    assert auc > prior + 0.2


def test_masked_payload_is_chance(real_updates: dict[str, object]) -> None:
    layout: Layout = real_updates["layout"]  # type: ignore[assignment]
    deltas: np.ndarray = real_updates["deltas"]  # type: ignore[assignment]
    bundle = real_updates["bundle"]
    pop = bundle.popularity("final")  # type: ignore[attr-defined]
    hist = bundle.history("final")  # type: ignore[attr-defined]
    codec = FixedPoint(1.0)
    aucs = []
    for i in range(40):
        clients = [SecAggClient(c) for c in range(3)]
        peers = {c.client_id: c.public_bytes for c in clients}
        clipped = deltas[i] * min(1.0, 1.0 / float(np.linalg.norm(deltas[i])))
        payload = clients[0].masked_update(clipped, peers, 0, codec).payload
        floats = codec.decode_sum(payload)
        aucs.append(recovery_metrics(history_scores(floats, layout), hist[i], pop)["auc"])
    assert abs(float(np.mean(aucs)) - 0.5) < 0.05
