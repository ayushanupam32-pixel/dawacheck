# M4 — Matching a strip to a medicine

**Goal:** after a scan, decide which medicine the strip is, and show its cheaper Jan Aushadhi
generic. When unsure, say so and let the user pick or type the name.

**Done when:** top-1 ≥ 85% on the development set.

**Status:** done. Top-1 **89.1%** on the simulated development set, **85.9%** on the simulated
test set that the model never saw. **0% wrong generics** on both. Live end to end: photo →
confirm → "This looks like: …" → generic and savings. Top-3 (90–91%) and abstention (28–30% of
medicines that are in the dataset) are short of the brief's stretch targets (95%, 20%), with the
reasons measured below.

## What was built

| Part                  | File                                                                         | What it does                                                                                                   |
| --------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Shared rules          | `pipeline/medicheck_pipeline/export_rules.py` → `web/lib/ai/salt-rules.json` | The pipeline's salt synonyms and form/release words, copied for the browser; a test fails if the copy is stale |
| Normalization         | `web/lib/ai/normalize.ts`                                                    | Same salt normalization as the pipeline; OCR-aware name comparison; strengths in names                         |
| Re-ranker             | `web/lib/ai/rerank.ts`                                                       | Evidence per candidate, choice model, safety rules, decision                                                   |
| Learned weights       | `web/lib/ai/match-weights.json`                                              | Written by `pnpm eval:match --fit`                                                                             |
| Candidates + decision | `web/lib/find-match.ts`                                                      | Two trigram searches (as read, and cleaned), merged; then the re-ranker                                        |
| API                   | `web/app/api/match/route.ts` (`POST`)                                        | Scan matching; medicine details in the body, never in the URL                                                  |
| Screen                | `web/components/scan-client.tsx`, `generic-result.tsx`                       | "This looks like", how sure, "Why we think so", options to pick, generic and savings                           |
| Database              | `supabase/migrations/20261024020000_*`, `20261024030000_*`                   | `search_brands()` can include discontinued brands; ignores "tablet" etc. in the query                          |
| Evaluation            | `web/scripts/eval-match.ts`, `pnpm eval` (photo section)                     | Fits the weights, picks the threshold, reports baselines, calibration and every photo                          |

Tests: 44 for matching (`web/tests/rerank.test.ts`), web total 258; pipeline 106.

## How a strip becomes a medicine

1. **Input:** what the user confirmed on "Check what we read": name, ingredients (one per line),
   plus the form, maker and release words (SR, MR, "sustained release") found in the text.
2. **Candidates:** the database's trigram search (M1) runs twice, on the name as read and on a
   cleaned version where OCR slips are undone ("SERT0SH 100mg Talet" → "sertosh"). The two lists
   are merged: up to 10 brands. Discontinued brands are included, because the strip in
   someone's cabinet may be old stock.
3. **Evidence** for each candidate, each +1 (agrees), −1 (contradicts) or 0 (not read):
   - _name_: how alike the names are (0–1), after removing "Tablet", "Rx" and strengths, and
     treating OCR look-alikes as equal (0/O, 1/l/i, 5/S, 8/B, rn/m, cl/d);
   - _strength_: numbers in the name on the strip ("Suhagra-100") must be in the candidate;
   - _ingredients_: same salts (after normalization, e.g. "Metformin Hydrochloride IP" =
     "metformin") and same strengths;
   - _form_ (tablet, syrup…), _release type_ (SR, DR…), _manufacturer_.
4. **Probabilities** with a **choice model** (conditional logit): each candidate gets a score
   `bias + Σ weight × evidence`, and a softmax turns the scores into probabilities over
   "candidate 1, …, candidate n, none of these", which add up to 1.
5. **Decide**, with two safety rules the model cannot override:
   - never answer with a candidate that something on the strip **contradicts** ("Potrate 5" is
     not "Potrate 10", however alike the names);
   - if the brand comes in **several strengths** (a number in its name) the strip must say which.
   - Otherwise answer if the probability ≥ the threshold (0.55); else abstain.
