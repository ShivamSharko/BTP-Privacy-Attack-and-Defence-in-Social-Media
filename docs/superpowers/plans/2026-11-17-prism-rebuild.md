# PRISM-Rec Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development for the
> S-tasks, superpowers:test-driven-development for every task. Steps use checkbox syntax.

**Goal:** Turn the step 0-10 research scripts into one tested `prism` package and CLI that answers
RQ1 to RQ6 on a model that actually personalises, by 23:30 on 17 November 2026.

**Architecture:** One round loop (sample, update, clip, optional mask, aggregate, noise, step,
account, receipt) with client behaviour and aggregator as plug-ins. Data layer kept. Ledger and
secure sum are independent modules.

**Tech stack:** Python 3.12, PyTorch CPU (`torch.func`), NumPy, SciPy, Opacus, dp-accounting,
cryptography, rfc8785, pydantic, pytest, hypothesis, ruff, mypy strict, uv.

**Spec:** `docs/superpowers/specs/2026-11-17-prism-rebuild-design.md`

## Global Constraints

- Tests are written first and seen to fail before the code is written.
- No test reads anything under `data/`. Tests use `prism.data.synthetic` or hand-built arrays.
- mypy strict and ruff clean on every file touched. Line length 100. Public functions typed and
  documented in one line.
- No user IDs, business IDs or review text in any log, receipt, result or test fixture.
- Cryptography only through the `cryptography` package. No hand-written primitives.
- Sub-agents: create or modify only the files listed in your task. Do not edit `pyproject.toml`,
  `uv.lock` or `.gitignore`. Do not run `git add`, `git commit` or any state-changing git command.
  Do not run `uv add` or `uv sync`. Run tools as `uv run --no-sync ...` with
  `-p no:cacheprovider` for pytest. Scratch files go in `_workspace/scratch/` only.
- Sources for anything looked up: standards, official docs, vendor engineering write-ups,
  repositories. Never conference or journal papers.

## Review Focus

1. A NaN or infinite client update must not reach the sum (clip guard, counted, tested in M3).
2. An empty Poisson cohort must still count as a round for the accountant (M3).
3. An interrupted write must never leave a file that later code treats as complete (M1).
4. A user whose whole history is hidden or whose targets are all already seen (M2, S4).
5. A ledger file edited by hand, truncated, or with lines reordered (S1).

---

## S-tasks (parallel sub-agents, independent files)

### Task S1: Ledger

**Files:** create `src/prism/ledger/__init__.py`, `merkle.py`, `receipts.py`, `log.py`, `gate.py`;
tests `tests/test_ledger_merkle.py`, `tests/test_ledger_log.py`, `tests/test_ledger_gate.py`.

**Produces:**

```python
# merkle.py  (RFC 6962 section 2.1 / RFC 9162 section 2.1, SHA-256)
def leaf_hash(data: bytes) -> bytes                      # SHA-256(0x00 || data)
def node_hash(left: bytes, right: bytes) -> bytes        # SHA-256(0x01 || left || right)
def merkle_root(leaves: Sequence[bytes]) -> bytes        # leaves are raw entries; empty -> SHA-256(b"")
def inclusion_proof(index: int, leaves: Sequence[bytes]) -> list[bytes]
def verify_inclusion(leaf: bytes, index: int, tree_size: int, proof: Sequence[bytes], root: bytes) -> bool
def consistency_proof(old_size: int, leaves: Sequence[bytes]) -> list[bytes]
def verify_consistency(old_size: int, new_size: int, old_root: bytes, new_root: bytes, proof: Sequence[bytes]) -> bool

# receipts.py
def canonical_bytes(obj: Mapping[str, Any]) -> bytes     # RFC 8785 via rfc8785; NaN/inf -> ValueError
def generate_key() -> Ed25519PrivateKey
def load_or_create_key(path: Path) -> Ed25519PrivateKey  # PEM PKCS8, unencrypted, creates parents
def public_key_hex(key: Ed25519PrivateKey) -> str
def sign(key: Ed25519PrivateKey, payload: bytes) -> str  # hex signature
def verify(public_hex: str, payload: bytes, signature_hex: str) -> bool  # never raises

# log.py
class Ledger:
    def __init__(self, path: Path, key: Ed25519PrivateKey, origin: str) -> None  # opens or creates JSONL
    size: int                                            # property, number of leaves
    def append(self, receipt: Mapping[str, Any]) -> int  # returns leaf index; leaf data = canonical_bytes(receipt)
    def root(self) -> bytes
    def checkpoint(self) -> dict[str, Any]               # appends and returns the signed checkpoint line
    def leaves(self) -> list[dict[str, Any]]             # receipts in order
@dataclass(frozen=True)
class VerifyReport: ok: bool; size: int; checkpoints: int; errors: tuple[str, ...]
def verify_ledger(path: Path, public_hex: str) -> VerifyReport
def prove_inclusion(path: Path, index: int) -> dict[str, Any]   # leaf, index, size, proof (hex), root (hex)

# gate.py
@dataclass(frozen=True)
class Budget: epsilon: float; delta: float
class ReleaseRefused(Exception): ...
class ReleaseGate:
    def __init__(self, ledger: Ledger, budget: Budget, lineage: str) -> None
    def authorise_round(self, round_index: int, epsilon_after: float) -> bool
    def record_round(self, round_index: int, fields: Mapping[str, Any]) -> int
    def release(self, epsilon_spent: float, rounds_completed: int, fields: Mapping[str, Any]) -> dict[str, Any]
```

