"""The results report: every section builds, missing inputs say "not run", output is safe."""

from __future__ import annotations

import csv
import re
from pathlib import Path
from typing import Any

import pytest

from prism import cli
from prism.experiments.runner import Paths
from prism.io import atomic_write_json
from prism.report import build

STAMP = "2026-11-17 12:00:00 UTC"
SECTIONS = (
    "baselines",
    "rq1",
    "rq2",
    "rq3",
    "rq4",
    "rq5",
    "rq6",
    "sensitivity",
    "parity",
    "provenance",
)
FIGURE_SECTIONS = ("baselines", "rq1", "rq2", "rq3", "rq4", "rq5", "rq6", "sensitivity")


def _paths(root: Path) -> Paths:
    return Paths(processed=root / "processed", results=root / "results", keys=root / "keys")


def _ci(low: float, high: float) -> list[float]:
    return [low, high]


def _baseline_block(scale: float) -> dict[str, Any]:
    return {
        name: {
            "ndcg@10": 0.02 * scale * k,
            "hr@10": 0.1 * k,
            "recall@20": 0.04 * k,
            "distinct@10": 30.0 * k,
            "ndcg_ci95": _ci(0.01 * k, 0.03 * k),
        }
        for k, name in enumerate(("most_popular", "item_knn", "item_ridge", "friends"), start=1)
    }


def _level(ndcg: float, eps: float | None, retention: float | None) -> dict[str, Any]:
    entry: dict[str, Any] = {
        "seeds": 3,
        "ndcg@10_mean": ndcg,
        "ndcg@10_ci95": _ci(ndcg - 0.002, ndcg + 0.002),
    }
    if eps is not None:
        entry.update(
            epsilon_of_record=eps,
            epsilon_at_delta_n2=eps * 1.3,
            epsilon_unamplified=eps * 40,
            noise_multiplier=1.1,
        )
    if retention is not None:
        entry.update(
            retention=retention,
            personalisation_retained=retention - 0.2,
            holm_rejects_no_difference=retention < 0.9,
        )
    return entry


def _regime(top: float) -> dict[str, Any]:
    return {
        "most_popular_ndcg@10": 0.026,
        "h1": {"threshold": 0.9, "epsilon": 8.0, "met": top >= 0.9, "retention": top},
        "levels": {
            "nondp": _level(0.05, None, None),
            "cliponly": _level(0.049, None, 0.98),
            "eps1": _level(0.03, 1.0, 0.6),
            "eps8": _level(0.05 * top, 7.9, top),
            "eps16": _level(0.048, 15.0, 0.96),
            "whatif-x2": _level(0.04, 0.5, 0.8),
            "whatif-x5": _level(0.042, 0.2, 0.84),
        },
    }


