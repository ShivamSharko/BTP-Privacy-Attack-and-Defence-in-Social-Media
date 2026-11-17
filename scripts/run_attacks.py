"""Run membership inference on all checkpoints and analytic inversion on a sample.

Writes aggregate-only records to results/attacks_membership.json and
results/attacks_inversion.json. No identifiers, no text.
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from typing import Any, Final

import numpy as np
import torch

from prism.attacks.inversion import (
    absolute_cosine,
    first_layer_block,
    recover_direction,
    topk_item_recovery,
)
from prism.attacks.membership import attack_summary
from prism.data.dataset import load_split, user_item_lists
from prism.models.two_tower import (
    HIDDEN_DIM,
    TwoTower,
    client_update,
    get_flat,
    set_flat,
)

os.environ.setdefault("OMP_NUM_THREADS", "2")
os.environ.setdefault("MKL_NUM_THREADS", "2")

PROCESSED: Final[Path] = Path("data/processed")
DATASET_CARD: Final[Path] = Path("results/dataset_card.json")
MI_OUT: Final[Path] = Path("results/attacks_membership.json")
INV_OUT: Final[Path] = Path("results/attacks_inversion.json")
INVERSION_USERS: Final[int] = 200
INVERSION_NOISE: Final[tuple[float, ...]] = (0.0, 0.534, 1.0961)
BATCH_USERS: Final[int] = 1024


def membership_for_checkpoint(
    flat: np.ndarray,
    item_features: np.ndarray,
    user_features: np.ndarray,
    train_items: list[np.ndarray],
    test_items: list[np.ndarray],
    n_items: int,
) -> dict[str, Any]:
    """Score-based interaction-level membership inference for one model."""
    model = TwoTower(item_features.shape[1], n_items)
    set_flat(model, flat)
    with torch.no_grad():
        item_emb = torch.nn.functional.normalize(
            model.item_tower(torch.from_numpy(item_features)), p=2.0, dim=-1
        ).numpy()
        bias = model.item_bias.detach().numpy()

    n_users = len(train_items)
    member_raw: list[float] = []
    member_centred: list[float] = []
    nonmember_raw: list[float] = []
    nonmember_centred: list[float] = []

    for start in range(0, n_users, BATCH_USERS):
        stop = min(start + BATCH_USERS, n_users)
        users = np.arange(start, stop, dtype=np.int64)
        with torch.no_grad():
            user_emb = torch.nn.functional.normalize(
                model.user_tower(torch.from_numpy(user_features[users])), p=2.0, dim=-1
            ).numpy()
        scores = 10.0 * (user_emb @ item_emb.T) + bias[None, :]
        centres = scores.mean(axis=1)
        for offset, user in enumerate(users):
            row = scores[offset]
            centre = float(centres[offset])
            seen = train_items[int(user)]
            held = test_items[int(user)]
            if seen.size:
                member_raw.extend(float(v) for v in row[seen])
                member_centred.extend(float(v) - centre for v in row[seen])
            if held.size:
                nonmember_raw.extend(float(v) for v in row[held])
                nonmember_centred.extend(float(v) - centre for v in row[held])

    return {
        "raw_score": attack_summary(
            np.array(member_raw, dtype=np.float64), np.array(nonmember_raw, dtype=np.float64)
        ),
        "user_centred_score": attack_summary(
            np.array(member_centred, dtype=np.float64),
            np.array(nonmember_centred, dtype=np.float64),
        ),
    }


def run_inversion(
    item_features: np.ndarray,
    user_features: np.ndarray,
    train_items: list[np.ndarray],
    n_items: int,
    n_users: int,
    clip_norm: float,
    n_sample: int,
) -> dict[str, Any]:
    """Recover client input direction from single updates at several noise levels."""
    torch.set_num_threads(2)
    torch.manual_seed(0)
    model = TwoTower(item_features.shape[1], n_items)
    base = get_flat(model)
    rng = np.random.default_rng(0)
    chosen = rng.choice(n_users, size=min(n_sample, n_users), replace=False)
    dim_in = int(item_features.shape[1])
    results: dict[str, Any] = {}

    for noise in INVERSION_NOISE:
        cosines: list[float] = []
        recovery: list[float] = []
        for user in chosen:
            delta = client_update(
                model,
                base,
                user_features[int(user)],
                item_features,
                train_items[int(user)],
                rng,
                n_items,
                1,
                2.0,
                clip_norm,
            )
            if noise > 0.0:
                delta = delta + rng.normal(0.0, noise * clip_norm, size=delta.shape).astype(
                    np.float32
                )
            block = first_layer_block(delta, HIDDEN_DIM, dim_in)
            direction = recover_direction(block)
            cosines.append(absolute_cosine(direction, user_features[int(user)]))
            recovery.append(
                topk_item_recovery(direction, item_features, train_items[int(user)], 10)
            )
        results[str(noise)] = {
            "users": len(cosines),
            "mean_absolute_cosine": float(np.mean(cosines)),
            "median_absolute_cosine": float(np.median(cosines)),
            "mean_top10_item_recovery": float(np.nanmean(recovery)),
        }
        print(
            f"  noise z={noise}: cosine={np.mean(cosines):.4f} recovery={np.nanmean(recovery):.4f}",
            flush=True,
        )
    return results


def main(argv: list[str] | None = None) -> int:
    """Evaluate every checkpoint and write aggregate-only attack records."""
    parser = argparse.ArgumentParser(description="Membership inference and inversion.")
    parser.add_argument("--skip-inversion", action="store_true")
    parser.add_argument("--inversion-users", type=int, default=INVERSION_USERS)
    parser.add_argument("--limit", type=int, default=None, help="cap checkpoints for a smoke run")
    args = parser.parse_args(argv)

    torch.set_num_threads(2)
    card = json.loads(DATASET_CARD.read_text(encoding="utf-8"))
    n_users, n_items = int(card["users"]), int(card["items"])
    data = np.load(PROCESSED / "features_semantic.npz")
    item_features, user_features = data["items"], data["users"]
    train_items = user_item_lists(load_split("train", PROCESSED), n_users)
    test_items = user_item_lists(load_split("test", PROCESSED), n_users)

    checkpoints = sorted(PROCESSED.glob("model_*.npz"))
    if args.limit is not None:
        checkpoints = checkpoints[: int(args.limit)]
    if not checkpoints:
        print("ERROR: no checkpoints found in data/processed")
        return 1

    print(f"Membership inference over {len(checkpoints)} checkpoints ...", flush=True)
    membership: dict[str, Any] = {}
    for index, path in enumerate(checkpoints, start=1):
        run_id = path.stem.removeprefix("model_")
        flat = np.load(path)["flat"]
        membership[run_id] = membership_for_checkpoint(
            flat, item_features, user_features, train_items, test_items, n_items
        )
        if index % 20 == 0:
            print(f"  {index}/{len(checkpoints)} done", flush=True)

    MI_OUT.write_text(
        json.dumps(
            {
                "scope": "interaction-level membership inference",
                "statistic": "model score, raw and user-centred",
                "results": membership,
            },
            indent=2,
            sort_keys=True,
        )
        + "\n",
        encoding="utf-8",
        newline="\n",
    )
    print("Written " + str(MI_OUT))

    if not args.skip_inversion:
        clip = json.loads(Path("results/clip_calibration.json").read_text(encoding="utf-8"))
        print("\nAnalytic first-layer inversion ...", flush=True)
        inversion = run_inversion(
            item_features,
            user_features,
            train_items,
            n_items,
            n_users,
            float(clip["clip_norm"]),
            int(args.inversion_users),
        )
        INV_OUT.write_text(
            json.dumps(
                {
                    "scope": "single-client update, non-SecAgg+ threat model",
                    "clip_norm": float(clip["clip_norm"]),
                    "results": inversion,
                },
                indent=2,
                sort_keys=True,
            )
            + "\n",
            encoding="utf-8",
            newline="\n",
        )
        print("Written " + str(INV_OUT))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
