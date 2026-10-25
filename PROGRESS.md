# DawaCheck progress

Last updated: 2026-10-24 (M4 commit, pushed to `main`).

## Where we are

**M0–M4 are done and pushed to `main`.** M4 (matching a scanned strip to a medicine) adds two
database migrations, already applied to Supabase. Next: M5 (safety checks).

- Live site: https://dawacheck-psi.vercel.app (deploys automatically on every push to `main`)

| Milestone                                                   | Status      | Commits                                                          | Notes                                                                |
| ----------------------------------------------------------- | ----------- | ---------------------------------------------------------------- | -------------------------------------------------------------------- |
| M0 Setup                                                    | done        | `052cbcd`                                                        | Next.js + pnpm workspace, CI, Vercel, 3 languages, large-text toggle |
| M1 Generic lookup                                           | done        | `eff1cd6`, `bc365fe`, `8726de1`, `1c4fee9`, `c1b090f`, `ca3d59c` | type a brand → exact Jan Aushadhi generic + savings                  |
| M2 Nearest Kendra                                           | done        | `da80334`, `c9ffe2b` (data refresh)                              | computed on the phone from static files                              |
| M3 Reading strips                                           | done        | `2b6b700`, `317324e`, `db927f1`                                  | in-browser OCR, confirm screen, evaluation                           |
| M4 Matching OCR → medicine                                  | done        |                                                                  | re-ranker + choice model + safety rules; top-1 89% dev / 86% test    |
| M5 Safety checks (NSQ, NPPA, banned FDC, 6-row result card) | not started |                                                                  |                                                                      |
| M6 Family cabinet + PWA                                     | dropped     |                                                                  |                                                                      |
| M7 Evaluation + polish                                      | not started |                                                                  |                                                                      |

Viva notes for each finished milestone: `docs/milestones/M0-setup.md` … `M4-matching.md`.

## What exists

### Accounts and services (all free)

- **GitHub** `ayushanupam32-pixel/dawacheck`. Actions secrets: `SUPABASE_URL`,
  `SUPABASE_SERVICE_KEY`. The `gh` CLI needs `GH_CONFIG_DIR=$HOME/.gh` on this Mac.