def _payloads() -> dict[str, dict[str, Any]]:
    controls_ok = {"passed": True}
    return {
        "baselines": {
            "experiment": "baselines",
            "phases": {"validation": _baseline_block(0.9), "test": _baseline_block(1.0)},
        },
        "dataset_card": {"users": 9913, "items": 6319, "interactions": 410193},
        "social_graph": {
            "users": 9913.0,
            "edges": 70691.0,
            "users_with_friends": 7645.0,
            "isolated_share": 0.2288,
            "mean_degree": 14.26,
        },
        "privacy_utility": {
            "experiment": "privacy_utility",
            "status": "VALID",
            "invalid_reasons": [],
            "evaluated_on": "test",
            "runs": 42,
            "baselines": _baseline_block(1.0),
            "summary": {"large": _regime(0.93), "small": _regime(0.7)},
            "limitations": ["Tuned on the same users.", "Clip-only is not private."],
        },
        "gossip": {
            "experiment": "gossip",
            "status": "VALID",
            "invalid_reasons": [],
            "controls": {
                "gossip_learns": {
                    "measured": "gossip over MostPopular",
                    "ratio": 1.4,
                    "threshold": 1.1,
                    "passed": True,
                }
            },
            "results": {
                "nodes": 300,
                "friend_peer_share": 0.4,
                "by_epsilon": {
                    "nonprivate": {
                        "gossip_ndcg10": {"mean": 0.04},
                        "federated_ndcg10": {"mean": 0.05},
                        "most_popular_ndcg10": 0.026,
                        "gap": {"mean": 0.01, "ci95": _ci(0.005, 0.015)},
                        "bytes": {"gossip_over_federated_total": 3.2},
                        "epsilon_claimed": {"gossip_local": None, "federated": None},
                    },
                    "8.0": {
                        "gossip_ndcg10": {"mean": 0.03},
                        "federated_ndcg10": {"mean": 0.045},
                        "most_popular_ndcg10": 0.026,
                        "gap": {"mean": 0.015, "ci95": _ci(0.01, 0.02)},
                        "bytes": {"gossip_over_federated_total": 3.2},
                        "epsilon_claimed": {"gossip_local": 30.0, "federated": 7.9},
                    },
                },
                "h2": {
                    "epsilon": 8.0,
                    "gap_mean": 0.015,
                    "gap_ci95": _ci(0.01, 0.02),
                    "relative_gap": 0.33,
                },
            },
            "limitations": ["Synchronous rounds."],
        },
        "update_leakage": {
            "experiment": "update_leakage",
            "status": "VALID",
            "invalid_reasons": [],
            "controls": {
                "raw_recovers_history": {
                    "what": "history AUC from the raw update",
                    "measured": {"auc": 0.9},
                    "threshold": {"min_auc": 0.7},
                    "passed": True,
                },
                "masked_is_chance": {
                    "what": "AUC from masked payload",
                    "measured": {"auc": 0.5},
                    "threshold": {"auc_within": [0.45, 0.55]},
                    "passed": True,
                },
            },
            "results": {
                "raw": _leak(0.9, {"auc": 0.8, "tpr_at_1pct_fpr": 0.1}),
                "local_noise_z1": _leak(0.6, {"auc": 0.55, "tpr_at_1pct_fpr": 0.02}),
                "masked": _leak(0.5, "not_applicable"),
                "sum_100": {"recovery": _recovery(0.52), "link": "not_applicable"},
                "sum_100_dp": {"recovery": "not_enough_targets", "link": "not_applicable"},
                "reference_histories": {"link": "no_friend_graph"},
            },
            "limitations": ["One checkpoint."],
        },
        "membership": {
            "experiment": "membership",
            "status": "VALID",
            "invalid_reasons": [],
            "controls": {
                "positive_overfit": {
                    "measured": "attack on an overfit model",
                    "values": {"auc": 0.9},
                    "threshold": {"auc_min": 0.7},
                    "passed": True,
                },
                "negative_independent": {
                    "measured": "independent model",
                    "values": {"auc": 0.5},
                    "threshold": {"tolerance": 0.05},
                    "passed": True,
                },
            },
            "results": {
                "levels": {
                    "nondp": _mlevel(None, 0.6, 0.05, 0.2),
                    "eps8": _mlevel(7.9, 0.51, 0.012, 0.0),
                    "eps1": _mlevel(1.0, 0.5, 0.01, 0.0),
                },
                "hypotheses": {"H3": {"holds": True, "mean_tpr_at_1pct_fpr": 0.012}},
            },
            "limitations": ["Half-split targets."],
        },
        "poisoning": {
            "experiment": "poisoning",
            "status": "VALID",
            "invalid_reasons": [],
            "controls": [
                {
                    "name": "positive_promotion",
                    "what": "exposure ratio",
                    "measured": 12.0,
                    "threshold": 5.0,
                    "passed": True,
                },
                {
                    "name": "negative_clean",
                    "what": "clean exposure",
                    "measured": 0.0001,
                    "threshold": 0.01,
                    "passed": True,
                },
            ],
            "results": {
                mode: {
                    str(f): {
                        "exposure": {"mean": f * scale, "min": f * scale / 2, "max": f * scale * 2},
                        "ndcg": {"mean": 0.04},
                        "utility_drop": 0.01,
                        "exposure_ratio": 1.0 + 30 * f,
                    }
                    for f in (0.0, 0.1, 0.2, 0.3)
                }
                for mode, scale in (
                    ("secure_sum", 1.0),
                    ("plaintext_trimmed_mean", 0.3),
                    ("committee_median_size4", 0.6),
                    ("committee_median_size20", 0.2),
                )
            },
            "h4": {"holds": True, "lower_at_every_share": True, "gap_largest_at_max_share": True},
            "committee_tradeoff": {
                mode: {
                    "committee_size": size,
                    "clean_ndcg_at_fraction_0": 0.041,
                    "per_fraction": [
                        {"fraction": 0.1, "target_exposure": 0.05, "clean_committee_share": 0.34},
                        {"fraction": 0.3, "target_exposure": 0.2, "clean_committee_share": 0.0},
                    ],
                }
                for mode, size in (("committee_median_size4", 4), ("committee_median_size20", 20))
            },
            "limitations": ["Fake accounts follow a simple script."],
        },
        "participation": {
            "experiment": "participation",
            "status": "VALID",
            "invalid_reasons": [],
            "controls": {
                "sampling": {
                    "what": "realised cohort vs expected",
                    "threshold": "within 10% of 1",
                    "measured": [{"scenario": "always", "ratio": 1.01, "passed": True}],
                    "passed": True,
                },
                "baseline": {"what": "model over MostPopular", "measured": None, "passed": True},
            },
            "results": {
                "cells": {
                    s: {
                        "8": {
                            "epsilon_of_record": 7.9,
                            "epsilon_note": "NOMINAL" if s == "activity" else "holds",
                            "overall_ndcg10": {"mean": 0.04},
                            "activity_groups_ndcg10": [0.02, 0.04, 0.06],
                            "degree_groups_ndcg10": [0.03, 0.04, 0.05],
                            "activity_gap": {"mean": 0.04 if s == "activity" else 0.01},
                            "degree_gap": {"mean": 0.02},
                            "gap_change_vs_independent": {
                                "activity": {"wilcoxon_two_sided_p": 0.0625}
                            },
                        }
                    }
                    for s in ("independent", "activity", "trace", "trace_activity", "trace_replay")
                },
                "availability": {
                    "independent": {"mean": 0.5, "activity_groups": [0.5, 0.5, 0.5]},
                    "trace": {"mean": 0.33, "activity_groups": [0.3, 0.33, 0.36]},
                },
                "trace_readout": {
                    "overall_ndcg10": {
                        "8": {
                            "trace": 0.04,
                            "trace_replay": 0.039,
                            "independent": 0.041,
                            "always": 0.05,
                            "trace_minus_independent": -0.001,
                            "trace_replay_minus_independent": -0.002,
                        }
                    },
                    "rank_matching_widens_activity_gap": {
                        "8": {"seeds": 5, "seeds_improved": 5, "mean_difference": 0.01}
                    },
                },
                "h5": {"holds": False},
            },
            "settings": {
                "trace": {
                    "seconds_per_round": 1800,
                    "summary": {"devices": 107749.0, "mean_active_share": 0.31},
                }
            },
            "limitations": ["Availability is synthetic."],
        },
        "sensitivity": {
            "experiment": "sensitivity",
            "status": "VALID",
            "invalid_reasons": [],
            "controls": [
                {
                    "variant": "k10",
                    "regime": "large",
                    "measured": "non-private over MostPopular",
                    "value": 1.5,
                    "threshold": 1.1,
                    "passed": True,
                }
            ],
            "results": {
                name: {
                    regime: {
                        "users": 9000 + i,
                        "items": 6000,
                        "interactions": 400000,
                        "most_popular_ndcg@10": 0.026,
                        "item_ridge_ndcg@10": 0.045,
                        "nondp_ndcg@10": 0.05,
                        "h1_met": regime == "large",
                        "epsilons": {
                            "8": {
                                "ndcg@10": 0.04,
                                "retention": 0.8 + 0.05 * i,
                                "personalisation_retained": 0.6,
                                "retention_ndcg@20": 0.82,
                            }
                        },
                        "conclusion_stable": {"h1_verdict_same": True},
                    }
                    for regime in ("large", "small")
                }
                for i, name in enumerate(("k10", "k15", "k20", "stars4"))
            },
            "limitations": ["Frozen hyperparameters on every variant."],
        },
        "free_riding": {
            "experiment": "free_riding",
            "status": "VALID",
            "invalid_reasons": [],
            "controls": [
                {
                    "name": "positive_zero_detection",
                    "what": "norm AUC of zero free-riders",
                    "measured": 0.99,
                    "threshold": 0.95,
                    "passed": True,
                }
            ],
            "results": {
                "clean": {"ndcg": {"mean": 0.05}},
                "zero": {
                    "0.1": {
                        "ndcg": {"mean": 0.048},
                        "cost_to_everyone": {"relative_ndcg_drop": 0.04},
                        "free_rider_gain": {
                            "difference_mean": -0.003,
                            "per_seed": [{"ci95_low": -0.005, "ci95_high": -0.001}],
                        },
                        "detection": {
                            "secure_aggregation": "not_applicable",
                            "norm_auc": {"mean": 0.99},
                            "cosine_auc": {"mean": 0.9},
                        },
                    }
                },
            },
            "limitations": ["Two simple free-riding behaviours."],
        },
        "flower_parity": {
            "experiment": "flower_parity",
            "status": "VALID",
            "invalid_reasons": [],
            "settings": {
                "flower_version": "1.43.0",
                "flower_execution_mode": "simulation runtime",
                "rounds": 5,
                "clients": 400,
                "tolerance": {"atol": 1e-06, "rtol": 1e-05},
            },
            "results": {
                "gaussian": {
                    "final": {"allclose": True, "max_abs_diff": 6e-08, "relative_l2_diff": 4.8e-08}
                },
                "noise_free": {
                    "final": {"allclose": True, "max_abs_diff": 0.0, "relative_l2_diff": 0.0}
                },
                "engine_step_check": {
                    "noise_multiplier_0": {"identical": True, "max_abs_diff": 0.0}
                },
            },
            "limitations": ["Small synthetic problem."],
        },
        "ledger_audit": {
            "experiment": "ledger_audit",
            "status": "VALID",
            "invalid_reasons": [],
            "controls": {"all_ledgers_verify": controls_ok, "every_tamper_detected": controls_ok},
            "results": {
                "verification": {"ledgers": 5, "verified": 5, "round_receipts": 100},
                "coverage": {"private_runs": 5, "coverage": 1.0},
                "tamper_detection": {"flips": 300, "detected": 300, "rate": 1.0},
                "costs": {"append_ms_per_receipt": 1.5, "verify_seconds": 0.2},
                "receipt_overhead": {"mean_share_of_run_time": 0.001},
                "blocked_release_demo": {"blocked": True, "rounds_asked": 12, "rounds_allowed": 10},
            },
            "limitations": ["One signing key."],
        },
    }


