"""Tests for grid configuration and identifier stability."""

from __future__ import annotations

from hypothesis import HealthCheck, settings
from run_grid import SEEDS, TOPOLOGY_ROUNDS, Job, build_jobs

settings.register_profile("default", suppress_health_check=[HealthCheck.too_slow])
settings.load_profile("default")


def test_round_matched_control_matches_federated_budget() -> None:
    matched = Job("central_matched", 8.0, 0, TOPOLOGY_ROUNDS["central_matched"])
    federated = Job("federated", 8.0, 0, TOPOLOGY_ROUNDS["federated"])
    n_users = 9913
    matched_updates = matched.sample_rate * n_users * matched.rounds * matched.local_epochs
    federated_updates = federated.sample_rate * n_users * federated.rounds * federated.local_epochs
    assert matched.rounds == federated.rounds == 400
    assert abs(matched_updates - federated_updates) < 1.0


def test_identifiers_for_existing_runs_are_unchanged() -> None:
    assert Job("central", None, 0, 40).identifier == "central_nondp_semantic_seed0_r40"
    assert Job("federated", 8.0, 3, 400).identifier == "federated_eps8.0_semantic_seed3_r400"


def test_topology_properties() -> None:
    assert Job("central", None, 0, 40).sample_rate == 0.20
    assert Job("central_matched", None, 0, 400).sample_rate == 0.02
    assert Job("federated", None, 0, 400).sample_rate == 0.01
    assert Job("federated", None, 0, 400).local_epochs == 2
    assert Job("central_matched", None, 0, 400).local_epochs == 1


def test_build_jobs_filters() -> None:
    jobs = build_jobs(False, "semantic", (0, 1), ("federated",), (8.0,))
    assert len(jobs) == 4
    assert {j.topology for j in jobs} == {"federated"}
    assert len(SEEDS) == 10
