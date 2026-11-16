"""Tests for the data contracts and referential integrity."""

from __future__ import annotations

import pandas as pd
import pytest

from prism.data.contracts import (
    ProcessedBusinessSchema,
    ProcessedReviewSchema,
    ProcessedUserSchema,
    SplitSchema,
    validate_referential_integrity,
)


def _users() -> pd.DataFrame:
    return pd.DataFrame(
        {"user_id": ["u1", "u2"], "friends": ["u2", "None"], "review_count": [1, 1]}
    )


def _businesses() -> pd.DataFrame:
    return pd.DataFrame(
        {
            "business_id": ["b1"],
            "name": ["X"],
            "city": ["Philadelphia"],
            "state": ["PA"],
            "latitude": [39.95],
            "longitude": [-75.16],
            "stars": [4.0],
            "review_count": [1],
            "categories": ["Mexican, Burgers"],
            "attributes_json": ["{}"],
        }
    )


def _reviews() -> pd.DataFrame:
    return pd.DataFrame(
        {
            "review_id": ["r1", "r2", "r3"],
            "user_id": ["u1", "u2", "u3"],
            "business_id": ["b1", "b1", "b2"],
            "stars": [5.0, 4.0, 3.0],
            "date": ["2020-01-01 10:00:00", "2020-01-02 11:00:00", "2020-01-03 12:00:00"],
        }
    )


def test_user_schema_accepts_three_column_subset() -> None:
    validated = ProcessedUserSchema.validate(_users())
    assert list(validated.columns) == ["user_id", "friends", "review_count"]


def test_review_schema_accepts_datetime_with_time() -> None:
    ProcessedReviewSchema.validate(_reviews())


def test_review_schema_rejects_bad_date() -> None:
    bad = _reviews()
    bad.loc[0, "date"] = "01-01-2020"
    with pytest.raises(Exception):  # noqa: B017
        ProcessedReviewSchema.validate(bad)


def test_business_schema_validates() -> None:
    ProcessedBusinessSchema.validate(_businesses())


def test_split_schema_rejects_unknown_split() -> None:
    frame = pd.DataFrame(
        {
            "user_idx": [0],
            "item_idx": [0],
            "rating": [5.0],
            "timestamp": ["2020-01-01 10:00:00"],
            "split": ["holdout"],
        }
    )
    with pytest.raises(Exception):  # noqa: B017
        SplitSchema.validate(frame)


def test_referential_integrity_finds_orphans() -> None:
    orphans = validate_referential_integrity(_users(), _businesses(), _reviews())
    assert orphans["orphan_user_ids_count"] == 1
    assert orphans["orphan_user_review_count"] == 1
    assert orphans["orphan_business_ids_count"] == 1
    assert orphans["orphan_business_review_count"] == 1