def _with_provenance(payloads: dict[str, dict[str, Any]]) -> None:
    for name in ("privacy_utility", "gossip", "sensitivity"):
        payloads[name]["provenance"] = {
            "engine_sha256": "a" * 64,
            "module_sha256": "b" * 64,
            "git_commit": "c0ffee1234567890",
            "git_dirty": name == "gossip",
        }


def _recovery(auc: float) -> dict[str, Any]:
    return {
        "auc": {"mean": auc, "ci95": _ci(auc - 0.02, auc + 0.02)},
        "precision_at_10": {"mean": 0.2, "ci95": _ci(0.1, 0.3)},
        "prior_auc": {"mean": 0.5, "ci95": _ci(0.45, 0.55)},
        "prior_precision_at_10": {"mean": 0.1, "ci95": _ci(0.05, 0.15)},
    }


def _leak(auc: float, link: Any) -> dict[str, Any]:
    return {"recovery": _recovery(auc), "link": link}


def _mlevel(claimed: float | None, auc: float, tpr: float, bound: float) -> dict[str, Any]:
    return {
        "claimed_epsilon": claimed,
        "bound_within_claim": True,
        "aggregate": {
            "auc": {"mean": auc},
            "tpr_at_1pct_fpr": {"mean": tpr},
            "epsilon_lower_bound": {"mean": bound, "max": bound},
        },
    }


