# ADR-050: Social layer is core scope

- Status: Approved (CHANGE-023)
- Date: 17 November 2026

## Context
The project title is Privacy Attack and Defence in Social Media, and the dataset is a social review platform. The friend graph for the 9,913 users has 70,691 friendships; 77% of users have at least one friend, the median user has 3 and the mean is 14.3. Until now the graph was used only for the gossip topology.

## Decision
The friend network is core scope. Additions: a friends-based baseline (recommend what a user's friends visited); friendship-link inference from model updates (RQ3), for raw updates, locally noised updates and under secure aggregation; gossip between friends under local DP, compared with server-based training on the same users (RQ2); participation bias with availability correlated to friend count, and quality compared across friend-count groups (RQ5); fake-account promotion as the poisoning frame (RQ4). Gossip leaves the cut order.

## Consequences
The graph is written to `data/processed/friends.npz`, which is git-ignored. Only aggregate summaries of it appear in `results/`.

## Supersedes
Nothing. It extends ADR-024 and ADR-030.
