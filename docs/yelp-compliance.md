# Yelp licence compliance checklist

Roadmap ADR-033. Controlling terms: Yelp Dataset Terms of Use, 7 Jul 2023.
This checklist must be completed before ANY public release of results.

## Standing obligations (always in force)
- [ ] Repository is PRIVATE. Verified on: ____
- [ ] No raw Data committed. `git ls-files` shows no files under data/. Verified on: ____
- [ ] No processed derivative committed. Verified on: ____
- [ ] Data not shared with any third party, including the co-owner. Each owner
      downloaded their own copy from Yelp.
- [ ] No business ratings, reviews or comments published (Section 4.I).
- [ ] No commercial use (Section 4.B).
- [ ] No implication of Yelp endorsement or affiliation (Section 4.G, 4.K).

## Pre-publication gate (Section 3) - required before ANY of these
Applies to: final report if publicly available, institutional repository upload,
conference/journal paper, poster, public demo video, public GitHub repo, blog post.

- [ ] Findings document prepared (aggregate results only, no raw Data)
- [ ] Section 4.I ambiguity raised explicitly in the submission
- [ ] Submitted to Yelp on: ____  Channel: ____ (dataset@yelp.com is the
      documented contact; confirm the correct submission channel)
- [ ] Yelp approval received on: ____  Evidence saved at: ____
- [ ] Guide approval for public release on: ____
- [ ] Both owners approved public release on: ____

Yelp commits to approving within five (5) business days. Submit at least three
weeks before the deadline to allow for questions and revisions.

## Artefact scrub before publication
- [ ] No user IDs, business IDs, review text, or user names in any artefact
- [ ] Dataset counts appear only in academic deliverables, not in public
      non-academic media
- [ ] Demo video shows aggregate metrics only; screen recording checked
- [ ] Figures contain no raw records

## Term expiry / termination (Section 10)
- Licence Effective Date: 15 Nov 2026
- Licence expiry: 15 Nov 2027
- [ ] Calendar reminder set for 15 Oct 2027 (one month before expiry)
- On expiry or termination:
  - [ ] Delete data/raw/ and data/processed/ from all machines
  - [ ] Delete any backups or external-drive copies
  - [ ] Certify in writing to Yelp if requested
- Note: Sections 4 through 13 survive termination (Section 12), so the
  no-sharing and no-commercial-use restrictions continue after deletion.

## Sign-off
| Role | Name | Date |
|---|---|---|
| Privacy/ML lead | Shivam Agarwal | |
| Systems/Security lead | Mokshit Jain | |
| Guide | Dr. Malika Acharya | |
