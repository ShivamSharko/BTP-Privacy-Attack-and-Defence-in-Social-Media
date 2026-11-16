"""Pandera data contracts for the Yelp Philadelphia subset (roadmap sections 10-11).

Formats follow the MEASURED data, not the official documentation, which is out of
date in two places: user.friends is a comma-separated string (documented as an
array) and review.date carries a time component (documented as YYYY-MM-DD).
"""

from __future__ import annotations

import pandas as pd  # type: ignore[import-untyped]
import pandera.pandas as pa
from pandera.typing import Series

DATE_PATTERN = r"^\d{4}-\d{2}-\d{2}( \d{2}:\d{2}:\d{2})?$"

NOTE = (
    "If `import pandera.pandas as pa` fails on the installed pandera version, "
    "use `import pandera as pa` instead and report which import was used."
)


class ProcessedBusinessSchema(pa.DataFrameModel):
    """Columns written by scripts/build_philly_subset.py."""

    business_id: Series[str] = pa.Field(coerce=True, nullable=False)
    name: Series[str] = pa.Field(coerce=True, nullable=True)
    city: Series[str] = pa.Field(coerce=True, nullable=True)
    state: Series[str] = pa.Field(coerce=True, nullable=True)
    latitude: Series[float] = pa.Field(coerce=True, ge=-90.0, le=90.0)
    longitude: Series[float] = pa.Field(coerce=True, ge=-180.0, le=180.0)
    stars: Series[float] = pa.Field(coerce=True, nullable=True, ge=0.0, le=5.0)
    review_count: Series[int] = pa.Field(coerce=True, ge=0)
    categories: Series[str] = pa.Field(coerce=True, nullable=True)
    attributes_json: Series[str] = pa.Field(coerce=True, nullable=True)

    class Config:
        coerce = True
        strict = False


class ProcessedUserSchema(pa.DataFrameModel):
    """Only three columns are kept; user names are deliberately never stored."""

    user_id: Series[str] = pa.Field(coerce=True, nullable=False)
    friends: Series[str] = pa.Field(coerce=True, nullable=True)
    review_count: Series[int] = pa.Field(coerce=True, ge=0)

    class Config:
        coerce = True
        strict = False


class ProcessedReviewSchema(pa.DataFrameModel):
    """Review text is never stored, so it is absent from this contract."""

    review_id: Series[str] = pa.Field(coerce=True, nullable=False)
    user_id: Series[str] = pa.Field(coerce=True, nullable=False)
    business_id: Series[str] = pa.Field(coerce=True, nullable=False)
    stars: Series[float] = pa.Field(coerce=True, ge=1.0, le=5.0)
    date: Series[str] = pa.Field(coerce=True, str_matches=DATE_PATTERN)

    class Config:
        coerce = True
        strict = False


class SplitSchema(pa.DataFrameModel):
    """Integer-indexed interactions written to the train/val/test artifacts."""

    user_idx: Series[int] = pa.Field(coerce=True, ge=0)
    item_idx: Series[int] = pa.Field(coerce=True, ge=0)
    rating: Series[float] = pa.Field(coerce=True, ge=1.0, le=5.0)
    timestamp: Series[str] = pa.Field(coerce=True, str_matches=DATE_PATTERN)
    split: Series[str] = pa.Field(isin=["train", "val", "test"])

    class Config:
        coerce = True
        strict = True


def validate_referential_integrity(
    df_users: pd.DataFrame,
    df_businesses: pd.DataFrame,
    df_reviews: pd.DataFrame,
) -> dict[str, int]:
    """Count reviews whose user or business has no record.

    Measured on the full dataset: 32 orphan reviewers globally, 4 in Philadelphia.
    """
    valid_users = set(df_users["user_id"].unique())
    valid_businesses = set(df_businesses["business_id"].unique())
    review_users = set(df_reviews["user_id"].unique())
    review_businesses = set(df_reviews["business_id"].unique())

    orphan_users = review_users - valid_users
    orphan_businesses = review_businesses - valid_businesses

    return {
        "orphan_user_ids_count": len(orphan_users),
        "orphan_user_review_count": int(df_reviews["user_id"].isin(orphan_users).sum()),
        "orphan_business_ids_count": len(orphan_businesses),
        "orphan_business_review_count": int(
            df_reviews["business_id"].isin(orphan_businesses).sum()
        ),
    }
