# Privacy attacks and defences for social-media recommendation and personalisation: a source-restricted review

Date of review: 17 November 2026. Numbers in square brackets refer to the reference list in section 11.

## 1. Scope and source policy

This review asks what can be established, from sources a practitioner can check, about privacy attacks and defences for the recommendation and personalisation systems of social-media platforms. These systems train on content people post, on behaviour such as ratings, and on the social graph of who is connected to whom. Last year's descriptive survey of differential privacy (DP), federated training, attacks and audit logs for a generic recommender is the starting point (sections 3 to 9). Section 2 adds what regulators and platforms report, section 4.4 peer-to-peer learning, and section 6.2 inference about the social graph. The dataset is the Yelp Open Dataset: a review platform where users write public reviews and keep a friend list.

This review uses only standards and specifications, government and agency reports, official library and framework documentation, engineering write-ups from the organisations that build or run the systems, official dataset pages, and open-source repositories with their documentation. It does not cite or rely on any conference or journal paper, including papers that a README, a blog post or a standard points to, and every source listed was opened on 17 November 2026.

Because of this rule, five kinds of claim could not be covered. First, measured results: no benchmark of utility loss under user-level DP on recommenders, and no measured attack success rates on federated updates or for inferring friendships. Second, formal results: security proofs for secure aggregation, guarantees for robust aggregators, and tight accounting theory. Third, decentralised (gossip) learning: I found no standard, agency report or vendor write-up that I could open on it (section 4.4). Fourth, how friends-based recommenders work and how training treats well-connected and isolated users: the only material on friend recommendation was secondary blog posts, and the only permitted fairness text is NIST's general warning about DP (section 3.3). Fifth, who first proposed a technique. Where a standard summarises a paper, I use only the standard's own sentence.

## 2. Privacy in social-media platforms: what regulators and platforms report

### 2.1 What data platforms hold

The European Data Protection Board (EDPB) describes social media as platforms where users hold profiles, share user-generated content and develop connections and networks with other users [41]. It sorts the data used to target users into provided data (for example relationship status on a profile), observed data (activity such as content shared, consulted or liked, plus device and third-party data) and inferred data, derived for example from browsing behaviour and "network connections" [41].

The US Federal Trade Commission's September 2024 staff report examined social media and video streaming services. It found that they collected data about activity on and off the service, and that some collected, inferred or bought data on household income, location and interests [40]. Its "user metrics" include the number of other users a person follows or is associated with [40]. The report does not discuss friend-recommendation models.

The Yelp documentation bundled with the dataset describes `user.json` as "the user's friend mapping and all the metadata associated with the user" [42]. Each record has a user id, first name, review count, join date, vote and compliment counts, fans, elite years, average rating, and `friends`, documented as an array of friends' user ids; reviews carry the author's `user_id` [42]. The documentation does not say whether friendship is symmetric or how it was established. In this project's copy, `friends` is a comma-separated string, not an array.

### 2.2 Harms the regulators name

The FTC defines privacy harm broadly, as unknown, unexpected or unwanted surveillance, collection, use of, or inference from, personal information [40]. Its findings include indefinite retention, weak minimisation, some "deletion" that was only de-identification, sharing with affiliates and third parties, advertising based on sensitive categories, and AI systems that infer personal details with little user control or ability to correct them [40]. Its examples of inferred attributes include relationship or marital status, parental status, education, household income and familial relationships [40].

The EDPB says that an inference about a special category of data, such as political opinion drawn from a visited page, is itself special-category data, and that profiling can create special-category data by inference from data that is not sensitive alone [41]. Neither document discusses inferring who is friends with whom from a trained model. The harm they name is inference of attributes and relationships from data the platform already holds.

### 2.3 Defences platforms and regulators describe

The FTC recommends minimised collection, written retention and deletion policies, limits on sharing with affiliates and third parties, safeguards for sensitive data, and user control over automated decisions [40]. I found no mention of DP or federated learning in the report; its recommendations are organisational.