6. **Show:** a match shows the medicine, "how sure" and "Why we think so"; then the generic, as
   in M1. An abstention says why, offers the top 3 to pick from, and "Type the name instead".
   If the ingredients confirmed from the strip differ from the chosen brand's record, no generic
   is shown at all.

## Key decisions, in plain words

**A choice model, not one probability per candidate.** The first version scored each candidate
on its own (logistic regression). It could not tell "Valium 5" from "Valium 10" when both names
match perfectly, so a perfect name match meant little and it abstained on 70% of strips. In a
choice model the candidates compete: the one whose strength agrees takes the probability from
the one whose strength contradicts, and two equally good candidates split it, so neither is
confident. Same idea as softmax at the end of a neural network classifier.

**Weights are learnt, safety is not.** The weights come from data (gradient descent on the
development set). But the learnt model gave "Potrate 10" 91% for a strip that says "Potrate 5",
because name, form and maker agreed. A rule that a contradiction is never answered costs a
tap (the user picks from the options) and prevents a wrong strength, which would mean a wrong
generic. The brief says a wrong generic is worse than no answer.

**Simulated cases, because 14 photos cannot train anything.** There are 5 labelled photos of
medicines in the Indian dataset. So the evaluation also takes 800 real brands from the database
and turns each into what OCR might read: letter swaps seen on the M3 photos (rn→m, l→1, O→0),
missing strengths, junk like "Rx" or "ee", some ingredients read with errors. In 1 of 4 cases the
true brand is removed from the candidates, so the right answer is "abstain" (a brand newer than
2022, or a foreign one). Weights and threshold are chosen on the dev part only; results are
reported on the test part and on the real photos.

**OCR-aware name comparison.** Edit distance counts every changed letter the same. But OCR
swaps some letters far more than others, so "TE1MA" and "Telma" are compared as equal. A
genuinely different letter ("Sortis" vs "Sortin") still counts.

**Fuzzy salts only by one letter.** "Citalopram" and "escitalopram" are different medicines two
letters apart. A one-letter slip in a long salt name counts as the same salt; two letters is
"maybe" (no evidence either way); more is a different salt.

**The search ignores "tablet".** The evaluation found that OCR text like "LAH TABLET" made the
database compare the query with almost all 241,000 brands (they all contain "tablet") and time
out after 3 seconds. Form words are now removed from the query; typing "Telma tablet" on the
search page benefits too.

**Discontinued brands are found when scanning.** "Fincover 1mg" and "Crocin Cold & Flu Max" are
marked discontinued in the 2022 data, but a photographed strip exists. The typed search still
shows only brands on sale.

## Results

From `eval/match-results.md` (`pnpm eval:match`).

**Simulated, test set (207 strips, 163 in the dataset; never used for fitting):**

| Method                                  | Top-1 | Top-3 | Answered | Wrong (of answered) | Wrong generic | Abstained (in dataset) |
| --------------------------------------- | ----- | ----- | -------- | ------------------- | ------------- | ---------------------- |
| Exact name only (no fuzzy matching)     | 62.6% | 62.6% | 50.7%    | 2.9%                | 2.9%          | 36.2%                  |
| Trigram search only                     | 81.0% | 90.8% | 91.8%    | 30.5%               | 26.8%         | 6.1%                   |
| Re-ranking, no abstention               | 85.9% | 90.2% | 91.8%    | 26.3%               | 19.5%         | 6.1%                   |
| **Medicheck (re-ranking + abstention)** | 85.9% | 90.2% | 58.5%    | 3.3%                | **0.0%**      | 28.2%                  |

Development set (593 strips): top-1 89.1%, wrong 1.0%, wrong generic 0.0%.

