"""Build the results report: one HTML file with embedded figures, Markdown and CSV tables.

The report reads the JSON files the experiments write under ``results/``. Every input may be
missing or odd: a missing file gives a section that says "not run", and an unexpected shape
shows "n/a" instead of failing. Nothing here recomputes a result; verdicts are the ones the
experiment payloads carry (or, where a payload only carries numbers, a rule stated in the
report itself).
"""

from __future__ import annotations

import argparse
import base64
import csv
import html
import io
import math
from collections.abc import Callable, Sequence
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

from prism.environment import collect_environment_report
from prism.experiments.regimes import default_paths
from prism.experiments.runner import Paths, code_sha256
from prism.io import atomic_write_text, read_json

TITLE = "PRISM-Rec: privacy attack and defence measurements for a social-media recommender"
NOT_RUN = "not run"
VALID = "VALID"
INVALID = "INVALID"
SUPPORTED = "supported"
NOT_SUPPORTED = "not supported"
INVALID_VERDICT = "invalid (control failed)"
SECAGG_TOLERANCE = 0.05  # H3 part 2: AUC allowed above the popularity prior

PUBLICATION_REVIEW = (
    "Pre-publication review by the dataset provider "
    "(owners' task, required before any publication)."
)

PALETTE = ("#0072B2", "#E69F00", "#009E73", "#D55E00", "#CC79A7", "#56B4E9", "#F0E442", "#000000")
MARKERS = ("o", "s", "^", "D", "v", "P", "X", "*")
DPI = 150

SECTION_ORDER: tuple[tuple[str, str], ...] = (
    ("baselines", "Baselines"),
    ("rq1", "RQ1: privacy-utility trade-off"),
    ("rq2", "RQ2: gossip between friends versus federated training"),
    ("rq3", "RQ3: what update leakage and membership inference reveal"),
    ("rq4", "RQ4: fake-account promotion against aggregation modes"),
    ("rq5", "RQ5: availability and participation bias"),
    ("rq6", "RQ6: signed ledger audit"),
    ("sensitivity", "Sensitivity: k-core and positive-feedback variants"),
    ("parity", "Framework parity"),
    ("provenance", "Provenance"),
)

PRIVACY_TEXT: tuple[str, ...] = (
    "The unit of privacy is one user: the guarantee hides whether one user's whole history was "
    "used in training, not a single review.",
    "Delta is 1/(10 n) for n users in the training population. The epsilon of record is the "
    "larger of two independent accountants (a privacy-loss-distribution accountant and a Renyi "
    "accountant), so it is the more cautious of the two. 'Epsilon at delta 1/n^2' is the same "
    "mechanism at a much smaller delta, and 'without amplification' ignores the benefit of "
    "sampling users each round.",
    "Not covered by epsilon: the choice of hyperparameters and clipping norm, which was made on "
    "the same users; floating-point effects of the noise generator; the assumption of ideal "
    "Poisson sampling of clients; and the diagnostics blocks, which a deployment would not "
    "release.",
)

CSS = """
:root { --fg:#1b1f23; --muted:#5a6370; --line:#d0d5dc; --bg:#ffffff; --soft:#f4f6f8;
  --ok:#0b6e4f; --bad:#a4262c; --idle:#5a6370; }
* { box-sizing: border-box; }
body { font: 15px/1.5 system-ui, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: var(--fg);
  background: var(--bg); margin: 0 auto; padding: 24px 20px 60px; max-width: 1000px; }
h1 { font-size: 1.6rem; line-height: 1.25; margin: 0 0 4px; }
h2 { font-size: 1.25rem; margin: 36px 0 8px; padding-top: 12px; border-top: 2px solid var(--line); }
h3 { font-size: 1.02rem; margin: 22px 0 6px; }
p { margin: 8px 0; }
.meta, .muted { color: var(--muted); font-size: 0.9rem; }
.table-wrap { overflow-x: auto; margin: 8px 0 14px; }
table { border-collapse: collapse; width: 100%; font-size: 0.86rem; font-variant-numeric: tabular-nums; }
th, td { border: 1px solid var(--line); padding: 4px 8px; text-align: left; vertical-align: top; }
th { background: var(--soft); }
td.num { text-align: right; }
.badge { display: inline-block; padding: 1px 10px; border-radius: 10px; font-size: 0.8rem;
  font-weight: 600; color: #fff; vertical-align: middle; margin-left: 8px; }
.badge-valid { background: var(--ok); }
.badge-invalid { background: var(--bad); }
.badge-notrun { background: var(--idle); }
.v-supported { color: var(--ok); font-weight: 600; }
.v-notsupported { color: var(--bad); font-weight: 600; }
.v-invalid { color: var(--bad); font-weight: 600; }
.v-notrun { color: var(--idle); font-weight: 600; }
.reasons { border-left: 4px solid var(--bad); background: #fbeeee; padding: 6px 12px; margin: 10px 0; }
figure { margin: 14px 0; text-align: center; }
figure img { max-width: 100%; height: auto; }
figcaption { color: var(--muted); font-size: 0.85rem; }
ul { margin: 6px 0 6px 22px; padding: 0; }
@media print {
  body { max-width: none; padding: 0; font-size: 11pt; }
  h2 { page-break-after: avoid; }
  figure, table, .reasons { page-break-inside: avoid; }
  .table-wrap { overflow: visible; }
  table { font-size: 8.5pt; }
}
"""


# ----------------------------------------------------------------------------------------------
# Safe access and formatting
# ----------------------------------------------------------------------------------------------