Platform engineering posts describe technical defences. Snap says it applies DP to friend suggestions so a person can make new friends without revealing existing relationships; otherwise a new user shown a suggestion might infer that two of their friends are connected [43]. Snap perturbs the social graph before generating suggestions, creating some edges and dropping others, and adds noise to mutual-friend counts, using what it calls a custom variant of DP; the post gives no epsilon, delta or utility measurement [43]. Snap's 2020 post describes training on the device and adding calibrated noise to the weights before upload, for local DP; the model still passes through Snap's servers [44]. LinkedIn describes DP in analytics products. A 2019 post describes deterministic noise tied to each query, so repeating a query cannot average the noise away, with event-level protection [46]. A December 2023 post covers post analytics, where an author watching viewer breakdowns could infer who just viewed; it reports Gaussian noise and epsilon "in the tens or even hundreds" [45]. Meta's 2022 post on federated learning with DP is covered in section 4.1 [15].

These posts are self-reported and concern analytics and friend suggestions, not recommenders trained on friend-linked data. They show that platforms treat the social graph as sensitive and that deployed epsilons can be large.

## 3. Differential privacy in practice

### 3.1 Units, parameters and reporting

NIST SP 800-226 (final, March 2025) is the anchor [1]. It states that a DP guarantee is defined by its privacy parameters and by the unit of privacy, meaning what counts as one neighbouring dataset. It calls user-level privacy the safest default, warns that event-level privacy protects events rather than people and can be surprisingly weak, and says guarantees with different units or deltas are not directly comparable [1]. It also says to report all the original privacy parameters instead of only a converted (epsilon, delta) pair [1].

On delta, NIST gives a common recommendation of roughly 1/n² and calls delta above 10⁻⁵ suspicious unless justified [1]. The Opacus FAQ gives a looser rule, delta below the inverse of the training set size [6], and the TensorFlow Federated tutorial calls "somewhat smaller than one over the number of records" standard practice [9]. NIST is stricter, so a delta near 1/(10n) should be reported next to a delta of 1/n².

NIST adds hazards that matter here. Hyperparameters tuned on the private data are themselves a leak [1]. Floating-point noise can leak [1]. Custom implementations should be avoided in favour of well-tested libraries with automatic accounting, and the trust model of a guarantee must hold in the real system [1]. NIST also says auditing cannot prove a guarantee but can find bugs, and that average-case audit results can understate risk to outliers [1].

### 3.2 Accounting libraries and their assumptions

Opacus 1.6.0 (Apache-2.0, released 5 May 2026) offers RDP, Gaussian DP and PRV accountants, with PRV the default [4][5]. A code comment in its PRV accountant states that it assumes only a Poisson-subsampled Gaussian mechanism is used [5]. Its `make_private` documents that turning Poisson sampling off "doesn't fit the assumptions made by privacy accounting" [5]. The FAQ frames the guarantee around a single training example and does not discuss user-level privacy [6].

The `dp-accounting` library from Google (0.7.0, Apache-2.0, 10 November 2026) describes mechanisms as `DpEvent` objects and supports PLD and RDP accountants [7][8]. Its README says upstream testing covers Linux with Python 3.10 only [7]. The TensorFlow Federated tutorial uses it with a Poisson-sampled Gaussian event and shows the user-level recipe: clip each client update, add noise to the sum, then divide [9].

### 3.3 Unequal effects of DP noise across groups

NIST SP 800-226 has a section on systemic bias. It says the noise added for DP affects smaller groups more than larger ones in relative terms, and that models trained with DP may produce lower-quality outputs for minority groups [1]. It says perfect mitigations are not known and advises testing output quality across all subgroups and keeping classes balanced during training [1]. NIST's examples are census counts and a classifier split by race; it says nothing about users who differ in how many connections they have, so no source I could use covers that case.

## 4. Federated learning with DP: production and frameworks

### 4.1 What production write-ups say

Google's 2022 post describes a Gboard model trained with user-level DP over 2,000 rounds of about 6,500 devices [11]. It says amplification by uniform sampling is hard to guarantee in a real device population, so the system used a method that does not rely on it [11]. A February 2024 post says all Gboard next-word models are now trained with DP, with epsilon between 0.994 and 13.69 at delta 10⁻¹⁰, and that epsilon of 1 or less still depends on large populations and cohorts [12]. Google's 2023 post on Android text selection reports a formal epsilon in the hundreds and guarantees that hold only against an honest-but-curious server [13].

