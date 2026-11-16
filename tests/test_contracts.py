"""Tests for data contracts and referential integrity."""

from __future__ import annotations

import pandas as pd

from prism.data.contracts import (
    BusinessSchema,
    ReviewSchema,
    UserSchema,
    validate_referential_integrity,
)


def test_user_schema_coercion():
    df = pd.DataFrame(
        {"user_id": [1, 2], "name": ["A", "B"], "review_count": [5, 10], "friends": ["1,2", "none"]}
    )
    validated = UserSchema.validate(df)
    assert validated["user_id"].dtype in ("object", "string", "str")  # coerced to string


def test_referential_integrity_finds_orphans():
    df_users = pd.DataFrame(
        {"user_id": ["u1", "u2"], "name": ["A", "B"], "review_count": [1, 1], "friends": ["", ""]}
    )
    df_businesses = pd.DataFrame(
        {
            "business_id": ["b1"],
            "name": ["X"],
            "city": ["Y"],
            "state": ["Z"],
            "latitude": [0.0],
            "longitude": [0.0],
            "review_count": [1],
        }
    )
    df_reviews = pd.DataFrame(
        {
            "review_id": ["r1", "r2", "r3"],
            "user_id": ["u1", "u2", "u3"],  # u3 is orphan
            "business_id": ["b1", "b1", "b2"],  # b2 is orphan
            "stars": [5.0, 4.0, 3.0],
            "date": ["2020-01-01", "2020-01-02", "2020-01-03"],
        }
    )

    # Validate schemas first
    df_users = UserSchema.validate(df_users)
    df_businesses = BusinessSchema.validate(df_businesses)
    df_reviews = ReviewSchema.validate(df_reviews)

    orphans = validate_referential_integrity(df_users, df_businesses, df_reviews)
    assert orphans["orphan_user_ids_count"] == 1
    assert orphans["orphan_user_review_count"] == 1
    assert orphans["orphan_business_ids_count"] == 1
    assert orphans["orphan_business_review_count"] == 1