- **Vercel** project `dawacheck`, team `ayushanupam32-6998`, Root Directory `web`, connected to
  the GitHub repo. Env vars: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`.
- **Supabase** project `hmfflngfvzhmrcfskfkp` (ap-south-1, free). Tables have RLS with a
  public-read policy; `pg_trgm` is in the `extensions` schema. Migrations are in
  `supabase/migrations/` (5: reference tables, `search_brands()`, Kendra official coords, and
  for M4 `search_brands(…, include_discontinued)` + ignoring form words like "tablet" in queries).

### Data (as loaded)

| Data                  | Rows                                           | Source                                                                   |
| --------------------- | ---------------------------------------------- | ------------------------------------------------------------------------ |
| Jan Aushadhi generics | 1,627                                          | janaushadhi.gov.in API (anonymous guest token)                           |
| Brands                | 241,046 (124,781 active with an exact generic) | A-Z Medicine Dataset of India, Kaggle, CC BY-SA 4.0, 2022-11-17 snapshot |
| Salts                 | 1,736                                          | derived                                                                  |
| Jan Aushadhi Kendras  | 21,541                                         | janaushadhi.gov.in, per state                                            |

`data-refresh.yml` runs on the 5th of every month: fetch → parse → validate (refuses to load if a
table changes by more than ±20%) → load → rebuild `web/public/data` → commit.

### M1 results

20-medicine hand check of the brand → generic lookup: 16 correct, 2 safe misses (Ecosprin,
Met XL: no exact match, so no answer), 2 not in the dataset, **0 wrong**.

### M3 results (dev photos, `eval/results.md`)

13 dev photos + the demo strip. "Wrong" = a value was shown that does not match the label.

| Field       | Correct | Wrong |
| ----------- | ------- | ----- |
| Batch no.   | 4/4     | 0     |
| Mfg date    | 4/5     | 0     |
| Exp date    | 4/5     | 0     |
| MRP         | 2/5     | 0     |
| Pack size   | 4/11    | 0     |
| Ingredients | 2/10    | 4     |
| Brand       | 2/14    | 4     |

Raw Tesseract on the original photo (the baseline) scores much lower on every field. Speed:
median 10 s per strip on a laptop (max 17 s); the brief's target is 5 s on a phone.

The 3 frozen **test** photos (`augmentin875`, `diazepam10`, `sortis40`) have never been looked
at. Only open them with `pnpm eval -- --final`, once, for the final report.

### M4 results (`eval/match-results.md`, `docs/milestones/M4-matching.md`)

Matching is evaluated on 800 **simulated** strips (real database brands turned into OCR-like
text; 1 in 4 has its true brand hidden so abstaining is right) and on the labelled photos.

| Set                              | Top-1 | Top-3 | Wrong (of answered) | Wrong generic | Abstained (in dataset) |
| -------------------------------- | ----- | ----- | ------------------- | ------------- | ---------------------- |
| Simulated dev (593; fitted here) | 89.1% | 90.9% | 1.0%                | 0.0%          | 29.8%                  |
| Simulated test (207; never seen) | 85.9% | 90.2% | 3.3%                | 0.0%          | 28.2%                  |

Baselines on simulated test: exact name only 62.6% top-1; trigram search only 81.0% top-1 and
30.5% wrong. Real photos with the name confirmed by the user: 3/5 matched, 0 wrong, all 9
not-in-dataset photos abstain (Sortis is not turned into Sortin, etc.). Fully automatic (no
corrections): 1/5 matched, 0 wrong: the M3 reader rarely reads the brand name.

## Half-done / not finished

- **Photo set is small:** 16 openly licensed web photos + demo, not the ~30 needed for M3 (or the
  ~200 the brief wants by M7). No phone photos taken by the user yet. The photos are not in git:
  `eval/photo-sources.json` says where to download each one again.
- **Labels were typed by Claude**, from the web photos, with an empty form (no pre-fill). A human
  should spot-check `eval/labels.json` against the photos before the numbers go in the report.
- **Scan flow not clicked through end to end in a browser** with real photos (front → back →
  stamp → confirm). Demo mode was clicked through, including M4's match / pick / abstain screens
  (by typing "Telma 40" and "Valium" as the name). Unit tests and `pnpm eval` cover the logic.
- **M4 brief targets not all met:** top-3 90% (target 95%; ~10% of names too garbled for the
  search to find) and abstention on in-dataset strips 28% (target ≤ 20%; mostly correct caution:
  strength not read for a brand sold in several strengths).
- **"How we read this" panel** shows which image variant produced each field, but not the OCR
  bounding boxes the brief asks for.
- **Hindi and Tamil translations** were written by Claude and need review by a native speaker.
- **Tesseract model is downloaded from the CDN** at first use (M6, which would have self-hosted
  it for offline use, was dropped).

## Known bugs and limits

- **Too slow:** 10 s median per strip on a laptop; phones will be slower. Preprocessing runs on
  the main thread (the page can stutter while it works).
- **Brand and ingredient reading are weak** (2/14 and 2/10, and 4 wrong each). M4 copes (it
  abstains, 0 wrong), but the fully automatic photo → medicine path matched only 1 of 5. Idea:
  use the matcher to confirm brand guesses (the 3 tallest lines on the front) before the
  confirm screen, as the brief's Stage 3 suggests ("confirmed by matching").
- **The demo strip's brand ("DEMOTEL") is made up**, so Demo mode ends in "couldn't find this
  name". Correct behaviour, but a weak demo; type "Telma 40" on the confirm screen to show a match.
- **English OCR only** (`eng`). Hindi text on strips is not read.
- **Kendra PMBJK23337** (Thane, shown at Mumbai CST) may be misplaced in the official data; it
  passed our district check. Not fixed.
- **Ecosprin and Met XL** have no generic answer (safe misses: their composition keys don't match
  any Jan Aushadhi product exactly).
- `~/.zshrc` line 20 has an unmatched quote (a warning in every new shell, harmless). The user
  should also close the old "add supabase key" terminal tab.

## Decisions and why

**Product and safety**

- **Exact composition key or nothing.** Generics are matched only when salts, strengths, form and
  release type are all identical (`salt:value:unit` sorted + `#form#release`). A wrong generic is
  worse than no answer (brief), so near-misses are safe misses.
