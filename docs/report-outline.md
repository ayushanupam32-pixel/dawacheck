# Project report outline: DawaCheck

Section order from the brief. Each section lists what to write and where the material already is.
**[PHONE]** = fill in after timing the app on a mid-range Android phone; **[SUS]** = after the
usability study. The final test-set evaluation ran on 2026-10-25 (`eval/results-final.md`,
`eval/match-results.md` "TEST (frozen)").
Never put a number in the report that is not in `eval/` or `docs/sus/`.

Suggested length: 35–45 pages with figures. Screenshots: `docs/demo.gif` frames (regenerate with
`web/scripts/demo-screens.ts`), architecture: `docs/architecture.png`.

---

## Abstract (≈ 200 words)

- Problem: Indian patients overpay for branded medicines when an identical Jan Aushadhi generic
  exists; quality alerts (CDSCO), ceiling prices (NPPA) and banned-combination lists are public but
  scattered across PDFs and portals that ordinary buyers never see.
- What DawaCheck does: photograph a strip → read on the phone → match to a medicine → five checks.
- Method: in-browser preprocessing + Tesseract OCR, rule-based extraction, trigram retrieval +
  re-ranking with a conditional-logit choice model and abstention; monthly public-data pipeline.
- Results: matching top-1 85.9% with 3.3% wrong answers on 207 unseen simulated strips (vs 26.3%
  wrong without abstention); batch, dates read 3/3–3/4 on dev photos with 0 wrong, but on the
  3 frozen test photos (two foreign packs, OCR confidence 23–44%) no field was read correctly and
  matching gave 1 right, 0 wrong; **[SUS]** usability; Lighthouse accessibility 100; ₹0 running cost.
- Privacy: photos and location never leave the phone.

## 1. Introduction and problem statement

- Out-of-pocket spending on medicines in India; brand vs generic price gaps (give a real example
  from the app: Telmikind 40 at ₹3.86/tablet vs Jan Aushadhi telmisartan 40 at ₹1.24).
- Pradhan Mantri Bhartiya Janaushadhi Pariyojana: what Kendras are, how many (21,560 in our data).
- Medicine quality: CDSCO's monthly NSQ / spurious alerts (6,882 entries since 2019 in our data);
  the public can't easily check a batch.
- Price control: NPPA ceiling prices under DPCO 2013 / NLEM 2022.
- Banned fixed-dose combinations (FDCs): e.g. the 2018 and 2023 bans; court stays.
- Problem statement, objectives (the five checks; on-device; ₹0; three languages; safe when unsure),
  scope (tablets/capsules strips; English print), and what is out of scope (medical advice,
  family cabinet — dropped).

## 2. Literature and existing apps (and the gap)

Check each fact against the app / site before citing; add access dates.

