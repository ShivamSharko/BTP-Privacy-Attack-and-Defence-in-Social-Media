# ADR-057: Committee-median mode as a custom aggregator outside the engine

- Status: Approved (CHANGE-024)
- Date: 17 November 2026 (evening)

## Context
ADR-025 defined three robustness modes. Mode (c), secure-aggregation committees with a median of the committee sums, was first on the cut list and not built in CHANGE-023. The coordinate-wise median and trimmed mean need every individual update, so they cannot be combined with secure aggregation.

## Decision
- The cohort is split at random into committees. Each committee's updates are summed, as under secure aggregation, so the server sees only committee sums. The result is the coordinate-wise median of the sums multiplied by the number of committees, so it is on the scale of a plain sum. With fewer than two committees it falls back to the plain sum.
- The logic is `make_committee_median` and `clean_committee_share` in `src/prism/attacks/poisoning.py`. `train` accepts it as a callable aggregator (`CustomAggregator`, a function of the clipped updates and a random generator). No new named aggregator is added to `fl/aggregate.py`.
- Two modes in the poisoning experiment: `committee_median_size4` and `committee_median_size20`.
- No DP noise: `train` already refuses any non-sum aggregator together with noise.
- The chance that a committee of random accounts holds no attacker is (1 - f) to the power of its size: 66% (size 4) and 12% (size 20) at 10% attackers; 41% and 1.2% at 20%; 24% and 0.08% at 30%.

## Consequences
A small committee hides an update among only 3 others but most committees stay clean; a large committee hides it among 19 others but nearly every committee holds an attacker. Committees are simulated in the clear and no secure aggregation protocol runs. Attackers do not adapt. Measured exposure and quality: see results/report/report.html.

## Supersedes
Implements ADR-025 mode (c), whose "not built" amendment of CHANGE-023 is itself amended.
