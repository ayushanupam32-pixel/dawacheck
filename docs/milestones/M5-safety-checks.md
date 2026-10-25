# M5 — Safety checks

**Goal:** after a scan, a result card with the checks: cheaper generic, batch safety (CDSCO
alerts), fair price (NPPA ceiling price), banned combination (CDSCO lists), nearest Jan Aushadhi
Kendra. (The brief's sixth check, duplicates in a family cabinet, belonged to M6, which the user
dropped on 2026-10-25; the card has five rows.)

**Done when:** all check test cases pass; the monthly GitHub Action runs successfully.

**Status (2026-10-25): done.** All four data checks are built, tested and live: cheaper generic
(M1), batch safety (CDSCO alerts), fair price (NPPA ceiling prices), banned combination (CDSCO
lists), plus the nearest-Kendra link. The brief's accuracy targets are met (see "Accuracy").

## Sources (inspected first; decisions agreed with the user)

| Check              | Source                                                                         | Format                                                  |
| ------------------ | ------------------------------------------------------------------------------ | ------------------------------------------------------- |
| Batch safety       | CDSCO "NSQ Alerts" page; its table loads public JSON from `cdscoonline.gov.in` | JSON per month (Latin-1), NSQ since 2019, spurious 2025 |
| Banned combination | CDSCO "Fixed Dose Combination" page                                            | PDFs: consolidated list (2021) + lists of 2023–2026     |
| Fair price         | NPPA "Compendium of Prices 2026" (dashboard; the user exports the Excel)       | Excel (pending)                                         |

No robots.txt on either CDSCO site; 2 seconds between requests. NPPA's web pages refuse scripts
(403) and its price dashboard uses rotating security tokens and request encryption, so neither is
scripted. The ceiling prices come instead from NPPA's official yearly orders, plain PDF files
listed on its "Circulars / Orders" page and served to any visitor; they are downloaded once a year
(April revision) into `pipeline/raw/nppa/<date>/`.

## What was built

| Part                  | File                                                                               |
| --------------------- | ---------------------------------------------------------------------------------- |
| Fetch alerts          | `pipeline/dawacheck_pipeline/fetch_cdsco_alerts.py`                                |
| Parse alerts          | `pipeline/dawacheck_pipeline/parse_cdsco_alerts.py`                                |
| Fetch FDC lists       | `pipeline/dawacheck_pipeline/fetch_cdsco_fdc.py`                                   |
| Parse FDC lists       | `pipeline/dawacheck_pipeline/parse_cdsco_fdc.py` (pdfplumber)                      |
| Parse NPPA orders     | `pipeline/dawacheck_pipeline/parse_nppa.py` (ceiling prices, 1.4.2026)             |
| Load                  | `pipeline/dawacheck_pipeline/load_supabase.py` (`load_alerts`, `load_banned_fdcs`) |
| Tables                | `supabase/migrations/20261024040000_safety_check_tables.sql`                       |
| Checks (pure, tested) | `web/lib/checks/batch.ts`, `banned.ts`, `price.ts`, `types.ts`                     |
| Checks with database  | `web/lib/run-checks.ts`, `POST /api/checks`                                        |
| Result card           | `web/components/result-card.tsx` (en / hi / ta)                                    |
| Monthly refresh       | `.github/workflows/data-refresh.yml` (4 new steps)                                 |

Data: **6,944 alerts** (6,896 NSQ, 48 spurious; Jan 2019 – Sep 2026) and **682 banned-list
entries** (582 combinations, 14 single drugs, 86 descriptions that cannot be matched).
Tests: pipeline 147 (+35), web 275 (+17).

## How the checks decide

