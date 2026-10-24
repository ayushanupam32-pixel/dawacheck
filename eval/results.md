# DawaCheck evaluation results

Generated 2026-10-24 by `pnpm eval`.
Strips: 14 (demo, dev). Photos with a back side: 1.

## Field reading: exact-match accuracy and character error rate (CER)

| Field       | DawaCheck correct | DawaCheck wrong | Baseline correct | Baseline wrong | CER DawaCheck | CER baseline |
| ----------- | ----------------- | --------------- | ---------------- | -------------- | ------------- | ------------ |
| brand       | 14% (2/14)        | 29% (4/14)      | 0% (0/14)        | 21% (3/14)     | 0.77          | 0.95         |
| ingredients | 20% (2/10)        | 40% (4/10)      | 0% (0/10)        | 20% (2/10)     | 0.69          | 0.96         |
| mrp         | 40% (2/5)         | 0% (0/5)        | 0% (0/5)         | 20% (1/5)      | 0.60          | 1.00         |
| packSize    | 36% (4/11)        | 0% (0/11)       | 9% (1/11)        | 0% (0/11)      | 0.64          | 0.91         |
| batchNo     | 100% (4/4)        | 0% (0/4)        | 25% (1/4)        | 0% (0/4)       | 0.00          | 0.75         |
| mfgDate     | 80% (4/5)         | 0% (0/5)        | 20% (1/5)        | 0% (0/5)       | 0.20          | 0.80         |
| expDate     | 80% (4/5)         | 0% (0/5)        | 40% (2/5)        | 0% (0/5)       | 0.20          | 0.60         |

"Wrong" = a value was shown and it was incorrect. The rest of each row (not correct, not
wrong) was left empty: the user is asked to type it. A wrong value is worse than an empty one.

## Batch number: foil vs matte packs

| Pack  | DawaCheck  | Baseline  |
| ----- | ---------- | --------- |
| Foil  | 100% (3/3) | 33% (1/3) |
| Matte | 100% (1/1) | 0% (0/1)  |

## Speed (this computer, not a phone)

Median 9885 ms, p95 16818 ms per strip (front + back). Phone timing is measured
separately in the app ("How we read this" shows the time).

CER = edits needed / length of the true value (0 = perfect). Exact match ignores case,
spaces and punctuation. A field left empty in the label is not scored.

## Photo → medicine, fully automatic (no corrections on the confirm screen)

The reader's fields go straight into the matcher, as if the user tapped "Find" without
fixing anything. 5 of 14 strips are in the brand dataset; for the
others, abstaining is the right answer. In the app the user can fix the name first, which
`pnpm eval:match` measures.

Right: 1 · Wrong: 0 · Abstained: 4 in dataset, 9 not in dataset

| Photo                  | Expected                     | DawaCheck               |           |
| ---------------------- | ---------------------------- | ----------------------- | --------- |
| demo                   | (abstain: not in dataset)    | abstain (no_candidates) | abstained |
| favipill800            | (abstain: not in dataset)    | abstain (no_brand)      | abstained |
| fincover1              | Fincover 1mg Tablet          | abstain (no_brand)      | abstained |
| suhagra100             | Suhagra 100 Tablet           | Suhagra 100 Tablet      | right     |
| neorelax-mr            | Neorelax MR Tablet           | abstain (no_brand)      | abstained |
| crocin-cold-flu        | Crocin Cold & Flu Max Tablet | abstain (no_brand)      | abstained |
| metformin500-zanza     | (abstain: not in dataset)    | abstain (unsure)        | abstained |
| warfarin2-label        | (abstain: not in dataset)    | abstain (contradiction) | abstained |
| azithromycin250-sandoz | (abstain: not in dataset)    | abstain (no_brand)      | abstained |
| anterone50             | (abstain: not in dataset)    | abstain (no_candidates) | abstained |
| citalopram20           | (abstain: not in dataset)    | abstain (no_candidates) | abstained |
| cialis20               | Cialis 20mg Tablet           | abstain (no_brand)      | abstained |
| dexedrine5             | (abstain: not in dataset)    | abstain (no_brand)      | abstained |
| androcur50             | (abstain: not in dataset)    | abstain (no_brand)      | abstained |
