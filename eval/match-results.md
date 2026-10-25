# Matching evaluation (M4)

Written by `pnpm eval:match --final` on 2026-10-25.

**Answered** = the app shows a medicine without asking. **Wrong** = an answered medicine that
is not the one on the strip (for "not in dataset" cases, any answer is wrong).
**Wrong generic** = wrong answers that would also give a different generic (a wrong brand with
the same composition still gives the right generic). Top-1 / top-3 are over in-dataset cases.
Targets from the brief: top-1 ≥ 85%, top-3 ≥ 95%, wrong ≤ 2% of answers, abstain ≤ 20%.

Weights: name 11.442, strength 1.387, ingredients 2.106, form 0.795, release 1.046, maker 1.545, bias -11.536; threshold 0.55.

## Simulated, dev (weights and threshold chosen here)

593 cases, 439 in the dataset.

| Method                                             | Top-1 | Top-3 | Answered | Wrong (of answered) | Wrong generic | Abstained, in dataset | Not-in-dataset answered |
| -------------------------------------------------- | ----- | ----- | -------- | ------------------- | ------------- | --------------------- | ----------------------- |
| Exact name only (no fuzzy matching)                | 54.4% | 54.4% | 40.8%    | 1.2%                | 1.2%          | 45.3%                 | 1.3%                    |
| Trigram search only (no re-ranking, no abstention) | 82.0% | 90.0% | 92.4%    | 34.3%               | 29.9%         | 5.2%                  | 85.7%                   |
| Re-ranking, no abstention                          | 89.1% | 90.9% | 92.4%    | 28.6%               | 21.5%         | 5.2%                  | 85.7%                   |
| DawaCheck (re-ranking + abstention)                | 89.1% | 90.9% | 52.4%    | 1.0%                | 0.0%          | 29.8%                 | 1.9%                    |

DawaCheck on in-dataset strips it did not answer correctly: right brand not found by the search 39; found but ranked below another 9; ranked first but not sure enough, because a same-name brand with another strength is also possible 25, for other reasons 58.

## Simulated, test (never used for fitting)

207 cases, 163 in the dataset.

| Method                                             | Top-1 | Top-3 | Answered | Wrong (of answered) | Wrong generic | Abstained, in dataset | Not-in-dataset answered |
| -------------------------------------------------- | ----- | ----- | -------- | ------------------- | ------------- | --------------------- | ----------------------- |
| Exact name only (no fuzzy matching)                | 62.6% | 62.6% | 50.7%    | 2.9%                | 2.9%          | 36.2%                 | 2.3%                    |
| Trigram search only (no re-ranking, no abstention) | 81.0% | 90.8% | 91.8%    | 30.5%               | 26.8%         | 6.1%                  | 84.1%                   |
| Re-ranking, no abstention                          | 85.9% | 90.2% | 91.8%    | 26.3%               | 19.5%         | 6.1%                  | 84.1%                   |
| DawaCheck (re-ranking + abstention)                | 85.9% | 90.2% | 58.5%    | 3.3%                | 0.0%          | 28.2%                 | 9.1%                    |

DawaCheck on in-dataset strips it did not answer correctly: right brand not found by the search 15; found but ranked below another 8; ranked first but not sure enough, because a same-name brand with another strength is also possible 8, for other reasons 15.

## Labelled photos, dev (values as confirmed by the user)

13 cases, 5 in the dataset.

| Method                                             | Top-1 | Top-3  | Answered | Wrong (of answered) | Wrong generic | Abstained, in dataset | Not-in-dataset answered |
| -------------------------------------------------- | ----- | ------ | -------- | ------------------- | ------------- | --------------------- | ----------------------- |
| Exact name only (no fuzzy matching)                | 60.0% | 60.0%  | 23.1%    | 0.0%                | 0.0%          | 40.0%                 | 0.0%                    |
| Trigram search only (no re-ranking, no abstention) | 80.0% | 100.0% | 84.6%    | 63.6%               | 63.6%         | 0.0%                  | 75.0%                   |
| Re-ranking, no abstention                          | 80.0% | 100.0% | 84.6%    | 63.6%               | 63.6%         | 0.0%                  | 75.0%                   |
| DawaCheck (re-ranking + abstention)                | 80.0% | 100.0% | 23.1%    | 0.0%                | 0.0%          | 40.0%                 | 0.0%                    |

DawaCheck on in-dataset strips it did not answer correctly: right brand not found by the search 0; found but ranked below another 1; ranked first but not sure enough, because a same-name brand with another strength is also possible 0, for other reasons 1.

## Labelled photos, TEST (frozen)

3 cases, 2 in the dataset.

| Method                                             | Top-1 | Top-3 | Answered | Wrong (of answered) | Wrong generic | Abstained, in dataset | Not-in-dataset answered |
| -------------------------------------------------- | ----- | ----- | -------- | ------------------- | ------------- | --------------------- | ----------------------- |
| Exact name only (no fuzzy matching)                | 0.0%  | 0.0%  | 0.0%     | 0.0%                | 0.0%          | 100.0%                | 0.0%                    |
| Trigram search only (no re-ranking, no abstention) | 0.0%  | 50.0% | 100.0%   | 100.0%              | 100.0%        | 0.0%                  | 100.0%                  |
| Re-ranking, no abstention                          | 50.0% | 50.0% | 100.0%   | 66.7%               | 66.7%         | 0.0%                  | 100.0%                  |
| DawaCheck (re-ranking + abstention)                | 50.0% | 50.0% | 33.3%    | 0.0%                | 0.0%          | 50.0%                 | 0.0%                    |