File format: one JSON object per line. Leaf line `{"type":"leaf","index":i,"receipt":{...}}`.
Checkpoint line `{"type":"checkpoint","origin":s,"size":n,"root_hex":h,"signature_hex":g}`, where
the signature covers the UTF-8 note `f"{origin}\n{size}\n{base64(root)}\n"` (C2SP tlog-checkpoint
body). Each line is written with a single `write` call followed by flush and `os.fsync`.

Gate semantics: `authorise_round` returns False and appends `{"kind":"refusal","lineage","round",
"epsilon_after","budget_epsilon","reason"}` when `epsilon_after > budget.epsilon * (1 + 1e-9)`;
otherwise True and appends nothing. `record_round` appends `{"kind":"round","lineage","round",
**fields}`. `release` raises `ReleaseRefused` (after appending a refusal receipt) if
`epsilon_spent` exceeds the budget, or the lineage's round receipts are not exactly rounds
1..`rounds_completed`; otherwise appends `{"kind":"release","lineage","epsilon_spent",
"rounds_completed",**fields}`, then a checkpoint, and returns the checkpoint.

- [ ] Known-answer tests: empty root is SHA-256(b""); the RFC 6962 reference vectors (fetch the
  eight test leaves and their roots, inclusion and consistency proofs from the
  certificate-transparency-go or transparency-dev/merkle repository test data; record the URL in
  the test docstring). If they cannot be fetched, say so in your report and use hand-computed
  2- and 3-leaf trees instead.
- [ ] Property tests (hypothesis): every index of every tree size 1..64 has a verifying inclusion
  proof; every 1 <= m <= n <= 64 has a verifying consistency proof; a proof fails against a wrong
  leaf, index, size or root.
- [ ] Tamper tests: flipping any single byte of any line, deleting a line, swapping two lines, or
  truncating the file makes `verify_ledger` return `ok=False` (or, for truncation after a
  checkpoint, a smaller verified size that the test asserts explicitly).
- [ ] Gate tests: over-budget round refused and logged; release refused when a round receipt is
  missing; successful release ends with a verifying checkpoint.

### Task S2: Secure sum simulation

**Files:** create `src/prism/fl/__init__.py` (empty docstring only), `src/prism/fl/secagg.py`;
test `tests/test_secagg.py`.

**Produces:**

```python
@dataclass(frozen=True)
class FixedPoint:
    clip_norm: float
    scale_bits: int = 32
    def encode(self, values: NDArray[np.floating]) -> NDArray[np.uint64]   # round(v * 2**bits / clip); |v| > clip*(1+1e-6) -> ValueError
    def decode_sum(self, total: NDArray[np.uint64]) -> NDArray[np.float64] # two's-complement signed, times clip / 2**bits
@dataclass(frozen=True)
class MaskedUpdate: client_id: int; payload: NDArray[np.uint64]
class SecAggClient:
    def __init__(self, client_id: int) -> None            # fresh X25519 key pair
    public_bytes: bytes                                   # property, raw 32 bytes
    def masked_update(self, update: NDArray[np.floating], peers: Mapping[int, bytes], round_id: int, codec: FixedPoint) -> MaskedUpdate
    def reveal_seed(self, peer_id: int, peer_public: bytes, round_id: int) -> bytes
class SecAggServer:                                       # has no method that accepts a plaintext update
    def __init__(self, codec: FixedPoint, round_id: int, length: int) -> None
    def receive(self, masked: MaskedUpdate) -> None
    def unmask(self, revealed: Mapping[tuple[int, int], bytes]) -> NDArray[np.float64]  # key (survivor, dropped)
@dataclass(frozen=True)
class SecureSumResult: total: NDArray[np.float64]; bytes_per_client: int; seconds: float; survivors: int
def secure_sum(updates: NDArray[np.floating], clip_norm: float, round_id: int, dropped: Sequence[int] = ()) -> SecureSumResult
```