Meta's 2022 post describes federated learning with DP across devices, trusted execution environments and servers, but gives no privacy parameters, noise placement or cohort sizes [15]. Apple's 2017 post describes local DP: noise is added on the device, examples use epsilon 4 per event, and each device is capped on records per day [16]. Apple's 2025 post applies DP to aggregate trends without stating epsilon [17].
Where epsilon is published it ranges from below 1 to the hundreds, and user-level DP in production relies on large device populations.

### 4.2 Central versus local DP

In central DP the server adds noise to the aggregate and must be trusted; in local DP each client adds noise first [1][18]. NIST says the local model gives less accurate answers, is useful only where the signal is strong, and "is typically not used for more complex applications like machine learning" [1]. Apple's local DP use is for counting what is popular [16]. Snap's device training is the one production example I found of local noise on model weights; it reports no epsilon [44].

### 4.3 What open-source frameworks provide

Flower 1.43.0 (Apache-2.0, Python 3.11 or later) offers central DP wrappers with fixed and adaptive clipping, and a `LocalDpMod` for local DP [19][24]. Its DP guide says "Differential Privacy in Flower is in a preview phase" [19]. Its `RdpAccountant` wraps `dp-accounting`, but its page does not say whether it assumes Poisson sampling [20]. Flower's simulations run on Ray, whose Windows support is called experimental [23]. TensorFlow Federated documents user-level DP with adaptive clipping and accounting [9]; the TensorFlow Privacy README states no accounting caveats [10].

### 4.4 Peer-to-peer and decentralised learning among users

NIST AI 100-2 defines federated learning as training "in a decentralized fashion" without pooling data, where entities or devices exchange model updates [2]. It does not say whether updates go through a server or between peers. Snap's on-device system sends weights through a server and describes no device-to-device exchange [44]. I found no permitted source that describes or measures gossip or other peer-to-peer training, including what neighbours can learn from the updates they receive. The material that exists is in papers, which this review excludes.

## 5. Secure aggregation

Flower's documentation says that with secure aggregation "the server can decrypt only the aggregated model update", and that it provides SecAgg and SecAgg+ [22]. The page states no threat model, dropout handling, or interaction with DP [22].

Google's 2023 post is more precise. Secure aggregation limits the server to an aggregate, but does not guarantee the aggregate hides any individual, which is why DP is added [13]. It also states that a malicious server could manipulate the key exchange or inject fake clients that skip the noise [13]. Google's October 2026 post says secure aggregation "was not compatible with state-of-the-art central DP guarantees" and describes a trusted-execution-environment system with policies published in a transparency log (Rekor), listing hardware limits and side channels as remaining concerns [14]. Cloudflare describes two aggregators run by different parties, at least one honest, plus zero-knowledge validity proofs [25].

On the tension with robust aggregation, NIST AI 100-2 says robust aggregation rules mostly work by identifying and excluding malicious updates at the server [2]. My reading, not a source's statement, is that a rule which inspects individual updates cannot run on a securely summed vector, so such a deployment must use input checks, norm bounds or trusted hardware. No permitted source measures what protection remains.

## 6. Attacks on models and shared updates

### 6.1 Models and updates in general

NIST AI 100-2 E2025 (March 2025) supplies the vocabulary [2]. Data privacy attacks include data reconstruction, membership inference, attribute inference and property inference; model extraction is a model privacy attack [2]. The report treats model inversion as recovering class representatives, which differs from reconstructing a specific record [2]. It says DP bounds membership inference and data reconstruction by definition but not model extraction [2]. It recommends empirical privacy auditing alongside theory, usually with inserted canaries or membership inference [2]. MITRE ATLAS data lists these as techniques; its changelog shows release 2026.10, dated 28 October 2026, grouping "Infer Membership" (AML.T0137.000), "Infer Properties" (AML.T0137.001), "Invert AI Model" (AML.T0137.002) and "Extract Memorized Data" under "Training Data Information from AI Models", with "Training Data Poisoning" as AML.T0020 [3].

ML Privacy Meter (MIT) runs membership inference, dataset-usage inference and DP lower-bound auditing, and reports ROC and log-scale ROC curves; its README lists image, tabular and text models and no recommenders [26]. The Adversarial Robustness Toolbox 1.20 (MIT) has black-box, rule-based and label-only membership attacks and reports no benchmark results; its supervised threshold calibration maximises accuracy on the train and test data the user supplies [27]. Neither covers shared updates in federated learning.

