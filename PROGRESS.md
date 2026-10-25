# DawaCheck progress

Last updated: 2026-10-26 (M7 built and in CI; AI working files untracked; SUS study, phone timing
and the written report wait for the user).

## Where we are

**M0–M5 are done and live. M6 was dropped by the user. M7 is built and live; the final test-set
evaluation ran once (2026-10-25). Waiting for the user: the SUS study and timing on a phone.**

- Live site: https://dawacheck-psi.vercel.app (deploys automatically on every push to `main`)

| Milestone                                             | Status  | Commits                                                                                | Notes                                                                |
| ----------------------------------------------------- | ------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| M0 Setup                                              | done    | `052cbcd`                                                                              | Next.js + pnpm workspace, CI, Vercel, 3 languages, large-text toggle |
| M1 Generic lookup                                     | done    | `eff1cd6`, `bc365fe`, `8726de1`, `1c4fee9`, `c1b090f`, `ca3d59c`                       | type a brand → exact Jan Aushadhi generic + savings                  |
| M2 Nearest Kendra                                     | done    | `da80334`, `c9ffe2b` (data refresh)                                                    | computed on the phone from static files                              |
| M3 Reading strips                                     | done    | `2b6b700`, `317324e`, `db927f1`                                                        | in-browser OCR, confirm screen, evaluation                           |
| M4 Matching OCR → medicine                            | done    | `7709e1d`                                                                              | re-ranker + choice model + safety rules; top-1 89% dev / 86% test    |
| M5 Safety checks (NSQ, NPPA, banned FDC, result card) | done    | `5b52369`, `c1b8af2`, `b0d8430`, `783bb3a`, `9073f4f`                                  | five-row result card (cabinet row dropped with M6)                   |
| M6 Family cabinet + PWA                               | dropped |                                                                                        |                                                                      |
| M7 Evaluation + polish                                | built   | `f656e60`, `3703161`, `06143a8`, `b6bc37b`, `02fbbc7`, `3e406de`, `baec22d`, `c8985fc` | final eval run once; SUS + phone timing pending (user)               |

Viva notes for each milestone: `docs/milestones/M0-setup.md` … `M7-evaluation-polish.md`.
Other deliverables in `docs/` (see `docs/README.md`): architecture diagram, demo GIF, report
outline, slides, demo script, viva Q&A, SUS kit.

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
- **Labels were typed by Claude**, from the web photos, with an empty form (no pre-fill); the
  user spot-checked them on 2026-10-25 (no corrections) before the final run.
- **Scan flow end to end:** verified through the real upload screens (front → back → stamp →
  confirm → Find) with the 18 `demo/` strips (generated images) and in Playwright, but **not yet
  with photos taken on a real phone**.
- **M4 brief targets not all met:** top-3 90% (target 95%; ~10% of names too garbled for the
  search to find) and abstention on in-dataset strips 28% (target ≤ 20%; mostly correct caution:
  strength not read for a brand sold in several strengths).
- **"How we read this" panel** shows which image variant produced each field, but not the OCR
  bounding boxes the brief asks for.
- **Hindi and Tamil translations** were written by Claude and need review by a native speaker.
- **Tesseract model is downloaded from the CDN** at first use (M6, which would have self-hosted
  it for offline use, was dropped).