def _write(results: Path, payloads: dict[str, dict[str, Any]]) -> None:
    for name, payload in payloads.items():
        atomic_write_json(results / f"{name}.json", payload)


@pytest.fixture
def fast(monkeypatch: pytest.MonkeyPatch) -> None:
    """Skip drawing figures in tests that only check text, to keep the file quick."""
    monkeypatch.setattr(build, "_figure", lambda builder: [])


@pytest.fixture(scope="module")
def full(tmp_path_factory: pytest.TempPathFactory) -> dict[str, Any]:
    root = tmp_path_factory.mktemp("full")
    payloads = _payloads()
    _with_provenance(payloads)
    _write(root / "results", payloads)
    current = build.code_sha256()
    for name, code in (("r1", current), ("r2", current), ("r3", "0" * 64), ("r4", None)):
        record: dict[str, Any] = {"status": "ok"}
        if code is not None:
            record["provenance"] = {"code_sha256": code}
        atomic_write_json(root / "results" / "runs" / "demo" / f"{name}.json", record)
    first = build.build_report(_paths(root), timestamp=STAMP)
    markdown = first["markdown"].read_bytes()
    html = first["html"].read_text(encoding="utf-8")
    second = build.build_report(_paths(root), timestamp=STAMP)
    return {
        "root": root,
        "result": first,
        "markdown": markdown.decode("utf-8"),
        "html": html,
        "markdown_again": second["markdown"].read_bytes(),
        "markdown_bytes": markdown,
        "html_again": second["html"].read_text(encoding="utf-8"),
    }


