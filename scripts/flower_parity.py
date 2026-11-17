"""Flower parity check: the in-process federated engine versus the Flower framework.

Claim tested: one federated training run executed through Flower (message-based API,
simulation runtime) equals an in-process reference built from the same prism building
blocks (client update, clipping, aggregation rule), up to floating-point order.

Both sides use the same fixed cohorts (precomputed with the engine's own sampling stream)
and the same per-client visible/hidden split, derived from (seed, round, client id). The
Flower strategy selects exactly those clients, clips and sums their updates on the server,
divides by the expected cohort size and takes an SGD step.

Not part of the package or its tests. Never imported by ``prism``.

How to create the environment (separate from the project environment; Windows, no WSL):

    uv venv _workspace/flower-env --python 3.12
    uv pip install --python _workspace/flower-env/Scripts/python.exe torch \\
        --index-url https://download.pytorch.org/whl/cpu
    uv pip install --python _workspace/flower-env/Scripts/python.exe \\
        numpy scipy pandas pydantic rfc8785 "flwr[simulation]"

How to run (from the repository root; ``src`` is added to the path by this script):

    _workspace/flower-env/Scripts/python.exe scripts/flower_parity.py

The script writes ``results/flower_parity.json``. It exits with a message if ``flwr`` is not
installed, and records status NOT_RUN if the Flower simulation cannot start.
"""

from __future__ import annotations

import argparse
import os
import platform
import sys
import tempfile
import time
import traceback
from dataclasses import dataclass
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
_SRC = str(ROOT / "src")
if _SRC not in sys.path:
    sys.path.insert(0, _SRC)
# Ray worker processes inherit the environment, so they can import prism too.
os.environ["PYTHONPATH"] = _SRC + os.pathsep + os.environ.get("PYTHONPATH", "")
os.environ.setdefault("OMP_NUM_THREADS", "1")
os.environ.setdefault("RAY_DEDUP_LOGS", "0")

import numpy as np  # noqa: E402
import numpy.typing as npt  # noqa: E402
import torch  # noqa: E402

from prism.config import ModelConfig, Phase, TrainConfig  # noqa: E402
from prism.data.bundle import DataBundle, load_bundle  # noqa: E402
from prism.data.synthetic import write_synthetic_dataset  # noqa: E402
from prism.fl.aggregate import clip_rows, noisy_mean  # noqa: E402
from prism.fl.client import make_delta_fn, split_history  # noqa: E402
from prism.fl.sampling import expected_cohort, poisson_cohort  # noqa: E402
from prism.fl.server import _ServerOptimiser  # noqa: E402
from prism.io import atomic_write_json  # noqa: E402
from prism.models.hybrid import Layout, content_base, init_flat, make_layout  # noqa: E402
from prism.seeding import stream  # noqa: E402

FloatArray = npt.NDArray[np.float32]

SEED = 7
N_USERS = 400
DIM = 8
ROUNDS = 5
SAMPLE_RATE = 0.1
SERVER_LR = 1.0
CLIP_NORM = 0.5
NOISE_MULTIPLIER = 1.0
RTOL = 1.0e-5
ATOL = 1.0e-6
PHASE: Phase = "final"


@dataclass(frozen=True)
class Problem:
    """Everything both implementations share."""

    processed: str
    model: ModelConfig
    train: TrainConfig
    seed: int
    cohorts: tuple[npt.NDArray[np.int64], ...]
    expected: float
    init: FloatArray
    noise_multiplier: float


def client_generator(seed: int, round_index: int, client: int) -> torch.Generator:
    """Torch generator that is a function of (seed, round, client id) only."""
    state = np.random.SeedSequence(entropy=seed, spawn_key=(round_index, client))
    generator = torch.Generator()
    generator.manual_seed(int(state.generate_state(1, dtype=np.uint64)[0] >> 2))
    return generator


