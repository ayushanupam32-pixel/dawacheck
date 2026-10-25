# M5 check accuracy

Written 2026-10-25. Targets are from the project brief (section 7, "What to measure").

## Banned-combination check: 20 banned + 20 legal medicines

Target: correct verdict on all 40 (100%). **Result: 40 / 40.**

Each case is a medicine described in full (salts, strengths, form, release type). The expected
verdict comes from the official CDSCO list text, not from DawaCheck's code:

- **20 banned**, each with the notification that bans exactly it: rosiglitazone, terfenadine,
  astemizole, phenformin, rimonabant (single-drug bans); nimesulide + paracetamol dispersible
  tablets; diclofenac + paracetamol injection; aceclofenac (SR) + paracetamol; aceclofenac 50 mg
  - paracetamol 125 mg tablet; gliclazide 80 mg + metformin 325 mg; azithromycin + cefixime;
    amoxicillin + dicloxacillin; ofloxacin + ornidazole injection; chlorpheniramine + codeine
    syrup; S(+) etodolac + paracetamol; nimesulide + serratiopeptidase; flupenthixol + melitracen;
    cefixime + ornidazole; levocetirizine + phenylephrine; mefenamic acid + paracetamol injection.
    All 20: **prohibited**.
- **20 legal**, widely sold medicines whose ingredients appear in the lists only inside other
  combinations (an extra salt, or a restricted form or strength), checked against the raw PDF
  text: paracetamol 500; aceclofenac 100 + paracetamol 325 tablet; diclofenac 50 + paracetamol
  325 tablet; nimesulide + paracetamol tablet; gliclazide 80 + metformin 500; ofloxacin +
  ornidazole tablet; (racemic) etodolac + paracetamol; telmisartan; metformin; amlodipine;
  atorvastatin; pantoprazole; amoxicillin + clavulanic acid; cefixime; cetirizine; montelukast +
  levocetirizine; glimepiride + metformin; domperidone SR + rabeprazole; azithromycin;
  ibuprofen + paracetamol. All 20: **not listed**.

Test: `web/tests/banned-cases.test.ts` (runs in CI on every push).

Note: with a cut-short 2-ingredient brand record (most combination records in the 2022 brand
dataset), the same banned combinations show as "may apply" (show your pharmacist), not
"prohibited", because the record cannot prove there is no third ingredient. Over all 241,046
brands: 62 certain alerts (all withdrawn single drugs) and 4,885 "show your pharmacist".

## Batch alerts (NSQ data) vs CDSCO's monthly PDFs

Target: precision and recall ≥ 98% against 3 manually checked monthly lists.

DawaCheck does not parse PDFs for this check: since August 2025 CDSCO publishes the alerts as a
searchable online table, which the pipeline reads as structured data. CDSCO's monthly PDFs (up to
June 2025) are an independent copy, so we compared the batch numbers of the three latest
CDSCO-laboratory PDFs with our data for the same month.

| Month (CDSCO labs PDF) | Batches in PDF | Found in DawaCheck's data | Recall    |
| ---------------------- | -------------- | ------------------------- | --------- |
| June 2025              | 57             | 56                        | 98.2%     |
| May 2025               | 55 *           | 54                        | 98.2%     |
| April 2025             | 60             | 60                        | 100%      |
| **Total**              | **172**        | **170**                   | **98.8%** |

\* One more PDF row has the batch "Not mentioned", which cannot be looked up.

The 2 misses (Dextrose injection batch 1-3098, June; Pantoprazole tablets batch 0092, May) are
**missing from CDSCO's online table itself**: our pipeline copies that table, so they cannot be in
our data. Not a parsing error, but a gap between CDSCO's two publications.

**Precision.** Our rows are copied from CDSCO's online table field by field (no free-text
extraction), so every row we hold is in the official source. Against the PDFs, the online table
has _more_ CDSCO-laboratory rows for the same months (June 2025: 83 vs 57; April 2025: 74 vs 60),
mostly from FDA Lab Mumbai and CDTL Mumbai/Chennai; spot-checked, they are genuine alerts in the
online table that the PDF did not list. So "in our data but not in the PDF" here measures the
PDF's incompleteness, not wrong rows.

Found while checking: 23 alerts had placeholders ("Not applicable", "Not given") as their batch
number. They are now treated as "no batch number" (`parse_cdsco_alerts.py`), leaving 6,921
alerts with a real batch number.

Method: `pdfplumber` tables of the three PDFs (batch column), normalized like the strip reader,
compared with `pipeline/clean/cdsco_alerts.csv` for the same month; misses checked by hand in the
PDF text and in the raw online-table files.

## Fair-price check: 30 hand-verified scheduled medicines

Target: correct verdict on 30 (100%). **Result: 30 / 30 ceiling prices read exactly, 60 / 60
verdicts correct.**

- **Source:** NPPA order S.O. 1575(E), 25.03.2026 (ceiling prices of 767 scheduled formulations
  under NLEM 2022, in force from 1.4.2026), plus S.O. 1581(E) (138 formulations, NLEM 2015).
  Official Gazette PDFs from nppa.gov.in, saved in `pipeline/raw/nppa/2026-03-27/` (SOURCE.md).
- **Prices read correctly:** for 30 common tablets and capsules (amlodipine, atorvastatin,
  azithromycin, cefixime, cetirizine, clopidogrel, metformin, telmisartan, levothyroxine, ...),
  the ceiling price was read by hand from the order's English table and compared with what the
  parser produced from the same PDF: right composition key and exactly the official price for all
  30 (`pipeline/tests/test_nppa_30.py`).
- **Verdicts:** for each, a 10-tablet strip made in January 2026 (after the GST cut to 5%) priced
  at ceiling + 4% must be "within", and at ceiling + 10% "above": 60 / 60
  (`web/tests/price-cases.test.ts`). A strip made before 22.09.2025 is allowed ceiling + 12% GST.

Coverage: 430 of 439 tablet/capsule ceiling prices parse (the 9 refused have unusual names, e.g.
"Co-trimoxazole [Sulphamethoxazole (A) + Trimethoprim (B)]"). 38,481 active brands (16.5%) have a
ceiling price, about the share of the market that is price-controlled.