def test_empty_results_say_not_run(tmp_path: Path) -> None:
    result = build.build_report(_paths(tmp_path), timestamp=STAMP)
    assert set(result["sections"]) == set(SECTIONS)
    assert all(status == "not run" for status in result["sections"].values())
    html = result["html"].read_text(encoding="utf-8")
    assert html.count("not run") >= len(SECTIONS)
    for hypothesis in ("H1", "H2", "H3", "H4", "H5"):
        assert hypothesis in html
    assert "<script" not in html
    assert result["markdown"].exists()


def test_every_section_renders_with_a_figure(full: dict[str, Any]) -> None:
    assert full["result"]["sections"] == dict.fromkeys(SECTIONS, "VALID")
    html = full["html"]
    for key in SECTIONS:
        match = re.search(rf'<section id="{key}".*?</section>', html, flags=re.S)
        assert match is not None, key
        assert ("data:image/png;base64," in match.group(0)) == (key in FIGURE_SECTIONS), key
    assert html.count("data:image/png;base64,") >= 10  # RQ1 and RQ3 carry two figures
    for hypothesis in ("H1", "H2", "H3", "H4", "H5"):
        assert f"<td>{hypothesis}</td>" in html


def test_html_is_self_contained(full: dict[str, Any]) -> None:
    html = full["html"]
    assert "<script" not in html.lower()
    assert "http://" not in html
    assert "https://" not in html
    assert html.startswith("<!DOCTYPE html>")


def test_verdicts_come_from_the_payloads(full: dict[str, Any]) -> None:
    markdown = full["markdown"]
    rows = {m.group(1): m.group(0) for m in re.finditer(r"^\| (H[1-5]) \|.*$", markdown, re.M)}
    assert set(rows) == {"H1", "H2", "H3", "H4", "H5"}
    assert "not supported" in rows["H1"]  # the small regime misses 0.9
    assert "supported" in rows["H2"] and "not supported" not in rows["H2"]
    assert "supported" in rows["H3"] and "not supported" not in rows["H3"]
    assert "supported" in rows["H4"] and "not supported" not in rows["H4"]
    assert "not supported" in rows["H5"]


def test_tables_and_csv(full: dict[str, Any]) -> None:
    tables = {p.name: p for p in full["result"]["tables"]}
    assert "rq1_privacy_utility.csv" in tables
    assert full["result"]["markdown"].exists()
    with open(tables["rq1_privacy_utility.csv"], newline="", encoding="utf-8") as handle:
        rows = list(csv.DictReader(handle))
    assert len(rows) == 2 * 7  # two regimes, seven privacy levels
    assert {r["Regime"] for r in rows} == {"large", "small"}
    for path in tables.values():
        assert path.parent.name == "tables"
        assert path.stat().st_size > 0


def test_unavailable_link_attack_is_text(full: dict[str, Any]) -> None:
    assert "not applicable under secure aggregation" in full["markdown"]


def test_limitations_verbatim(full: dict[str, Any]) -> None:
    for text in ("Tuned on the same users.", "One signing key.", "Synchronous rounds."):
        assert text in full["markdown"]
        assert text in full["html"]


def test_build_is_reproducible(full: dict[str, Any]) -> None:
    assert full["markdown_bytes"] == full["markdown_again"]
    assert STAMP in full["html"]
    assert full["html"] == full["html_again"]
    other = build.build_report(_paths(full["root"]), timestamp="2030-01-01 00:00:00 UTC")
    changed = other["html"].read_text(encoding="utf-8")
    assert changed.replace("2030-01-01 00:00:00 UTC", STAMP) == full["html"]


