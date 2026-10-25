# DawaCheck evaluation results

Generated 2026-10-25 by `pnpm eval`.
Strips: 15 (demo, dev). Photos with a back side: 2.

## Field reading: exact-match accuracy and character error rate (CER)

| Field       | DawaCheck correct | DawaCheck wrong | Baseline correct | Baseline wrong | CER DawaCheck | CER baseline |
| ----------- | ----------------- | --------------- | ---------------- | -------------- | ------------- | ------------ |
| brand       | 20% (3/15)        | 27% (4/15)      | 0% (0/15)        | 20% (3/15)     | 0.72          | 0.95         |
| ingredients | 27% (3/11)        | 36% (4/11)      | 0% (0/11)        | 18% (2/11)     | 0.63          | 0.97         |
| mrp         | 50% (3/6)         | 0% (0/6)        | 0% (0/6)         | 17% (1/6)      | 0.50          | 1.00         |
| packSize    | 42% (5/12)        | 0% (0/12)       | 8% (1/12)        | 0% (0/12)      | 0.58          | 0.92         |
| batchNo     | 100% (5/5)        | 0% (0/5)        | 20% (1/5)        | 0% (0/5)       | 0.00          | 0.80         |
| mfgDate     | 83% (5/6)         | 0% (0/6)        | 17% (1/6)        | 0% (0/6)       | 0.17          | 0.83         |
| expDate     | 83% (5/6)         | 0% (0/6)        | 50% (3/6)        | 0% (0/6)       | 0.17          | 0.50         |

"Wrong" = a value was shown and it was incorrect. The rest of each row (not correct, not
wrong) was left empty: the user is asked to type it. A wrong value is worse than an empty one.

## Batch number: foil vs matte packs

| Pack  | DawaCheck  | Baseline  |
| ----- | ---------- | --------- |
| Foil  | 100% (3/3) | 33% (1/3) |
| Matte | 100% (2/2) | 0% (0/2)  |

## Speed (this computer, not a phone)

Median 3221 ms, p95 10788 ms per strip (front + back). Phone timing is measured
separately in the app ("How we read this" shows the time).

CER = edits needed / length of the true value (0 = perfect). Exact match ignores case,
spaces and punctuation. A field left empty in the label is not scored.

## Photo → medicine, fully automatic (no corrections on the confirm screen)

The reader's fields go straight into the matcher, as if the user tapped "Find" without
fixing anything. 7 of 15 strips are in the brand dataset; for the
others, abstaining is the right answer. In the app the user can fix the name first, which
`pnpm eval:match` measures.

- With brand guesses (the tallest plausible lines on the front, confirmed by matching):
  Right: 3 · Wrong: 0 · Abstained: 4 in dataset, 8 not in dataset
- Ablation, only the one name the reader picked: Right: 3 · Wrong: 0 · Abstained: 4 in dataset, 8 not in dataset

| Photo                  | Expected                     | DawaCheck               |           | Without guesses | Guesses tried                                                                                                        |
| ---------------------- | ---------------------------- | ----------------------- | --------- | --------------- | -------------------------------------------------------------------------------------------------------------------- |
| demo-telmikind         | Telmikind 40 Tablet          | Telmikind 40 Tablet     | right     | right           | TELMIKIND 40                                                                                                         |
| demo-omee              | Omee Capsule                 | Omee Capsule            | right     | right           | OMEE                                                                                                                 |
| favipill800            | (abstain: not in dataset)    | abstain (contradiction) | abstained | abstained       | Favipil R00 i & a 3 7 / Favipill I : HYz=> / Riewatdn of hited ean Sw. ois Tes. EE x                                 |
| fincover1              | Fincover 1mg Tablet          | abstain (unsure)        | abstained | abstained       | Wiis ames BDO A fre 8 of / ARG CA CRE Rae Sinks o gue © x gi / Prati APR                                             |
| suhagra100             | Suhagra 100 Tablet           | Suhagra 100 Tablet      | right     | right           | \| Suhagra-100 / pave -                                                                                              |
| neorelax-mr            | Neorelax MR Tablet           | abstain (no_candidates) | abstained | abstained       | Exgipients AHN mg cade en Ta a sd / Joe E70 2950 PIS Natagarh, Distt. of Sty / EC 5 ated tatrsi ne ENS 3 JEAN 2X A = |
| crocin-cold-flu        | Crocin Cold & Flu Max Tablet | abstain (no_candidates) | abstained | abstained       | .Rs15.00 INCL.OF C0 ; Fy / .Rs15.00 INCL.OF ay ; Fy / : ST ; h. N Re Ny asians lf                                    |
| metformin500-zanza     | (abstain: not in dataset)    | abstain (unsure)        | abstained | abstained       | \| Metformin t / \| Metformin 4 / rmin                                                                               |
| warfarin2-label        | (abstain: not in dataset)    | abstain (contradiction) | abstained | abstained       | —— WARFARIN / Forman, OUT OF THE REACH OF CHILDREN / Expr Armedabad, India                                           |
| azithromycin250-sandoz | (abstain: not in dataset)    | abstain (no_candidates) | abstained | abstained       | te LEA Shad A A. A Vy 3 ; ! / Fido Ee \| EY" GW / ak EE RO AE ol Aa ERE FOTN.                                        |
| anterone50             | (abstain: not in dataset)    | abstain (contradiction) | abstained | abstained       | Anterone 50 LL em / 1 Anterone 50 i ee / 1 Anterone 50 i ea                                                          |
| citalopram20           | (abstain: not in dataset)    | abstain (no_candidates) | abstained | abstained       | HEUMANN Jf / 1 ~ Heuma a / gh 20 Filmtablet ey Siig                                                                  |
| cialis20               | Cialis 20mg Tablet           | abstain (no_candidates) | abstained | abstained       | NT JENN SN                                                                                                           |
| dexedrine5             | (abstain: not in dataset)    | abstain (no_candidates) | abstained | abstained       | Ek > > pexedrine® bl NS 5 $d “Zn 7 he / x > = — Sa ce aersdn a / 3 tots Smo Dexedrine® tn NG oe                      |
| androcur50             | (abstain: not in dataset)    | abstain (contradiction) | abstained | abstained       | i : ile a blet: al hy ile / HN A rocurds A lin a / {hi PREY Bie ) ig hb SF 75 sn Yi                                  |
