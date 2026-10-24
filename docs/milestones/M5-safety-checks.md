# M5 — Safety checks

**Goal:** after a scan, a result card with six checks: cheaper generic, batch safety (CDSCO
alerts), fair price (NPPA ceiling price), banned combination (CDSCO lists), duplicates in the
family cabinet, nearest Jan Aushadhi Kendra.

**Done when:** all check test cases pass; the monthly GitHub Action runs successfully.

**Status (2026-10-24): in progress.** Built and tested: batch safety, banned combination, the
result card, the pipeline for both sources. Waiting:

- **Fair price:** the NPPA "Compendium of Prices 2026" Excel export has not reached
  `pipeline/raw/nppa/` yet. The card says "Not available yet".
- **Loading the data:** only the GitHub Action has the database's secret key, so the alerts and
  banned lists are loaded by `data-refresh.yml` after this work is committed. Until then the card
  says "Couldn't check: this government list is not loaded yet" (never "nothing found").
- Duplicates in the family cabinet arrive with M6.

## Sources (inspected first; decisions agreed with the user)

| Check              | Source                                                                         | Format                                                  |
| ------------------ | ------------------------------------------------------------------------------ | ------------------------------------------------------- |
| Batch safety       | CDSCO "NSQ Alerts" page; its table loads public JSON from `cdscoonline.gov.in` | JSON per month (Latin-1), NSQ since 2019, spurious 2025 |
| Banned combination | CDSCO "Fixed Dose Combination" page                                            | PDFs: consolidated list (2021) + lists of 2023–2026     |
| Fair price         | NPPA "Compendium of Prices 2026" (dashboard; the user exports the Excel)       | Excel (pending)                                         |

No robots.txt on either CDSCO site; 2 seconds between requests. NPPA's web pages refuse scripts
(403), so we do not scrape them: the user downloads the file, like the Kaggle brand dataset.

## What was built

| Part                  | File                                                                               |
| --------------------- | ---------------------------------------------------------------------------------- |
| Fetch alerts          | `pipeline/dawacheck_pipeline/fetch_cdsco_alerts.py`                                |
| Parse alerts          | `pipeline/dawacheck_pipeline/parse_cdsco_alerts.py`                                |
| Fetch FDC lists       | `pipeline/dawacheck_pipeline/fetch_cdsco_fdc.py`                                   |
| Parse FDC lists       | `pipeline/dawacheck_pipeline/parse_cdsco_fdc.py` (pdfplumber)                      |
| Load                  | `pipeline/dawacheck_pipeline/load_supabase.py` (`load_alerts`, `load_banned_fdcs`) |
| Tables                | `supabase/migrations/20261024040000_safety_check_tables.sql`                       |
| Checks (pure, tested) | `web/lib/checks/batch.ts`, `banned.ts`, `types.ts`                                 |
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

**Banned combination.** The medicine's salts as a set ("A + B" = "B + A"). A medicine with an
extra salt is a different combination. A single-drug ban (phenacetin, rosiglitazone…) matches
any medicine containing it. Only one case is an **alert**: one matching entry, plainly
prohibited, with no strengths named. Everything else that matches is a **warn** for the
pharmacist, with the legal status in words:

- the ban was **stayed** or **quashed** by a High Court, is **under examination**, was **revoked
  with conditions**, or is **restricted** (from the consolidated list's own footnotes 1#–6#);
- the entry names **strengths** (we do not compare strengths automatically);
- **several entries** differ by strength and status (glimepiride + pioglitazone + metformin is
  prohibited in some strengths and quashed in others).

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
   shows six rows. Before the data is loaded, batch and banned say "Couldn't check".
3. After the data refresh: type batch `60098` and name `Alzomac 0.5`, ingredient
   `Alprazolam 0.5 mg`: the batch row shows the September 2026 NSQ alert.

## Limitations

- Strengths named in banned-list entries are shown, not compared.
- Banned entries whose ingredient names we cannot match to our salt list are missed (a missed
  ban says "not on the lists we could match", never "safe").
- Older alerts (before 2025) often have no brand name; they match on ingredients or manufacturer.
- Fair price is not built yet (waiting for the NPPA file).