- **PPIs count as delayed-release** even when the brand name doesn't say so
  (`always_delayed_release` in `synonyms.yaml`): their tablets always are. This alone matched
  +9,873 brands (e.g. PAN 40).
- **Two-ingredient brand rows are marked `composition_complete = false`.** The Kaggle dataset only
  has two ingredient columns, so a 3-salt medicine would look like a 2-salt one. The search page
  asks the user to confirm the full composition before showing a generic.
- **Free-text OCR fields need a minimum confidence (`MIN_SHOW 0.3`), structured fields don't.**
  Low-confidence brand/ingredient guesses were usually garbage, so we show an empty field for the
  user to type. MRP/batch/dates have strict patterns that already reject garbage; filtering them
  only hid correct values.

**Data**

- **Official Kendra coordinates are used only when they pass checks**: inside India, within
  600 km of the state's median, within 100 km of the district's median. Otherwise we fall back
  to a geocoded address (Nominatim, cached) or the PIN area's centre, and say which one we used.
  This caught a Ganganagar Kendra plotted in central Delhi.
- **Kendra data as static files, bucketed by geohash (3 characters)**, with `index.json` and a
  PIN index. The phone downloads only nearby cells and computes Haversine distances itself, so
  the location never leaves the device and there is no server cost.
- **Kendra owner names (`contactPerson`) are stripped** when fetching: personal data we don't need.
- **Brand dataset:** A-Z Medicine Dataset of India (CC BY-SA 4.0), chosen by the user. It is a
  2022 snapshot; prices and brands may be out of date, and the app says so.

**Matching (M4)**

- **Choice model (conditional logit), not one probability per candidate:** candidates compete,
  so "Valium 5" vs "Valium 10" with no strength read are split, not both "sure". The first
  per-candidate logistic version abstained on 70%.
- **Learnt weights, hard safety rules:** never auto-answer a candidate that the strip contradicts
  (strength, form, ingredients, release), and require the strength to be confirmed for brands
  sold in several strengths. The learnt model alone gave "Potrate 10" 91% for "Potrate 5".
- **Simulated evaluation cases** because 5 in-dataset photos cannot fit anything; honest about
  it (the noise model and the name comparison share the same look-alike letters, so simulated
  numbers are likely optimistic).
- **OCR-aware name comparison** (0/O, 1/l/i, 5/S, 8/B, rn/m, cl/d treated as equal) and a second,
  cleaned database search.
- **Salt names fuzzy by one letter only;** two letters is "no evidence" (citalopram vs
  escitalopram).
- **Discontinued brands searchable when scanning** (old stock); typed search shows only active.
- **`search_brands` ignores form words** ("tablet"): "LAH TABLET" used to time out.
- **POST for scan matching:** medicine details in the body, not the URL (server logs).
- **No generic if the strip's confirmed ingredients differ from the chosen brand's record**
  (`compositionDiffers`), even when the user picks the brand by hand.
- **Salt rules copied from the pipeline** (`export_rules.py` → `web/lib/ai/salt-rules.json`); a
  pytest fails if the copy is stale.

**Tech**

- **Built-in Next.js dictionaries, not next-intl:** three small JSON files are enough and there's
  one less dependency to explain.
- **Canvas preprocessing, not OpenCV.js:** OpenCV is ~8 MB; the few steps we need (grayscale,
  contrast stretch, adaptive threshold, deskew) are short, testable TypeScript.
- **The "ink" variant (max − min of R, G, B):** printed ink is coloured or dark, silver foil is
  grey. This removes most foil glare and reflections.
- **Stamp close-up + quarter turns + straighten:** batch/expiry stamps are often printed sideways
  and small; reading a close-up at 90° and 270° fixed several real photos.