- **Not done (user's part):** SUS study (`docs/sus/`), timing on a mid-range Android phone,
  writing the report and slides from `docs/report-outline.md` and `docs/slides.md`.

## Known bugs and limits

- **Too slow:** 7.1 s median per strip on a laptop (was 10 s); phones will be slower. Preparing
  runs in a Web Worker now, but the quarter turns of pass 3 still run on the page.
- **Brand and ingredient reading are weak** on real web photos: dev 0/13 brands pre-filled
  right (3 wrong), ingredients 1/9 (3 wrong); final test set 0 right. Matching copes (abstains,
  0 wrong medicines); brand guesses "confirmed by matching" are in but gave no gain on dev photos.
- **In-app Omee demo:** the browser's OCR sometimes misses "OMEE" on that image; the presenter
  types it. (The `demo/3-batch-alert/01-omee` strip reads it.)
- **Matcher weakness:** "CETZINE 10" matches another maker's "Cetzin 10mg" (93%) because GSK's
  Cetzine 10 is not in the 2022 dataset. Not fixed. Look-alike siblings ("Azithral 500" vs
  "Azithral 5D") make it abstain, which is correct caution.
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
- **Fair price done (2026-10-25):** the user had no Excel and asked me to download from a valid
  source. Source: NPPA's yearly orders S.O. 1575(E) (767, NLEM 2022) and S.O. 1581(E) (138, NLEM
  2015), 25.03.2026, in force 1.4.2026, Gazette PDFs from nppa.gov.in "Circulars / Orders",
  saved in `pipeline/raw/nppa/2026-03-27/` with SOURCE.md. `parse_nppa.py` (rows rewritten in Jan
  Aushadhi name style, same keys as brands; one row per form for aspirin's shared price), table
  `ceiling_prices` (migration `20261025010000_*`), loader, refresh step. `web/lib/checks/price.ts`:
  MRP per tablet vs ceiling × 1.05 (5% GST). Synonym added: acetylsalicylic acid = aspirin.
  Accuracy: 30/30 prices exact, 60/60 verdicts. **Yearly task:** when NPPA publishes the April
  revision (late March), download the new orders into `pipeline/raw/nppa/<date>/`.
- **GST margin by manufacturing date (2026-10-25):** comparing real brand prices showed a flat 5%
  margin would call correctly priced pre-cut strips (12% GST until 22.09.2025) overpriced; the
  margin is now 5% for strips made from Oct 2025, else 12%. **M5 verified live:** data refresh
  run 40175469975 (with brands) loaded 696 ceiling prices; Telma 40 at ₹7.75/tab is "within" if
  made 2024-06, "above" if 2026-01. The demo strip (made-up MRP ₹122.98/15) shows "above" for
  Telma 40: expected, the demo price is invented.
- `web/.prettierignore` exists because Prettier only reads the ignore file of the folder it runs
  in; `web/lib/ai/salt-rules.json` must never be reformatted (a pytest checks it).

## M7 progress (2026-10-25)

**Committed `f656e60`, CI green, live and verified:** both demos clicked through on
https://dawacheck-psi.vercel.app (Telmikind: match 81%, generic, batch not in alerts, fair price;
Omee: type "Omee", tick the batch, Find → match 94% and the red CDSCO alert). Laptop read time on
the live site 1.3–1.5 s per demo strip.

Agreed order with the user: improvements that change the reader/matcher first (the final test-set
eval runs only once), then About page + accessibility + Playwright, then final eval and docs.

- **Speed:** `lib/ai/reader.ts` now starts all reads of a pass together; `lib/ai/ocr.ts` runs 2
  Tesseract workers (`createScheduler`; 1 on phones with < 4 cores) and prepares photos in a Web
  Worker (`lib/ai/prepare.worker.ts`, OffscreenCanvas; falls back to the page). Shared code in
  `lib/ai/prepare.ts`. `pnpm eval` uses 2 workers too. Same 13 dev photos: median **9.9 s → 7.1 s**,
  p95 **16.8 s → 10.8 s**, every field score unchanged. `scripts/speed-experiment.ts`: 1200 px
  photos would be faster still (4.6 s) but lost one mfg and one exp date, so we stay at 1600 px.
  Not measured on a phone yet.