def _d(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _l(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def _get(value: Any, *keys: str) -> Any:
    for key in keys:
        if not isinstance(value, dict):
            return None
        value = value.get(key)
    return value


def _num(value: Any) -> float | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    number = float(value)
    return number if math.isfinite(number) else None


def _key_num(key: Any) -> float | None:
    """A number from a JSON object key such as "0.1" (keys are always strings)."""
    try:
        return _num(float(key))
    except (TypeError, ValueError):
        return None


def _fmt(value: Any, digits: int = 4) -> str:
    number = _num(value)
    return "n/a" if number is None else f"{number:.{digits}f}"


def _interval(value: Any, digits: int = 4) -> str:
    items = _l(value)
    if len(items) != 2 or _num(items[0]) is None or _num(items[1]) is None:
        return "n/a"
    return f"[{_fmt(items[0], digits)}, {_fmt(items[1], digits)}]"


def _int(value: Any) -> str:
    number = _num(value)
    return "n/a" if number is None else f"{round(number):,}"


def _text(value: Any) -> str:
    if value is None:
        return "n/a"
    if isinstance(value, bool):
        return "yes" if value else "no"
    if isinstance(value, float):
        return "n/a" if not math.isfinite(value) else f"{value:.4g}"
    if isinstance(value, int):
        return str(value)
    return str(value)


def _compact(value: Any) -> str:
    """Short text for a control's measured value or threshold."""
    if isinstance(value, dict):
        return "; ".join(f"{key} = {_compact(item)}" for key, item in value.items()) or "n/a"
    if isinstance(value, list):
        ratios = [
            _num(_d(item).get("ratio")) for item in value if _num(_d(item).get("ratio")) is not None
        ]
        if value and len(ratios) == len(value):
            return f"{len(value)} cells, ratio {min(ratios):.3g} to {max(ratios):.3g}"  # type: ignore[type-var]
        return ", ".join(_compact(item) for item in value) or "n/a"
    return _text(value)


def _pass(value: Any) -> str:
    if value is True:
        return "pass"
    if value is False:
        return "FAIL"
    return "n/a"


def _strings(value: Any) -> list[str]:
    return [str(item) for item in _l(value)]


# ----------------------------------------------------------------------------------------------
# Document model
# ----------------------------------------------------------------------------------------------


@dataclass
class Table:
    name: str  # CSV file stem; empty for tables that are not exported
    title: str
    headers: list[str]
    rows: list[list[str]]


@dataclass
class Figure:
    title: str
    caption: str
    png: bytes


@dataclass
class Section:
    key: str
    title: str
    status: str = NOT_RUN
    summary: str = ""
    reasons: list[str] = field(default_factory=list)
    controls: Table | None = None
    tables: list[Table] = field(default_factory=list)
    figures: list[Figure] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)
    limitations: list[str] = field(default_factory=list)


@dataclass
class Verdict:
    hypothesis: str
    statement: str
    numbers: str
    verdict: str


def _png(fig: Any) -> bytes:
    buffer = io.BytesIO()
    fig.savefig(buffer, format="png", dpi=DPI, bbox_inches="tight", metadata={"Software": None})
    plt.close(fig)
    return buffer.getvalue()


def _new_axes(xlabel: str, ylabel: str, width: float = 7.4, height: float = 4.1) -> Any:
    fig, ax = plt.subplots(figsize=(width, height))
    ax.set_xlabel(xlabel, fontsize=10)
    ax.set_ylabel(ylabel, fontsize=10)
    ax.tick_params(labelsize=9)
    ax.grid(True, axis="y", color="#d9dde3", linewidth=0.6)
    ax.set_axisbelow(True)
    for side in ("top", "right"):
        ax.spines[side].set_visible(False)
    return fig, ax


def _legend(ax: Any, below: bool = False) -> None:
    if below:
        ax.legend(fontsize=9, frameon=False, loc="upper center", bbox_to_anchor=(0.5, -0.2), ncol=2)
    else:
        ax.legend(fontsize=9, frameon=False)


def _figure(builder: Callable[[], Figure | None]) -> list[Figure]:
    """Run a figure builder; a figure that cannot be drawn from odd data is simply omitted."""
    try:
        made = builder()
    except Exception:
        return []
    return [] if made is None else [made]


def _grouped_bars(
    labels: list[str],
    series: list[tuple[str, list[float | None]]],
    ylabel: str,
    xlabel: str,
    errors: dict[str, list[tuple[float, float] | None]] | None = None,
    reference: tuple[float, str] | None = None,
) -> bytes | None:
    if not labels or not any(v is not None for _, values in series for v in values):
        return None
    fig, ax = _new_axes(xlabel, ylabel)
    width = 0.8 / max(len(series), 1)
    x = np.arange(len(labels), dtype=np.float64)
    for index, (name, values) in enumerate(series):
        heights = np.array([np.nan if v is None else v for v in values], dtype=np.float64)
        err = None
        if errors and name in errors:
            pairs = errors[name]
            low = [
                0.0 if p is None else max(h - p[0], 0.0)
                for h, p in zip(heights, pairs, strict=False)
            ]
            high = [
                0.0 if p is None else max(p[1] - h, 0.0)
                for h, p in zip(heights, pairs, strict=False)
            ]
            err = np.array([np.nan_to_num(low), np.nan_to_num(high)])
        ax.bar(
            x + (index - (len(series) - 1) / 2) * width,
            np.nan_to_num(heights),
            width * 0.92,
            yerr=err,
            capsize=3,
            label=name,
            color=PALETTE[index % len(PALETTE)],
            edgecolor="#333333",
            linewidth=0.5,
            hatch=("", "//", "..", "xx")[index % 4],
        )
    if reference is not None:
        ax.axhline(reference[0], color="#000000", linestyle="--", linewidth=1.0, label=reference[1])
    ax.set_xticks(x)
    ax.set_xticklabels(labels, fontsize=9, rotation=0 if len(labels) <= 5 else 30, ha="center")
    ax.set_ylim(bottom=0.0)
    _legend(ax, below=True)
    return _png(fig)


# ----------------------------------------------------------------------------------------------
# Inputs
# ----------------------------------------------------------------------------------------------

INPUTS: tuple[str, ...] = (
    "baselines",
    "privacy_utility",
    "gossip",
    "update_leakage",
    "membership",
    "poisoning",
    "participation",
    "ledger_audit",
    "social_graph",
    "dataset_card",
    "sensitivity",
    "free_riding",
    "flower_parity",
)


@dataclass
class Inputs:
    data: dict[str, dict[str, Any]]
    unreadable: list[str]
    results_dir: Path | None = None

    def get(self, name: str) -> dict[str, Any] | None:
        return self.data.get(name)


def _load(results: Path) -> Inputs:
    data: dict[str, dict[str, Any]] = {}
    unreadable: list[str] = []
    for name in INPUTS:
        path = results / f"{name}.json"
        if not path.exists():
            continue
        try:
            payload = read_json(path)
        except (OSError, ValueError):
            unreadable.append(name)
            continue
        if isinstance(payload, dict):
            data[name] = payload
        else:
            unreadable.append(name)
    return Inputs(data, unreadable, results)


def _not_run(inputs: Inputs, key: str, title: str, files: Sequence[str]) -> Section:
    parts = []
    for name in files:
        reason = "could not be read" if name in inputs.unreadable else "not found"
        parts.append(f"results/{name}.json {reason}")
    return Section(key, title, NOT_RUN, summary="not run: " + "; ".join(parts) + ".")


def _status(payload: dict[str, Any]) -> tuple[str, list[str]]:
    status = payload.get("status")
    reasons = _strings(payload.get("invalid_reasons"))
    if status == VALID:
        return VALID, reasons
    if status == INVALID:
        return INVALID, reasons or ["the experiment reported INVALID without a reason"]
    return INVALID, [*reasons, "the result file has no valid status field, so it is not trusted"]


def _control_name(item: dict[str, Any], index: int) -> str:
    if "name" in item:
        return str(item["name"])
    parts = [str(item[k]) for k in ("variant", "regime") if k in item]
    return " ".join(parts) if parts else f"control {index + 1}"


def _controls_table(controls: Any) -> Table | None:
    entries: list[tuple[str, dict[str, Any]]] = []
    if isinstance(controls, dict):
        entries = [(str(name), _d(value)) for name, value in controls.items()]
    elif isinstance(controls, list):
        entries = [(_control_name(_d(item), i), _d(item)) for i, item in enumerate(controls)]
    if not entries:
        return None
    skip = {"passed", "what", "name", "threshold", "measured", "values"}
    rows = []
    for name, control in entries:
        what = control.get("what")
        if what is None and isinstance(control.get("measured"), str):
            what = control["measured"]
        measured = control.get("values")
        if measured is None and not isinstance(control.get("measured"), str):
            measured = control.get("measured")
        if measured is None:
            measured = {k: v for k, v in control.items() if k not in skip} or None
        rows.append(
            [
                name.replace("_", " "),
                _text(what) if what is not None else "n/a",
                _compact(measured),
                _compact(control.get("threshold")),
                _pass(control.get("passed")),
            ]
        )
    return Table(
        "", "Controls", ["Control", "What was measured", "Measured", "Threshold", "Result"], rows
    )


def _finish(section: Section, payload: dict[str, Any], note_missing: Sequence[str] = ()) -> Section:
    status, reasons = _status(payload)
    section.status = status
    section.reasons = reasons
    section.controls = _controls_table(payload.get("controls"))
    section.limitations = _strings(payload.get("limitations"))
    section.notes.extend(note_missing)
    return section


# ----------------------------------------------------------------------------------------------
# Section builders
# ----------------------------------------------------------------------------------------------

BASELINE_NAMES = {
    "most_popular": "MostPopular",
    "item_knn": "ItemKNN",
    "item_ridge": "item-item ridge",
    "friends": "friends",
}


def _baseline_label(key: str) -> str:
    return BASELINE_NAMES.get(key, key.replace("_", " "))


def _baseline_order(key: str) -> tuple[int, str]:
    names = list(BASELINE_NAMES)
    return (names.index(key) if key in names else len(names), key)


def build_baselines(inputs: Inputs) -> Section:
    title = dict(SECTION_ORDER)["baselines"]
    payload = inputs.get("baselines")
    phases = _d(_get(payload, "phases")) if payload else {}
    if not payload or not any(isinstance(v, dict) and v for v in phases.values()):
        return _not_run(inputs, "baselines", title, ["baselines"])
    section = Section("baselines", title, VALID)
    section.summary = (
        "Reference recommenders that need no training. MostPopular is the floor every model "
        "must beat and is also the non-profiling mode; item-item ridge is a collaborative "
        "ceiling. Full-catalogue ranking, history items masked."
    )
    rows: list[list[str]] = []
    for split in sorted(phases, key=lambda s: (s != "validation", s)):
        for key in sorted(_d(phases[split]), key=_baseline_order):
            m = _d(_d(phases[split])[key])
            rows.append(
                [
                    split,
                    _baseline_label(key),
                    _fmt(m.get("ndcg@10")),
                    _interval(m.get("ndcg_ci95")),
                    _fmt(m.get("hr@10")),
                    _fmt(m.get("recall@20")),
                    _int(m.get("distinct@10")),
                ]
            )
    section.tables.append(
        Table(
            "baselines",
            "Baseline accuracy and variety",
            [
                "Split",
                "Baseline",
                "NDCG@10",
                "NDCG@10 95% interval",
                "HR@10",
                "Recall@20",
                "Distinct items in top-10 lists",
            ],
            rows,
        )
    )
    section.notes.append(
        "Reading: NDCG@10 and HR@10 reward putting held-out items near the top of a list of "
        "ten; 'distinct items' counts how many different items appear in anyone's top ten "
        "(MostPopular shows the same few to everybody)."
    )
    section.limitations = [
        "Rank metrics are computed over the filtered catalogue, so absolute values are higher "
        "than they would be over the raw catalogue."
    ]

    def figure() -> Figure | None:
        names = sorted({k for p in phases.values() for k in _d(p)}, key=_baseline_order)
        labels = [_baseline_label(k) for k in names]
        series: list[tuple[str, list[float | None]]] = []
        errors: dict[str, list[tuple[float, float] | None]] = {}
        for split in sorted(phases, key=lambda s: (s != "validation", s)):
            values = [_num(_get(phases[split], k, "ndcg@10")) for k in names]
            series.append((split, values))
            pairs: list[tuple[float, float] | None] = []
            for k in names:
                ci = _l(_get(phases[split], k, "ndcg_ci95"))
                low, high = (_num(ci[0]), _num(ci[1])) if len(ci) == 2 else (None, None)
                pairs.append((low, high) if low is not None and high is not None else None)
            errors[split] = pairs
        png = _grouped_bars(labels, series, "NDCG@10 (higher is better)", "Baseline", errors)
        if png is None:
            return None
        return Figure(
            "NDCG@10 of each baseline",
            "NDCG@10 per baseline on the validation and test splits; whiskers are 95% "
            "bootstrap intervals over users. The value axis starts at zero.",
            png,
        )

    section.figures = _figure(figure)
    return section


def _level_order(key: str) -> tuple[int, float, str]:
    def tail(prefix: str) -> float:
        try:
            return float(key.split(prefix)[-1])
        except ValueError:
            return 0.0

    if key == "nondp":
        return (0, 0.0, key)
    if key == "cliponly":
        return (1, 0.0, key)
    if key.startswith("eps"):
        return (2, tail("eps"), key)
    if key.startswith("whatif"):
        return (3, tail("x"), key)
    return (4, 0.0, key)


def _level_label(key: str) -> str:
    if key == "nondp":
        return "non-private"
    if key == "cliponly":
        return "clip only (not private)"
    if key.startswith("eps"):
        return f"epsilon {key[3:]}"
    if key.startswith("whatif-x"):
        return f"what-if: noise divided by {key[8:]}"
    return key


def _holm(value: Any) -> str:
    if value is True:
        return "differs from non-private"
    if value is False:
        return "no detectable difference"
    return "n/a"


def _regime_reference(regime: dict[str, Any], baselines: dict[str, Any]) -> dict[str, float | None]:
    return {
        "nondp": _num(_get(regime, "levels", "nondp", "ndcg@10_mean")),
        "most_popular": _num(regime.get("most_popular_ndcg@10"))
        or _num(_get(baselines, "most_popular", "ndcg@10")),
    }


def build_rq1(inputs: Inputs) -> Section:
    title = dict(SECTION_ORDER)["rq1"]
    payload = inputs.get("privacy_utility")
    if payload is None:
        return _not_run(inputs, "rq1", title, ["privacy_utility"])
    section = _finish(Section("rq1", title), payload)
    summary = _d(payload.get("summary"))
    section.summary = (
        "A recommender trained with user-level differential privacy at several epsilon "
        "levels, in two sampling regimes (sampling rate and rounds), compared with the "
        "non-private model of the same regime. Evaluated on the "
        f"{_text(payload.get('evaluated_on'))} split, {_int(payload.get('runs'))} runs."
    )
    headers = [
        "Regime",
        "Privacy level",
        "Seeds",
        "Epsilon of record",
        "Epsilon at delta 1/n^2",
        "Epsilon without amplification",
        "NDCG@10 mean",
        "NDCG@10 95% interval",
        "Retention",
        "Personalisation retained",
        "Holm decision",
    ]
    rows: list[list[str]] = []
    for regime in sorted(summary):
        levels = _d(_d(summary[regime]).get("levels"))
        for key in sorted(levels, key=_level_order):
            e = _d(levels[key])
            rows.append(
                [
                    regime,
                    _level_label(key),
                    _int(e.get("seeds")),
                    _fmt(e.get("epsilon_of_record"), 2),
                    _fmt(e.get("epsilon_at_delta_n2"), 2),
                    _fmt(e.get("epsilon_unamplified"), 2),
                    _fmt(e.get("ndcg@10_mean")),
                    _interval(e.get("ndcg@10_ci95")),
                    _fmt(e.get("retention"), 3),
                    _fmt(e.get("personalisation_retained"), 3),
                    _holm(e.get("holm_rejects_no_difference")),
                ]
            )
    section.tables.append(
        Table("rq1_privacy_utility", "Utility at each privacy level", headers, rows)
    )
    section.notes.append(
        "Retention is private NDCG@10 divided by non-private NDCG@10 of the same regime. "
        "Personalisation retained is (private minus MostPopular) divided by (non-private minus "
        "MostPopular): how much of the gain over the same list for everyone survives. The Holm "
        "decision compares each level with the non-private model across seeds, adjusted for "
        "several comparisons."
    )
    baselines = _d(payload.get("baselines"))
    fallback = _d(
        _get(
            inputs.get("baselines"),
            "phases",
            "test" if payload.get("evaluated_on") != "validation" else "validation",
        )
    )
    ridge = _num(_get(baselines, "item_ridge", "ndcg@10")) or _num(
        _get(fallback, "item_ridge", "ndcg@10")
    )

    def main_figure() -> Figure | None:
        fig, ax = _new_axes(
            "Epsilon of record (log scale; smaller is more private)", "NDCG@10 (higher is better)"
        )
        drawn = False
        for index, regime in enumerate(sorted(summary)):
            colour = PALETTE[index % len(PALETTE)]
            levels = _d(_d(summary[regime]).get("levels"))
            points = []
            for key, entry in levels.items():
                e = _d(entry)
                x, y = _num(e.get("epsilon_of_record")), _num(e.get("ndcg@10_mean"))
                if key.startswith("eps") and x is not None and y is not None and x > 0:
                    ci = _l(e.get("ndcg@10_ci95"))
                    low = _num(ci[0]) if len(ci) == 2 else None
                    high = _num(ci[1]) if len(ci) == 2 else None
                    points.append((x, y, low, high))
            points.sort()
            if points:
                drawn = True
                xs = [p[0] for p in points]
                ys = [p[1] for p in points]
                err = np.array(
                    [
                        [0.0 if p[2] is None else max(p[1] - p[2], 0.0) for p in points],
                        [0.0 if p[3] is None else max(p[3] - p[1], 0.0) for p in points],
                    ]
                )
                ax.errorbar(
                    xs,
                    ys,
                    yerr=err,
                    color=colour,
                    marker=MARKERS[index % len(MARKERS)],
                    capsize=3,
                    linewidth=1.6,
                    label=f"private model, {regime} regime",
                )
            ref = _regime_reference(_d(summary[regime]), baselines)
            if ref["nondp"] is not None:
                ax.axhline(
                    ref["nondp"],
                    color=colour,
                    linestyle=":",
                    linewidth=1.4,
                    label=f"non-private model, {regime} regime",
                )
        if not drawn:
            plt.close(fig)
            return None
        popular = next(
            (
                v
                for v in (_num(_d(summary[r]).get("most_popular_ndcg@10")) for r in sorted(summary))
                if v is not None
            ),
            _num(_get(baselines, "most_popular", "ndcg@10")),
        )
        if popular is not None:
            ax.axhline(
                popular,
                color="#666666",
                linestyle="--",
                linewidth=1.2,
                label="MostPopular (same list for everyone)",
            )
        if ridge is not None:
            ax.axhline(
                ridge,
                color="#000000",
                linestyle="-.",
                linewidth=1.2,
                label="item-item ridge (non-private ceiling)",
            )
        ax.set_xscale("log")
        ax.set_ylim(bottom=0.0)
        _legend(ax, below=True)
        return Figure(
            "NDCG@10 against epsilon",
            "NDCG@10 of the private model at each epsilon of record, with 95% intervals over "
            "seeds. Dotted lines: the non-private model of each regime. Dashed and dash-dotted "
            "lines: MostPopular and the item-item ridge baseline.",
            _png(fig),
        )

    def whatif_figure() -> Figure | None:
        fig, ax = _new_axes("Epsilon of record (log scale)", "NDCG@10 (higher is better)", 6.4, 3.6)
        drawn = False
        for index, regime in enumerate(sorted(summary)):
            levels = _d(_d(summary[regime]).get("levels"))
            points = sorted(
                (_num(_d(e).get("epsilon_of_record")), _num(_d(e).get("ndcg@10_mean")))
                for key, e in levels.items()
                if key.startswith("whatif")
            )
            pts = [(x, y) for x, y in points if x is not None and y is not None and x > 0]
            if pts:
                drawn = True
                ax.plot(
                    [p[0] for p in pts],
                    [p[1] for p in pts],
                    color=PALETTE[index % len(PALETTE)],
                    marker=MARKERS[index % len(MARKERS)],
                    linewidth=1.6,
                    label=f"what-if levels, {regime} regime",
                )
        if not drawn:
            plt.close(fig)
            return None
        ax.set_xscale("log")
        ax.set_ylim(bottom=0.0)
        _legend(ax, below=True)
        return Figure(
            "What-if levels",
            "Dividing the noise by k simulates a larger population; each point carries the "
            "larger epsilon that noise really gives. This is an illustration, not a guarantee.",
            _png(fig),
        )

    section.figures = _figure(main_figure) + _figure(whatif_figure)
    return section


def _eps_label(key: str) -> str:
    return "non-private" if key in {"nonprivate", "nondp", "None"} else f"epsilon {key}"


def _seed_count(seeds: Any) -> str:
    count = len(_l(seeds))
    return f"{count} seeds" if count else "seeds n/a"


def build_rq2(inputs: Inputs) -> Section:
    title = dict(SECTION_ORDER)["rq2"]
    payload = inputs.get("gossip")
    if payload is None:
        return _not_run(inputs, "rq2", title, ["gossip"])
    section = _finish(Section("rq2", title), payload)
    results = _d(payload.get("results"))
    section.summary = (
        "Training by gossip between friends with local noise on each device, compared with "
        "server-based federated training with central noise, on the same users and at the "
        f"same epsilon. {_int(results.get('nodes'))} nodes, "
        f"{_seed_count(_get(payload, 'settings', 'seeds'))}; share of gossip peers who are real "
        f"friends: {_fmt(results.get('friend_peer_share'), 3)}."
    )
    by_eps = _d(results.get("by_epsilon"))
    keys = sorted(by_eps, key=lambda k: (k != "nonprivate", _key_num(k) or 0.0, k))
    with_replace = any(
        "gossip_local_replace_adjacency" in _d(_d(by_eps[k]).get("epsilon_claimed")) for k in keys
    )
    rows = []
    for key in keys:
        e = _d(by_eps[key])
        row = [
            _eps_label(key),
            _fmt(_get(e, "gossip_ndcg10", "mean")),
            _fmt(_get(e, "federated_ndcg10", "mean")),
            _fmt(e.get("most_popular_ndcg10")),
            _fmt(_get(e, "gap", "mean")),
            _interval(_get(e, "gap", "ci95")),
            _fmt(_get(e, "epsilon_claimed", "gossip_local"), 2),
        ]
        if with_replace:
            row.append(_fmt(_get(e, "epsilon_claimed", "gossip_local_replace_adjacency"), 2))
        row += [
            _fmt(_get(e, "epsilon_claimed", "federated"), 2),
            _fmt(_get(e, "bytes", "gossip_over_federated_total"), 3),
        ]
        rows.append(row)
    replace_header = (
        ["Epsilon, gossip (local, replace adjacency, sensitivity 2C)"] if with_replace else []
    )
    section.tables.append(
        Table(
            "rq2_gossip",
            "Gossip versus federated training",
            [
                "Setting",
                "Gossip NDCG@10",
                "Federated NDCG@10",
                "MostPopular NDCG@10",
                "Gap (federated minus gossip)",
                "Gap 95% interval (over users)",
                "Epsilon claimed, gossip (local, add-or-remove)",
                *replace_header,
                "Epsilon of record, federated",
                "Bytes: gossip over federated",
            ],
            rows,
        )
    )

    def figure() -> Figure | None:
        labels = [_eps_label(k) for k in keys]
        png = _grouped_bars(
            labels,
            [
                (
                    "gossip with local noise",
                    [_num(_get(by_eps[k], "gossip_ndcg10", "mean")) for k in keys],
                ),
                (
                    "federated with central noise",
                    [_num(_get(by_eps[k], "federated_ndcg10", "mean")) for k in keys],
                ),
                ("MostPopular", [_num(_d(by_eps[k]).get("most_popular_ndcg10")) for k in keys]),
            ],
            "NDCG@10 (higher is better)",
            "Training setting",
        )
        if png is None:
            return None
        return Figure(
            "Gossip against federated training",
            "NDCG@10 of gossip and federated training at the same epsilon, with MostPopular for "
            "scale. The value axis starts at zero.",
            png,
        )

    section.figures = _figure(figure)
    return section


def _setting_order(key: str) -> tuple[int, float, str]:
    def tail(text: str) -> float:
        try:
            return float(text)
        except ValueError:
            return 0.0

    if key == "raw":
        return (0, 0.0, key)
    if key.startswith("local_noise_z"):
        return (1, tail(key[len("local_noise_z") :]), key)
    if key == "masked":
        return (2, 0.0, key)
    if key.startswith("sum_"):
        body = key[4:]
        dp = body.endswith("_dp")
        return (3 + int(dp), tail(body.removesuffix("_dp")), key)
    return (9, 0.0, key)


def _setting_label(key: str) -> str:
    if key == "raw":
        return "raw clipped update"
    if key.startswith("local_noise_z"):
        return f"local noise, z = {key[len('local_noise_z') :]}"
    if key == "masked":
        return "one masked secure-aggregation payload"
    if key.startswith("sum_") and key.endswith("_dp"):
        return f"secure sum of {key[4:-3]} users plus central DP noise"
    if key.startswith("sum_"):
        return f"secure sum of {key[4:]} users"
    if key == "reference_histories":
        return "true histories (reference for the link attack)"
    return key


def _link_text(link: Any) -> str:
    if link == "not_applicable":
        return "not applicable under secure aggregation"
    if link == "no_friend_graph":
        return "no friend graph"
    if isinstance(link, dict):
        return _fmt(link.get("auc"))
    return "n/a"


def build_rq3(inputs: Inputs) -> Section:
    title = dict(SECTION_ORDER)["rq3"]
    leak, member = inputs.get("update_leakage"), inputs.get("membership")
    if leak is None and member is None:
        return _not_run(inputs, "rq3", title, ["update_leakage", "membership"])
    section = Section("rq3", title)
    section.summary = (
        "Two attacks on what a trained model or its updates reveal about a user. History "
        "recovery and friendship inference try to read a user's own update; membership "
        "inference asks whether a user took part in training at all."
    )
    statuses: list[str] = []
    for name, payload in (("update_leakage", leak), ("membership", member)):
        if payload is None:
            section.notes.append(f"{name}: not run (results/{name}.json not found).")
            continue
        status, reasons = _status(payload)
        statuses.append(status)
        section.reasons += [f"{name}: {r}" for r in reasons] if status == INVALID else []
        section.limitations += _strings(payload.get("limitations"))
    section.status = INVALID if INVALID in statuses else VALID
    control_rows: list[list[str]] = []
    for payload in (leak, member):
        table = _controls_table(_d(payload).get("controls")) if payload else None
        if table:
            control_rows += table.rows
    if control_rows:
        section.controls = Table(
            "",
            "Controls",
            ["Control", "What was measured", "Measured", "Threshold", "Result"],
            control_rows,
        )

    if leak is not None:
        results = _d(leak.get("results"))
        rows = []
        for key in sorted(results, key=_setting_order):
            entry = _d(results[key])
            recovery = entry.get("recovery")
            rec = _d(recovery)
            note = "" if rec else _text(recovery) if recovery is not None else ""
            rows.append(
                [
                    _setting_label(key),
                    _fmt(_get(rec, "auc", "mean")),
                    _interval(_get(rec, "auc", "ci95")),
                    _fmt(_get(rec, "precision_at_10", "mean")),
                    _fmt(_get(rec, "prior_precision_at_10", "mean")),
                    _fmt(_get(rec, "prior_auc", "mean")),
                    _link_text(entry.get("link")),
                    note.replace("_", " ") if note else "",
                ]
            )
        section.tables.append(
            Table(
                "rq3_update_leakage",
                "History recovery and friendship inference from updates",
                [
                    "Setting",
                    "History AUC",
                    "History AUC 95% interval",
                    "Precision@10",
                    "Popularity prior precision@10",
                    "Popularity prior AUC",
                    "Friendship-link AUC",
                    "Note",
                ],
                rows,
            )
        )

        def leak_figure() -> Figure | None:
            keys = [
                k
                for k in sorted(results, key=_setting_order)
                if _num(_get(results[k], "recovery", "auc", "mean")) is not None
            ]
            png = _grouped_bars(
                [_setting_label(k).replace(" plus ", "\nplus ") for k in keys],
                [
                    (
                        "history recovery from the update",
                        [_num(_get(results[k], "recovery", "auc", "mean")) for k in keys],
                    ),
                    (
                        "popularity prior (no update used)",
                        [_num(_get(results[k], "recovery", "prior_auc", "mean")) for k in keys],
                    ),
                ],
                "AUC of history recovery (0.5 is chance)",
                "What the attacker sees",
                reference=(0.5, "chance (AUC 0.5)"),
            )
            if png is None:
                return None
            return Figure(
                "History recovery against the popularity prior",
                "How well an attacker ranks a user's true items, using the update (solid) versus "
                "only item popularity (hatched). The value axis starts at zero.",
                png,
            )

        section.figures += _figure(leak_figure)

    if member is not None:
        results = _d(member.get("results"))
        levels = _d(results.get("levels"))
        rows = []
        for key in sorted(levels, key=_level_order):
            e = _d(levels[key])
            agg = _d(e.get("aggregate"))
            rows.append(
                [
                    _level_label(key),
                    _fmt(e.get("claimed_epsilon"), 2),
                    _fmt(_get(agg, "auc", "mean")),
                    _fmt(_get(agg, "tpr_at_1pct_fpr", "mean")),
                    _fmt(_get(agg, "epsilon_lower_bound", "max"), 2),
                    _text(e.get("bound_within_claim")),
                ]
            )
        section.tables.append(
            Table(
                "rq3_membership",
                "Membership inference",
                [
                    "Privacy level",
                    "Claimed epsilon",
                    "AUC (mean over seeds)",
                    "TPR at 1% FPR",
                    "Empirical epsilon lower bound (max over seeds)",
                    "Bound within claim",
                ],
                rows,
            )
        )

        def member_figure() -> Figure | None:
            keys = sorted(levels, key=_level_order)
            png = _grouped_bars(
                [_level_label(k) for k in keys],
                [
                    (
                        "empirical epsilon lower bound",
                        [
                            _num(_get(levels[k], "aggregate", "epsilon_lower_bound", "max"))
                            for k in keys
                        ],
                    ),
                    ("claimed epsilon", [_num(_d(levels[k]).get("claimed_epsilon")) for k in keys]),
                ],
                "Epsilon",
                "Privacy level",
            )
            if png is None:
                return None
            return Figure(
                "Measured leakage against claimed epsilon",
                "The attack's empirical epsilon lower bound (what it provably showed) next to "
                "the epsilon the training claims. A bound above the claim would indicate a "
                "broken implementation. The value axis starts at zero.",
                png,
            )

        section.figures += _figure(member_figure)
    return section


def _committee_table(payload: dict[str, Any]) -> Table | None:
    trade = _d(payload.get("committee_tradeoff"))
    rows = []
    for mode in sorted(trade, key=lambda m: _num(_get(trade, m, "committee_size")) or 0.0):
        entry = _d(trade[mode])
        for item in _l(entry.get("per_fraction")):
            share = _num(_d(item).get("fraction"))
            rows.append(
                [
                    _int(entry.get("committee_size")),
                    "n/a" if share is None else f"{100 * share:.0f}%",
                    _fmt(_d(item).get("clean_committee_share"), 3),
                    _fmt(_d(item).get("target_exposure")),
                    _fmt(entry.get("clean_ndcg_at_fraction_0")),
                ]
            )
    if not rows:
        return None
    return Table(
        "rq4_committee",
        "Committee trade-off",
        [
            "Committee size",
            "Attacker share",
            "Share of attacker-free committees",
            "Target exposure",
            "Clean NDCG@10 (no attackers)",
        ],
        rows,
    )


def _range_text(per_seed: Any) -> str:
    lows = [_num(_d(x).get("ci95_low")) for x in _l(per_seed)]
    highs = [_num(_d(x).get("ci95_high")) for x in _l(per_seed)]
    low = [v for v in lows if v is not None]
    high = [v for v in highs if v is not None]
    if not low or not high:
        return "n/a"
    return f"[{min(low):.4f}, {max(high):.4f}]"


def _auc_cell(stats: Any) -> str:
    return _fmt(_d(stats).get("mean"), 3) if isinstance(stats, dict) else "n/a"


def _add_free_riding(section: Section, free: dict[str, Any], alone: bool) -> None:
    status, reasons = _status(free)
    if alone or status == INVALID:
        section.status = status if alone else INVALID
    section.reasons += [f"free_riding: {r}" for r in reasons] if status == INVALID else []
    controls = _controls_table(free.get("controls"))
    results = _d(free.get("results"))
    clean = _num(_get(results, "clean", "ndcg", "mean"))
    rows = []
    for behaviour in sorted(k for k in results if k != "clean"):
        cells = _d(results[behaviour])
        for fraction in sorted(cells, key=lambda f: _key_num(f) or 0.0):
            c = _d(cells[fraction])
            share = _key_num(fraction)
            det = _d(c.get("detection"))
            secure = det.get("secure_aggregation")
            rows.append(
                [
                    behaviour,
                    "n/a" if share is None else f"{100 * share:.0f}%",
                    _fmt(_get(c, "ndcg", "mean")),
                    _fmt(_get(c, "cost_to_everyone", "relative_ndcg_drop"), 3),
                    _fmt(_get(c, "free_rider_gain", "difference_mean")),
                    _range_text(_get(c, "free_rider_gain", "per_seed")),
                    _auc_cell(det.get("norm_auc")),
                    _auc_cell(det.get("cosine_auc")),
                    "not applicable under secure aggregation"
                    if secure == "not_applicable"
                    else _text(secure),
                ]
            )
    section.tables.append(
        Table(
            "rq4_free_riding",
            "Free-riding clients",
            [
                "Behaviour",
                "Free-rider share",
                "Overall NDCG@10",
                "Drop vs 0% free-riders",
                "Free-riders minus contributors NDCG@10",
                "Range over seeds of the 95% interval",
                "Detection AUC by update norm (server sees updates)",
                "Detection AUC by cosine (server sees updates)",
                "Detection under secure aggregation",
            ],
            rows,
        )
    )
    if controls is not None:
        controls.title = "Free-riding controls"
        section.tables.append(controls)
    section.notes.append(
        "Free-riding clients send an update that costs nothing (zeros, or noise with the honest "
        f"norm). NDCG@10 with no free-riders: {_fmt(clean)}."
    )
    section.limitations += _strings(free.get("limitations"))


def build_rq4(inputs: Inputs) -> Section:
    title = dict(SECTION_ORDER)["rq4"]
    poison, free = inputs.get("poisoning"), inputs.get("free_riding")
    if poison is None and free is None:
        return _not_run(inputs, "rq4", title, ["poisoning", "free_riding"])
    section = _rq4_poisoning(inputs) if poison is not None else Section("rq4", title)
    if free is not None:
        _add_free_riding(section, free, poison is None)
    else:
        section.notes.append("Free-riding clients: not run (results/free_riding.json not found).")
    if poison is None:
        section.notes.append("Poisoning modes: not run (results/poisoning.json not found).")
    return section


def _rq4_poisoning(inputs: Inputs) -> Section:
    title = dict(SECTION_ORDER)["rq4"]
    payload = inputs.get("poisoning")
    if payload is None:
        return _not_run(inputs, "rq4", title, ["poisoning"])
    section = _finish(Section("rq4", title), payload)
    results = _d(payload.get("results"))
    section.summary = (
        "Fake accounts try to push one target item into other users' recommendations. Target "
        "exposure is measured against the share of fake accounts, for each way the server "
        "combines updates."
    )
    rows = []
    for mode in sorted(results):
        cells = _d(results[mode])
        for fraction in sorted(cells, key=lambda f: _key_num(f) or 0.0):
            c = _d(cells[fraction])
            share = _key_num(fraction)
            rows.append(
                [
                    mode.replace("_", " "),
                    "n/a" if share is None else f"{100 * share:.0f}%",
                    _fmt(_get(c, "exposure", "mean")),
                    _fmt(_get(c, "exposure", "min")),
                    _fmt(_get(c, "exposure", "max")),
                    _fmt(_get(c, "ndcg", "mean")),
                    _fmt(c.get("utility_drop"), 3),
                    _fmt(c.get("exposure_ratio"), 3),
                ]
            )
    section.tables.append(
        Table(
            "rq4_poisoning",
            "Target exposure and utility by aggregation mode",
            [
                "Aggregation mode",
                "Attacker share",
                "Target exposure (mean)",
                "Exposure min over seeds",
                "Exposure max over seeds",
                "NDCG@10",
                "Utility drop vs clean",
                "Exposure over clean",
            ],
            rows,
        )
    )
    committee = _committee_table(payload)
    if committee is not None:
        section.tables.append(committee)
    h4 = _d(payload.get("h4"))
    if h4:
        section.notes.append(f"H4 readout: {_h4_numbers(h4)}.")

    def figure() -> Figure | None:
        fig, ax = _new_axes(
            "Attacker share of accounts (%)", "Target exposure (share of users shown the item)"
        )
        drawn = False
        for index, mode in enumerate(sorted(results)):
            pts = []
            for fraction, cell in _d(results[mode]).items():
                x, y = _key_num(fraction), _num(_get(cell, "exposure", "mean"))
                if x is not None and y is not None:
                    pts.append(
                        (
                            100 * x,
                            y,
                            _num(_get(cell, "exposure", "min")),
                            _num(_get(cell, "exposure", "max")),
                        )
                    )
            pts.sort()
            if not pts:
                continue
            drawn = True
            low = [0.0 if p[2] is None else max(p[1] - p[2], 0.0) for p in pts]
            high = [0.0 if p[3] is None else max(p[3] - p[1], 0.0) for p in pts]
            ax.errorbar(
                [p[0] for p in pts],
                [p[1] for p in pts],
                yerr=np.array([low, high]),
                color=PALETTE[index % len(PALETTE)],
                marker=MARKERS[index % len(MARKERS)],
                capsize=3,
                linewidth=1.6,
                label=mode.replace("_", " "),
            )
        if not drawn:
            plt.close(fig)
            return None
        ax.set_ylim(bottom=0.0)
        _legend(ax)
        return Figure(
            "Target exposure against attacker share",
            "Mean target exposure per aggregation mode as the share of fake accounts grows; "
            "whiskers span the smallest and largest value over seeds.",
            _png(fig),
        )

    section.figures = _figure(figure)
    return section


GROUP_LABELS = ("least active third", "middle third", "most active third")


SCENARIO_ORDER = (
    "always",
    "independent",
    "activity",
    "social",
    "trace",
    "trace_activity",
    "trace_replay",
)


def _scenario_order(name: str) -> tuple[int, str]:
    return (SCENARIO_ORDER.index(name) if name in SCENARIO_ORDER else len(SCENARIO_ORDER), name)


def _add_trace_tables(section: Section, payload: dict[str, Any], results: dict[str, Any]) -> None:
    availability = _d(results.get("availability"))
    if availability:
        rows = []
        for scenario in sorted(availability, key=_scenario_order):
            a = _d(availability[scenario])
            rows.append(
                [
                    scenario,
                    _fmt(a.get("mean"), 3),
                    " / ".join(_fmt(v, 3) for v in _l(a.get("activity_groups"))) or "n/a",
                    " / ".join(_fmt(v, 3) for v in _l(a.get("degree_groups"))) or "n/a",
                ]
            )
        section.tables.append(
            Table(
                "rq5_availability",
                "Mean availability by scenario",
                [
                    "Scenario",
                    "Mean availability",
                    "By activity group (least / middle / most active)",
                    "By friend-count group (0 / 1 to 5 / more than 5)",
                ],
                rows,
            )
        )
    readout = _d(results.get("trace_readout"))
    overall = _d(readout.get("overall_ndcg10"))
    widen = _d(readout.get("rank_matching_widens_activity_gap"))
    if overall:
        rows = []
        for key in sorted(overall, key=lambda k: (k != "nondp", _key_num(k) or 0.0, k)):
            o, w = _d(overall[key]), _d(widen.get(key))
            seeds = _int(w.get("seeds")) if w else "n/a"
            rows.append(
                [
                    _eps_label(key),
                    _fmt(o.get("trace")),
                    _fmt(o.get("trace_replay")),
                    _fmt(o.get("independent")),
                    _fmt(o.get("always")),
                    _fmt(o.get("trace_minus_independent")),
                    _fmt(o.get("trace_replay_minus_independent")),
                    f"{_int(w.get('seeds_improved'))} of {seeds}" if w else "n/a",
                    _fmt(w.get("mean_difference")) if w else "n/a",
                ]
            )
        section.tables.append(
            Table(
                "rq5_trace_readout",
                "Trace readout",
                [
                    "Privacy level",
                    "trace NDCG@10",
                    "trace_replay NDCG@10",
                    "independent NDCG@10",
                    "always NDCG@10",
                    "trace minus independent",
                    "trace_replay minus independent",
                    "Seeds where rank-matching widens the activity gap (trace_activity vs trace)",
                    "Mean change of the activity gap",
                ],
                rows,
            )
        )
    info = _d(_get(payload, "settings", "trace"))
    if info:
        summary = _d(info.get("summary"))
        section.notes.append(
            f"Device trace: {_int(summary.get('devices'))} devices, mean active share "
            f"{_fmt(summary.get('mean_active_share'), 3)}; one training round is "
            f"{_int(info.get('seconds_per_round'))} seconds of trace time (an assumption). "
            "Epsilon is exact for trace and trace_replay and nominal for trace_activity."
        )
    elif not any(str(k).startswith("trace") for k in _d(results.get("cells"))):
        section.notes.append("Trace scenarios: not run (no device trace results).")


def build_rq5(inputs: Inputs) -> Section:
    title = dict(SECTION_ORDER)["rq5"]
    payload = inputs.get("participation")
    if payload is None:
        return _not_run(inputs, "rq5", title, ["participation"])
    section = _finish(Section("rq5", title), payload)
    results = _d(payload.get("results"))
    cells = _d(results.get("cells"))
    section.summary = (
        "Clients are not always available. When availability follows activity or friend count, "
        "does the model serve the less available groups worse? Groups are thirds of history "
        "length (activity) and bands of friend count (degree)."
    )

    def triple(values: Any) -> str:
        items = _l(values)
        return " / ".join(_fmt(v) for v in items) if items else "n/a"

    rows = []
    for scenario in sorted(cells, key=_scenario_order):
        by_eps = _d(cells[scenario])
        for key in sorted(by_eps, key=lambda k: (k != "nondp", _key_num(k) or 0.0, k)):
            c = _d(by_eps[key])
            rows.append(
                [
                    scenario,
                    _eps_label(key),
                    _fmt(c.get("epsilon_of_record"), 2),
                    _fmt(_get(c, "overall_ndcg10", "mean")),
                    triple(c.get("activity_groups_ndcg10")),
                    _fmt(_get(c, "activity_gap", "mean")),
                    triple(c.get("degree_groups_ndcg10")),
                    _fmt(_get(c, "degree_gap", "mean")),
                    _fmt(
                        _get(c, "gap_change_vs_independent", "activity", "wilcoxon_two_sided_p"), 4
                    ),
                    _text(c.get("epsilon_note")) if c.get("epsilon_note") is not None else "n/a",
                ]
            )
    section.tables.append(
        Table(
            "rq5_participation",
            "NDCG@10 by group and scenario",
            [
                "Scenario",
                "Privacy level",
                "Epsilon of record",
                "Overall NDCG@10",
                "Activity groups NDCG@10 (least / middle / most active)",
                "Activity gap (most minus least)",
                "Friend-count groups NDCG@10 (0 / 1 to 5 / more than 5)",
                "Friend-count gap",
                "Paired Wilcoxon p, activity gap vs independent (underpowered: min 0.0625 with 5 seeds)",
                "Epsilon note",
            ],
            rows,
        )
    )
    _add_trace_tables(section, payload, results)
    h5 = _d(results.get("h5"))
    if h5.get("rule"):
        section.notes.append(f"H5 rule: {_text(h5.get('rule'))}")
    pattern = _h5_pattern(h5)
    if pattern:
        section.notes.append(f"H5 sign pattern: {pattern}.")
    for note in _strings(results.get("notes")):
        section.notes.append(note)

    def figure() -> Figure | None:
        counts: dict[str, int] = {}
        for by_eps in cells.values():
            for key in _d(by_eps):
                counts[key] = counts.get(key, 0) + 1
        if not counts:
            return None
        chosen = max(counts, key=lambda k: (counts[k], k != "nondp", _key_num(k) or 0.0))
        scenarios = [s for s in sorted(cells) if chosen in _d(cells[s])]
        series = []
        for g, label in enumerate(GROUP_LABELS):
            vals: list[float | None] = []
            for s in scenarios:
                groups = _l(_get(cells[s], chosen, "activity_groups_ndcg10"))
                vals.append(_num(groups[g]) if len(groups) > g else None)
            series.append((label, vals))
        png = _grouped_bars(
            scenarios, series, "NDCG@10 (higher is better)", "Availability scenario"
        )
        if png is None:
            return None
        return Figure(
            f"NDCG@10 by activity group ({_eps_label(chosen)})",
            "NDCG@10 of the least, middle and most active thirds of users under each "
            "availability scenario. The value axis starts at zero.",
            png,
        )

    section.figures = _figure(figure)
    return section


def build_rq6(inputs: Inputs) -> Section:
    title = dict(SECTION_ORDER)["rq6"]
    payload = inputs.get("ledger_audit")
    if payload is None:
        return _not_run(inputs, "rq6", title, ["ledger_audit"])
    section = _finish(Section("rq6", title), payload)
    r = _d(payload.get("results"))
    verification, coverage = _d(r.get("verification")), _d(r.get("coverage"))
    tamper, costs = _d(r.get("tamper_detection")), _d(r.get("costs"))
    overhead, blocked = _d(r.get("receipt_overhead")), _d(r.get("blocked_release_demo"))
    section.summary = (
        "Every private run writes a signed, append-only ledger of its privacy receipts. The "
        "audit verifies every ledger, checks that each private run ended in a release receipt, "
        "flips single bytes to see whether tampering is detected, and measures what the log "
        "costs."
    )
    rows = [
        [
            "Ledgers verified",
            f"{_int(verification.get('verified'))} of {_int(verification.get('ledgers'))}",
        ],
        ["Round receipts", _int(verification.get("round_receipts"))],
        ["Release receipts", _int(verification.get("release_receipts"))],
        ["Refusal receipts", _int(verification.get("refusal_receipts"))],
        ["Ledger bytes per round", _fmt(verification.get("bytes_per_round"), 1)],
        ["Private runs", _int(coverage.get("private_runs"))],
        [
            "Private runs without a valid release receipt",
            _int(coverage.get("without_valid_release_receipt")),
        ],
        ["Receipt coverage", _fmt(coverage.get("coverage"), 3)],
        ["Single-byte tampers tried", _int(tamper.get("flips"))],
        ["Tampers detected", _int(tamper.get("detected"))],
        ["Detection rate", _fmt(tamper.get("rate"), 3)],
        ["Append time per receipt (ms)", _fmt(costs.get("append_ms_per_receipt"), 2)],
        ["Whole-ledger verification time (s)", _fmt(costs.get("verify_seconds"), 3)],
        ["Inclusion proof size (bytes)", _int(costs.get("inclusion_proof_bytes"))],
        [
            "Mean share of run time spent on receipts",
            _fmt(overhead.get("mean_share_of_run_time"), 4),
        ],
        ["Blocked-release demo: rounds asked", _int(blocked.get("rounds_asked"))],
        ["Blocked-release demo: rounds allowed by budget", _int(blocked.get("rounds_allowed"))],
        ["Blocked-release demo: rounds completed", _int(blocked.get("rounds_completed"))],
        [
            "Blocked-release demo: release blocked",
            _text(blocked.get("blocked")) if "blocked" in blocked else "n/a",
        ],
    ]
    section.tables.append(Table("rq6_ledger", "Ledger audit", ["Measurement", "Value"], rows))

    def figure() -> Figure | None:
        tried, detected = _num(tamper.get("flips")), _num(tamper.get("detected"))
        if tried is None or detected is None:
            return None
        png = _grouped_bars(
            ["Single-byte tampers"],
            [("tampers tried", [tried]), ("tampers detected", [detected])],
            "Number of tampered copies of a ledger",
            "Tamper test",
        )
        if png is None:
            return None
        return Figure(
            "Tamper detection",
            "Single bytes flipped one at a time in a copy of one ledger; every flip should be "
            "detected. The value axis starts at zero.",
            png,
        )

    section.figures = _figure(figure)
    return section


VARIANT_LABELS = {
    "k10": "k-core 10",
    "k15": "k-core 15 (main dataset, reference)",
    "k20": "k-core 20",
    "stars4": "4 stars or more",
}
VARIANT_ORDER = ("k10", "k15", "k20", "stars4")
H1_TARGET = 0.9


def _variant_order(name: str) -> tuple[int, str]:
    return (VARIANT_ORDER.index(name) if name in VARIANT_ORDER else len(VARIANT_ORDER), name)


def build_sensitivity(inputs: Inputs) -> Section:
    title = dict(SECTION_ORDER)["sensitivity"]
    payload = inputs.get("sensitivity")
    if payload is None:
        return _not_run(inputs, "sensitivity", title, ["sensitivity"])
    section = _finish(Section("sensitivity", title), payload)
    results = _d(payload.get("results"))
    section.summary = (
        "The privacy-utility result is repeated on variants of the dataset: the k-core filter "
        "at k = 10 and k = 20 (the main dataset uses k = 15) and a variant keeping only "
        "reviews of 4 stars or more. Hyperparameters stay frozen at the values tuned on the "
        "main dataset. The question is whether the epsilon 8 conclusion changes."
    )
    rows: list[list[str]] = []
    for name in sorted(results, key=_variant_order):
        for regime in sorted(_d(results[name])):
            r = _d(results[name][regime])
            e = _d(_get(r, "epsilons", "8"))
            same = _get(r, "conclusion_stable", "h1_verdict_same")
            rows.append(
                [
                    VARIANT_LABELS.get(name, name),
                    regime,
                    _int(r.get("users")),
                    _int(r.get("items")),
                    _int(r.get("interactions")),
                    _fmt(r.get("most_popular_ndcg@10")),
                    _fmt(r.get("item_ridge_ndcg@10")),
                    _fmt(r.get("nondp_ndcg@10")),
                    _fmt(e.get("ndcg@10")),
                    _fmt(e.get("retention"), 3),
                    _fmt(e.get("retention_ndcg@20"), 3),
                    _fmt(e.get("personalisation_retained"), 3),
                    "n/a" if not isinstance(same, bool) else ("yes" if same else "no"),
                ]
            )
    section.tables.append(
        Table(
            "sensitivity",
            "Dataset variants at epsilon 8",
            [
                "Variant",
                "Regime",
                "Users",
                "Items",
                "Interactions",
                "MostPopular NDCG@10",
                "Item-item ridge NDCG@10",
                "Non-private NDCG@10",
                "NDCG@10 at epsilon 8",
                "Retention at list length 10",
                "Retention at list length 20",
                "Personalisation retained",
                "H1 verdict same as main dataset",
            ],
            rows,
        )
    )

    def figure() -> Figure | None:
        names = sorted(results, key=_variant_order)
        regimes = sorted({r for n in names for r in _d(results[n])})
        series = [
            (
                f"{regime} regime",
                [_num(_get(results[n], regime, "epsilons", "8", "retention")) for n in names],
            )
            for regime in regimes
        ]
        png = _grouped_bars(
            [VARIANT_LABELS.get(n, n).replace(" (", "\n(") for n in names],
            series,
            "Retention at epsilon 8 (private NDCG@10 over non-private)",
            "Dataset variant",
            reference=(H1_TARGET, "H1 target (0.90)"),
        )
        if png is None:
            return None
        return Figure(
            "Retention at epsilon 8 by dataset variant",
            "Private NDCG@10 divided by non-private NDCG@10 at epsilon 8 for each dataset "
            "variant and regime. The dashed line is the 0.90 target of H1. The value axis "
            "starts at zero.",
            png,
        )

    section.figures = _figure(figure)
    return section


def build_parity(inputs: Inputs) -> Section:
    title = dict(SECTION_ORDER)["parity"]
    payload = inputs.get("flower_parity")
    if payload is None or payload.get("status") == "NOT_RUN":
        section = _not_run(inputs, "parity", title, ["flower_parity"])
        if payload is not None:
            section.summary = "not run: results/flower_parity.json reports status NOT_RUN."
        return section
    section = _finish(Section("parity", title), payload)
    st = _d(payload.get("settings"))
    tolerance = _d(st.get("tolerance"))
    section.summary = (
        f"The same federated rounds were run through the Flower framework (version "
        f"{_text(st.get('flower_version'))}, {_text(st.get('flower_execution_mode'))}) and "
        "through the in-process reference, on a small synthetic problem "
        f"({_int(st.get('clients'))} clients, {_int(st.get('rounds'))} rounds). The check asks "
        "whether the final model parameters agree within a tolerance of "
        f"atol {_text(tolerance.get('atol'))} and rtol {_text(tolerance.get('rtol'))}. "
        "The main experiments still use the in-process engine."
    )
    results = _d(payload.get("results"))
    rows = []
    for name in sorted(results):
        entry = _d(results[name])
        if name == "engine_step_check":
            for sub in sorted(entry):
                step = _d(entry[sub])
                rows.append(
                    [
                        f"engine step, {sub.replace('_', ' ')}",
                        _text(_fmt(step.get("max_abs_diff"), 9)),
                        "n/a",
                        _text(step.get("identical")),
                    ]
                )
            continue
        final = _d(entry.get("final"))
        rows.append(
            [
                _text(entry.get("variant", name)).replace("_", " "),
                _text(_fmt(final.get("max_abs_diff"), 9)),
                _text(_fmt(final.get("relative_l2_diff"), 9)),
                _text(final.get("allclose")),
            ]
        )
    section.tables.append(
        Table(
            "parity",
            "Flower against the in-process reference",
            [
                "Variant",
                "Max absolute difference",
                "Relative L2 difference",
                "Within tolerance",
            ],
            rows,
        )
    )
    return section


def build_provenance(inputs: Inputs) -> Section:
    title = dict(SECTION_ORDER)["provenance"]
    rows = []
    for name in INPUTS:
        prov = _get(inputs.get(name), "provenance")
        if isinstance(prov, dict):
            dirty = prov.get("git_dirty")
            rows.append(
                [
                    name,
                    str(prov.get("engine_sha256") or "n/a")[:12],
                    str(prov.get("module_sha256") or "n/a")[:12],
                    str(prov.get("git_commit") or "n/a")[:8],
                    "n/a" if not isinstance(dirty, bool) else ("yes" if dirty else "no"),
                ]
            )
    carrying, matching, total = _run_record_hashes(inputs.results_dir)
    if not rows and total == 0:
        return Section(
            "provenance", title, NOT_RUN, summary="not run: no provenance blocks or run records."
        )
    section = Section("provenance", title, VALID)
    section.summary = (
        "Which code produced each result file, and whether the training runs match the "
        "current engine."
    )
    section.tables.append(
        Table(
            "provenance",
            "Provenance of experiment results",
            ["Experiment", "Engine hash", "Module hash", "Commit", "Working tree dirty"],
            rows,
        )
    )
    try:
        current = code_sha256()
    except Exception:
        current = "n/a"
    section.notes.append(
        f"{carrying} of {total} run records carry a code hash; {matching} of those {carrying} "
        f"equal the current engine hash ({current[:12]}). A record's code hash is computed from "
        "the contents of the engine source files, so it can be recomputed at any commit."
    )
    return section


def _run_record_hashes(results: Path | None) -> tuple[int, int, int]:
    """Run records with a code hash, how many equal the current one, and how many records."""
    if results is None:
        return 0, 0, 0
    try:
        current = code_sha256()
    except Exception:
        current = None
    total = carrying = matching = 0
    for path in sorted((results / "runs").rglob("*.json")):
        try:
            record = read_json(path)
        except (OSError, ValueError):
            continue
        if not isinstance(record, dict):
            continue
        total += 1
        code = _get(record, "provenance", "code_sha256")
        if isinstance(code, str):
            carrying += 1
            matching += int(code == current)
    return carrying, matching, total


# ----------------------------------------------------------------------------------------------
# Hypotheses
# ----------------------------------------------------------------------------------------------


def _h1(inputs: Inputs) -> Verdict:
    statement = (
        "The model at epsilon = 8 retains at least 90% of the non-private NDCG@10 of the same "
        "regime."
    )
    payload = inputs.get("privacy_utility")
    if payload is None:
        return Verdict("H1", statement, "results/privacy_utility.json not found", NOT_RUN)
    summary = _d(payload.get("summary"))
    parts, flags = [], []
    for regime in sorted(summary):
        h1 = _d(_d(summary[regime]).get("h1"))
        met = h1.get("met")
        flags.append(met if isinstance(met, bool) else None)
        parts.append(
            f"{regime}: retention {_fmt(h1.get('retention'), 3)} "
            f"(threshold {_fmt(h1.get('threshold'), 2)})"
        )
    numbers = "; ".join(parts) or "n/a"
    if _status(payload)[0] == INVALID:
        return Verdict("H1", statement, numbers, INVALID_VERDICT)
    if any(f is False for f in flags):
        return Verdict("H1", statement, numbers, NOT_SUPPORTED)
    if flags and all(f is True for f in flags):
        return Verdict("H1", statement, numbers, SUPPORTED)
    return Verdict("H1", statement, numbers, NOT_RUN)


def _h2(inputs: Inputs) -> Verdict:
    statement = (
        "Gossip with local DP has lower NDCG@10 than federated training with central DP at "
        "epsilon = 8 (95% interval of the per-user gap excludes 0)."
    )
    payload = inputs.get("gossip")
    if payload is None:
        return Verdict("H2", statement, "results/gossip.json not found", NOT_RUN)
    h2 = _d(_d(payload.get("results")).get("h2"))
    ci = _l(h2.get("gap_ci95"))
    low = _num(ci[0]) if len(ci) == 2 else None
    numbers = (
        f"gap {_fmt(h2.get('gap_mean'))}, 95% interval {_interval(ci)}, "
        f"relative gap {_fmt(h2.get('relative_gap'), 3)}"
        if h2
        else "n/a"
    )
    if _status(payload)[0] == INVALID:
        return Verdict("H2", statement, numbers, INVALID_VERDICT)
    for flag in ("holds", "met"):
        if isinstance(h2.get(flag), bool):
            return Verdict("H2", statement, numbers, SUPPORTED if h2[flag] else NOT_SUPPORTED)
    if low is None:
        return Verdict("H2", statement, numbers, NOT_RUN)
    return Verdict("H2", statement, numbers, SUPPORTED if low > 0 else NOT_SUPPORTED)


def _secagg_part(inputs: Inputs) -> tuple[bool | None, str]:
    results = _d(_d(inputs.get("update_leakage")).get("results"))
    sums = [
        (int(k[4:]), k)
        for k in results
        if k.startswith("sum_") and not k.endswith("_dp") and k[4:].isdigit()
    ]
    if not sums:
        return None, "secure-sum history AUC n/a"
    key = max(sums)[1]
    auc = _num(_get(results[key], "recovery", "auc", "mean"))
    prior = _num(_get(results[key], "recovery", "prior_auc", "mean"))
    text = (
        f"{_setting_label(key)}: history AUC {_fmt(auc, 3)} vs prior {_fmt(prior, 3)} "
        f"(+{SECAGG_TOLERANCE} allowed)"
    )
    if auc is None or prior is None:
        return None, text
    return auc <= prior + SECAGG_TOLERANCE, text


def _h3(inputs: Inputs) -> Verdict:
    statement = (
        "At epsilon = 8 membership inference has TPR at 1% FPR of at most 2%, and a server "
        "seeing only secure sums of 100 users recovers a history no better than the "
        f"popularity prior plus {SECAGG_TOLERANCE} AUC."
    )
    member, leak = inputs.get("membership"), inputs.get("update_leakage")
    h3 = _d(_d(_d(member).get("results")).get("hypotheses")).get("H3")
    part1 = _d(h3).get("holds") if isinstance(_d(h3).get("holds"), bool) else None
    part2, text2 = _secagg_part(inputs)
    numbers = (
        f"membership TPR@1%FPR {_fmt(_d(h3).get('mean_tpr_at_1pct_fpr'), 4)}; {text2}"
        if member is not None or leak is not None
        else "results/membership.json and results/update_leakage.json not found"
    )
    if leak is None:
        part2 = None
    if any(p is not None and _status(p)[0] == INVALID for p in (member, leak)):
        return Verdict("H3", statement, numbers, INVALID_VERDICT)
    if part1 is False or part2 is False:
        return Verdict("H3", statement, numbers, NOT_SUPPORTED)
    if part1 is True and part2 is True:
        return Verdict("H3", statement, numbers, SUPPORTED)
    return Verdict("H3", statement, numbers + " (both parts are needed)", NOT_RUN)


def _flag_verdict(
    inputs: Inputs, name: str, hypothesis: str, statement: str, flag: Any, numbers: str
) -> Verdict:
    payload = inputs.get(name)
    if payload is None:
        return Verdict(hypothesis, statement, f"results/{name}.json not found", NOT_RUN)
    if _status(payload)[0] == INVALID:
        return Verdict(hypothesis, statement, numbers, INVALID_VERDICT)
    if isinstance(flag, bool):
        return Verdict(hypothesis, statement, numbers, SUPPORTED if flag else NOT_SUPPORTED)
    return Verdict(hypothesis, statement, numbers, NOT_RUN)


def _h4_numbers(h4: dict[str, Any]) -> str:
    if "lower_at_every_share" in h4 or "gap_largest_at_max_share" in h4:
        return (
            f"trimmed mean lower at every share: {_text(h4.get('lower_at_every_share'))}; "
            f"gap largest at the largest share: {_text(h4.get('gap_largest_at_max_share'))}"
        )
    return (  # payloads written before the rule followed the amendment
        f"trimmed mean lower at every share: {_text(h4.get('trimmed_mean_lower_everywhere'))}; "
        f"gap grows: {_text(h4.get('gap_grows'))}"
    )


def _h4(inputs: Inputs) -> Verdict:
    h4 = _d(_d(inputs.get("poisoning")).get("h4"))
    numbers = _h4_numbers(h4) if h4 else "n/a"
    statement = (
        "Plaintext trimmed-mean aggregation gives lower target exposure than the secure-sum "
        "mode at every attacker share, and the gap is largest at the largest share (30%)."
    )
    return _flag_verdict(inputs, "poisoning", "H4", statement, h4.get("holds"), numbers)


def _h5_pattern(h5: dict[str, Any]) -> str:
    """The sign pattern per correlated scenario and epsilon level, e.g. '4 of 5 seeds wider'."""
    parts = []
    for scenario in ("activity", "social"):
        cells = _d(h5.get(scenario))
        items = []
        for key in sorted(cells, key=lambda k: (k != "nondp", _key_num(k) or 0.0, k)):
            cell = _d(cells[key])
            if cell.get("seeds") is None:
                continue
            items.append(
                f"{_text(cell.get('seeds_improved'))} of {_text(cell.get('seeds'))} seeds wider "
                f"at {_eps_label(key)}"
            )
        if items:
            parts.append(f"{scenario}: " + ", ".join(items))
    return "; ".join(parts)


def _h5(inputs: Inputs) -> Verdict:
    h5 = _d(_d(_d(inputs.get("participation")).get("results")).get("h5"))
    pattern = _h5_pattern(h5)
    if pattern:
        numbers = pattern + " (sign pattern decides; Wilcoxon is underpowered)"
    else:  # payloads written before the sign-pattern rule
        ps = [
            f"p = {_fmt(_d(v).get('wilcoxon_two_sided_p'), 4)} ({_eps_label(k)})"
            for k, v in sorted(_d(h5.get("activity")).items())
        ]
        numbers = "paired Wilcoxon, activity gap vs independent: " + ("; ".join(ps) or "n/a")
    statement = (
        "Availability correlated with activity (or friend count) gives a larger NDCG@10 gap "
        "between the top and bottom groups than independent availability, in every seed."
    )
    return _flag_verdict(inputs, "participation", "H5", statement, h5.get("holds"), numbers)


def hypothesis_verdicts(inputs: Inputs) -> list[Verdict]:
    return [_h1(inputs), _h2(inputs), _h3(inputs), _h4(inputs), _h5(inputs)]


# ----------------------------------------------------------------------------------------------
# Header facts and provenance
# ----------------------------------------------------------------------------------------------


def _facts(inputs: Inputs) -> list[list[str]]:
    card, graph = _d(inputs.get("dataset_card")), _d(inputs.get("social_graph"))
    base = _d(inputs.get("baselines"))
    users = _num(card.get("users")) or _num(graph.get("users")) or _num(base.get("users"))
    items = _num(card.get("items")) or _num(base.get("items"))
    with_friends = _num(graph.get("users_with_friends"))
    share = None
    if with_friends is not None and users:
        share = with_friends / users
    elif _num(graph.get("isolated_share")) is not None:
        share = 1.0 - float(_num(graph.get("isolated_share")) or 0.0)
    return [
        ["Users", _int(users)],
        ["Items (businesses)", _int(items)],
        ["Interactions", _int(card.get("interactions"))],
        ["Friendships", _int(graph.get("edges"))],
        ["Users with at least one friend", _int(with_friends)],
        ["Share of users with friends", _fmt(share, 3)],
        ["Mean friends per user", _fmt(graph.get("mean_degree"), 1)],
    ]


def _provenance(inputs: Inputs) -> tuple[str, str]:
    prov = _d(_d(inputs.get("privacy_utility")).get("provenance"))
    commit, lock = prov.get("git_commit"), prov.get("uv_lock_sha256")
    if not commit or not lock:
        try:
            env = collect_environment_report()
            commit = commit or env.git_commit
            lock = lock or env.uv_lock_sha256
        except Exception:
            pass
    return str(commit or "n/a"), str(lock or "n/a")


# ----------------------------------------------------------------------------------------------
# Rendering
# ----------------------------------------------------------------------------------------------

BUILDERS: tuple[Callable[[Inputs], Section], ...] = (
    build_baselines,
    build_rq1,
    build_rq2,
    build_rq3,
    build_rq4,
    build_rq5,
    build_rq6,
    build_sensitivity,
    build_parity,
    build_provenance,
)


def _safe_section(
    builder: Callable[[Inputs], Section], inputs: Inputs, key: str, title: str
) -> Section:
    try:
        return builder(inputs)
    except Exception as error:
        return Section(
            key,
            title,
            INVALID,
            reasons=[f"the section could not be rendered ({type(error).__name__})"],
        )


def _h(value: Any) -> str:
    return html.escape(_text(value) if not isinstance(value, str) else value, quote=True)


def _badge_class(status: str) -> str:
    return {VALID: "badge-valid", INVALID: "badge-invalid"}.get(status, "badge-notrun")


def _verdict_class(verdict: str) -> str:
    return {
        SUPPORTED: "v-supported",
        NOT_SUPPORTED: "v-notsupported",
        INVALID_VERDICT: "v-invalid",
    }.get(verdict, "v-notrun")


def _is_numeric_cell(cell: str) -> bool:
    return cell == "n/a" or cell.replace(",", "").replace(".", "", 1).replace("-", "", 1).isdigit()


def _html_table(
    headers: Sequence[str], rows: Sequence[Sequence[str]], classes: Sequence[str] = ()
) -> str:
    head = "".join(f"<th>{_h(x)}</th>" for x in headers)
    body = []
    for row in rows:
        cells = []
        for i, cell in enumerate(row):
            cls = (
                classes[i]
                if i < len(classes) and classes[i]
                else ("num" if _is_numeric_cell(cell) else "")
            )
            cells.append(f'<td class="{cls}">{_h(cell)}</td>' if cls else f"<td>{_h(cell)}</td>")
        body.append("<tr>" + "".join(cells) + "</tr>")
    return (
        '<div class="table-wrap"><table><thead><tr>'
        + head
        + "</tr></thead><tbody>"
        + "".join(body)
        + "</tbody></table></div>"
    )


def _md_cell(text: str) -> str:
    return text.replace("|", "\\|").replace("\n", " ")


def _md_table(headers: Sequence[str], rows: Sequence[Sequence[str]]) -> str:
    lines = [
        "| " + " | ".join(_md_cell(h) for h in headers) + " |",
        "| " + " | ".join("---" for _ in headers) + " |",
    ]
    lines += ["| " + " | ".join(_md_cell(c) for c in row) + " |" for row in rows]
    return "\n".join(lines)


def _csv_text(headers: Sequence[str], rows: Sequence[Sequence[str]]) -> str:
    buffer = io.StringIO()
    writer = csv.writer(buffer, lineterminator="\n")
    writer.writerow(headers)
    writer.writerows(rows)
    return buffer.getvalue()


VERDICT_HEADERS = ["Hypothesis", "Statement", "Decisive numbers", "Verdict"]
FACT_HEADERS = ["Fact", "Value"]


def _what_was_measured() -> str:
    return (
        "PRISM-Rec is a recommender for a social review platform (users, businesses and a "
        "friend network). It is trained in a simulated federated setting with user-level "
        "differential privacy, and every result below is an aggregate over users. The project "
        "measures what privacy costs in accuracy (RQ1), how a gossip design between friends "
        "compares (RQ2), what attackers learn from updates and from the trained model (RQ3), "
        "how fake accounts can promote an item (RQ4), how uneven availability affects different "
        "users (RQ5), and whether a signed ledger can show that privacy budgets were respected "
        "(RQ6). Each attack and defence has controls; a failed control marks the whole result "
        "INVALID."
    )


def _render_html(
    sections: list[Section],
    verdicts: list[Verdict],
    facts: list[list[str]],
    not_done: Sequence[str],
    timestamp: str,
    commit: str,
    lock: str,
) -> str:
    out: list[str] = [
        "<!DOCTYPE html>",
        '<html lang="en"><head><meta charset="utf-8">',
        '<meta name="viewport" content="width=device-width, initial-scale=1">',
        f"<title>{_h(TITLE)}</title>",
        f"<style>{CSS}</style></head><body>",
        f"<h1>{_h(TITLE)}</h1>",
        f'<p class="meta">Generated {_h(timestamp)}. Git commit {_h(commit)}. '
        f"uv.lock sha256 {_h(lock)}.</p>",
        "<h2>What was measured</h2>",
        f"<p>{_h(_what_was_measured())}</p>",
        "<h3>Dataset and friend graph</h3>",
        _html_table(FACT_HEADERS, facts),
        "<h2>Hypothesis verdicts</h2>",
    ]
    rows_html = []
    for v in verdicts:
        rows_html.append(
            f"<tr><td>{_h(v.hypothesis)}</td><td>{_h(v.statement)}</td><td>{_h(v.numbers)}</td>"
            f'<td class="{_verdict_class(v.verdict)}">{_h(v.verdict)}</td></tr>'
        )
    out.append(
        '<div class="table-wrap"><table><thead><tr>'
        + "".join(f"<th>{_h(x)}</th>" for x in VERDICT_HEADERS)
        + "</tr></thead><tbody>"
        + "".join(rows_html)
        + "</tbody></table></div>"
    )
    for s in sections:
        out.append(
            f'<section id="{_h(s.key)}"><h2>{_h(s.title)}'
            f'<span class="badge {_badge_class(s.status)}">{_h(s.status)}</span></h2>'
        )
        if s.summary:
            out.append(f"<p>{_h(s.summary)}</p>")
        if s.reasons:
            out.append(
                '<div class="reasons"><strong>Why this result is invalid</strong><ul>'
                + "".join(f"<li>{_h(r)}</li>" for r in s.reasons)
                + "</ul></div>"
            )
        if s.controls:
            out.append("<h3>Controls</h3>")
            out.append(_html_table(s.controls.headers, s.controls.rows, ["", "", "", "", ""]))
        for table in s.tables:
            out.append(f"<h3>{_h(table.title)}</h3>")
            out.append(_html_table(table.headers, table.rows))
        for note in s.notes:
            out.append(f'<p class="muted">{_h(note)}</p>')
        for fig in s.figures:
            encoded = base64.b64encode(fig.png).decode("ascii")
            out.append(
                f'<figure><img alt="{_h(fig.title)}" src="data:image/png;base64,{encoded}">'
                f"<figcaption><strong>{_h(fig.title)}.</strong> {_h(fig.caption)}</figcaption></figure>"
            )
        if s.limitations:
            out.append(
                "<h3>Limitations</h3><ul>"
                + "".join(f"<li>{_h(x)}</li>" for x in s.limitations)
                + "</ul>"
            )
        out.append("</section>")
    out.append("<h2>How to read the privacy numbers</h2>")
    out += [f"<p>{_h(t)}</p>" for t in PRIVACY_TEXT]
    out.append("<h2>Not done</h2><ul>" + "".join(f"<li>{_h(x)}</li>" for x in not_done) + "</ul>")
    out.append("</body></html>")
    return "\n".join(out) + "\n"


def _render_markdown(
    sections: list[Section],
    verdicts: list[Verdict],
    facts: list[list[str]],
    not_done: Sequence[str],
    timestamp: str,
    commit: str,
    lock: str,
) -> str:
    out = [
        f"# {TITLE}",
        "",
        f"Generated {timestamp}. Git commit {commit}. uv.lock sha256 {lock}.",
        "",
        "## What was measured",
        "",
        _what_was_measured(),
        "",
        "### Dataset and friend graph",
        "",
        _md_table(FACT_HEADERS, facts),
        "",
        "## Hypothesis verdicts",
        "",
        _md_table(
            VERDICT_HEADERS, [[v.hypothesis, v.statement, v.numbers, v.verdict] for v in verdicts]
        ),
        "",
    ]
    for s in sections:
        out += [f"## {s.title}", "", f"Status: **{s.status}**", ""]
        if s.summary:
            out += [s.summary, ""]
        if s.reasons:
            out += ["Why this result is invalid:", ""] + [f"- {r}" for r in s.reasons] + [""]
        if s.controls:
            out += ["### Controls", "", _md_table(s.controls.headers, s.controls.rows), ""]
        for table in s.tables:
            out += [f"### {table.title}", "", _md_table(table.headers, table.rows), ""]
        for note in s.notes:
            out += [note, ""]
        for fig in s.figures:
            out += [f"Figure: {fig.title}. {fig.caption} (see report.html)", ""]
        if s.limitations:
            out += ["### Limitations", ""] + [f"- {x}" for x in s.limitations] + [""]
    out += ["## How to read the privacy numbers", ""]
    for text in PRIVACY_TEXT:
        out += [text, ""]
    out += ["## Not done", ""] + [f"- {x}" for x in not_done] + [""]
    return "\n".join(out)


def _not_done_items(inputs: Inputs) -> list[str]:
    """What is still not done, judged from which result files and fields exist."""
    items: list[str] = []
    if inputs.get("sensitivity") is None:
        items.append("k-core (k = 10, 20) and 4-star sensitivity analyses")
    if inputs.get("free_riding") is None:
        items.append("Free-riding clients")
    flower = inputs.get("flower_parity")
    if flower is None or flower.get("status") == "NOT_RUN":
        items.append("Flower parity check")
    modes = _d(_get(inputs.get("poisoning"), "results"))
    if not any(str(m).startswith("committee_median") for m in modes):
        items.append("Committee-median robustness mode")
    cells = _d(_get(inputs.get("participation"), "results", "cells"))
    if not any(str(m).startswith("trace") for m in cells):
        items.append("Trace-based client availability")
    items.append(PUBLICATION_REVIEW)
    return items


def build_report(
    paths: Paths,
    not_done: Sequence[str] | None = None,
    *,
    timestamp: str | None = None,
) -> dict[str, Any]:
    """Write ``report.html``, ``report.md`` and ``tables/*.csv`` under ``results/report``."""
    inputs = _load(paths.results)
    stamp = timestamp or datetime.now(UTC).strftime("%Y-%m-%d %H:%M:%S UTC")
    sections = [
        _safe_section(builder, inputs, key, title)
        for builder, (key, title) in zip(BUILDERS, SECTION_ORDER, strict=True)
    ]
    verdicts = hypothesis_verdicts(inputs)
    facts = _facts(inputs)
    commit, lock = _provenance(inputs)
    items = _not_done_items(inputs) if not_done is None else list(not_done)
    out_dir = paths.results / "report"
    html_path, md_path = out_dir / "report.html", out_dir / "report.md"
    atomic_write_text(
        html_path, _render_html(sections, verdicts, facts, items, stamp, commit, lock)
    )
    atomic_write_text(
        md_path, _render_markdown(sections, verdicts, facts, items, stamp, commit, lock)
    )
    tables: list[Path] = []
    for section in sections:
        for table in section.tables:
            if table.name:
                path = out_dir / "tables" / f"{table.name}.csv"
                atomic_write_text(path, _csv_text(table.headers, table.rows))
                tables.append(path)
    return {
        "html": html_path,
        "markdown": md_path,
        "tables": tables,
        "sections": {s.key: s.status for s in sections},
    }


def cli(argv: list[str] | None = None) -> int:
    """``prism report``."""
    parser = argparse.ArgumentParser(prog="prism report", description=__doc__)
    parser.add_argument("--root", default=".")
    args = parser.parse_args(argv)
    result = build_report(default_paths(Path(args.root)))
    print(f"html:     {result['html']}")
    print(f"markdown: {result['markdown']}")
    for path in result["tables"]:
        print(f"table:    {path}")
    for key, status in result["sections"].items():
        print(f"{key:<13}{status}")
    return 0


if __name__ == "__main__":
    raise SystemExit(cli())
