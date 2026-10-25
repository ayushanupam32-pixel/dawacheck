# Label spot-check (before the final evaluation)

The labels in `labels.json` were typed by Claude from the photos, with an empty form. The final
numbers in the report must rest on labels a person has checked. This takes about 15 minutes for
the 3 test photos, 45 minutes with the dev photos too.

## How

1. `pnpm dev`, then open http://localhost:3000/en/eval/label (works only on your computer).
2. Go through the photos with Next. For each one, compare every field with what is **printed on
   the photo**, and fix it in the form. Then Save.
3. Rules for a field:
   - Type exactly what is printed (case and spacing don't matter). Ingredients: one per line,
     `Salt strength unit`, e.g. `Telmisartan 40 mg`.
   - If you can't see a value on the photo, leave it **empty**. Don't fill it in from memory.
   - Dates as `YYYY-MM` (`2027-05`).
   - **Match brand**: the exact name in DawaCheck's brand list (check on the Search page), or
     empty if the medicine is not in the list (then DawaCheck should say "not sure").
4. **Do not scan the 3 test photos in the app** and don't open `eval/results*.md` for them. They
   must stay unseen until the final run, or the final numbers are not honest.
5. Tell Claude when you're done; it then runs `pnpm eval -- --final` and
   `pnpm eval:match -- --final` once.

## The 3 frozen test photos (check these first)

| Photo        | Brand     | Ingredients          | Match brand                      | MRP | Pack | Batch  | Mfg | Exp     |
| ------------ | --------- | -------------------- | -------------------------------- | --- | ---- | ------ | --- | ------- |
| augmentin875 | Augmentin | —                    | Augmentin 1000 Duo Tablet        | —   | 20   | 506761 | —   | 2012-11 |
| diazepam10   | Valium    | Diazepam 10 mg       | Valium 10mg Tablet               | —   | —    | —      | —   | —       |
| sortis40     | Sortis    | Atorvastatinum 40 mg | (not in dataset: should abstain) | —   | 30   | —      | —   | —       |

## The 13 development photos (if you have time)

| Photo                  | Brand                 | Ingredients                                                   | Match brand                      | MRP    | Pack | Batch    | Mfg     | Exp     |
| ---------------------- | --------------------- | ------------------------------------------------------------- | -------------------------------- | ------ | ---- | -------- | ------- | ------- |
| favipill800            | Favipill 800          | Favipiravir 800 mg                                            | (not in dataset: should abstain) | 1400.0 | 10   | XFA20002 | 2020-11 | 2021-04 |
| fincover1              | Fincover              | Finasteride 1 mg                                              | Fincover 1mg Tablet              | 33.0   | 10   | FCR004   | 2009-12 | 2012-11 |
| suhagra100             | Suhagra-100           | —                                                             | Suhagra 100 Tablet               | —      | —    | —        | —       | —       |
| neorelax-mr            | Neorelax MR           | Thiocolchicoside 4 mg; Aceclofenac 100 mg; Paracetamol 325 mg | Neorelax MR Tablet               | 150.0  | 10   | —        | 2017-06 | 2020-05 |
| crocin-cold-flu        | Crocin Cold & Flu Max | —                                                             | Crocin Cold & Flu Max Tablet     | 15.0   | 6    | R3002    | 2013-01 | 2014-12 |
| metformin500-zanza     | Metformin             | Metformin 500 mg                                              | (not in dataset: should abstain) | —      | 84   | —        | —       | —       |
| warfarin2-label        | Warfarin Sodium       | Warfarin Sodium 2 mg                                          | (not in dataset: should abstain) | —      | 1000 | —        | —       | —       |
| azithromycin250-sandoz | Sandoz Azithromycin   | Azithromycin 250 mg                                           | (not in dataset: should abstain) | —      | 6    | —        | —       | —       |
| anterone50             | Anterone 50           | Cyproterone acetate 50 mg                                     | (not in dataset: should abstain) | —      | 50   | —        | —       | —       |
| citalopram20           | Citalopram Heumann    | Citalopram 20 mg                                              | (not in dataset: should abstain) | —      | 20   | —        | —       | —       |
| cialis20               | Cialis                | —                                                             | Cialis 20mg Tablet               | —      | —    | —        | —       | —       |
| dexedrine5             | Dexedrine             | Dexamfetamine sulphate 5 mg                                   | (not in dataset: should abstain) | —      | 28   | —        | —       | —       |
| androcur50             | Androcur              | —                                                             | (not in dataset: should abstain) | —      | —    | —        | —       | —       |

Note: the test set is only 3 photos (the brief asks for ~50), so its numbers will be very rough.
The report says so.