Why controls matter: NIST says auditing cannot prove a guarantee and can mislead when it reports averages [1]. An attack score is only interpretable against a positive control (an attack that must succeed on a leaky setup) and a negative control (one that must fail on a setup that leaks nothing). No permitted source prescribes such controls; this is a design choice of this project.

### 6.2 Inference about the social graph

For a social platform the sensitive object is often the relationship, not a single record. Two taxonomies are relevant, and neither names link inference.

NIST AI 100-2 defines attribute inference as extracting a sensitive attribute of the training set, assuming partial knowledge of other features, and property inference as learning global information about the training distribution, such as the fraction of the training set with a sensitive attribute [2]. Its property-inference section lists graph neural networks among the model types attacked, but I found no link, edge or relationship inference attack in the report [2]. In MITRE ATLAS release 2026.10, "Invert AI Model" covers inferring sensitive attributes, and "Infer Properties" covers properties of the training data such as population composition or the presence of a group [3]. I searched the ATLAS data for link, relationship, friend and social-graph terms and found no matching technique [3]. The OWASP Machine Learning Security Top 10 project page was a draft with no list of entries [47], so I used it for nothing. Both documents therefore cover only the broader category of inference about training data. In my reading, friendship-link inference from model updates is an inference about a relationship between two training users, closest to attribute or property inference applied to a pair; no source says so. The only source that treats graph inference as a concrete risk is Snap, which describes a new user inferring that two friends are connected from a suggestion [43]. That is an attack on outputs shown to users, not on updates sent to a server.

## 7. Poisoning and robust aggregation

NIST AI 100-2 says model poisoning is mostly studied in federated learning, where compromised clients send malicious updates [2]. For mitigation it lists Byzantine-resilient aggregation, notes that motivated adversaries can bypass these defences, and says gradient clipping and DP can mitigate poisoning "to some extent" but usually reduce accuracy and do not fully mitigate it [2].

Flower's strategy index lists Krum, MultiKrum, Bulyan, FedMedian and FedTrimmedAvg [21]. The Krum page takes a `num_malicious_nodes` argument defaulting to 0 and gives no threat model [21]. So the operator must supply an attacker count, with no guidance on choosing it.

## 8. Recommender evaluation and the Yelp terms

RecBole documents the main choices [28]. Splits default to random ratio 80/10/10 with a temporal ordering option, grouped by user. Ranking defaults to full ranking against all items, with sampled modes using uniform or popularity negatives. Default metrics include Recall, MRR, NDCG, Hit and Precision at 10 [28]. The TensorFlow Recommenders retrieval tutorial uses a random 80/20 split but says an industrial split would be by time, and notes that excluding already-seen items is common but is not done in its tutorials [29]. Neither source covers a recommender that uses a friend list.

The Yelp Open Dataset page lists 6,990,280 reviews and 150,346 businesses and calls the data intended for educational use [30]. The Dataset Terms of Use (last updated 7 July 2023; the copy bundled with the download is the same version) restrict the data to academic use and bar sharing it with third parties or displaying it publicly [31][42]. Findings must be submitted to Yelp before any public presentation or publication, with approval promised within five business days. The term is 12 months, after which the data must be deleted [31][42]. This is a reading of the text, not legal advice.

## 9. Transparency logs and signed receipts

RFC 6962 (June 2013) and RFC 9162 (December 2021, obsoleting it) are both Experimental [33][32]. They define the tree hash with a 0x00 prefix for leaves and 0x01 for interior nodes, inclusion proofs, consistency proofs, and a signed tree head [32][33]. RFC 8785 (June 2020) defines a canonical JSON form for hashing and signing, but is Informational, requires I-JSON input with numbers that fit a double, and applies no Unicode normalisation [34]; the `rfc8785` package is pure Python and requires string keys [35].

The C2SP checkpoint format is a signed note with origin, tree size and root hash, and a log must not sign a checkpoint inconsistent with one it signed before [36]. The witness specification adds cosigners that check a consistency proof against the last checkpoint they saw [37]. Implementations include Tessera (Apache-2.0, Go, with witness support) [38] and Rekor (Apache-2.0, for signed supply-chain metadata) [39].

