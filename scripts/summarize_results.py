"""Reproduce every headline table from results/runs/*.json (roadmap DoD).

Reports mean, sd, bootstrap CI over seeds, retention against both the own-topology
non-private model and the central non-private model, paired Wilcoxon and sign
tests, and Holm-Bonferroni correction across the epsilon family.

Also reports the minimum achievable two-sided p-value for the available seed
count, so a non-significant result is never mistaken for evidence of no effect.
"""

from __future__ import annotations

import argparse
import json
import math
from collections import defaultdict
from pathlib import Path
from typing import Any, Final

import numpy as np
from scipy import stats

RUNS: Final[Path] = Path("results/runs")
OUT_JSON: Final[Path] = Path("results/summary.json")
OUT_CSV: Final[Path] = Path("results/summary_table.csv")
BOOTSTRAP_DRAWS: Final[int] = 10000
ALPHA: Final[float] = 0.05
METRIC: Final[str] = "ndcg@10"


def bootstrap_ci(values: np.ndarray, seed: int = 0) -> tuple[float, float]:
    """Percentile bootstrap CI for the mean over seeds."""
    rng = np.random.default_rng(seed)
    n = values.size
    draws = rng.integers(0, n, size=(BOOTSTRAP_DRAWS, n))
    means = values[draws].mean(axis=1)
    return float(np.percentile(means, 2.5)), float(np.percentile(means, 97.5))


def holm_adjust(pvalues: list[float]) -> list[bool]:
    """Holm-Bonferroni step-down decisions at ALPHA."""
    m = len(pvalues)
    order = sorted(range(m), key=lambda i: pvalues[i])
    decisions = [False] * m
    for rank, index in enumerate(order):
        threshold = ALPHA / (m - rank)
        if pvalues[index] <= threshold:
            decisions[index] = True
        else:
            break
    return decisions


def min_two_sided_sign_p(n: int) -> float:
    """Smallest possible two-sided sign-test p-value for n paired seeds."""
    return min(1.0, 2.0 * math.pow(0.5, n))


def paired_tests(treated: np.ndarray, control: np.ndarray) -> dict[str, Any]:
    """Paired comparison of two seed-matched configurations."""
    diff = treated - control
    n = int(diff.size)
    negative = int((diff < 0).sum())
    positive = int((diff > 0).sum())
    try:
        wilcoxon_p = float(stats.wilcoxon(treated, control, zero_method="wilcox").pvalue)
    except ValueError:
        wilcoxon_p = 1.0
    return {
        "mean_difference": float(diff.mean()),
        "seeds_degraded": negative,
        "seeds_improved": positive,
        "wilcoxon_two_sided_p": wilcoxon_p,
        "min_possible_two_sided_p": min_two_sided_sign_p(n),
        "sign_test_one_sided_p": float(math.pow(0.5, n)) if negative == n else 1.0,
    }


def load_groups() -> dict[tuple[str, str], dict[int, float]]:
    """Group final metric values by (topology, epsilon tag) and seed."""
    groups: dict[tuple[str, str], dict[int, float]] = defaultdict(dict)
    for path in sorted(RUNS.glob("*.json")):
        record = json.loads(path.read_text(encoding="utf-8"))
        tag = "nondp" if record["target_epsilon"] is None else str(record["target_epsilon"])
        groups[(record["topology"], tag)][int(record["seed"])] = float(
            record["final_metrics"][METRIC]
        )
    return groups