- **Brand guesses ("confirmed by matching", brief Stage 3):** `brandGuesses()` in `lib/ai/merge.ts`
  takes the 3 tallest plausible lines on the front (OCR confidence ≥ 30, lower than the 60 needed
  to SHOW a name, because guesses must be confirmed). The scan page sends them with POST
  /api/match while the name field is as read; `matchGuesses()` (`lib/find-match.ts`) tries each,
  and `combineDecisions()` (`lib/ai/rerank.ts`) accepts a match only if all matching guesses agree
  on one product. **Result on dev photos: no change** (1/5 right before and after on the web
  photos, 0 wrong; the 4 misses have no readable name at all: the OCR is the bottleneck). `pnpm
eval` reports both (with / without guesses). Word-level guesses were tried and rejected: no gain
  ("Neorejax" finds nothing) and risk ("Metformin 500" would match another maker's brand).
- **Demo mode now has 2 real-brand strips** (user agreed): `telmikind` (Telmikind 40, Mankind,
  10 tabs, ₹38.59 from the dataset, demo batch DM2506) → match, generic saving, fair price
  within; `omee` (CDSCO NSQ alert Sep 2026: Omee, Alkem, batch 25281124, Mfg 06/2025, Exp
  05/2027, dissolution failure; ₹61.87/20 from the dataset) → red batch alert. Generated by
  `eval/make_demo_images.py`; old DEMOTEL images deleted; `eval/labels.json` has `demo-telmikind`
  and `demo-omee`. Verified in the browser (dev and production build).
- **Found while testing the demo:** an upright red "DEMO" mark was read as the brand and matched
  the real "Demo 20mg Capsule" (Medoz, omeprazole 20) at 98%: wrong medicine. The mark is now
  sideways. Lesson for the report: any prominent word that is also a brand name can match.
- **Known demo limit:** in the browser Tesseract does not read the big "OMEE" (in Node it reads
  it at 40% confidence). In the Omee demo the presenter types "Omee", ticks "It matches my strip"
  for the batch, then taps Find.
- **New: "It matches my strip" tick box** under a batch marked "Please check". Before, a batch
  read right but with low confidence (any "1", "O", "I" or "L" lowers it) could never be checked:
  retyping the same value still counted as unsure. Texts in en/hi/ta.
- Web tests: 399, including the new `tests/reader.test.ts`, brand guesses and combineDecisions.

### M7 part 2 (2026-10-25): About page, accessibility, Playwright

- **About page** `/[locale]/about` (linked from the home page): the 6 sources + OpenStreetMap,
  each with its publisher, what we use it for, licence and **last refresh date + row count from
  `data_sources`** (cached for an hour with `"use cache"`; if the database can't be reached the
  page says the date isn't available). Results: matching on the simulated **test** set (4 methods:
  exact name, trigram, re-ranking, DawaCheck; top-1, wrong answers, top-3) and field reading on the
  dev photos vs plain OCR, plus speed. Privacy (incl. OSM tiles only after "Show on map", what the
  server receives) and medical safety. All texts in en/hi/ta (Hindi/Tamil by Claude: review).
- **Numbers are generated, not typed:** `pnpm eval` writes `reader` (dev photos only, demo strips
  excluded) or `readerFinal` (with --final) and `pnpm eval:match` writes `matching` into
  `web/lib/eval-summary.json`. After the final runs, the page shows the test-set numbers by itself.
  `eval:match` now also keeps the demo strips out of the photo metrics (listed per photo only).
- **Accessibility:** Lighthouse 13.5.0 accessibility **100** on /en, /en/scan, /en/search,
  /en/kendras, /en/about, /hi/about, /ta (production build, mobile). Playwright + axe (WCAG 2.1
  A/AA) find **0 violations** on all 5 pages × 3 languages and on the confirm screen, result card,
  search results and Kendra list. Keyboard pass: logical order, visible focus everywhere. **Fixed:**
  after reading, focus fell back to the page body; it now moves to the new screen's heading
  (photo steps, confirm screen, error). Tables fit a 375 px phone in en/hi; in Tamil the last
  column scrolls inside its own labelled box.
- **Playwright** (`pnpm build && pnpm test:e2e`, 19 tests, ~15 s, installed Chrome): both demo
  strips end to end (read → confirm → match → all 5 check rows → disclaimer; the Omee strip gives
  the red CDSCO alert), typed search (Telma 40 → generic + savings), Kendras by PIN (3 results), axe
  everywhere. In CI since 2026-10-26 (see below).

### M7 part 3 (2026-10-25): docs and study kits

- **README** rewritten (pitch, demo GIF, features, architecture, results with baselines, sources
  and licences, privacy, disclaimer, setup, limitations, future work).
- `docs/architecture.mmd` + `.png` (rendered with mermaid-cli and the installed Chrome),
  `docs/demo.gif` (live site, `web/scripts/demo-screens.ts` + `eval/make_demo_gif.py`).
- `docs/report-outline.md`, `slides.md` (14), `demo-script.md` (3 min; the cabinet step replaced
  by the "not sure" step), `viva-qa.md` (18 questions), `docs/milestones/M7-evaluation-polish.md`.
- `docs/sus/`: facilitator guide with 5 tasks, SUS questionnaire (English + our Hindi
  translation, not validated), response template, `sus_score.py` (doctests).
- `eval/SPOT-CHECK.md`: how the user checks the labels (test photos first) before the final run.
- Privacy wording made exact (About page en/hi/ta + README): the Kendra files reveal the phone's
  ~150 km square, never the point.
- Pipeline tests are now 197 (were 152 at M5).
- Note: the Mac's system `python3` is 3.9 and has a tokenizer bug with long lines of Hindi/Tamil
  text; run such scripts with `uv run --no-project --python 3.12 python …`.

### Final test-set evaluation (2026-10-25, run once; do NOT run `--final` again)

The user checked the labels (no corrections). `eval/results-final.md`, `eval/match-results.md`
("TEST (frozen)"), `web/lib/eval-summary.json` (`readerFinal`, `photosTest`; the About page now
shows the test-set reading table).

- Reading, 3 photos: **0 fields right**; wrong brand 1/3, wrong ingredients 2/2; plain OCR 1/2
  pack sizes. OCR confidence 23–44% (French Augmentin, German Sortis, angled photos).
- Matching with confirmed names: 1/2 right (Valium 10mg 86%), 0 wrong; Augmentin abstained
  (strength unknown), Sortis correctly not in the list. Baselines: 67–100% wrong answers.
- Fully automatic: 0 right, 0 wrong.
- **Defect found:** `mergeReadings` gives a missing back photo a placeholder reading with
  confidence 100, so `(front + back) / 200` doubles a weak front's score and garbage ingredients
  pass `MIN_SHOW`. **Fixed after the final run (same day):** with no back photo only the
  front's confidence counts. Checked on dev photos only (`--final` not re-run): wrong values
  8 → 6, structured fields, speed and automatic matches unchanged; "Suhagra-100" no longer
  pre-filled but still matched via brand guesses. 401 unit tests, 19 Playwright tests pass.
- README, report outline, slides, viva Q&A (new Q19) and M7 notes updated; phone-speed
  placeholders are now **[PHONE]**.

### Demo strips (2026-10-25)

- `demo/`: 18 strips, each `front.jpg`, `back.jpg`, `stamp.jpg`, by feature: `1-everyday` (10),
  `2-expensive` (4: Montair 10 and Storvas 10 above the ceiling; Rosuvas 10, Galvus 50 big
  savings), `3-batch-alert` (Omee 25281124, Taxim-O 200 25460922: real CDSCO alerts),
  `4-banned` (Enselin 2: prohibited, red; Cefolac-AZ: may apply, amber; both dated before their
  bans). Values from the brand dataset / CDSCO alerts (`demo/strips.json`), DM batches checked
  absent from alerts. `demo/README.md` = how to use and what to say. **18/18 verified** through
  the upload flow (`web/scripts/verify-demo-strips.ts` → `demo/VERIFIED.md`).
- **Bug fixed:** two-line "eq. to" salts were read as "To Amlodipine" (`extractIngredients` now
  joins them). Dev eval unchanged; 406 unit + 19 Playwright tests pass.
- **Matcher weakness noted:** "CETZINE 10" → another maker's "Cetzin 10mg" (93%) because GSK
  Cetzine 10 isn't in the 2022 dataset. Not fixed; say it in the viva as a limitation.
- Re-run the verifier before the viva (alerts and prices are live data).

### Definition of done (2026-10-26)

- `docs/definition-of-done.md`: the brief's 9 items with evidence. Met: 3, 5, 6, 7, 8. Partly:
  1 (five checks; M6 dropped), 2 (no real phone yet; no PWA), 4 (first scheduled refresh due
  5 Nov 2026), 9 (report/slides are outlines; Playwright now in CI).
- **New privacy test** `web/e2e/privacy.spec.ts`: network log of a real photo scan (only two
  small JSON API calls, no image bytes, only other host the OCR CDN) and of a GPS Kendra search
  (no upload, no coordinates in any request). Both fail when a leak is planted.
- **Gap fixed:** the typed-name search showed only the generic. It now has an optional "Details
  from your strip" box (batch, MRP, count, manufactured) and the full five-check result card
  (en/hi/ta; Playwright test with Taxim-O 200 batch 25460922 → red alert). 22 Playwright tests.

### Playwright in CI (2026-10-26)

- GitHub secret `SUPABASE_PUBLISHABLE_KEY` added (from `web/.env.local`; read-only key, RLS).
- `ci.yml`: the build and a new "End-to-end tests (Playwright)" step get `SUPABASE_URL` and the
  key; Playwright uses the runner's Chrome; skipped when the secret is unavailable (fork PRs);
  report uploaded on failure. First run 40225372468: **22 passed (44 s)**. Job timeout 20 min.

### Repository housekeeping (2026-10-26)

- At the user's request, `CLAUDE.md` and `.claude/` are **no longer tracked in git** (`edd9778`):
  kept on the developer's Mac and listed in `.gitignore`, so Claude sessions still read them. The
  website and pipeline never used them (site checked live afterwards).
- Not changed, on purpose: git history (old commits still contain those files and the
  "Co-Authored-By: Claude" lines) and the AI-use disclosures in the docs ("labels typed by
  Claude", "Hindi/Tamil written by Claude"). Advice given: declare AI assistance in the report
  and viva, per the college's policy.

## Exact next steps

1. **Time the live demo on a phone** ("How we read this" shows the seconds) → fill **[PHONE]**.
2. **SUS study** with 15–20 people (`docs/sus/README.md`), then `sus_score.py` → fill **[SUS]**.
3. Write the report and slides from the outlines; record the demo.
4. Optional: native-speaker review of Hindi/Tamil texts; more phone photos (a new test set would need its own freeze).