A log proves that a later tree extends an earlier one and that an entry is in a tree with a given root [32][33]. The RFCs say logs make misissuance detectable but do not prevent it, may accept invalid content, and can show different views to different clients unless auditors compare tree heads [32][33]. For training receipts, my reading is that a log would show no recorded round was altered or removed, but not that the logged epsilon was correct or that training ran as recorded.

## 10. Gaps this project addresses, and limits of this review

- **Reporting a DP guarantee completely (section 3).** NIST asks for the unit and all parameters, and sources disagree on delta. The project records the unit, epsilon at two deltas, epsilon without sampling amplification, and a cross-check between three accountants.
- **The sampling assumption (sections 3 and 4).** Opacus and TFF assume Poisson sampling, and Google avoided relying on it in production. The project states that its epsilon holds only under ideal Poisson sampling and labels availability-gated runs as nominal.
- **Central versus local DP on one task (section 4).** NIST says local DP is typically not used for machine learning, and Apple's use is for counting. The permitted sources contain no comparison on a recommender, so the project measures both on the same task.
- **Gossip between friends (section 4.4).** No permitted source describes peer-to-peer training or what neighbours learn from each other's updates. The project exchanges updates only along friendship edges under local DP and compares it with the server-based setting.
- **Friendship-link inference (sections 2 and 6.2).** Regulators name inference of relationships as a harm, Snap treats the friend graph as sensitive, and the taxonomies name only broader categories. The project measures how well a curious server recovers who is friends with whom from user updates, with and without secure aggregation and noise, against controls that must pass first.
- **Attack success with and without secure aggregation (sections 5 and 6).** Documentation gives no measured recovery rates, and the open-source tools target classifiers. The project measures update inversion on single updates and cohort sums.
- **Fairness between well-connected and isolated users (section 3.3).** NIST warns that DP noise hurts small groups more but gives no connection-count example. The project compares recommendation quality by number of friends under each training mode.
- **Robust aggregation when updates are hidden (sections 5 and 7).** The sources imply a conflict without quantifying it. The project compares plaintext trimmed mean and median with a secure sum plus a norm bound.
- **Comparable evaluation, with a friends-based baseline (section 8).** Evaluation guides leave split, masking and ranking mode open and say nothing on friend-based recommenders. The project fixes a per-user chronological split, masks seen items, uses full ranking, and includes a friends-only recommender as a baseline.
- **A logged privacy budget with a release gate (section 9).** Google uses a transparency log for TEE policies [14], but none of the sources describes a per-round privacy receipt with a gate that blocks over-budget releases. The project builds one and states what it cannot prove.

Limits of this review. The rule in section 1 removes the empirical literature, so it cannot say how large any effect is: the accuracy cost of DP on a recommender, how easily friendships can be inferred, how gossip learning compares with federated learning, or how far connection count changes outcomes. Platform posts are self-reported, and several give no epsilon or utility figures. The FTC report and EDPB guidelines were read as text extracted from PDFs and concern advertising and targeting, not recommender training. Other standards were read as landing pages or extracted text, and documentation changes between versions. The OWASP page was a draft without entries. The UK Information Commissioner's Office guidance on privacy-enhancing technologies could not be opened. I found no ENISA or national regulator report on recommender privacy, and no Reddit or Pinterest engineering post that met the source rule. This review is not legal advice.

## 11. References

All accessed 17 November 2026.

