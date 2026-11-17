"""``prism`` command line: one entry point for data, training, attacks, the ledger and the report."""

from __future__ import annotations

import importlib
import sys
from typing import Final

COMMANDS: Final[dict[str, tuple[str, str]]] = {
    "baselines": (
        "prism.experiments.baselines",
        "MostPopular, ItemKNN, item-item ridge and friends baselines",
    ),
    "grid": ("prism.experiments.privacy_utility", "RQ1: privacy-utility grid and summary"),
    "update-leakage": (
        "prism.experiments.update_leakage",
        "RQ3: history inversion and friendship inference from updates",
    ),
    "membership": ("prism.experiments.membership", "RQ3: user-level membership inference"),
    "poisoning": (
        "prism.experiments.poisoning",
        "RQ4: fake-account promotion against robust aggregation",
    ),
    "gossip": ("prism.experiments.gossip", "RQ2: gossip between friends with local DP"),
    "participation": (
        "prism.experiments.participation",
        "RQ5: availability and social participation bias",
    ),
    "ledger": ("prism.experiments.ledger_audit", "RQ6: verify every ledger, measure overhead"),
    "social": ("prism.experiments.social_build", "build the friend graph from the users file"),
    "demo-small": (
        "prism.experiments.demo",
        "end-to-end run on a synthetic dataset (no Yelp data needed)",
    ),
    "report": ("prism.report.build", "build the HTML and Markdown results report"),
}


def usage() -> str:
    """Help text listing every command."""
    lines = ["usage: prism <command> [options]", "", "commands:"]
    lines += [f"  {name:<15} {summary}" for name, (_, summary) in COMMANDS.items()]
    lines += ["", "Run 'prism <command> --help' for a command's options."]
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    """Dispatch ``prism <command> [options]`` to the command module's ``cli`` function."""
    args = list(sys.argv[1:] if argv is None else argv)
    if not args or args[0] in {"-h", "--help"}:
        print(usage())
        return 0
    command, rest = args[0], args[1:]
    if command not in COMMANDS:
        print(f"unknown command: {command}\n\n{usage()}", file=sys.stderr)
        return 2
    module = importlib.import_module(COMMANDS[command][0])
    result: int = module.cli(rest)
    return result


if __name__ == "__main__":
    raise SystemExit(main())