class ClientKit:
    """Client-side computation for one dataset: the shared 'client update' building block."""

    def __init__(self, problem: Problem) -> None:
        self.problem = problem
        self.bundle: DataBundle = load_bundle(Path(problem.processed))
        self.layout: Layout = make_layout(self.bundle.n_items, problem.model.dim)
        base = content_base(self.bundle.item_content, problem.model)
        self.delta_fn = make_delta_fn(
            self.layout,
            base,
            problem.model,
            problem.train.local_steps,
            problem.train.local_lr,
        )

    def update(self, flat: torch.Tensor, round_index: int, client: int) -> torch.Tensor:
        """Single-step update of one client from the global parameters and its own history."""
        users = np.array([client], dtype=np.int64)
        rows = torch.from_numpy(self.bundle.history_matrix(PHASE, users))
        visible, target = split_history(
            rows,
            self.problem.train.local_steps,
            self.problem.train.hide_fraction,
            client_generator(self.problem.seed, round_index, client),
        )
        row: torch.Tensor = self.delta_fn(flat, visible, target)[0]
        return row


def make_problem(tmp_dir: Path, noise_multiplier: float) -> Problem:
    """Build the synthetic dataset, the configs, the fixed cohorts and the initial model."""
    processed = tmp_dir / "processed"
    write_synthetic_dataset(processed, n_users=N_USERS)
    bundle = load_bundle(processed)
    model = ModelConfig(dim=DIM)
    train = TrainConfig(
        sample_rate=SAMPLE_RATE,
        rounds=ROUNDS,
        server_lr=SERVER_LR,
        server_opt="sgd",
        momentum=0.0,
        clip_norm=CLIP_NORM,
        noise_multiplier=noise_multiplier,
    )
    users = np.arange(bundle.n_users, dtype=np.int64)
    sampling = stream(SEED, "sampling")
    cohorts = tuple(poisson_cohort(sampling, users, SAMPLE_RATE) for _ in range(ROUNDS))
    layout = make_layout(bundle.n_items, DIM)
    init = init_flat(layout, model, stream(SEED, "init")).numpy().astype(np.float32)
    return Problem(
        processed=str(processed),
        model=model,
        train=train,
        seed=SEED,
        cohorts=cohorts,
        expected=expected_cohort(users.size, SAMPLE_RATE),
        init=init,
        noise_multiplier=noise_multiplier,
    )


def reference_run(problem: Problem) -> list[FloatArray]:
    """In-process reference: the round loop of ``train`` with the per-client split rule."""
    kit = ClientKit(problem)
    clip = problem.train.clip_norm
    assert clip is not None
    noise_rng = stream(problem.seed, "noise")
    flat = torch.from_numpy(problem.init.copy())
    history: list[FloatArray] = []
    for round_index, cohort in enumerate(problem.cohorts, start=1):
        deltas = torch.stack([kit.update(flat, round_index, int(c)) for c in cohort])
        total = clip_rows(deltas, clip).clipped.sum(dim=0).to(torch.float64)
        noise = noise_rng.normal(0.0, problem.noise_multiplier * clip, size=total.shape[0])
        if problem.noise_multiplier > 0.0:
            total = total + torch.from_numpy(noise)
        mean = total / max(problem.expected, 1.0)
        flat = (flat.to(torch.float64) + problem.train.server_lr * mean).to(torch.float32)
        history.append(flat.numpy().copy())
    return history


def check_engine_step(problem: Problem) -> dict[str, Any]:
    """Unit check: the reference's aggregation step equals noisy_mean + the engine's SGD step."""
    clip = problem.train.clip_norm
    assert clip is not None
    generator = torch.Generator().manual_seed(123)
    size = int(problem.init.size)
    deltas = torch.randn(37, size, generator=generator)
    flat = torch.from_numpy(problem.init.copy())
    out: dict[str, Any] = {}
    for z in (0.0, NOISE_MULTIPLIER):
        total = clip_rows(deltas, clip).clipped.sum(dim=0).to(torch.float64)
        rng = stream(5, "noise")
        mean = noisy_mean(total, problem.expected, z, clip, rng)
        engine = _ServerOptimiser(problem.train, size).step(flat, mean)
        rng = stream(5, "noise")
        noise = rng.normal(0.0, z * clip, size=size)
        own = total + torch.from_numpy(noise) if z > 0.0 else total
        mine = (
            flat.to(torch.float64) + problem.train.server_lr * (own / max(problem.expected, 1.0))
        ).to(torch.float32)
        out[f"noise_multiplier_{z:g}"] = {
            "max_abs_diff": float((engine - mine).abs().max()),
            "identical": bool(torch.equal(engine, mine)),
        }
    return out