def test_invalid_payload_shows_reasons_and_verdict(tmp_path: Path, fast: None) -> None:
    payloads = _payloads()
    payloads["poisoning"]["status"] = "INVALID"
    payloads["poisoning"]["invalid_reasons"] = ["control negative_clean failed: 0.4 > 0.01"]
    payloads["poisoning"]["controls"][1]["passed"] = False
    _write(tmp_path / "results", payloads)
    result = build.build_report(_paths(tmp_path), timestamp=STAMP)
    assert result["sections"]["rq4"] == "INVALID"
    html = result["html"].read_text(encoding="utf-8")
    assert "control negative_clean failed: 0.4 &gt; 0.01" in html
    assert "badge-invalid" in html
    row = next(
        line
        for line in result["markdown"].read_text(encoding="utf-8").splitlines()
        if line.startswith("| H4 |")
    )
    assert "invalid (control failed)" in row


def test_text_is_escaped(tmp_path: Path, fast: None) -> None:
    payloads = _payloads()
    payloads["gossip"]["limitations"] = ["a < b and <b>bold</b>"]
    payloads["gossip"]["status"] = "INVALID"
    payloads["gossip"]["invalid_reasons"] = ["<img src=x onerror=1>"]
    _write(tmp_path / "results", payloads)
    html = build.build_report(_paths(tmp_path), timestamp=STAMP)["html"].read_text(encoding="utf-8")
    assert "<b>bold</b>" not in html
    assert "<img src=x" not in html
    assert "a &lt; b and &lt;b&gt;bold&lt;/b&gt;" in html


def test_unexpected_and_missing_keys_do_not_raise(tmp_path: Path, fast: None) -> None:
    results = tmp_path / "results"
    weird: dict[str, Any] = {
        "baselines": {"phases": "nonsense"},
        "privacy_utility": {"status": "VALID", "summary": {"large": {"levels": [1, 2]}}},
        "gossip": {"results": {"by_epsilon": {"8.0": 5}, "h2": []}},
        "update_leakage": {"status": "VALID", "results": {"raw": 3}, "controls": 7},
        "membership": {"results": {"levels": {"eps8": {"aggregate": None}}}},
        "poisoning": {"status": "VALID", "results": {"m": {"0.1": "x"}}, "controls": [4]},
        "participation": {"status": "VALID", "results": {"cells": {"a": {"1": None}}}},
        "ledger_audit": {"status": "VALID", "results": {"costs": []}},
        "social_graph": {"users": "many"},
        "dataset_card": [],
    }
    _write(results, weird)
    result = build.build_report(_paths(tmp_path), timestamp=STAMP)
    assert set(result["sections"]) == set(SECTIONS)
    assert result["html"].exists()


def test_nan_and_none_render_as_na(tmp_path: Path, fast: None) -> None:
    payloads = _payloads()
    levels = payloads["privacy_utility"]["summary"]["large"]["levels"]
    levels["eps8"]["ndcg@10_mean"] = None
    levels["eps8"]["retention"] = float("nan")
    # NaN is rejected by atomic_write_json, so write this payload as text.
    import json

    results = tmp_path / "results"
    _write(results, {k: v for k, v in payloads.items() if k != "privacy_utility"})
    (results / "privacy_utility.json").write_text(
        json.dumps(payloads["privacy_utility"]), encoding="utf-8"
    )
    result = build.build_report(_paths(tmp_path), timestamp=STAMP)
    markdown = result["markdown"].read_text(encoding="utf-8")
    assert re.search(r"nan", markdown.lower()) is None
    assert "None" not in markdown
    assert "n/a" in markdown


def test_provenance_prefers_payload(tmp_path: Path, fast: None) -> None:
    payloads = _payloads()
    payloads["privacy_utility"]["provenance"] = {"git_commit": "abc1234", "uv_lock_sha256": "ff00"}
    _write(tmp_path / "results", payloads)
    result = build.build_report(_paths(tmp_path), timestamp=STAMP)
    markdown = result["markdown"].read_text(encoding="utf-8")
    assert "abc1234" in markdown
    assert "ff00" in markdown


def test_not_done_list_is_configurable(tmp_path: Path, fast: None) -> None:
    result = build.build_report(_paths(tmp_path), not_done=["flux capacitor"], timestamp=STAMP)
    markdown = result["markdown"].read_text(encoding="utf-8")
    assert "flux capacitor" in markdown
    assert "Flower parity" not in markdown
    default = build.build_report(_paths(tmp_path), timestamp=STAMP)["markdown"]
    assert "Flower parity" in default.read_text(encoding="utf-8")


