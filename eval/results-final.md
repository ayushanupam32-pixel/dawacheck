# DawaCheck evaluation results

Generated 2026-10-25 by `pnpm eval --final`.
Strips: 3 (test). Photos with a back side: 0.

## Field reading: exact-match accuracy and character error rate (CER)

| Field       | DawaCheck correct | DawaCheck wrong | Baseline correct | Baseline wrong | CER DawaCheck | CER baseline |
| ----------- | ----------------- | --------------- | ---------------- | -------------- | ------------- | ------------ |
| brand       | 0% (0/3)          | 33% (1/3)       | 0% (0/3)         | 33% (1/3)      | 1.00          | 1.00         |
| ingredients | 0% (0/2)          | 100% (2/2)      | 0% (0/2)         | 50% (1/2)      | 0.78          | 1.00         |
| mrp         | –                 | –               | –                | –              | –             | –            |
| packSize    | 0% (0/2)          | 0% (0/2)        | 50% (1/2)        | 0% (0/2)       | 1.00          | 0.50         |
| batchNo     | 0% (0/1)          | 0% (0/1)        | 0% (0/1)         | 0% (0/1)       | 1.00          | 1.00         |
| mfgDate     | –                 | –               | –                | –              | –             | –            |
| expDate     | 0% (0/1)          | 0% (0/1)        | 0% (0/1)         | 0% (0/1)       | 1.00          | 1.00         |

"Wrong" = a value was shown and it was incorrect. The rest of each row (not correct, not
wrong) was left empty: the user is asked to type it. A wrong value is worse than an empty one.

## Batch number: foil vs matte packs

| Pack  | DawaCheck | Baseline |
| ----- | --------- | -------- |
| Foil  | 0% (0/1)  | 0% (0/1) |
| Matte | –         | –        |

## Speed (this computer, not a phone)

Median 3424 ms, p95 3757 ms per strip (front + back). Phone timing is measured
separately in the app ("How we read this" shows the time).

CER = edits needed / length of the true value (0 = perfect). Exact match ignores case,
spaces and punctuation. A field left empty in the label is not scored.

## Photo → medicine, fully automatic (no corrections on the confirm screen)

The reader's fields go straight into the matcher, as if the user tapped "Find" without
fixing anything. 2 of 3 strips are in the brand dataset; for the
others, abstaining is the right answer. In the app the user can fix the name first, which
`pnpm eval:match` measures.

- With brand guesses (the tallest plausible lines on the front, confirmed by matching):
  Right: 0 · Wrong: 0 · Abstained: 2 in dataset, 1 not in dataset
- Ablation, only the one name the reader picked: Right: 0 · Wrong: 0 · Abstained: 2 in dataset, 1 not in dataset

| Photo        | Expected                  | DawaCheck               |           | Without guesses | Guesses tried                                                                   |
| ------------ | ------------------------- | ----------------------- | --------- | --------------- | ------------------------------------------------------------------------------- |
| augmentin875 | Augmentin 1000 Duo Tablet | abstain (no_candidates) | abstained | abstained       | Dono me \| / Dono mer \| / Amoxicilline/acide Clavulanique - A \|               |
| diazepam10   | Valium 10mg Tablet        | abstain (no_candidates) | abstained | abstained       | NE Ream, go A RE \ te wt / yiazepa™                                             |
| sortis40     | (abstain: not in dataset) | abstain (contradiction) | abstained | abstained       | E o potenovane LOMA / = SORTIS \ taolely - / Eo Ce g g atorvastatinumi So © poe |