- **Re-ranking** adds 5 points of top-1 over the trigram search alone (7 on dev).
- **Abstention + safety rules** cut wrong answers from 26% to 3%; every remaining wrong answer
  was a brand with the same composition as the right one (e.g. "Etozoc 90" for "Etozox 90",
  both etoricoxib 90 mg), so the generic shown was still right.
- **Calibration:** when it says 90–100% sure it is right 98% of the time; 50–90%: 90–92%;
  25–50%: 52%. So the confidence shown means roughly what it says above 50%.
- **Why top-3 stops at ~90%:** for ~10% of strips the search never finds the right brand (names
  too garbled). Most abstentions on in-dataset strips are correct caution: no strength read for
  a brand sold in several strengths, or a name that matches two similar products equally.

**Real photos, values as confirmed by the user (14 dev photos, 5 in the dataset):** 0 wrong.
Suhagra-100, Neorelax MR and Fincover matched; Cialis (no strength in the name) correctly asks
"10 mg or 20 mg?"; Crocin Cold & Flu Max abstains (48%, threshold 55%). All 9 foreign or
not-in-dataset strips abstain, including the dangerous look-alikes: Sortis (atorvastatin) is not
turned into Sortin (rosuvastatin), Warfarin not into Heparin, Citalopram not into Escitalopram,
Favipill 800 not into Favipill 400.

**Real photos, fully automatic (no corrections; `pnpm eval`):** 1 right (Suhagra-100), 0 wrong,
4 abstained. The M3 reader leaves the name empty on most whole-pack photos, so this path
depends on M3's brand reading, the weakest field.

## How to test it

1. `pnpm dev`, open http://localhost:3000/en/scan, **Try a demo strip**, then **Find a cheaper
   generic**. The demo brand "DEMOTEL" is made up, so it says it couldn't find the name (correct).
2. Change the name to `Telma 40` and press the button again: "This looks like: Telma 40 Tablet",
   how sure, "Why we think so", then the Jan Aushadhi generic and the savings.
3. Change the name to `Valium`: it asks which strength. Choose one: no generic is shown, because
   the strip's ingredients (telmisartan) are not Valium's.
4. `pnpm eval:match` (about 1 minute; needs `web/.env.local`), `pnpm test` (258 tests).

## Limitations

- **Simulated cases are not real OCR.** The noise model was written from the errors seen on the
  M3 photos, and the name comparison knows the same look-alike letters, so the simulated numbers
  are likely optimistic. The real-photo numbers are small (5 in-dataset photos). More real
  photos of Indian strips are the most useful next step.
- The 25% "not in the dataset" rate in the simulation is a guess; it decides how cautious the
  learnt model is.
- The fully automatic path is limited by brand reading (M3). The user must usually type or fix
  the name.
- Brand data is from November 2022; newer brands abstain ("couldn't find").

## Viva questions this milestone answers

- _How does the app know which medicine it is?_ Candidates from a trigram search, evidence for
  each (name, strength, ingredients, form, release, maker), a choice model for probabilities,
  and safety rules before answering.
- _What is a conditional logit / softmax?_ Scores become probabilities that add up to 1 across
  the options, including "none of these"; the options compete.
- _How were the weights chosen?_ Gradient descent minimising −log P(right answer) on the
  development set (`fitChoiceModel`); the threshold is the lowest whose wrong rate on dev is ≤ 2%.
- _Why not trust the model completely?_ It is trained on simulated data and optimises average
  accuracy; a contradicted strength is a safety problem, not an accuracy problem.
- _What happens when it is unsure?_ It says so, shows the top 3 with how likely each is, and
  links to typing the name. It never guesses.
- _How do you know the confidence means something?_ The calibration table: 90–100% confidence
  was right 98% of the time on test cases.
- _Why might a right brand still give no generic?_ Its record may list fewer ingredients than
  the strip (the dataset keeps 2), or Jan Aushadhi has no exact same composition.