- **Jan Aushadhi Sugam** (PMBI's official app): search generic products, prices, locate Kendras.
  Gap: you must already know the generic name; no scanning, no brand → generic matching, no
  quality or price-control checks.
- **Pharma Sahi Daam** (NPPA's app): ceiling and retail prices. Gap: typed search only; no generic
  substitution, no batch alerts.
- **Commercial pharmacy apps** (Tata 1mg, PharmEasy, Netmeds, Apollo 24|7): brand info and
  "substitutes", often their own private labels; commercial incentive; no CDSCO batch check; need
  an account; data leaves the phone.
- **CDSCO portal**: NSQ alerts as monthly tables/PDFs, searchable by batch only if you know where.
- **OCR research**: Tesseract (LSTM); preprocessing for documents (Bradley–Roth adaptive
  thresholding, skew estimation by projection profiles); medicine-label OCR papers (cite 2–3,
  e.g. pill-bottle / drug-label reading studies; check they exist).
- **Entity matching under noise**: trigram similarity, re-ranking, abstention / selective
  prediction ("reject option"; Chow 1970).
- **The gap DawaCheck fills**: one photo → all five public checks, on the phone, no account, ₹0,
  says "not sure" instead of guessing.

## 3. System design

- Requirements (functional: the five checks, three entry paths; non-functional: ₹0, privacy, works
  without any AI API, accessibility, 3 languages, < 5 s target).
- Architecture figure (`docs/architecture.png`) and walk-through: phone / Vercel / Supabase /
  GitHub Actions. Why each piece (milestone notes M0, M2).
- Data model: tables `brands`, `brand_ingredients`, `salts`, `ja_products`, `kendras`,
  `nsq_alerts`, `banned_fdcs`, `ceiling_prices`, `data_sources` (`supabase/migrations/`).
  The **composition key** (`salt:value:unit|… #form #release`) as the central idea.
- Security: Row Level Security, publishable vs secret key; POST body for medicine details.
- Privacy by design: what leaves the phone and what doesn't (README "Privacy").
- UI flow figure: scan → confirm → match → result card; typed search; Kendra finder; About.

## 4. Data pipeline

- Sources table (README "Data sources") with formats and licences; how each was inspected before a
  parser was written (M1, M2, M5 notes).
- Fetch → parse → normalize (salt synonyms, units, release types, `always_delayed_release`) →
  validate (±20% rule) → load (idempotent upserts, run-stamp deletes) → static files.
- Politeness: rate limits, User-Agent, caching; NPPA dashboard not scripted (tokens/encryption).
- Kendra coordinates: checks (India, state 600 km, district 100 km), geocoding fallback; the
  Ganganagar-in-Delhi example (M2).
- Banned-FDC parsing: footnotes (stayed, revoked, quashed), strengths, forms; the false-alarm
  incident and its fix (M5) — a good honesty story.
- Monthly GitHub Action; what happens when a source fails.

## 5. AI methods

5.1 **Preprocessing**: scaling, EXIF orientation, contrast stretch, adaptive threshold with an
integral image, inversion, the "ink" image (max − min RGB) for foil, deskew by projection
profile, quarter turns for sideways stamps. Figures: one strip in each version.
5.2 **OCR**: Tesseract LSTM in the browser (Tesseract.js); progressive passes; 2 workers; Web
Worker for preprocessing.
5.3 **Extraction**: rule set per field; OCR-confusion fixes inside numbers; refusal rules (MRP
with following digits, ambiguous batch characters → low confidence); merging variants by
pattern × OCR confidence; `MIN_SHOW` for free text.
5.4 **Matching**: trigram candidate retrieval (two queries: as read, cleaned); features (name
similarity with OCR look-alikes, strength, ingredients, form, release, maker); conditional logit
(softmax over candidates + "none"), fitted by gradient descent with L2; threshold for ≤ 2% wrong
on dev; brand guesses confirmed by matching (M7).
5.5 **Abstention and safety rules**: contradiction rule, strength-must-be-confirmed rule,
`compositionDiffers`, generics only on an identical composition key; calibration table
(`eval/match-results.md`).
5.6 **The checks**: batch (same batch AND product/maker), price (per unit, GST by mfg date),
banned (yes / maybe / no), Kendra (geohash + Haversine).

## 6. Implementation

- Tech stack table (README "How it works", `web/package.json`, `pipeline/pyproject.toml`) and why (Next.js 16 App Router, Cache Components; Tesseract.js;
  Canvas not OpenCV; Supabase + pg_trgm; Python pipeline with uv).
- Code organisation: pure tested modules vs thin glue; same code for app and evaluation.
- i18n (built-in dictionaries), accessibility measures, Demo mode.
- Testing: 406 unit tests (Vitest), 197 pipeline tests (pytest), 22 Playwright tests (end to end, privacy network log, axe), CI
  on every push, Lighthouse 100.
- Deployment: Vercel from `main`, monthly data refresh commits.

## 7. Evaluation (tables and ablations)

7.1 **Data**: labelled photos (16 web photos: 13 dev, 3 frozen test; sources in
`eval/photo-sources.json`), simulated matching cases (800: 593 dev, 207 test), how labels were made
and checked (empty form, spot-check by a person: `eval/SPOT-CHECK.md`).
7.2 **Reading** (`eval/results.md`, `eval/results-final.md`): per-field accuracy and wrong rate,
CER; foil vs matte. Test set: 0 fields right; wrong brand 1/3, wrong ingredients 2/2; plain OCR
1/2 pack sizes. Discuss honestly: photo difficulty (foreign packs, OCR confidence 23–44%), the
front-only defect it exposed (missing back counted as 100% confident), and that the test set is
too small (3) to generalise. Do not re-tune on it. Then the fix made after the final run
(missing back no longer counts as 100% confident), evaluated on dev photos only: wrong values
8 → 6, everything else unchanged; state clearly that the test numbers are pre-fix.
7.3 **Ablation: preprocessing** — full pipeline vs raw Tesseract (the brief's first baseline).
7.4 **Matching** (`eval/match-results.md`): exact-name baseline, trigram only, re-ranking without
abstention, DawaCheck; top-1, top-3, wrong of answered, wrong generic, abstention; on simulated
dev/test and labelled photos. Calibration table.
7.5 **Ablation: brand guesses** — with vs without (no change on dev photos; say why).
7.6 **Photo → medicine, fully automatic** vs with the user's correction. Test set: automatic
0 right / 0 wrong (all abstained); with confirmed names 1/2 right (Valium 10mg), 0 wrong, vs
67–100% wrong answers for the always-answer baselines.
7.7 **Checks accuracy** (`eval/m5-checks.md`): banned 40/40, NSQ vs CDSCO PDFs 170/172, prices
30/30, verdicts 60/60; generic hand check 16/20, 0 wrong.
7.8 **Speed**: 9.9 → 7.1 s median on a laptop (2 workers); 1200 px experiment and why rejected;
**[PHONE]** phone measurement.
7.9 **Usability**: **[SUS]** mean, SD, 95% CI, n; task completion; quotes (no names).
7.10 **Accessibility**: Lighthouse 100; axe 0 violations; keyboard pass and the focus fix.
7.11 Brief targets table: met / not met, honestly (top-3 90% vs 95%; abstention 28% vs ≤ 20%;
speed; photo-set size).

## 8. Privacy, ethics and medical safety

- What data exists where (phone / server / database); no accounts, no analytics; OSM tiles.
- Medical safety rules and wording ("show this to your pharmacist", never "stop/switch").
- Why abstention: asymmetric cost of a wrong generic; the wrong-match found with the "DEMO"
  watermark (M7) as a concrete example of the risk.
- Data ethics: licences (CC BY-SA ShareAlike), owner names stripped from Kendra data, polite
  scraping, no CAPTCHA bypass.
- Fairness/accessibility: three languages, large text, older users; Hindi OCR missing.

## 9. Limitations

From README "Limitations" and each milestone's limitations section: small photo set, weak brand
reading, simulated matching data, 2022 brand snapshot, English OCR only, speed on phones, labels
typed by the developer and spot-checked, three-photo test set, translations not reviewed by a
native speaker, M6 not built.

## 10. Conclusion and future work

What was achieved against the objectives; future work (README "Future work").

## References (format consistently; check every entry)

- R. Smith, "An Overview of the Tesseract OCR Engine," ICDAR 2007.
- D. Bradley, G. Roth, "Adaptive Thresholding Using the Integral Image," Journal of Graphics
  Tools 12(2), 2007.
- D. McFadden, "Conditional logit analysis of qualitative choice behavior," in Frontiers in
  Econometrics, 1974.
- C. K. Chow, "On optimum recognition error and reject tradeoff," IEEE Trans. Information Theory, 1970.
- R. W. Sinnott, "Virtues of the Haversine," Sky and Telescope 68(2), 1984.
- J. Brooke, "SUS: A 'quick and dirty' usability scale," in Usability Evaluation in Industry, 1996.
- J. Sauro, A Practical Guide to the System Usability Scale, 2011.
- PostgreSQL documentation, pg_trgm.
- Government sources with URLs and access dates: PMBI product list and Kendra list; CDSCO NSQ
  alerts and FDC notifications; NPPA S.O. 1575(E) and 1581(E) (25.03.2026); DPCO 2013.
- A-Z Medicine Dataset of India, S. Singh, Kaggle, CC BY-SA 4.0.
- OpenStreetMap contributors (ODbL); Nominatim.