def run_flower(problem: Problem) -> tuple[list[FloatArray], dict[str, Any]]:
    """Run the same training through Flower's simulation runtime; return per-round models."""
    from flwr.app import (  # type: ignore[import-not-found]
        Array,
        ArrayRecord,
        ConfigRecord,
        Context,
        Message,
        MessageType,
        MetricRecord,
        RecordDict,
    )
    from flwr.clientapp import ClientApp  # type: ignore[import-not-found]
    from flwr.serverapp import Grid, ServerApp  # type: ignore[import-not-found]
    from flwr.serverapp.strategy import Strategy  # type: ignore[import-not-found]
    from flwr.serverapp.strategy.strategy_utils import (  # type: ignore[import-not-found]
        send_and_receive,
    )
    from flwr.simulation import run_simulation  # type: ignore[import-not-found]

    clip = CLIP_NORM
    models: list[FloatArray] = []
    info: dict[str, Any] = {"selected": [], "unmapped_nodes": 0}

    class ParityStrategy(Strategy):  # type: ignore[misc]
        """Fixed-cohort selection, server-side clipping, sum, expected-size mean, SGD step."""

        def __init__(self) -> None:
            self.node_of_client: dict[int, int] = {}
            self.noise_rng = stream(problem.seed, "noise")

        def summary(self) -> None:
            print("ParityStrategy: fixed cohorts, clip, sum / expected cohort, SGD step")

        def _discover(self, grid: Any) -> None:
            nodes = list(grid.get_node_ids())
            queries = [
                Message(content=RecordDict(), message_type=MessageType.QUERY, dst_node_id=n)
                for n in nodes
            ]
            for reply in send_and_receive(grid, queries, timeout=600):
                if reply.has_error():
                    raise RuntimeError(f"query failed: {reply.error.reason}")
                metrics = next(iter(reply.content.metric_records.values()))
                self.node_of_client[int(metrics["partition-id"])] = reply.metadata.src_node_id
            if sorted(self.node_of_client) != list(range(N_USERS)):
                raise RuntimeError("partition ids are not 0..n-1")

        def configure_train(self, server_round: int, arrays: Any, config: Any, grid: Any) -> Any:
            if not self.node_of_client:
                self._discover(grid)
            cohort = [int(c) for c in problem.cohorts[server_round - 1]]
            info["selected"].append(len(cohort))
            content = RecordDict(
                {
                    "arrays": arrays,
                    "config": ConfigRecord({"server-round": server_round}),
                }
            )
            return [
                Message(
                    content=content,
                    message_type=MessageType.TRAIN,
                    dst_node_id=self.node_of_client[c],
                )
                for c in cohort
            ]

        def aggregate_train(self, server_round: int, replies: Any) -> Any:
            rows: list[tuple[int, torch.Tensor]] = []
            flat = torch.from_numpy(models[-1].copy() if models else problem.init.copy())
            for reply in replies:
                if reply.has_error():
                    raise RuntimeError(f"client failed: {reply.error.reason}")
                record = reply.content
                client = int(next(iter(record.metric_records.values()))["client-id"])
                delta = next(iter(record.array_records.values()))["delta"].numpy()
                rows.append((client, torch.from_numpy(delta)))
            rows.sort(key=lambda item: item[0])
            if len(rows) != len(problem.cohorts[server_round - 1]):
                raise RuntimeError("did not receive exactly the selected clients' updates")
            if rows:
                stacked = torch.stack([row for _, row in rows])
                total = clip_rows(stacked, clip).clipped.sum(dim=0).to(torch.float64)
            else:
                total = torch.zeros(flat.shape[0], dtype=torch.float64)
            if problem.noise_multiplier > 0.0:
                noise = self.noise_rng.normal(
                    0.0, problem.noise_multiplier * clip, size=total.shape[0]
                )
                total = total + torch.from_numpy(noise)
            mean = total / max(problem.expected, 1.0)
            new = (flat.to(torch.float64) + problem.train.server_lr * mean).to(torch.float32)
            models.append(new.numpy().copy())
            return ArrayRecord({"flat": Array(new.numpy().copy())}), MetricRecord({})

        def configure_evaluate(self, server_round: int, arrays: Any, config: Any, grid: Any) -> Any:
            return []

        def aggregate_evaluate(self, server_round: int, replies: Any) -> Any:
            return None

    server = ServerApp()

    @server.main()  # type: ignore[untyped-decorator]
    def main(grid: Grid, context: Context) -> None:
        strategy = ParityStrategy()
        strategy.start(
            grid=grid,
            initial_arrays=ArrayRecord({"flat": Array(problem.init.copy())}),
            num_rounds=ROUNDS,
        )

    client = ClientApp()
    kits: dict[str, ClientKit] = {}

    def kit_for_process() -> ClientKit:
        if "kit" not in kits:
            torch.set_num_threads(1)
            kits["kit"] = ClientKit(problem)
        return kits["kit"]

    @client.query()  # type: ignore[untyped-decorator]
    def query(message: Message, context: Context) -> Message:
        pid = int(context.node_config["partition-id"])
        reply = RecordDict({"m": MetricRecord({"partition-id": pid})})
        return Message(content=reply, reply_to=message)

    @client.train()  # type: ignore[untyped-decorator]
    def train(message: Message, context: Context) -> Message:
        pid = int(context.node_config["partition-id"])
        round_index = int(message.content.config_records["config"]["server-round"])
        flat = torch.from_numpy(message.content.array_records["arrays"]["flat"].numpy().copy())
        delta = kit_for_process().update(flat, round_index, pid)
        reply = RecordDict(
            {
                "arrays": ArrayRecord({"delta": Array(delta.numpy().copy())}),
                "metrics": MetricRecord({"client-id": pid, "num-examples": 1}),
            }
        )
        return Message(content=reply, reply_to=message)

    run_simulation(
        server_app=server,
        client_app=client,
        num_supernodes=N_USERS,
        backend_name="ray",
        backend_config={
            "client_resources": {"num_cpus": 1, "num_gpus": 0.0},
            "init_args": {"num_cpus": 2, "include_dashboard": False},
        },
    )
    return models, info


