"""Pandera data contracts for Yelp dataset (PROJECT_ROADMAP.md §10, §11).

Enforces schema validity and referential integrity before any filtering or splitting.
"""

from __future__ import annotations

try:
    import pandera.pandas as pa
except ImportError:
    import pandera as pa  # type: ignore[no-redef]
from pandera.typing import Series

# Backward compatibility alias
SchemaModel = pa.DataFrameModel


class BusinessSchema(pa.DataFrameModel):
    business_id: Series[str] = pa.Field(coerce=True)
    name: Series[str] = pa.Field(nullable=True)
    city: Series[str] = pa.Field(nullable=True)
    state: Series[str] = pa.Field(nullable=True)
    latitude: Series[float] = pa.Field(nullable=True, ge=-90, le=90)
    longitude: Series[float] = pa.Field(nullable=True, ge=-180, le=180)
    review_count: Series[int] = pa.Field(nullable=True, ge=0)

    class Config:
        coerce = True


class UserSchema(pa.DataFrameModel):
    user_id: Series[str] = pa.Field(coerce=True)
    name: Series[str] = pa.Field(nullable=True)
    review_count: Series[int] = pa.Field(nullable=True, ge=0)
    friends: Series[str] = pa.Field(nullable=True)

    class Config:
        coerce = True


class ReviewSchema(pa.DataFrameModel):
    review_id: Series[str] = pa.Field(coerce=True)
    user_id: Series[str] = pa.Field(coerce=True)
    business_id: Series[str] = pa.Field(coerce=True)
    stars: Series[float] = pa.Field(ge=1.0, le=5.0)
    date: Series[str] = pa.Field(coerce=True)  # Will be parsed to datetime later

    class Config:
        coerce = True


def validate_referential_integrity(
    df_users: pa.typing.DataFrame[UserSchema],
    df_businesses: pa.typing.DataFrame[BusinessSchema],
    df_reviews: pa.typing.DataFrame[ReviewSchema],
) -> dict[str, int]:
    """Check that reviews only reference existing users and businesses.

    Returns a dictionary of orphan counts. Roadmap finding: ~32 orphan reviewers expected.
    """
    valid_user_ids = set(df_users["user_id"].unique())
    valid_business_ids = set(df_businesses["business_id"].unique())

    review_user_ids = set(df_reviews["user_id"].unique())
    review_business_ids = set(df_reviews["business_id"].unique())

    orphan_users = review_user_ids - valid_user_ids
    orphan_businesses = review_business_ids - valid_business_ids

    # Count how many reviews belong to orphans
    orphan_user_review_count = len(df_reviews[df_reviews["user_id"].isin(orphan_users)])
    orphan_business_review_count = len(
        df_reviews[df_reviews["business_id"].isin(orphan_businesses)]
    )

    return {
        "orphan_user_ids_count": len(orphan_users),
        "orphan_user_review_count": orphan_user_review_count,
        "orphan_business_ids_count": len(orphan_businesses),
        "orphan_business_review_count": orphan_business_review_count,
    }