Pairwise seed: `HKDF-SHA256(X25519(sk_i, pk_j), length=32, info=f"prism-secagg|{round_id}|{min(i,j)}|{max(i,j)}".encode())`.
Mask stream: ChaCha20 keystream from `cryptography` (key = seed, zero nonce), read as
little-endian uint64. Client i adds the mask for j when i < j and subtracts it when i > j, all
arithmetic modulo 2**64. `dropped` clients take part in key exchange but send nothing; each
survivor reveals its seed with each dropped client and the server removes those masks.
More than 2**20 clients -> ValueError.

- [ ] Property test: for 2..8 clients, 1..64 coordinates, any dropout subset leaving at least 2
  survivors, `secure_sum` equals the plaintext sum of survivors within `K * clip * 2**-32`.
- [ ] A single masked payload (cohort of 3, 20,000 coordinates): Kolmogorov-Smirnov p > 0.001
  against uniform on [0, 2**64), and absolute Pearson correlation with the plaintext below 0.05.
- [ ] The server's sum without `unmask` of a dropout differs from the true sum (masks really are
  needed); `inspect` shows `SecAggServer` has no plaintext-accepting method.
- [ ] Encode guard and client-count guard raise.

### Task S3: Data bundle and synthetic dataset

**Files:** create `src/prism/data/bundle.py`, `src/prism/data/synthetic.py`;
tests `tests/test_bundle.py`, `tests/test_synthetic.py`. Read `src/prism/data/dataset.py`,
`splits.py`, `features.py` and `scripts/build_dataset.py`, `scripts/build_features.py` for the
on-disk format (do not read `data/`).

**Produces:**

```python
Phase = Literal["tune", "final"]
@dataclass(frozen=True)
class DataBundle:
    n_users: int; n_items: int
    train: tuple[NDArray[np.int64], ...]; val: tuple[NDArray[np.int64], ...]; test: tuple[NDArray[np.int64], ...]
    item_content: NDArray[np.float32]                      # (n_items, content_dim), rows L2-normalised
    def history(self, phase: Phase) -> tuple[NDArray[np.int64], ...]   # tune: train; final: sorted unique train+val
    def targets(self, phase: Phase) -> tuple[NDArray[np.int64], ...]   # tune: val; final: test
    def history_matrix(self, phase: Phase, users: NDArray[np.int64] | None = None) -> NDArray[np.float32]  # dense 0/1 rows
    def popularity(self, phase: Phase) -> NDArray[np.int64]            # distinct users per item in history(phase)
def load_bundle(processed: Path, variant: str = "semantic") -> DataBundle
def write_synthetic_dataset(out_dir: Path, n_users: int = 400, n_items: int = 300, content_dim: int = 32, n_clusters: int = 8, seed: int = 0) -> DataBundle
```

`load_bundle` reads `dataset_{train,val,test}.csv.gz` (columns `user_idx`, `item_idx`; others
ignored) and `features_{variant}.npz` (`items`, `users`); n_items and n_users come from those two
array shapes. It raises ValueError on an index out of range or a user with no train item.
`write_synthetic_dataset` writes exactly those files (CSV columns `user_idx,item_idx,rating,
timestamp,split`) and returns the bundle `load_bundle` would return. Generator: users and items
belong to latent clusters, item popularity is Zipf-skewed, each user has 15 to 60 interactions,
about 80% inside their own cluster; per-user chronological 70/10/20 split; item content is the
cluster centroid plus noise.

- [ ] Round trip: `load_bundle(out_dir)` equals the returned bundle; same seed gives identical arrays.
- [ ] No leakage: train, val, test disjoint per user; `history("final")` is train plus val.
- [ ] Learnable: with the existing `prism.eval.baselines`, ItemKNN NDCG@10 on validation is at
  least 1.5 times MostPopular's on the default synthetic dataset.
- [ ] Error paths of `load_bundle`.

### Task S4: Evaluation refactor and statistics

**Files:** modify `src/prism/eval/metrics.py`, `src/prism/eval/baselines.py`,
`scripts/summarize_results.py` (imports only); create `src/prism/eval/stats.py`;
tests `tests/test_metrics.py` (extend), `tests/test_baselines.py` (extend), `tests/test_stats.py`.

**Produces:**