- **Progressive reading:** cheap pass first, more variants only if key fields are missing.
- **Native camera input (`<input capture>`)**, not a live camera view: works on every phone and
  needs no permissions code.
- **Fair baseline:** raw Tesseract reads the original photo file, untouched, so the improvement we
  report is real.
- **Unbiased labeling:** the label form starts empty (no pre-fill), and 1 in 4 photos goes to a
  frozen test set by a hash of its id.
- **pnpm `allowBuilds`:** esbuild allowed (needed by tsx); sharp, tesseract.js and unrs-resolver
  denied (not needed; fewer install scripts running on the machine).

## M5 (safety checks): sources inspected and agreed (2026-10-24)

- **NSQ + spurious alerts:** CDSCO's public JSON behind
  https://cdsco.gov.in/opencms/opencms/en/Notifications/nsq-drugs/ (the page embeds
  `cdscoonline.gov.in/CDSCO/viewPublicNSQDrug`). Endpoints: `reportingYears?tab=nsq|spurious`,
  `publicReportingMonths?year=&tab=`, `filteredNsqDrugTable?month=Sep-2026&source=All&tab=nsq`,
  `filteredSpuriousDrugTable?…&tab=spurious`. Responses are **Latin-1** JSON (`aaData` rows:
  brand, product, batch, mfg/exp "Feb-2026", maker, result, source, lab/state, month). NSQ from
  2019, spurious from 2025. No robots.txt, no login. Agreed: fetch everything once, then monthly,
  2 s apart. (The old Alerts page PDFs stop at June 2025.)
- **Banned FDCs:** CDSCO PDFs on https://cdsco.gov.in/opencms/opencms/en/Drugs/FDC/ : the
  consolidated list (as on 22.11.2021, 34 pages) + 14 (2023), 156 (2024), S(+)-etodolac +
  paracetamol (2024) and 16 (11.06.2026) FDCs. The consolidated list has footnotes: 1# stayed by
  Madras HC, 2#/6# revoked with conditions, 3#/4# under examination (SC orders), 5# quashed by
  Delhi HC (appeal pending). Agreed: **active bans** say "prohibited by S.O. …, show this to your
  pharmacist"; **stayed / quashed / under examination** get a softer "under legal review" note
  with the status; **revoked with conditions** show the condition. 1983-era category bans
  ("FDCs of vitamins with analgesics") cannot be matched exactly.
- **NPPA ceiling prices:** nppa.gov.in HTML returns 403 to scripts (PDFs download fine). The
  downloadable lists are NLEM 2015 (30.09.2020; compendium till 10.08.2022). Current prices are
  only in the "Compendium of Prices 2026" dashboard (nppaipdms.gov.in), which has an Excel export.
  Agreed: **the user exports the Excel** in their own browser and saves it in
  `pipeline/raw/nppa/<date>/`; the pipeline parses it (like the Kaggle file). Ceiling prices
  **exclude GST**; the app must say so.

### M5 progress (end of 2026-10-24)

See `docs/milestones/M5-safety-checks.md`.