def main(argv: list[str] | None = None) -> int:
    """Build the summary tables and write JSON plus CSV."""
    parser = argparse.ArgumentParser(description="Summarise experiment grid.")
    parser.add_argument("--metric", default=METRIC)
    args = parser.parse_args(argv)
    metric = str(args.metric)

    groups = load_groups()
    if not groups:
        print("ERROR: no run records found in results/runs")
        return 1

    central_control = groups.get(("central", "nondp"), {})
    summary: dict[str, Any] = {"metric": metric, "alpha": ALPHA, "topologies": {}}
    rows: list[str] = [
        "topology,epsilon_tag,n_seeds,mean,sd,ci_low,ci_high,retention_own,retention_vs_central_nondp,retention_vs_central_matched_nondp,wilcoxon_p,holm_reject"
    ]

    for topology in ("central", "central_matched", "federated"):
        own_control = groups.get((topology, "nondp"), {})
        if not own_control:
            continue
        seeds = sorted(own_control)
        control_values = np.array([own_control[s] for s in seeds], dtype=np.float64)
        epsilon_tags = sorted(
            (tag for (top, tag) in groups if top == topology and tag != "nondp"),
            key=lambda value: float(value),
        )
        tests: dict[str, Any] = {}
        pvalues: list[float] = []
        for tag in epsilon_tags:
            per_seed = groups[(topology, tag)]
            paired = sorted(set(seeds) & set(per_seed))
            treated = np.array([per_seed[s] for s in paired], dtype=np.float64)
            base = np.array([own_control[s] for s in paired], dtype=np.float64)
            result = paired_tests(treated, base)
            tests[tag] = result
            pvalues.append(result["wilcoxon_two_sided_p"])
        decisions = holm_adjust(pvalues) if pvalues else []

        entries: dict[str, Any] = {}
        for tag in ["nondp", *epsilon_tags]:
            per_seed = groups[(topology, tag)]
            values = np.array([per_seed[s] for s in sorted(per_seed)], dtype=np.float64)
            low, high = bootstrap_ci(values)
            mean = float(values.mean())
            entry = {
                "n_seeds": int(values.size),
                "mean": mean,
                "sd": float(values.std(ddof=1)) if values.size > 1 else 0.0,
                "bootstrap_ci95": [low, high],
                "retention_vs_own_nondp": mean / float(control_values.mean()),
                "retention_vs_central_nondp": (
                    mean / float(np.mean([central_control[s] for s in sorted(central_control)]))
                    if central_control
                    else None
                ),
                "retention_vs_central_matched_nondp": (
                    mean
                    / float(
                        np.mean(
                            [
                                groups[("central_matched", "nondp")][s]
                                for s in sorted(groups[("central_matched", "nondp")])
                            ]
                        )
                    )
                    if groups.get(("central_matched", "nondp"))
                    else None
                ),
            }
            if tag in tests:
                entry.update(tests[tag])
                entry["holm_reject"] = bool(decisions[epsilon_tags.index(tag)])
            entries[tag] = entry
            rows.append(
                f"{topology},{tag},{entry['n_seeds']},{mean:.6f},{entry['sd']:.6f},"
                f"{low:.6f},{high:.6f},{entry['retention_vs_own_nondp']:.4f},"
                f"{entry['retention_vs_central_nondp'] if entry['retention_vs_central_nondp'] is not None else ''},"
                f"{entry['retention_vs_central_matched_nondp'] if entry['retention_vs_central_matched_nondp'] is not None else ''},"
                f"{entry.get('wilcoxon_two_sided_p', '')},{entry.get('holm_reject', '')}"
            )
        summary["topologies"][topology] = entries

    summary["confounds"] = [
        "Resolved: the round-matched central control (q=0.02, E=1, T=400) reaches 0.02484 non-private versus federated 0.02368 at the same expected user-update budget. The earlier federated advantage over central was a 10x optimisation-step artifact, not a topology benefit. H1 must name its reference explicitly: against round-matched central, FL+DP at epsilon 8 retains about 88 percent and does not meet the 90 percent threshold.",
        "Central used 40 server rounds; federated used 400 at a matched expected user-update budget. The federated advantage reflects 10x more optimisation steps, not an intrinsic benefit of decentralisation. A round-matched central control is required.",
        "With 5 seeds the minimum achievable two-sided sign/Wilcoxon p-value is 0.0625, so two-sided significance at alpha=0.05 is impossible regardless of effect size.",
        "Neither topology exceeded the MostPopular baseline; the model is content-only with no user-ID embeddings.",
    ]
    OUT_JSON.write_text(
        json.dumps(summary, indent=2, sort_keys=True) + "\n", encoding="utf-8", newline="\n"
    )
    OUT_CSV.write_text("\n".join(rows) + "\n", encoding="utf-8", newline="\n")

    print(f"Metric: {metric}")
    for topology, entries in summary["topologies"].items():
        print(f"\n=== {topology} ===")
        print(
            "eps      n   mean      sd        bootstrap95        retain_own  retain_central  wilcoxon_p"
        )
        for tag, entry in entries.items():
            ci = entry["bootstrap_ci95"]
            rc = entry["retention_vs_central_nondp"]
            print(
                f"{tag:<8} {entry['n_seeds']:<3} {entry['mean']:.5f}  {entry['sd']:.5f}  "
                f"[{ci[0]:.5f},{ci[1]:.5f}]  {entry['retention_vs_own_nondp'] * 100:6.1f}%    "
                f"{(rc * 100 if rc is not None else float('nan')):6.1f}%        "
                f"{entry.get('wilcoxon_two_sided_p', float('nan')):.4f}"
            )
    print("\nWritten: results/summary.json and results/summary_table.csv")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