```python
# metrics.py
def ranking_metrics(score_fn, seen_items, target_items, n_items, batch_users=1024) -> dict[str, float]
def ranking_metrics_per_user(score_fn, seen_items, target_items, n_items, batch_users=1024) -> tuple[dict[str, float], NDArray[np.float64]]
```

Behaviour changes, each with a test written first: ties are broken deterministically by lower item
index, and MRR uses the same order; a target that is also in `seen_items` is dropped from that
user's targets, and a user left with none is skipped; works for `n_items < 20`; adds key
`"distinct@10"` (number of distinct items in all top-10 lists) and keeps every existing key. The
per-user variant also returns NDCG@10 per user with NaN for skipped users. Vectorise where it does
not change results.

```python
# baselines.py (add; build the user-item matrix once per call)
def ease_score_fn(train_items, n_items, l2: float = 500.0) -> ScoreFn   # closed-form item-item ridge, zero diagonal
# stats.py (move bootstrap_ci, holm_adjust, paired_tests here unchanged; the script imports them)
def retention(private: float, non_private: float) -> float
def personalisation_retained(private: float, non_private: float, popularity: float) -> float  # NaN if non_private <= popularity
def clopper_pearson(successes: int, trials: int, alpha: float = 0.05) -> tuple[float, float]  # two one-sided bounds
def epsilon_lower_bound(true_pos: int, positives: int, false_pos: int, negatives: int, delta: float, alpha: float = 0.05) -> float
```

`epsilon_lower_bound` = max(0, ln((TPR_low − delta) / FPR_high)) with one-sided Clopper-Pearson
bounds at level alpha; 0.0 when TPR_low <= delta; FPR_high is never taken below 1/negatives.

- [ ] All existing tests in `tests/` still pass, or are updated with a one-line reason where they
  encoded the old tie rule.

### Task S5: Literature review (research and writing, no code)

**Files:** create `docs/literature-review.md`. Brief is in the dispatch prompt.

---

## M-tasks (main session, in order)

### Task M1: seeding, I/O, config
`src/prism/seeding.py` (`streams(seed, names) -> dict[str, np.random.Generator]` via
`SeedSequence.spawn`, plus `torch_generator`), `src/prism/io.py` (`atomic_write_json`,
`atomic_write_npz`, `read_json`; write to a temp file in the same directory, fsync, `os.replace`),
`src/prism/config.py` (frozen pydantic `ModelConfig`, `TrainConfig`, `RunConfig`, `config_hash`).

### Task M2: model
`src/prism/models/hybrid.py`: `Layout` by parameter name, `init_params`, `user_loss`,
`score_matrix`. Tests: layout round trip, loss decreases under SGD on synthetic data, a user with
an empty visible set or empty target set gives a finite loss and zero gradient contribution.

### Task M3: federated engine
`src/prism/fl/sampling.py`, `client.py`, `aggregate.py`, `server.py`. Tests first: sensitivity
property (one user changes the clipped sum by at most C), noise scale and divisor (statistical),
Poisson rate, empty cohort still counted, NaN update zeroed and counted, determinism (same seed,
same final parameter hash), independent streams (changing the noise seed does not change cohorts).

### Task M4: accounting
`src/prism/privacy/accounting.py`: `epsilon_report(q, z, rounds, n) -> EpsilonReport` with PRV,
RDP, PLD, the value of record, ε at δ = 1/n², ε without amplification, and `gate_ok`.
`max_rounds_within(budget, q, z, n, planned)`. Known answer: q = 0.01, z = 0.534, T = 400,
n = 9,913 gives PRV 7.771 and PLD 7.761 (measured on this PC, 17 Nov 2026), RDP 9.27.

### Task M5: experiments and CLI
`src/prism/experiments/runner.py` (one run: train, evaluate, account, ledger, record),
`tuning.py`, `grid.py` (resumable, parallel, failures recorded), `src/prism/cli.py`,
`[project.scripts] prism = "prism.cli:main"`. Then tune on validation, freeze, amend the
pre-registration, launch the RQ1 grid.

### Task M6: attacks and defences
`src/prism/attacks/inversion.py`, `membership.py`, `poisoning.py`, `controls.py`; robust
aggregators in `fl/aggregate.py`. Definitions are in spec section 3.6.

### Task M7: gossip and availability
`src/prism/fl/gossip.py`; availability scenarios in `fl/sampling.py`.

### Task M8: report, documents, verification
`src/prism/report/build.py` (sub-agent once the run-record schema is frozen), roadmap v2.0.0,
pre-registration amendment, implementation log, viva notes, README, final review.