- **Committed and live (`5b52369`):** alerts + banned-FDC pipelines, tables, loader, refresh
  steps, `web/lib/checks/*`, `POST /api/checks`, the six-row result card. The data-refresh run of
  2026-10-24 loaded 6,905 alerts and 682 banned entries; live checks verified for batch safety
  (Paracet 500 batch APRCT-2501 and Cufcott LS batch UFL251248K give alerts; other batches "not
  found"; uncertain or missing batch gives "couldn't check").
- **Banned-list false alarm (2026-10-24), fixed 2026-10-25:** the first deployed banned check
  matched on salts only and called common legal medicines banned (e.g. 6,444 aceclofenac +
  paracetamol brands; the ban is on the SR form and a 50+125 mg product). It was switched off
  live (deleted `data_sources` row `cdsco_fdc`), then fixed: entries keep `salt_strengths`,
  `forms`, `releases` (migration `20261024050000_banned_fdc_restrictions.sql`); `applies()` in
  `web/lib/checks/banned.ts` compares all of them ("yes" / "maybe" / "no"); a combination ban
  on a cut-short 2-ingredient brand record is only "maybe" (`saltsComplete`, see
  `describeMedicine` in `web/lib/run-checks.ts`). Measured over all 241,046 brands: 18,278
  flagged before → 62 certain alerts (all withdrawn single drugs) + 4,885 "show your pharmacist".
  Details in `docs/milestones/M5-safety-checks.md`. Web tests 281, pipeline 152.
- **Reload slip (2026-10-25), fixed:** the first refresh after the fix kept the old 682 entries
  next to the new 687 (deletion was "last_seen older than today", both loads were the same day,
  ids changed). Check switched off again (row `cdsco_fdc` deleted); loader now stamps rows with
  the run's start time (`last_seen` is timestamptz, migration `20261025000000_*`) and checks size
  against the previous run's `rows_loaded`.
- **Live and verified (2026-10-25, after refresh run 40124008146):** 687 banned entries, 6,905
  alerts, check switched on again. Live API: A Clo P / Ezofen-P / Telma 40 "not listed";
  Acemiz-MR "may apply" from its record, "not listed" with its 3 strip ingredients; Faconex Plus
  (diclofenac + paracetamol injection) and Fena syrup (aceclofenac 50 + paracetamol 125) "may
  apply"; Enselin 2 (rosiglitazone) "prohibited".
- **2026-10-25:** M6 dropped by the user: family-cabinet row removed from the result card and
  the home page (five checks now). Accuracy checks done (`eval/m5-checks.md`): banned 40/40,
  NSQ vs CDSCO PDFs 170/172 (98.8%). Placeholder batch numbers ("Not applicable", "Not given")
  now count as no batch (6,921 usable alerts). The NPPA dashboard was inspected: it uses rotating
  CSRF tokens and request encryption, so it is NOT scripted; the user exports the Excel by hand.
- **Waiting on the user:** the NPPA "Compendium of Prices 2026" Excel in
  `pipeline/raw/nppa/<date>/` (not there as of 2026-10-25).
- `web/.prettierignore` exists because Prettier only reads the ignore file of the folder it runs
  in; `web/lib/ai/salt-rules.json` must never be reformatted (a pytest checks it).

## Exact next steps

1. **Finish M5** when the NPPA file arrives (step 2). Then write the M5 milestone notes' final
   results and mark M5 done; the brief's "Done when" (all check tests pass, monthly Action runs)
   is met for batch and banned checks. Also still open in M5 (or do them in M7): the brief's
   accuracy checks: NSQ rows vs 3 monthly PDFs checked by hand (≥ 98%), the banned check on 20
   banned + 20 legal medicines (100%), the fair-price check on 30 medicines (100%). If the NPPA
   Excel can't be exported, fall back to the downloadable 2022 compendium PDF, labelled as
   August 2022 prices.
2. **NPPA:** when the Excel is in `pipeline/raw/nppa/<date>/`, inspect it, show the user a sample,
   then `parse_nppa.py`, the `ceiling_prices` table (redesign the M0 draft), `checkPrice`
   (per-unit MRP vs ceiling, saying clearly that ceiling prices exclude GST), and the card row.
3. **Speed:** move preprocessing and OCR into a Web Worker; try a smaller first-pass image; skip
   the inverted variant when the ink variant already found the key fields; measure on a phone.
4. **Brand reading:** use the matcher to confirm brand guesses before the confirm screen.
5. **More photos:** the user takes ~15–20 strip photos with their own phone (front, back, stamp
   close-up), copies them into `eval/photos/`, labels them at `/en/eval/label` (including the
   new "match brand": the exact brand name in the database, or empty if not in it).
6. **Spot-check `eval/labels.json`** (human) before any numbers go into the report.
7. Then M7 (M6 was dropped by the user on 2026-10-25): evaluation, About page, accessibility, final
   `pnpm eval -- --final` and `pnpm eval:match -- --final`), and the deliverables (README GIF,
   architecture diagram, report, slides, viva Q&A).