def test_cli_prints_paths_and_statuses(
    tmp_path: Path, capsys: pytest.CaptureFixture[str], fast: None
) -> None:
    (tmp_path / "results").mkdir()
    assert build.cli(["--root", str(tmp_path)]) == 0
    out = capsys.readouterr().out
    assert "report.html" in out and "report.md" in out and "not run" in out
    assert cli.COMMANDS["report"][0] == "prism.report.build"


def test_inputs_are_not_modified(tmp_path: Path, fast: None) -> None:
    results = tmp_path / "results"
    _write(results, _payloads())
    before = {p.name: p.read_bytes() for p in results.glob("*.json")}
    build.build_report(_paths(tmp_path), timestamp=STAMP)
    assert before == {p.name: p.read_bytes() for p in results.glob("*.json")}


def _row(markdown: str, name: str) -> str:
    return next(line for line in markdown.splitlines() if line.startswith(f"| {name} |"))


def _h5_part(improved: int, seeds: int = 5) -> dict[str, Any]:
    return {
        "8": {
            "seeds": seeds,
            "seeds_improved": improved,
            "seeds_degraded": seeds - improved,
            "sign_test_p_all_improved": 0.5**seeds if improved == seeds else 1.0,
            "mean_difference": 0.01,
            "wilcoxon_two_sided_p": 0.0625,
            "wilcoxon_note": "underpowered: the minimum possible two-sided p is 0.0625",
        }
    }


def test_new_h4_and_h5_fields_render_in_the_verdict_rows(tmp_path: Path, fast: None) -> None:
    payloads = _payloads()
    payloads["poisoning"]["h4"] = {
        "holds": True,
        "lower_at_every_share": True,
        "gap_largest_at_max_share": True,
    }
    h5 = payloads["participation"]["results"]["h5"]
    h5.update(
        holds=False, holds_activity=False, holds_social=False,
        activity=_h5_part(4), social=_h5_part(1), rule="Amendment 1: sign pattern",
    )  # fmt: skip
    _write(tmp_path / "results", payloads)
    result = build.build_report(_paths(tmp_path), timestamp=STAMP)
    markdown = result["markdown"].read_text(encoding="utf-8")
    h4_row = _row(markdown, "H4")
    assert "lower at every share: yes" in h4_row.lower() or "lower at every share: true" in (
        h4_row.lower()
    )
    assert "largest at 30%" in h4_row or "largest at the largest" in h4_row
    h5_row = _row(markdown, "H5")
    assert "activity: 4 of 5 seeds wider at epsilon 8" in h5_row
    assert "social: 1 of 5" in h5_row
    assert "not supported" in h5_row
    payloads["participation"]["results"]["h5"].update(
        holds=True, holds_activity=True, activity=_h5_part(5)
    )
    _write(tmp_path / "results", payloads)
    again = build.build_report(_paths(tmp_path), timestamp=STAMP)
    row = _row(again["markdown"].read_text(encoding="utf-8"), "H5")
    assert "activity: 5 of 5 seeds wider at epsilon 8" in row
    assert "not supported" not in row and "supported" in row


def test_h4_with_failing_largest_share_is_not_supported(tmp_path: Path, fast: None) -> None:
    payloads = _payloads()
    payloads["poisoning"]["h4"] = {
        "holds": False,
        "lower_at_every_share": True,
        "gap_largest_at_max_share": False,
    }
    _write(tmp_path / "results", payloads)
    result = build.build_report(_paths(tmp_path), timestamp=STAMP)
    assert "not supported" in _row(result["markdown"].read_text(encoding="utf-8"), "H4")


def test_rq2_table_shows_replace_adjacency_only_when_present(tmp_path: Path, fast: None) -> None:
    payloads = _payloads()
    _write(tmp_path / "results", payloads)
    old = build.build_report(_paths(tmp_path), timestamp=STAMP)
    assert "replace adjacency" not in old["markdown"].read_text(encoding="utf-8")
    by_eps = payloads["gossip"]["results"]["by_epsilon"]
    for entry in by_eps.values():
        entry["epsilon_claimed"]["gossip_local_replace_adjacency"] = (
            None if entry["epsilon_claimed"]["gossip_local"] is None else 55.5
        )
    _write(tmp_path / "results", payloads)
    new = build.build_report(_paths(tmp_path), timestamp=STAMP)
    markdown = new["markdown"].read_text(encoding="utf-8")
    assert "replace adjacency" in markdown and "55.50" in markdown


