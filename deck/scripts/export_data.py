"""Export project results, code excerpts and computed tables for the slide deck.

Run from anywhere: ``uv run python deck/scripts/export_data.py``.
Writes five strict-JSON files into ``deck/src/data/``.
"""

from __future__ import annotations

import ast
import json
import math
import re
import subprocess
import sys
from collections import Counter
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "deck" / "src" / "data"
SRC = ROOT / "src" / "prism"

RESULT_NAMES = [
    "baselines",
    "privacy_utility",
    "membership",
    "update_leakage",
    "poisoning",
    "free_riding",
    "gossip",
    "participation",
    "sensitivity",
    "ledger_audit",
    "social_graph",
    "dataset_card",
    "flower_parity",
    "calibration",
]
RATES = [0.05, 0.5]
ROUNDS = [10, 20, 40, 80, 160, 400]
NOISE = [0.5, 0.6, 0.7, 0.8, 0.92, 1.0, 1.2, 1.5, 2, 3, 4, 6, 8, 12]
USERS = 9913
MERKLE_COUNTS = [1, 2, 3, 5, 8, 13]


def finite(value: Any) -> Any:
    """Replace non-finite floats with None, recursively."""
    if isinstance(value, float) and not math.isfinite(value):
        return None
    if isinstance(value, dict):
        return {k: finite(v) for k, v in value.items()}
    if isinstance(value, list):
        return [finite(v) for v in value]
    return value


def write_json(name: str, data: Any) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    text = json.dumps(finite(data), ensure_ascii=False, sort_keys=True, allow_nan=False)
    (OUT / f"{name}.json").write_text(text + "\n", encoding="utf-8", newline="\n")
    print(f"wrote {name}.json ({len(text) / 1024:.0f} KiB)")


def export_results() -> dict[str, Any]:
    out: dict[str, Any] = {}
    for name in RESULT_NAMES:
        raw = json.loads((ROOT / "results" / f"{name}.json").read_text(encoding="utf-8"))
        if finite(raw) != raw:
            print(f"note: {name}.json contains non-finite values, stored as null")
        out[name] = raw
    return out


def export_code() -> dict[str, Any]:
    out: dict[str, Any] = {}
    for path in sorted(SRC.rglob("*.py")):
        rel = path.relative_to(SRC).as_posix()
        if rel == "report/build.py":
            continue
        text = path.read_text(encoding="utf-8")
        lines = text.splitlines()
        tree = ast.parse(text)

        def add(node: ast.AST, qualified: str, rel: str = rel, lines: list[str] = lines) -> None:
            start = min([node.lineno, *(d.lineno for d in node.decorator_list)])  # type: ignore[attr-defined]
            end = node.end_lineno  # type: ignore[attr-defined]
            out[f"{rel}::{qualified}"] = {
                "file": f"src/prism/{rel}",
                "name": qualified,
                "start": start,
                "end": end,
                "source": "\n".join(lines[start - 1 : end]),
            }

        for node in tree.body:
            if isinstance(node, ast.FunctionDef | ast.AsyncFunctionDef):
                add(node, node.name)
            elif isinstance(node, ast.ClassDef):
                add(node, node.name)
                for sub in node.body:
                    if isinstance(sub, ast.FunctionDef | ast.AsyncFunctionDef):
                        add(sub, f"{node.name}.{sub.name}")
    return out


def export_grid() -> dict[str, Any]:
    from prism.privacy.accounting import delta_for, pld_epsilon

    delta = delta_for(USERS)
    eps: list[list[list[float | None]]] = []
    for rate in RATES:
        block = []
        for rounds in ROUNDS:
            row = []
            for noise in NOISE:
                try:
                    row.append(float(pld_epsilon(rate, float(noise), rounds, delta)))
                except Exception:
                    row.append(None)
            block.append(row)
            print(f"grid rate={rate} rounds={rounds} done", flush=True)
        eps.append(block)
    return {
        "rates": RATES,
        "rounds": ROUNDS,
        "noise": NOISE,
        "delta": 1 / (10 * USERS),
        "users": USERS,
        "accountant": "pld",
        "epsilon": eps,
    }


def export_facts() -> dict[str, Any]:
    facts: dict[str, Any] = {}
    records = sorted((ROOT / "results" / "runs").rglob("*.json"))
    hashes = []
    for p in records:
        h = json.loads(p.read_text(encoding="utf-8")).get("provenance", {}).get("code_sha256")
        if isinstance(h, str) and h:
            hashes.append(h)
    src = "results/runs (counted by deck/scripts/export_data.py)"
    facts["runs.records"] = {"value": len(records), "source": src}
    facts["runs.with_code_hash"] = {"value": len(hashes), "source": src}
    common = Counter(hashes).most_common(1)
    facts["runs.engine_hash"] = {"value": common[0][0] if common else "", "source": src}
    if len(set(hashes)) > 1:
        print(f"note: {len(set(hashes))} distinct code hashes; storing the most common")

    proc = subprocess.run(
        [sys.executable, "-m", "pytest", "--collect-only", "-q"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    match = re.search(r"(\d+) tests? collected", proc.stdout)
    if match:
        count = int(match.group(1))
    else:  # quiet mode of this repo's pytest config prints "<file>: <n>" per file
        per_file = re.findall(r"^\S+\.py: (\d+)$", proc.stdout, re.M)
        if not per_file:
            raise RuntimeError("could not parse the collection count: " + proc.stdout[-500:])
        count = sum(int(n) for n in per_file)
    facts["tests.count"] = {
        "value": count,
        "source": "pytest --collect-only -q (counted by deck/scripts/export_data.py)",
    }

    documented = json.loads((Path(__file__).parent / "documented_facts.json").read_text("utf-8"))
    for key, fact in documented.items():
        text = (ROOT / fact["source"]).read_text(encoding="utf-8")
        if fact["quote"] not in text:
            raise RuntimeError(f"quote for {key} not found in {fact['source']}")
        facts[key] = fact

    # Figures measured by running a command (coverage). Each entry names the command and date.
    measured_path = Path(__file__).parent / "measured_facts.json"
    if measured_path.exists():
        for key, fact in json.loads(measured_path.read_text("utf-8")).items():
            facts[key] = fact
    return facts


def export_merkle() -> dict[str, Any]:
    from prism.ledger.merkle import inclusion_proof, leaf_hash, merkle_root

    vectors: dict[str, Any] = {}
    for count in MERKLE_COUNTS:
        names = [f"receipt-{i}" for i in range(count)]
        leaves = [n.encode("utf-8") for n in names]
        index = count // 2
        vectors[str(count)] = {
            "leaves_utf8": names,
            "leaf_hashes": [leaf_hash(x).hex() for x in leaves],
            "root": merkle_root(leaves).hex(),
            "proof": {
                "index": index,
                "hashes": [h.hex() for h in inclusion_proof(index, leaves)],
            },
        }
    return {
        "leaf_hash": "SHA-256(0x00 || leaf bytes)",
        "node_hash": "SHA-256(0x01 || left hash || right hash)",
        "split": "left subtree holds the largest power of two strictly less than n (RFC 6962)",
        "empty_root": "SHA-256 of the empty byte string",
        "vectors": vectors,
    }


def main() -> None:
    sys.path.insert(0, str(ROOT / "src"))
    write_json("results", export_results())
    write_json("code", export_code())
    write_json("merkle_vectors", export_merkle())
    write_json("facts", export_facts())
    if "--skip-grid" in sys.argv[1:]:
        print("keeping the existing accounting_grid.json (--skip-grid)")
    else:
        write_json("accounting_grid", export_grid())


if __name__ == "__main__":
    main()
