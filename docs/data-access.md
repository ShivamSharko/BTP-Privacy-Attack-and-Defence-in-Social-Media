# Yelp Open Dataset - access and integrity record

Roadmap ADR-016: raw data is never committed. This file is the tracked record of
how the data was obtained and verified. Closes verification item 11.

## Acquisition
- Source: Yelp Open Dataset, "Download JSON" option (1 TAR, 4.35 GB compressed;
  1 PDF + 5 JSON, 8.65 GB uncompressed).
- Source URL: <TODO - paste the exact yelp.com URL used>
- Requested and downloaded by: Shivam Agarwal (23UEC621), LNMIIT Jaipur
- Download date: 15 Nov 2026
- Terms accepted on: <TODO - date you ticked the agreement>
- Dataset vintage: JSON members are dated 20 Jan 2022 (Jan-2022 Yelp release).
  This is a stated limitation: our sources are current through 2026, the data is not.

## Licence
- Documents kept locally in `data/raw/` (git-ignored):
  - `Dataset_User_Agreement.pdf` (80,358 bytes)
  - `Yelp_Dataset_Documentation_and_ToS.pdf` (124,660 bytes)
- Permitted use: "Subject to the terms set forth in the Data Agreement (specifically the restrictions set forth in Section 4 below), Yelp grants you a royalty-free, non-exclusive, revocable, non-sublicensable, non-transferable, fully paid-up right and license during the Term to use, access, and create derivative works of the Data in electronic form for solely for non-commercial use.. Non-commercial use means use of the Data by registered nonprofits, government, educational institutions, and think tanks which (a) is not undertaken for profit, or (b) is not intended to produce works, services, or data for commercial use." (`Dataset_User_Agreement.pdf`, Section 3, pp. 1-2)
- Redistribution clause: "You agree that you will not, and will not encourage, assist, or enable others to: A. display, perform, or distribute any of the Data, or use the Data to update or create your own business listing information for commercial purposes (i.e. you may not publicly display any of the Data to any third party, especially reviews and other user generated content, as this is a private data set challenge and not a license to compete with or disparage with Yelp)... D. share or make available the Data to any third party; E. create, redistribute or disclose any summary of, or metrics related to, the Data (e.g., the number of reviewed business included in the Data and other statistical analysis) to any third party or on any website or other electronic media not expressly covered by this Agreement or without Yelp’s prior consent, this provision however, excludes any disclosures necessary for academic purposes, including without limitation the publication of academic articles concerning your use of the Data... H. rent, lease, sell, transfer, assign, or sublicense, any part of the Data;" (`Dataset_User_Agreement.pdf`, Section 4, p. 2; `Yelp_Dataset_Documentation_and_ToS.pdf`, Section 4.D, p. 8)
- Re-identification clause: <TODO - no explicit re-identification clause in agreement text; general privacy restriction is Section 4.C: "use the Data in any manner or for any purpose that may violate any law or regulation, or any right of any person including, but not limited to, intellectual property rights, rights of privacy and/or rights of personality, or which otherwise may be harmful (in Yelp's sole discretion) to Yelp, its providers, its suppliers, end users of this website, or your end users;" (`Dataset_User_Agreement.pdf`, Section 4.C, p. 2)>
- Attribution wording: "Nothing herein shall be construed as a license to use Yelp’s registered trademarks or service marks, or any other Yelp branding. Prior to any public presentation or publication of the academic results or conclusions that involve the Data and/or the Yelp brand name, you must submit your findings to Yelp for review and approval, and Yelp will approve of the public release within five (5) business days of its submission to Yelp." (`Dataset_User_Agreement.pdf`, Section 3, p. 2)
- Team rule: each owner requests their own copy from Yelp. The dataset is NOT
  shared between owners, pending confirmation of the redistribution clause.

## Storage and minimisation
- Location: `data/raw/`, ignored by the anchored `/data/` rule in .gitignore.
- Extracted members: business, review, user JSON + the inner agreement PDF.
- Deliberately NOT extracted: `checkin` and `tip` (roadmap section 10 does not use them).
- Review text is never used as a feature and never written to any output.
- Deletion: raw data removed from personal machines when BTP evaluation concludes.

## Integrity record
| Artifact | Size (bytes) | SHA-256 | Recorded on |
|---|---|---|---|
| yelp_dataset.tar | 4343892965 | 7196433B8A43DD1CBBC3054C5EE85447A56D5FDEE8652F8DC7AA5AAD579AD7CD | 15 Nov 2026 |

### Extracted file sizes (verified 15 Nov 2026)
| File | Size (bytes) |
|---|---|
| Dataset_User_Agreement.pdf | 80358 |
| Yelp_Dataset_Documentation_and_ToS.pdf | 124660 |
| yelp_academic_dataset_business.json | 118863795 |
| yelp_academic_dataset_review.json | 5341868833 |
| yelp_academic_dataset_user.json | 3363329011 |

Git exclusion verified: `git check-ignore -v data\raw\yelp_academic_dataset_review.json`
matches `.gitignore:27:/data/`, and `git status --short` lists no data files.

## Reproduce
1. Request access on Yelp's official dataset page; accept the terms.
2. Save `yelp_dataset.tar` into `data/raw/`.
3. `Get-FileHash data\raw\yelp_dataset.tar -Algorithm SHA256` - compare with the table above.
4. Extract only the four required members:
   `tar -xf data\raw\yelp_dataset.tar -C data\raw Dataset_User_Agreement.pdf yelp_academic_dataset_business.json yelp_academic_dataset_review.json yelp_academic_dataset_user.json`
5. `uv run python scripts/inspect_yelp.py --root data/raw`
6. Compare `results/dataset_profile.json` with the measured counts below.

## Measured counts (full inventory, 15 Nov 2026)

| Metric | Measured |
|---|---|
| businesses | 1,50,346 |
| reviews | 69,90,280 |
| users (rows in user.json) | 19,87,897 |
| distinct reviewers (in review.json) | 19,87,929 |
| distinct reviewed businesses | 1,50,346 |
| date range | 2005-02-16 03:23:22 .. 2022-01-19 19:48:45 |
| friend listings (directed) | 10,52,25,474 |
| users with at least one friend | 11,09,346 |
| max friend degree | 14,995 |
| review_count_sum (user.json) | 4,65,05,676 |
| distinct city labels | 1,416 |
| distinct state labels | 27 |
| malformed lines | 0 |

The `review_count_sum` (4,65,05,676) does not equal the review count in review.json (69,90,280), exceeding it by 3,95,15,396 reviews because `user.json` tracks lifetime user activity across all Yelp markets while `review.json` is restricted to businesses in this dataset extract.

### Integrity findings (must be handled in the Step 3 data contract)
1. **Orphan reviewers:** 19,87,929 distinct reviewers vs 19,87,897 user rows (difference 32). Cause unverified - deleted accounts or duplicate user rows. Step 3 must assert user_id uniqueness and inner-join reviews to users.
2. **City-label fragmentation:** "Saint Louis"/"St. Louis" and "Saint Petersburg"/"St. Petersburg" are the same places; 1,416 city labels span the 11 documented metros. Metro selection must not match raw city strings (proposed ADR-031: geographic filter on business lat/lon).
3. **Sparse density:** mean 3.52 reviews per user. The k-core threshold must be chosen from a measured histogram, not fixed in advance.
4. **Noise state labels:** CO=3, HI=2, MA=2, MI=1, MT=1, NC=1 businesses.