def test_not_done_list_shrinks_when_results_exist(
    tmp_path: Path, full: dict[str, Any], fast: None
) -> None:
    empty = build.build_report(_paths(tmp_path), timestamp=STAMP)["markdown"].read_text(
        encoding="utf-8"
    )
    for line in (
        "k-core (k = 10, 20) and 4-star sensitivity analyses",
        "Free-riding clients",
        "Flower parity check",
        "Committee-median robustness mode",
        "Trace-based client availability",
        "Pre-publication review by the dataset provider",
    ):
        assert line in empty
    assert "list length k" not in empty
    done = full["markdown"].split("## Not done")[1]
    assert "Pre-publication review by the dataset provider (owners' task" in done
    for line in ("k-core", "Free-riding", "Flower parity", "Committee-median", "Trace-based"):
        assert line not in done


def test_flower_not_run_status_counts_as_not_done(tmp_path: Path, fast: None) -> None:
    payloads = _payloads()
    payloads["flower_parity"]["status"] = "NOT_RUN"
    _write(tmp_path / "results", payloads)
    result = build.build_report(_paths(tmp_path), timestamp=STAMP)
    assert result["sections"]["parity"] == "not run"
    assert "Flower parity check" in result["markdown"].read_text(encoding="utf-8")


def test_sensitivity_section(full: dict[str, Any]) -> None:
    markdown = full["markdown"]
    assert "Sensitivity: k-core and positive-feedback variants" in markdown
    assert "Frozen hyperparameters on every variant." in markdown
    tables = {p.name: p for p in full["result"]["tables"]}
    with open(tables["sensitivity.csv"], newline="", encoding="utf-8") as handle:
        rows = list(csv.DictReader(handle))
    assert len(rows) == 8  # four variants, two regimes
    assert {r["Variant"] for r in rows} >= {"k-core 10", "4 stars or more"}
    assert rows[0]["Retention at list length 20"] == "0.820"


def test_poisoning_additions(full: dict[str, Any]) -> None:
    markdown = full["markdown"]
    assert "committee median size4" in markdown and "committee median size20" in markdown
    assert "Committee trade-off" in markdown
    assert "Share of attacker-free committees" in markdown
    assert "Free-riding clients" in markdown
    assert "not applicable under secure aggregation" in markdown
    assert "Two simple free-riding behaviours." in markdown
    tables = {p.name for p in full["result"]["tables"]}
    assert {"rq4_free_riding.csv", "rq4_committee.csv"} <= tables


def test_participation_trace_additions(full: dict[str, Any]) -> None:
    markdown = full["markdown"]
    for scenario in ("trace_activity", "trace_replay"):
        assert scenario in markdown
    assert "Trace readout" in markdown
    assert "107,749" in markdown
    assert "Mean availability by scenario" in markdown


def test_gossip_section_shows_nodes_and_seeds(tmp_path: Path, fast: None) -> None:
    payloads = _payloads()
    payloads["gossip"]["results"]["nodes"] = 3000
    payloads["gossip"]["settings"] = {"seeds": [0, 1, 2]}
    _write(tmp_path / "results", payloads)
    markdown = build.build_report(_paths(tmp_path), timestamp=STAMP)["markdown"].read_text(
        encoding="utf-8"
    )
    assert "3,000 nodes" in markdown
    assert "3 seeds" in markdown


def test_parity_section(full: dict[str, Any]) -> None:
    markdown = full["markdown"]
    assert "Framework parity" in markdown
    assert "1.43.0" in markdown
    assert "Small synthetic problem." in markdown
    assert full["result"]["sections"]["parity"] == "VALID"


def test_provenance_section(full: dict[str, Any]) -> None:
    markdown = full["markdown"]
    assert "aaaaaaaaaaaa" in markdown and "a" * 13 not in markdown
    assert "| c0ffee12 |" in markdown
    assert "3 of 4 run records carry a code hash" in markdown
    assert "2 of those 3 equal the current engine hash" in markdown
    assert "so it can be recomputed at any commit." in markdown
    assert full["result"]["sections"]["provenance"] == "VALID"


def test_new_sections_not_run_when_files_missing(tmp_path: Path, fast: None) -> None:
    result = build.build_report(_paths(tmp_path), timestamp=STAMP)
    for key in ("sensitivity", "parity", "provenance"):
        assert result["sections"][key] == "not run"