**Batch safety.** Same batch number (normalized like the strip reader: "AOX-2402" = "AOX2402")
AND the same product: brand name similar (≥ 0.6, the brief's threshold), or all of the medicine's
salts in the alert's product name, or the same manufacturer. A batch number alone is not enough:
different companies reuse numbers. Results:

- **alert**: the brief's exact wording, "This batch was reported in a government quality alert.
  The finding applies to the tested batch. Show this to your pharmacist.", plus the month, the
  failed test, the lab, and "alerts checked up to …".
- **ok**: "not in the government quality alerts we checked", or "in an alert, but for a different
  medicine".
- **unknown**: no batch number, a batch number the reader was unsure of (below the confirm
  screen's 60% "Please check" level and not corrected by the user), or no alerts loaded.

**Fair price.** NPPA fixes a ceiling price per unit (one tablet, one ml) for each scheduled
formulation, **excluding GST**. The check finds the ceiling by the medicine's exact composition
key (like the generic), works out the MRP per tablet from the strip (MRP ÷ how many), and compares
it with the ceiling **plus 5% GST** (the GST on most medicines since 22.09.2025; some lifesaving
ones are 0%). Above that, the MRP is above the ceiling whatever the GST: "show this to your
pharmacist", with NPPA's helpline (1800 111 255). Otherwise: "within the ceiling", "not
price-controlled" (no ceiling for this medicine), or "can't compare" (MRP or count missing, or a
price per ml/g, since we do not read a bottle's volume). A combination from a cut-short brand
record gets no verdict: its ceiling could belong to a smaller combination. When a medicine has
several ceilings (pack sizes, two lists), the newer list and the highest price are used, so a
price is never called too high by mistake.

**Banned combination.** An entry applies only if everything it names matches the medicine:

- the **salts**, as a set ("A + B" = "B + A"; an extra salt makes a different combination); a
  single-drug ban (phenacetin, rosiglitazone…) applies to any medicine containing the drug;
- the **form**, if named ("Diclofenac + Paracetamol **injection**" bans only the injection);
- the **release type**, if named ("Aceclofenac **(SR)** + Paracetamol");
- the **strengths**, if named ("Gliclazide **80mg** + Metformin **325 mg**").

Each entry is then **certain** (everything confirmed), **may apply** (something it names cannot be
confirmed for this medicine) or does not apply. Only a certain match with a plainly prohibited
entry is an **alert**. Everything else that applies is a **warn** for the pharmacist, with the
legal status in words: stayed or quashed by a High Court, under examination, revoked with
conditions, restricted (from the consolidated list's footnotes 1#–6#), or "may apply".

"These salts and nothing else" can only be confirmed when the ingredient list is complete. The
brand dataset keeps at most 2 ingredients per brand (M1 marks those records "may be
incomplete"): "Acemiz-MR" is aceclofenac + paracetamol + chlorzoxazone but is recorded with two.
So a combination ban on an incomplete record is "may apply", unless the strip, as confirmed by the
user, lists more salts than the record.

## The banned-list false alarm (found on the live site, fixed)

The first version (commit `5b52369`) compared salts only. After the first data load, checking the
live site showed it calling **aceclofenac + paracetamol** banned: 6,444 brands of one of India's
most common legal pain-relief combinations. The ban is on the **sustained-release** form and on a
50 mg + 125 mg product, not on the combination. The same was true of diclofenac + paracetamol
(injection only), nimesulide + paracetamol (dispersible tablets, suspension, injection), gliclazide

- metformin (two strength pairs) and others. The check was switched off on the live site within
  the hour (it said "couldn't check"), and fixed:

| Brands in the dataset (241,046) | Salts only (deployed first) | Fixed check                         |
| ------------------------------- | --------------------------- | ----------------------------------- |
| Flagged as banned (alert)       | 18,278                      | **62**                              |
| "Show your pharmacist" (warn)   | (included above)            | 4,885 ("may apply" or court status) |

The 62 certain alerts are all single drugs withdrawn in India (rosiglitazone, rimonabant,
terfenadine, astemizole, phenformin, fenfluramine). The 4,885 warnings are combinations that are
on the lists but whose ingredient list, form or strength the record cannot confirm, or whose ban
is stayed, quashed or under examination; in the scan flow, the strip's confirmed ingredients
settle many of them. Measured by running the real check (`web/lib/checks/banned.ts`) over every
composition in `pipeline/clean/brands.csv`.

Lesson for the report: test a safety check against the whole population it will see, not only
against the cases it should catch.

A second slip during the fix: reloading kept the 682 old (unrestricted) entries next to the 687
new ones, because the loader deleted rows "older than today" and both loads ran on the same day,
with new row ids. The check stayed switched off until the loader was fixed: rows are now stamped
with the run's start time and everything older is removed, and the ±20% safety check compares
with what the previous run loaded rather than with the table's row count.

## Accuracy (the brief's targets)

From `eval/m5-checks.md`:

- **Banned combination, 20 banned + 20 legal medicines** (target 100%): **40 / 40** correct
  (`web/tests/banned-cases.test.ts`, runs in CI).
- **Batch alerts vs CDSCO's own monthly PDFs** (target ≥ 98%): **170 / 172** batches of the
  April–June 2025 CDSCO-lab PDFs are in our data (98.8%). The 2 misses are missing from CDSCO's
  online table itself. The online table holds more alerts than the PDFs (they are partial lists).
- **Fair price, 30 hand-verified scheduled medicines** (target 100%): **30 / 30** ceiling prices
  read exactly from the official order, **60 / 60** within/above verdicts
  (`pipeline/tests/test_nppa_30.py`, `web/tests/price-cases.test.ts`).

## Key decisions, in plain words

**"Couldn't check" is not "nothing found".** If a list is not loaded, or the batch number is
uncertain, the card says it could not check. Saying "not in the alerts" without having looked
would be false reassurance.

**The latest notification wins, per strength.** S(+) Etodolac + Paracetamol was banned in 2018,
the ban was quashed in 2020, and it was banned again on 12.08.2024: it shows as prohibited.
Entries with different strengths stay separate.

**The document's legend beats a vague table row.** The consolidated list's row says only
"Etodolac + Paracetamol", but its footnote 5# says the notification is about S(+) Etodolac.
Read literally, ordinary etodolac + paracetamol medicines (legally sold) would be put "under
legal review". The parser applies the legend (one documented override).

**A form-limited ban is not matched.** "Tetracycline liquid oral preparations" bans only the
liquid form; matching on "tetracycline" would flag legal capsules. Such entries are kept as
descriptions and never matched.

**Repairing names, cautiously.** The PDFs split words ("Cetir izine") and contain typos
("Dextromethophen"). A name is repaired only to a salt our medicine data uses, and only if exactly
one such salt is 1 letter away (2 for long names). 448 of 582 combinations use only known salts;
most of the rest are herbal or enzyme ingredients no brand record lists.

**Multi-batch cells are split.** "PFB-701, OPCP-195" is two batches; "AS-9057 (Two different
samples ...)" is AS-9057.

**Which ingredients count.** The strip's (as confirmed) when they include all of the brand's
(the dataset keeps only 2 per brand, so Neorelax MR's third salt is on the strip only); the
brand's when the strip lists fewer (the reader missed one).

## How to test it

1. `pnpm test` (checks: `web/tests/checks.test.ts`), `cd pipeline && uv run pytest -q`.
2. `pnpm dev` → /en/scan → Try a demo strip → change the name to `Telma 40` → Find. The card
   shows five rows. Before the data is loaded, batch and banned say "Couldn't check".
3. After the data refresh: type batch `60098` and name `Alzomac 0.5`, ingredient
   `Alprazolam 0.5 mg`: the batch row shows the September 2026 NSQ alert.

## Limitations

- A 2-ingredient brand record cannot confirm an exact combination, so many banned combinations
  show as "may apply" (warn) rather than "prohibited" unless the strip lists more ingredients.
- Banned entries whose ingredient names we cannot match to our salt list are missed (a missed
  ban says "not on the lists we could match", never "safe").
- Older alerts (before 2025) often have no brand name; they match on ingredients or manufacturer.
- Fair price is not built yet (waiting for the NPPA file).