1. NIST. *Guidelines for Evaluating Differential Privacy Guarantees*, SP 800-226, final, March 2025. https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-226.pdf (landing page https://csrc.nist.gov/pubs/sp/800/226/final)
2. NIST. *Adversarial Machine Learning: A Taxonomy and Terminology of Attacks and Mitigations*, AI 100-2 E2025, March 2025. https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.100-2e2025.pdf (landing page https://csrc.nist.gov/pubs/ai/100/2/e2025/final)
3. MITRE. *ATLAS data* repository, README, CHANGELOG and data file `dist/v6/ATLAS-2026.10.yaml` (release 2026.10, 28 October 2026). https://github.com/mitre-atlas/atlas-data, https://github.com/mitre-atlas/atlas-data/blob/main/CHANGELOG.md and https://raw.githubusercontent.com/mitre-atlas/atlas-data/main/dist/v6/ATLAS-2026.10.yaml
4. Meta / PyTorch. *Opacus* on PyPI, version 1.6.0, 5 May 2026. https://pypi.org/project/opacus/
5. Meta / PyTorch. *Opacus* source, `privacy_engine.py` and `accountants/prv.py`, main branch. https://raw.githubusercontent.com/pytorch/opacus/main/opacus/privacy_engine.py and https://raw.githubusercontent.com/pytorch/opacus/main/opacus/accountants/prv.py
6. Meta / PyTorch. *Opacus FAQ*, current. https://opacus.ai/docs/faq
7. Google. *dp_accounting* README, `google/differential-privacy` repository, current. https://github.com/google/differential-privacy/tree/main/python/dp_accounting
8. Google. *dp-accounting* on PyPI, version 0.7.0, 10 November 2026. https://pypi.org/project/dp-accounting/ (metadata read via https://pypi.org/pypi/dp-accounting/json)
9. Google / TensorFlow. *Differential Privacy in TFF* tutorial, TFF v0.88.0 docs. https://www.tensorflow.org/federated/tutorials/federated_learning_with_differential_privacy
10. Google. *TensorFlow Privacy* README, current. https://github.com/tensorflow/privacy
11. Google Research. *Federated Learning with Formal Differential Privacy Guarantees*, 28 February 2022. https://research.google/blog/federated-learning-with-formal-differential-privacy-guarantees/
12. Google Research. *Advances in private training for production on-device language models*, 21 February 2024. https://research.google/blog/advances-in-private-training-for-production-on-device-language-models/
13. Google Research. *Distributed differential privacy for federated learning*, 2 March 2023. https://research.google/blog/distributed-differential-privacy-for-federated-learning/
14. Google Research. *Toward provably private learning from federated data*, 2 October 2026. https://research.google/blog/toward-provably-private-learning-from-federated-data/
15. Meta Engineering. *Applying federated learning to protect data on mobile devices*, 14 June 2022. https://engineering.fb.com/2022/06/14/production-engineering/federated-learning-differential-privacy/
16. Apple Machine Learning Research. *Learning with Privacy at Scale*, 6 December 2017. https://machinelearning.apple.com/research/learning-with-privacy-at-scale
17. Apple Machine Learning Research. *Understanding Aggregate Trends for Apple Intelligence Using Differential Privacy*, 14 April 2025 (footnote updated 9 September 2026). https://machinelearning.apple.com/research/differential-privacy-aggregate-trends
18. Flower Labs. *Differential Privacy* (explanation), Flower documentation, current. https://flower.ai/docs/framework/explanation-differential-privacy.html
19. Flower Labs. *Use Differential Privacy*, Flower documentation, current. https://flower.ai/docs/framework/how-to-use-differential-privacy.html
20. Flower Labs. *RdpAccountant*, Flower API reference, current. https://flower.ai/docs/framework/ref-api/flwr.serverapp.RdpAccountant.html
21. Flower Labs. *flwr.serverapp.strategy*, with the Krum and FedMedian pages, Flower API reference, current. https://flower.ai/docs/framework/ref-api/flwr.serverapp.strategy.html, https://flower.ai/docs/framework/ref-api/flwr.serverapp.strategy.Krum.html, https://flower.ai/docs/framework/ref-api/flwr.serverapp.strategy.FedMedian.html
22. Flower Labs. *Secure Aggregation Protocols*, Flower documentation, current. https://flower.ai/docs/framework/explanation-ref-secure-aggregation-protocols.html
23. Flower Labs. *Run simulations*, Flower documentation, current. https://flower.ai/docs/framework/how-to-run-simulations.html
24. Flower Labs. *flwr* on PyPI, version 1.43.0. https://pypi.org/project/flwr/ (metadata read via https://pypi.org/pypi/flwr/json)
25. Cloudflare. *Privacy-preserving measurement and machine learning*, 29 September 2023. https://blog.cloudflare.com/deep-dive-privacy-preserving-measurement
26. Privacy Trust Lab. *ML Privacy Meter* README, current. https://github.com/privacytrustlab/ml_privacy_meter
27. Linux Foundation AI & Data / Trusted-AI. *Adversarial Robustness Toolbox* v1.20 README and membership inference documentation. https://github.com/Trusted-AI/adversarial-robustness-toolbox and https://adversarial-robustness-toolbox.readthedocs.io/en/latest/modules/attacks/inference/membership_inference.html
28. RecBole. *Training and evaluation introduction*, documentation, current. https://recbole.io/docs/user_guide/train_eval_intro.html
29. Google / TensorFlow. *Recommending movies: retrieval*, TensorFlow Recommenders tutorial, current. https://www.tensorflow.org/recommenders/examples/basic_retrieval
30. Yelp. *Yelp Open Dataset*, official dataset page, current. https://business.yelp.com/data/resources/open-dataset/
31. Yelp. *Yelp Dataset Terms of Use*, last updated 7 July 2023. https://s3-media0.fl.yelpcdn.com/assets/srv0/engineering_pages/f64cb2d3efcc/assets/vendor/Dataset_User_Agreement.pdf
32. IETF. *Certificate Transparency Version 2.0*, RFC 9162, December 2021. https://datatracker.ietf.org/doc/html/rfc9162
33. IETF. *Certificate Transparency*, RFC 6962, June 2013. https://datatracker.ietf.org/doc/html/rfc6962
34. IETF. *JSON Canonicalization Scheme (JCS)*, RFC 8785, June 2020. https://datatracker.ietf.org/doc/html/rfc8785
35. Trail of Bits. *rfc8785.py* README, version 0.1.4 (27 September 2024). https://github.com/trailofbits/rfc8785.py
36. C2SP. *tlog-checkpoint*, main branch, current. https://github.com/C2SP/C2SP/blob/main/tlog-checkpoint.md
37. C2SP. *tlog-witness*, main branch, current. https://github.com/C2SP/C2SP/blob/main/tlog-witness.md
38. Transparency.dev. *Tessera* README, current. https://github.com/transparency-dev/tessera
39. Sigstore. *Rekor* README, current. https://github.com/sigstore/rekor
40. US Federal Trade Commission. *A Look Behind the Screens: Examining the Data Practices of Social Media and Video Streaming Services*, staff report, September 2024. https://www.ftc.gov/reports/look-behind-screens-examining-data-practices-social-media-video-streaming-services (report PDF https://www.ftc.gov/system/files/ftc_gov/pdf/Social-Media-6b-Report-9-11-2024.pdf)
41. European Data Protection Board. *Guidelines 8/2020 on the targeting of social media users*, version 2.0, adopted 13 April 2021 (version 2.1, 7 July 2021, amends references only). https://www.edpb.europa.eu/our-work-tools/our-documents/guidelines/guidelines-82020-targeting-social-media-users_en (PDF https://www.edpb.europa.eu/system/files/2021-04/edpb_guidelines_082020_on_the_targeting_of_social_media_users_en.pdf)
42. Yelp. *Yelp Dataset Documentation & Terms*, PDF bundled with the Yelp Open Dataset download (JSON documentation and Dataset Terms of Use, last updated 7 July 2023). Read from the project's copy of the download, `data/raw/Yelp_Dataset_Documentation_and_ToS.pdf`; the dataset page [30] states that documentation is included.
43. Snap Inc. Engineering. *Differential Privacy at Snapchat*, 15 December 2022. https://eng.snap.com/differential-privacy-at-snap
44. Snap Inc. Engineering. *Device-Distributed Machine Learning*, 8 July 2020. https://eng.snap.com/device-distributed-machine-learning
45. LinkedIn Engineering. *Privacy Preserving Single Post Analytics*, 12 December 2023. https://www.linkedin.com/blog/engineering/trust-and-safety/privacy-preserving-single-post-analytics
46. LinkedIn Engineering. *Privacy-preserving analytics and reporting at LinkedIn*, 10 April 2019. https://www.linkedin.com/blog/engineering/trust-and-safety/privacy-preserving-analytics-and-reporting-at-linkedin
47. OWASP. *OWASP Machine Learning Security Top 10*, project page (draft), current. https://owasp.org/www-project-machine-learning-security-top-10/