def compare(reference: list[FloatArray], flower: list[FloatArray]) -> dict[str, Any]:
    """Per-round and final differences between two model histories."""
    per_round = []
    for index, (a, b) in enumerate(zip(reference, flower, strict=True), start=1):
        diff = np.abs(a.astype(np.float64) - b.astype(np.float64))
        scale = float(np.linalg.norm(a.astype(np.float64)))
        per_round.append(
            {
                "round": index,
                "max_abs_diff": float(diff.max()),
                "relative_l2_diff": float(np.linalg.norm(diff) / max(scale, 1e-30)),
                "allclose": bool(np.allclose(a, b, rtol=RTOL, atol=ATOL)),
                "bit_identical": bool(np.array_equal(a, b)),
            }
        )
    final = per_round[-1]
    return {
        "final": {key: final[key] for key in final if key != "round"},
        "per_round": per_round,
        "all_rounds_allclose": all(row["allclose"] for row in per_round),
    }


def run_variant(name: str, noise_multiplier: float, tmp_dir: Path) -> dict[str, Any]:
    """Reference and Flower run for one setting; returns the comparison."""
    problem = make_problem(tmp_dir, noise_multiplier)
    start = time.time()
    reference = reference_run(problem)
    reference_seconds = time.time() - start
    start = time.time()
    flower, info = run_flower(problem)
    flower_seconds = time.time() - start
    if len(flower) != ROUNDS:
        raise RuntimeError(f"Flower completed {len(flower)} of {ROUNDS} rounds")
    out = compare(reference, flower)
    out.update(
        {
            "variant": name,
            "noise_multiplier": noise_multiplier,
            "cohort_sizes": [int(c.size) for c in problem.cohorts],
            "clients_selected_by_flower": info["selected"],
            "reference_seconds": reference_seconds,
            "flower_seconds": flower_seconds,
        }
    )
    return out


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0] if __doc__ else "")
    parser.add_argument("--out", default=str(ROOT / "results" / "flower_parity.json"))
    parser.add_argument("--skip-noise", action="store_true", help="skip the Gaussian-noise variant")
    args = parser.parse_args(argv)
    try:
        import flwr  # type: ignore[import-not-found]
    except ImportError:
        print(
            "flwr is not installed in this environment. Create the separate environment described "
            "at the top of scripts/flower_parity.py and run the script with its Python.",
            file=sys.stderr,
        )
        return 2
    torch.set_num_threads(2)
    started = time.time()
    reasons: list[str] = []
    results: dict[str, Any] = {}
    status = "VALID"
    with tempfile.TemporaryDirectory() as tmp:
        problem = make_problem(Path(tmp) / "unit", 0.0)
        results["engine_step_check"] = check_engine_step(problem)
        for entry in results["engine_step_check"].values():
            if entry["max_abs_diff"] > ATOL:
                reasons.append("reference aggregation step differs from noisy_mean + engine SGD")
        variants = [("noise_free", 0.0)] + ([] if args.skip_noise else [("gaussian", 1.0)])
        for name, z in variants:
            try:
                results[name] = run_variant(name, z, Path(tmp) / name)
            except Exception as error:
                traceback.print_exc()
                reasons.append(f"Flower run '{name}' failed: {type(error).__name__}: {error}")
                results[name] = None
                if name == "noise_free":
                    status = "NOT_RUN"
                break
            if not results[name]["all_rounds_allclose"]:
                reasons.append(f"variant '{name}': Flower and reference differ beyond tolerance")
    if status != "NOT_RUN" and reasons:
        status = "INVALID"
    payload: dict[str, Any] = {
        "experiment": "flower_parity",
        "status": status,
        "invalid_reasons": reasons,
        "settings": {
            "flower_version": str(flwr.__version__),
            "python_version": platform.python_version(),
            "platform": platform.platform(),
            "flower_execution_mode": "simulation runtime (flwr.simulation.run_simulation, "
            "Ray backend, message-based Strategy/ServerApp/ClientApp API)",
            "clients": N_USERS,
            "rounds": ROUNDS,
            "sample_rate": SAMPLE_RATE,
            "expected_cohort": SAMPLE_RATE * N_USERS,
            "server_lr": SERVER_LR,
            "server_opt": "sgd",
            "momentum": 0.0,
            "clip_norm": CLIP_NORM,
            "noise_multiplier_in_noise_variant": NOISE_MULTIPLIER,
            "model_dim": DIM,
            "model_parameters": int(
                make_layout(300, DIM).total,
            ),
            "seed": SEED,
            "tolerance": {"rtol": RTOL, "atol": ATOL},
        },
        "results": results,
        "limitations": [
            "The problem is a small synthetic dataset (400 users, 300 items) and only five rounds.",
            "Server-side clipping and aggregation are implemented as a custom Flower strategy, "
            "not with Flower's built-in differential-privacy wrappers.",
            "Cohort selection and the client-side visible/hidden split are fixed to remove "
            "framework-controlled randomness, and the client update function is the same prism "
            "code on both sides, so the check covers the federated plumbing and the aggregation "
            "rule, not the client mathematics.",
            "The reference is not prism.fl.server.train itself, whose split uses one shared "
            "stream; its aggregation step is checked separately against noisy_mean and the "
            "engine's SGD step.",
            "The main experiments still use the in-process engine.",
        ],
        "wall_seconds": time.time() - started,
    }
    atomic_write_json(Path(args.out), payload)
    print(f"status: {status}")
    for name in ("noise_free", "gaussian"):
        block = results.get(name)
        if block:
            final = block["final"]
            print(
                f"{name}: max_abs={final['max_abs_diff']:.3e} rel_l2={final['relative_l2_diff']:.3e}"
                f" allclose={final['allclose']}"
            )
    for reason in reasons:
        print("reason:", reason)
    return 0 if status == "VALID" else 1


if __name__ == "__main__":
    raise SystemExit(main())