DawaCheck on in-dataset strips it did not answer correctly: right brand not found by the search 0; found but ranked below another 1; ranked first but not sure enough, because a same-name brand with another strength is also possible 0, for other reasons 0.

## Calibration (simulated test)

| Confidence | Cases | Top choice right |
| ---------- | ----- | ---------------- |
| 0.00–0.25  | 37    | 16.2%            |
| 0.25–0.50  | 24    | 54.2%            |
| 0.50–0.75  | 35    | 91.4%            |
| 0.75–0.90  | 41    | 90.2%            |
| 0.90–1.00  | 53    | 98.1%            |

## Each labelled photo

| Photo                  | Name confirmed        | Expected                     | DawaCheck                  | Confidence | OK     | Options offered                                                                                                |
| ---------------------- | --------------------- | ---------------------------- | -------------------------- | ---------- | ------ | -------------------------------------------------------------------------------------------------------------- |
| demo-telmikind         | TELMIKIND 40          | Telmikind 40 Tablet          | Telmikind 40 Tablet        | 78.9%      | yes    | Telmikind 40 Tablet; Telmikind-H Tablet; Telmikind-AM Tablet                                                   |
| demo-omee              | OMEE                  | Omee Capsule                 | Omee Capsule               | 76.7%      | yes    | Omee Capsule; Omees 20mg Capsule; Omee-D Capsule                                                               |
| favipill800            | Favipill 800          | (abstain: not in dataset)    | abstain (contradiction)    | 2.7%       | yes    | Favipill 400mg Tablet                                                                                          |
| fincover1              | Fincover              | Fincover 1mg Tablet          | Fincover 1mg Tablet        | 88.2%      | yes    | Fincover 1mg Tablet                                                                                            |
| suhagra100             | Suhagra-100           | Suhagra 100 Tablet           | Suhagra 100 Tablet         | 71.4%      | yes    | Suhagra 100 Tablet; Suhagra 25 Tablet; Suhagra 50 Tablet                                                       |
| neorelax-mr            | Neorelax MR           | Neorelax MR Tablet           | Neorelax MR Tablet         | 82.2%      | yes    | Neorelax MR Tablet; Neorelax MR 8 Tablet; Neorelax P Tablet                                                    |
| crocin-cold-flu        | Crocin Cold & Flu Max | Crocin Cold & Flu Max Tablet | abstain (unsure)           | 47.7%      | **no** | Crocin Cold & Flu Max Tablet                                                                                   |
| metformin500-zanza     | Metformin             | (abstain: not in dataset)    | abstain (unsure)           | 2.3%       | yes    | DavaIndia Metformin 500mg Tablet; StayHappi Metformin 500mg Tablet; DavaIndia Metformin 500mg Tablet SR        |
| warfarin2-label        | Warfarin Sodium       | (abstain: not in dataset)    | abstain (contradiction)    | 0.4%       | yes    | Heparin Sodium 10000 IU Injection; Heparin Sodium 5000IU Injection                                             |
| azithromycin250-sandoz | Sandoz Azithromycin   | (abstain: not in dataset)    | abstain (unsure)           | 20.8%      | yes    | DavaIndia Azithromycin 250mg Tablet; Genericart Azithromycin 250mg Tablet; DavaIndia Azithromycin 500mg Tablet |
| anterone50             | Anterone 50           | (abstain: not in dataset)    | abstain (contradiction)    | 0.0%       | yes    | StayHappi Medroxyprogesterone acetate 10mg Tablet                                                              |
| citalopram20           | Citalopram Heumann    | (abstain: not in dataset)    | abstain (unsure)           | 3.3%       | yes    | Citalopam 20mg Tablet; DavaIndia Escitalopram Oxalate 20mg Tablet; StayHappi Escitalopram Oxalate 20mg Tablet  |
| augmentin875           | Augmentin             | Augmentin 1000 Duo Tablet    | abstain (strength_unknown) | 21.8%      | **no** | Augmentin 375 Tablet; Augmentin 250mg/50mg Injection; Augmentin 500mg/100mg Injection                          |
| cialis20               | Cialis                | Cialis 20mg Tablet           | abstain (strength_unknown) | 32.3%      | **no** | Cialis 10mg Tablet; Cialis 20mg Tablet                                                                         |
| dexedrine5             | Dexedrine             | (abstain: not in dataset)    | abstain (no_candidates)    | 0.0%       | yes    |                                                                                                                |
| diazepam10             | Valium                | Valium 10mg Tablet           | Valium 10mg Tablet         | 86.0%      | yes    | Valium 10mg Tablet; Valium 5 Tablet; Valium 2mg Tablet                                                         |
| sortis40               | Sortis                | (abstain: not in dataset)    | abstain (contradiction)    | 1.6%       | yes    | Sortin 5mg Tablet; Sortin 10mg Tablet; Sortin 20mg Tablet                                                      |
| androcur50             | Androcur              | (abstain: not in dataset)    | abstain (no_candidates)    | 0.0%       | yes    |                                                                                                                |
