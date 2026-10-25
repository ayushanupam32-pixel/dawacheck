<!--
DRAFT, written from docs/report-outline.md, the milestone notes and the evaluation files.
Before you submit:
  1. Rewrite it in your own words. You must be able to explain every sentence in the viva.
  2. Fill every [FILL], [PHONE], [SUS], [CITE] and [VERIFY] marker (search for "[").
  3. Check each fact about other apps (section 2) yourself and write the date you checked.
  4. Follow your college's rules on declaring AI assistance (the declaration below is a draft).
Every number here comes from eval/, docs/milestones/, the Supabase data_sources table (refresh of
25 Oct 2026) or a test run on 26 Oct 2026. Do not add a number that is not in eval/ or docs/sus/.
-->

# DawaCheck: Checking Indian Medicine Strips Against Public Government Data on the Phone

**A project report submitted in partial fulfilment of the requirements for the degree of
Bachelor of Technology in Computer Science and Engineering (Artificial Intelligence and Machine
Learning)**

By **[FILL: your full name]** ([FILL: roll number])

Under the guidance of **[FILL: guide's name and designation]**

[FILL: department, college, university]

[FILL: month and year of submission]

---

## Declaration

I declare that this report describes work I carried out under the guidance of [FILL], and that
it has not been submitted for any other degree. Where I used the work of others (data sets,
libraries, photographs, publications), it is acknowledged in the text and in the references.

**Use of AI tools.** [FILL, following your college's policy. A draft:] An AI coding assistant
(Claude, by Anthropic) was used during development: to write and review code, to draft the
evaluation labels for the web photographs (later checked by me), to draft the Hindi and Tamil
interface texts (not yet reviewed by a native speaker), and to draft parts of this report. All
design decisions, results and text were checked by me, and I can explain each of them.

Signature: ………………………… Date: …………………………

## Certificate

[FILL: the certificate page in your department's format, signed by your guide and head of
department.]

## Acknowledgements

[FILL: your guide, the department, the people who took part in the usability study, family
members who lent their medicine strips.]

The project depends on public data and open work by others: the Pharmaceuticals & Medical
Devices Bureau of India (PMBI), the Central Drugs Standard Control Organisation (CDSCO), the
National Pharmaceutical Pricing Authority (NPPA), Shudhanshu Singh (A-Z Medicine Dataset of
India), the OpenStreetMap contributors, the Tesseract and Tesseract.js projects, and the
photographers on Wikimedia Commons and Flickr whose openly licensed photographs were used for
evaluation (Appendix A).

---

## Abstract

Indian patients often pay several times more for a branded medicine than for a Jan Aushadhi
generic with exactly the same composition. The government also publishes medicine quality
alerts (CDSCO), ceiling prices (NPPA) and lists of banned fixed-dose combinations, but these are
scattered across PDFs and portals that buyers at a pharmacy counter never see.

DawaCheck is a free web app that brings these sources together. The user photographs the front
and back of a medicine strip. The phone reads it in the browser, the user confirms what was read,
and the app runs five checks: a cheaper Jan Aushadhi generic with an identical composition, the
batch number against CDSCO quality alerts, the MRP against the NPPA ceiling price, the
combination against CDSCO's banned lists, and the nearest Jan Aushadhi Kendra.

Reading uses canvas preprocessing (adaptive thresholding, deskewing and a colour "ink" image that
removes silver-foil glare) and Tesseract OCR, followed by rule-based field extraction. Matching
uses trigram retrieval and a conditional-logit choice model with safety rules and abstention. A
monthly pipeline refreshes the data.

On 207 simulated strips never used for fitting, matching chose the right medicine first 85.9% of
the time, and only 3.3% of its answers were wrong (26.3% without abstention); no answer gave a
wrong generic. On 13 development photos the batch number was read 3/3 and dates 3/4 with no
wrong values. On the 3 frozen test photos (two foreign packs, OCR confidence 23–44%) no field was
read correctly, but matching gave 1 right and 0 wrong medicines. Usability: [SUS]. Lighthouse
accessibility: 100. Running cost: ₹0. Photos and location never leave the phone.

**Keywords:** OCR, Tesseract, entity matching, selective prediction, abstention, generic
medicines, Jan Aushadhi, privacy by design.

---

## Contents

1. Introduction and problem statement
2. Literature and existing apps
3. System design
4. Data pipeline
5. AI methods
6. Implementation
7. Evaluation
8. Privacy, ethics and medical safety
9. Limitations
10. Conclusion and future work

References · Appendix A: photograph credits · Appendix B: reproducing the results · Appendix C:
milestones

**Figures** (to insert): 1 Architecture (`docs/architecture.png`) · 2 User flow (frames from
`docs/demo.gif`) · 3 One strip in each preprocessing version · 4 Confirm screen · 5 Result card
· 6 Kendra finder · 7 About page.

---

## 1. Introduction and problem statement

### 1.1 Background

**Price.** In India most medicines are bought out of pocket. [CITE: a National Health Accounts
estimate of the out-of-pocket share of health spending, and the share of it spent on medicines.]
The same molecule is sold under many brand names at very different prices. For example, in the
data DawaCheck uses, a strip of Telmikind 40 (telmisartan 40 mg) costs ₹38.59 for 10 tablets
(₹3.86 a tablet), and the Jan Aushadhi product with exactly the same composition costs ₹12.38 for
10 (₹1.24 a tablet). For one tablet a day, that difference is about ₹79 a month.

**Jan Aushadhi.** The Pradhan Mantri Bhartiya Janaushadhi Pariyojana (PMBJP), run by PMBI, sells
generic medicines at low prices through dedicated shops called Jan Aushadhi Kendras. [VERIFY:
launch year and renaming.] The official list loaded by DawaCheck on 25 October 2026 has 1,627
priced generic products and 21,560 Kendras.

**Quality.** CDSCO publishes monthly lists of drug samples found "Not of Standard Quality" (NSQ)
or spurious, each with the batch number, manufacturer and the test that failed. DawaCheck holds
6,882 such alerts (January 2019 to September 2026). A patient holding a strip has no easy way to
check whether its batch appears in any of them.

**Price control.** Under the Drugs (Prices Control) Order 2013, NPPA fixes ceiling prices for
scheduled formulations listed in the National List of Essential Medicines (NLEM). The current
orders, S.O. 1575(E) (NLEM 2022, 767 formulations) and S.O. 1581(E) (NLEM 2015, 138
formulations), dated 25.03.2026, came into force on 1 April 2026.

**Banned combinations.** The government has prohibited many fixed-dose combinations (FDCs),
for example 14 FDCs in 2023, 156 in 2024 and 16 on 11.06.2026. Some bans were stayed, quashed or
revoked with conditions by courts. [CITE: the 2018 notification banning 328 FDCs, if you mention
it.]

### 1.2 Problem statement

All of this information is public, free and official, but a person at a pharmacy counter cannot
use it: it is spread over several government websites, in PDF tables and dashboards, and it is
indexed by generic composition, batch number or legal notification, not by the brand name printed
on the strip they are holding.

**Problem:** given only a photograph of a medicine strip, tell its owner (a) whether an identical
Jan Aushadhi generic exists and how much it would save, (b) whether that batch appears in a
government quality alert, (c) whether the MRP is above the government ceiling, (d) whether the
combination is on a banned list, and (e) where the nearest Jan Aushadhi Kendra is. Do this
without charging the user, without sending the photo or location anywhere, and without ever
giving a confident wrong answer.

### 1.3 Objectives

1. The five checks above, from a photograph, from a typed brand name, and in a Demo mode.
2. Read the strip on the phone, in the browser, with no paid or cloud AI service.
3. Total running cost ₹0 (free tiers only).
4. Photos and location never leave the device.
5. Three interface languages: English, Hindi and Tamil.
6. Safe when unsure: abstain rather than guess; generics only on an exactly identical
   composition; never medical advice.
7. Accessible: Lighthouse accessibility ≥ 90, large text, large tap targets.
8. Evaluated honestly, with baselines and a frozen test set.

### 1.4 Scope

In scope: tablets and capsules in strips, with English print; Indian brands and government
lists. Out of scope: medical advice of any kind; non-English print (Hindi text on strips is not
read); a family medicine cabinet with expiry reminders and installation as an app (planned as
milestone M6, dropped on 25 October 2026 to focus on evaluation).

### 1.5 Structure of the report

Section 2 reviews existing apps and methods. Section 3 describes the system design and section 4
the data pipeline. Section 5 explains the AI methods: preprocessing, OCR, extraction, matching
and abstention. Section 6 covers the implementation and testing, section 7 the evaluation,
section 8 privacy, ethics and medical safety, and section 9 the limitations. Section 10
concludes.

---

## 2. Literature and existing apps

> Check each claim in 2.1 on the app or website yourself and add the date you checked.

### 2.1 Existing apps and portals

**Jan Aushadhi Sugam** (PMBI's official app). [VERIFY, checked on: [FILL]] Lets users search Jan
Aushadhi products and prices and locate Kendras. _Gap:_ the user must already know the generic
name or composition; there is no scanning, no brand-to-generic matching, and no quality or price
checks.

**Pharma Sahi Daam** (NPPA's app). [VERIFY, checked on: [FILL]] Shows ceiling and retail prices.
_Gap:_ typed search only; no generic substitution and no batch alerts.

**Commercial pharmacy apps** (for example Tata 1mg, PharmEasy, Netmeds, Apollo 24|7). [VERIFY,
checked on: [FILL]] Show brand information and "substitutes", which may include the seller's own
products. _Gap:_ a commercial incentive in what is recommended; no CDSCO batch check; usually an
account is needed; searches and prescriptions are sent to the company.

**CDSCO portal.** Publishes NSQ and spurious-drug alerts as monthly tables (and, up to June
2025, PDFs). _Gap:_ searchable by batch only if you know where to look, and not linked to brand
names or to the other checks.

### 2.2 Optical character recognition

Tesseract began as an HP research engine and was later developed at Google; Smith [1] describes
its architecture. Version 4 added an LSTM-based line recogniser, which Tesseract.js (a
WebAssembly build) makes usable inside a web browser. Tesseract expects clean, dark text on a
light background, so photographs need preprocessing.

A single global threshold (for example Otsu's method [2]) fails when lighting varies across the
image. Bradley and Roth [3] compare each pixel with the mean of its neighbourhood, computed in
constant time per pixel from an integral image (summed-area table); this is the method DawaCheck
uses. Skew is commonly estimated with projection profiles: the image is projected onto rows at
candidate angles, and at the correct angle the row sums alternate sharply between text lines
and gaps.

[CITE: two or three studies on reading medicine labels or pill-bottle text with OCR, for
example for visually impaired users. Find them on Google Scholar and check they exist before
citing.]

### 2.3 Matching noisy text to a database

Trigram similarity, as in PostgreSQL's `pg_trgm` [4], compares the sets of three-letter pieces of
two strings and tolerates typos. Retrieval with a cheap similarity, followed by re-ranking with
richer evidence, is a standard pattern in entity matching. To choose among competing candidates,
DawaCheck uses McFadden's conditional logit [5], in which each option's probability is a softmax
over the scores of all options, so candidates compete.

### 2.4 Abstention and calibration

Chow [6] showed that a classifier allowed to reject (abstain) can trade coverage for a lower
error rate, and gave the optimal rule. This idea is now called selective prediction [7]. It only
works if the model's confidence means something: a model is _calibrated_ if, among the cases
where it says 90%, about 90% are right [8].

### 2.5 The gap

No existing tool goes from a photograph of a strip to all five public checks; works without an
account, privately and for free; and says "not sure" instead of guessing. DawaCheck fills this
gap with public data only.

---

## 3. System design

### 3.1 Requirements

| Functional                                                    | Non-functional                                         |
| ------------------------------------------------------------- | ------------------------------------------------------ |
| F1 Read brand, ingredients, MRP, pack size, batch, dates      | N1 ₹0 running cost (free tiers only)                   |
| F2 Let the user check and correct every field                 | N2 Photos and location never leave the device          |
| F3 Match the strip to a medicine, or say "not sure"           | N3 Works with no AI API (OCR in the browser)           |
| F4 Cheaper generic with identical composition, and the saving | N4 English, Hindi, Tamil                               |
| F5 Batch against CDSCO alerts                                 | N5 Accessible (WCAG 2.1 AA; Lighthouse ≥ 90)           |
| F6 MRP against NPPA ceiling + GST                             | N6 Target under 5 s per strip on a mid-range phone     |
| F7 Combination against banned FDC lists                       | N7 Never medical advice; disclaimer on every result    |
| F8 Nearest 3 Kendras by GPS or PIN code                       | N8 Data refreshed monthly; "last updated" shown        |
| F9 Three entry paths: scan, type a name, Demo mode            | N9 Polite to government websites; no CAPTCHA bypassing |

### 3.2 Architecture

> **Figure 1.** `docs/architecture.png`

DawaCheck has four parts:

1. **The phone (browser).** Takes the photos with the phone's own camera app, prepares them in
   a Web Worker, reads them with Tesseract.js, extracts the fields and shows the confirm screen.
   It also finds the nearest Kendras from static files. Photos and location stay here.
2. **Vercel (Next.js server).** Serves the pages and two small JSON endpoints: `POST /api/match`
   (which medicine is this?) and `POST /api/checks` (run the checks). It receives only the
   medicine details the user confirmed (name, ingredients, form, maker, batch, MRP, pack size,
   dates) and, while the name is left as read, up to three short lines from the front of the
   strip as brand guesses (section 5.3). Never the photo or the full OCR text.
3. **Supabase (PostgreSQL).** Holds the reference tables. The web app reads them with a
   publishable key that Row Level Security restricts to `SELECT`.
4. **GitHub Actions.** On the 5th of each month, fetches every source, parses and validates it,
   loads the database with a secret key, rebuilds the static Kendra files and commits them, which
   redeploys the site.

Each piece was chosen because its free tier covers the load: static pages from Vercel's CDN
cost nothing per visit; a few hundred thousand rows fit in Supabase's free database; and the
Kendra search costs no server time at all.

### 3.3 Data model

Tables (`supabase/migrations/`): `brands` and `brand_ingredients` (241,046 brands), `salts`
(1,736), `ja_products` (1,627 Jan Aushadhi generics), `kendras` (21,560), `cdsco_alerts`
(6,882), `banned_fdcs` (687 entries), `ceiling_prices` (696) and `data_sources` (each source's
last refresh, row count and URL, shown on the About page).

**The composition key** is the central idea. Every product, from any source, is reduced to one
string:

```
glimepiride:1:mg|metformin:500:mg#tablet#ir
```

Salts are normalised (synonyms and salt suffixes: "Metformin Hydrochloride IP" → `metformin`),
sorted alphabetically so order does not matter, and each strength is converted to a canonical
unit (500 mcg → 0.5 mg; 125 mg per 5 ml → 25 mg/ml). Then come the dosage form and the release
type (`ir` immediate, `sr`/`er` sustained or extended, `dr` delayed). "Glycomet GP 1 Tablet" and
the Jan Aushadhi "Glimepiride 1mg + Metformin 500mg Tablets" give the same key. **A generic is
suggested only when the keys are identical.** The same salt at another strength, form or release
type is a different medicine.

### 3.4 Security

The web app has only the publishable key. Row Level Security is on for every table, with one
policy that allows reading and none that allows writing, so the key in the browser cannot change
data. The secret (service) key exists only as a GitHub Actions secret, used by the monthly
pipeline. Scan matching uses `POST`, so medicine details travel in the request body and never
appear in URLs or server access logs.

### 3.5 Privacy by design

| Data                         | Where it goes                                                                                                                                       |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Photos                       | Read in the browser's memory. Never uploaded.                                                                                                       |
| Location                     | Used on the phone. The phone downloads the Kendra file for its ~156 km square (geohash) and the 8 around it; the server sees at most those squares. |
| PIN code                     | Only its first 3 digits are used, as a file name.                                                                                                   |
| Confirmed medicine details   | Sent to the server in a `POST` body to search the lists (with up to 3 brand-guess lines). Not stored or logged.                                     |
| Map tiles                    | Only after the user taps "Show on map" (they come from OpenStreetMap's servers).                                                                    |
| Accounts, cookies, analytics | None.                                                                                                                                               |

This is tested automatically (section 6.4): a Playwright test records every network request
during a photo scan and a GPS Kendra search, and fails if image bytes or coordinates leave the
browser.

### 3.6 User flow

> **Figure 2.** Frames from `docs/demo.gif`.

- **Scan:** front photo → back photo → optional close-up of the batch stamp → reading → "Check
  what we read" (every field editable; anything below 60% confidence is marked "Please check") →
  Find → "This looks like: …" with "how sure" and "Why we think so" (or "not sure" with the top 3) → the result card with five rows and the disclaimer.
- **Type a name:** search box → pick from the list → generic and saving → optional "Details from
  your strip" (batch, MRP, count, manufacturing date) → the same five-row result card.
- **Demo mode:** two sample strips built from real records, so a demonstration never depends on
  the light in the room.
- **Kendras:** "Use my location" or a PIN code → the 3 nearest with distance, address, Call and
  Directions buttons → optional map.
- **About:** data sources with last refresh dates and row counts, evaluation results, privacy
  and medical safety.

---

## 4. Data pipeline

### 4.1 Sources

| Source                                   | Publisher                | Format                               | Licence / terms              | Rows (25 Oct 2026) |
| ---------------------------------------- | ------------------------ | ------------------------------------ | ---------------------------- | ------------------ |
| Jan Aushadhi product & MRP list          | PMBI                     | JSON behind the official page        | Public government data       | 1,627              |
| Jan Aushadhi Kendra list                 | PMBI                     | JSON, one request per state          | Public government data       | 21,560             |
| NSQ and spurious drug alerts             | CDSCO                    | JSON per month (Latin-1)             | Public government data       | 6,882              |
| Prohibited FDC lists                     | CDSCO                    | PDFs (consolidated 2021 + 2023–2026) | Public government data       | 687                |
| Ceiling prices, S.O. 1575(E) and 1581(E) | NPPA                     | Gazette PDFs                         | Public Gazette notifications | 696                |
| A-Z Medicine Dataset of India (Nov 2022) | Shudhanshu Singh, Kaggle | CSV                                  | CC BY-SA 4.0                 | 241,046            |
| Map tiles, geocoding (Nominatim)         | OpenStreetMap            | Tiles, JSON                          | ODbL                         | n/a                |

**Each source was inspected before a parser was written**, and a sample was shown and agreed
before any code depended on it. Examples of what inspection found:

- The Jan Aushadhi page loads its table from a public JSON endpoint after getting an anonymous
  guest token, the same request its own Download button sends. The Kendra endpoint refuses an
  all-India request, so the fetcher asks for each of the 36 states and union territories, 2
  seconds apart.
- CDSCO's NSQ page embeds a table that loads public JSON month by month. The responses are in
  Latin-1, not UTF-8.
- NPPA's web pages return HTTP 403 to scripts, and its price dashboard uses rotating security
  tokens and encrypted requests. It was therefore **not** scripted. The official yearly Gazette
  orders (plain PDFs on its "Circulars / Orders" page) are downloaded by hand once a year instead.
- The Kendra list includes each owner's personal name. DawaCheck does not copy it.

### 4.2 Stages

**Fetch → parse → normalise → validate → load → build static files.**

- **Normalise** (`pipeline/dawacheck_pipeline/normalize.py`, rules in `synonyms.yaml`): salt
  synonyms and suffixes, units, dosage forms and release types. One rule needs special mention:
  proton-pump inhibitor tablets (pantoprazole, rabeprazole, esomeprazole, omeprazole,
  lansoprazole) are always gastro-resistant, but brand records often omit the word, so the rule
  `always_delayed_release` adds it. This rule alone gave exact generics to about 9,900 more
  brands, including Pan 40. Aspirin is deliberately excluded, because plain aspirin tablets exist.
- **Refuse rather than guess.** The Jan Aushadhi parser rejects anything unclear (kits of
  separate tablets, strength ranges, two dosage forms in one name): 1,882 of 2,439 names parse,
  and most of the rest are surgical items. The brand dataset keeps at most two ingredients per
  medicine, so every two-ingredient brand is marked `composition_complete = false`, and the app
  asks the user to confirm the full ingredient list before showing a generic.
- **Validate.** The loader refuses to replace a table whose size changes by more than ±20%, so a
  broken download or a changed format can never replace good data.
- **Load.** Idempotent upserts with stable source IDs, so running twice changes nothing. Rows
  are stamped with the run's start time, and older rows are removed afterwards (section 4.5
  explains why it is the start time).

### 4.3 Politeness

Every fetcher sends a clear User-Agent, waits between requests (2 s for CDSCO and the Kendra
list, 1 per second for Nominatim), caches what it has fetched (the geocoding cache is committed
to the repository), and runs once a month. No login, CAPTCHA or other protection is bypassed.

### 4.4 Checking Kendra coordinates

The official list has coordinates for 99.9% of Kendras. Geocoding every address with Nominatim
as first planned would have taken about 6 hours a month, and Nominatim found only about 1 in 30
Indian addresses in a test. So the official coordinates are used, after checks: a coordinate is
rejected if it is missing, outside India, more than 600 km from the median of its own state, or
more than 100 km from the median of its own district. Medians are used because a few wrong
points cannot drag them away.

The district check caught a real error: a Kendra registered in Ganganagar (Rajasthan) had
coordinates in central Delhi, 349 km away, so a user at Connaught Place would have been told it
was 0.5 km away. When the checks ran (21,541 Kendras at the time), 21,273 official coordinates
passed, 3 were fixed by geocoding the address, 175 were placed at the centre of their PIN code
area and marked "Location is approximate", and 90 (0.4%) were left off the map rather than
shown in the wrong place.

### 4.5 Parsing the banned-FDC lists, and a false alarm

The FDC lists are PDF tables (parsed with `pdfplumber`). The consolidated list has footnotes that
change an entry's legal status: stayed by the Madras High Court, revoked with conditions, under
examination by the Supreme Court, or quashed by the Delhi High Court with an appeal pending.
The PDFs also split words ("Cetir izine") and contain typos. A name is repaired only to a salt
the medicine data uses, and only if exactly one such salt is within one letter (two for long
names).

**The false alarm.** The first deployed version compared salts only. Checking the live site
after the first data load showed it calling aceclofenac + paracetamol banned, which would have
flagged 6,444 brands of one of India's most common legal painkiller combinations. The ban is on
the sustained-release form and on a 50 mg + 125 mg product, not on the combination itself.
The check was switched off on the live site within the hour and fixed: entries now keep their
strengths, forms and release types, and the check compares all of them (section 5.6). Measured
over all 241,046 brands, the number flagged as banned fell from 18,278 to 62 certain alerts (all
single drugs withdrawn in India), plus 4,885 "show your pharmacist" warnings.

A second slip followed. The first reload after the fix kept the 682 old entries next to the 687
new ones: the loader deleted rows "last seen before today", both loads ran on the same day, and
the row IDs had changed. The check stayed off until the loader stamped rows with the run's start
time and compared sizes with the previous run's `rows_loaded`.

_Lesson:_ test a safety check against the whole population it will see, not only against the
cases it should catch.

### 4.6 Monthly refresh

`.github/workflows/data-refresh.yml` runs at 03:30 UTC on the 5th of each month. If a source
fails or fails validation, the job stops and the previous data stays live; the About page keeps
showing the date of the last successful refresh. Seven manual runs succeeded up to 25 October
2026; the first scheduled run is due on 5 November 2026. NPPA ceiling prices change once a year
(April), so their file is added by hand.

---

## 5. AI methods

### 5.1 Preprocessing (`web/lib/ai/preprocess.ts`)

All steps are short, unit-tested TypeScript on a canvas. OpenCV.js was rejected: it is an
8–10 MB download, too heavy for a cheap phone on mobile data.

1. **Load and scale.** Respect the phone's rotation flag (EXIF) and scale the long side to
   1600 px: enough for small print, small enough to be fast.
2. **Contrast stretch.** Grayscale, then map the 2nd percentile to black and the 98th to white.
   Clipping the brightest 2% stops a few glare pixels from washing out the rest.
3. **Adaptive black-and-white** (Bradley and Roth [3]). A pixel becomes black if it is more than
   12% darker than the mean of the square around it (about 41 px wide at 1600 px; the long side
   ÷ 40, at least 15). The means come from an integral image, where each cell holds the sum of all
   pixels above and to the left, so the sum of any rectangle needs four look-ups.
4. **Inverted** version, for light print on dark foil.
5. **The "ink" image.** Silver foil's embossed pattern turns into a black mesh after
   thresholding, as dark as the letters. But batch, date and MRP stamps are coloured ink, and foil
   is grey however bright it is. So the ink image measures how _colourful_ each pixel is:
   max(R, G, B) − min(R, G, B). Only the ink survives. On one stamp, OCR confidence went from 25%
   to 65%.
6. **Deskew** by projection profile: for each angle from −15° to +15° in 0.5° steps, project the
   dark pixels onto rotated rows and take the sum of squares of the row counts. It is highest
   when rows are either full of ink or empty, that is, at the text's angle.
7. **Quarter turns.** Indian strips often print the stamp sideways. The optional stamp close-up
   is also read turned 90° and 270°, then straightened again.

> **Figure 3.** One strip as original, enhanced, black-and-white, ink, and straightened stamp.

### 5.2 OCR (`web/lib/ai/ocr.ts`, `reader.ts`)

Tesseract.js runs Tesseract's LSTM recogniser in the browser (English model, downloaded once
from a CDN). Reading is **progressive**: a cheap pass first, and more image versions and the
sideways stamp reads only if key fields are missing or unsure. On the original demo strip the
black-and-white version read at 88–89% OCR confidence against 32–48% for the enhanced one, so
black-and-white goes first.

For speed, two Tesseract workers read a pass's image versions at the same time (one on phones
with fewer than 4 cores), and the photos are prepared in a Web Worker with `OffscreenCanvas` so
the page stays responsive. Results are kept in the order they were requested, whatever finishes
first, so the merged answer never depends on timing (a unit test races fake reads to check this).

### 5.3 Extraction and merging (`extract.ts`, `merge.ts`)

**Rules, not a trained model.** Indian strips use a small set of fixed labels ("B.No.", "MFG",
"EXP", "M.R.P."), so rules work without training data, and each rule can be tested and
explained. Machine learning would need hundreds of labelled photos.

- OCR confusions are fixed **inside numbers only** (O→0, l→1, S→5, B→8).
- Each field has a pattern check: an MRP between ₹0.50 and ₹20,000; an expiry after manufacture
  and within 6 years.
- **Refuse rather than misread.** "MRP ₹1,245.00" was once read as ₹1.24 (the comma looked like a
  decimal point); now, if digits continue right after what was read, the MRP is left empty. A
  batch code containing look-alike characters (O/0, I/1/L) gets a low confidence.
- Ingredients printed over two lines ("Amlodipine Besilate IP" / "eq. to Amlodipine 5 mg", the
  usual Indian layout) are joined.
- **Merging:** for each field, keep the reading with the highest pattern confidence × OCR
  confidence across image versions. Free-text fields (brand, ingredients) are shown only above a
  minimum confidence (0.3); below it the field is left empty for the user. Structured fields are
  not filtered this way, because their strict patterns already reject garbage.
- **Brand guesses.** The brand is taken as the tallest plausible line on the front. The reader
  also sends the 3 tallest plausible lines (OCR confidence ≥ 30) as _guesses_; a guess counts
  only if the matcher accepts it under the same rules (section 5.4), and if two guesses match
  different medicines, nothing is accepted.

### 5.4 Matching (`web/lib/ai/rerank.ts`, `find-match.ts`)

**Candidates.** The database's trigram search runs twice, on the name as read and on a cleaned
version with OCR slips undone ("SERT0SH 100mg Talet" → "sertosh"), and the lists are merged into
up to 10 brands. Form words such as "tablet" are removed from the query (otherwise "LAH TABLET"
was compared with almost every brand and timed out). Discontinued brands are included when
scanning, because a strip in a cabinet may be old stock.

**Evidence.** For each candidate, six features:

| Feature     | Value                                                                                                                                                                                                                                                                                                                                             |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| name        | similarity 0–1 after removing "Tablet", "Rx" and strengths, with OCR look-alikes treated as equal (0/O, 1/l/i, 5/S, 8/B, rn/m, cl/d)                                                                                                                                                                                                              |
| strength    | +1 / 0 / −1: numbers in the strip's name ("Suhagra-100") present in the candidate                                                                                                                                                                                                                                                                 |
| ingredients | +1 exactly the same salts and strengths; +0.5 no contradiction but not a full match (a salt not read, or a record cut short at two ingredients); 0 nothing to compare; −1 a contradiction. A one-letter slip in a long salt name counts as the same salt; two letters is "no evidence", because citalopram and escitalopram are two letters apart |
| form        | +1 / 0 / −1                                                                                                                                                                                                                                                                                                                                       |
| release     | +1 / 0 / −1 (SR, MR, DR…)                                                                                                                                                                                                                                                                                                                         |
| maker       | +1 / 0 / −1                                                                                                                                                                                                                                                                                                                                       |

**Choice model.** Each candidate gets a score from its features, and "none of these" scores 0.
The probabilities are a softmax over all options:

```
score(j) = b + Σ_k  w_k · f_jk                  (b = bias, w = weights, f = features)
P(j)     = exp(score(j)) / (1 + Σ_i exp(score(i)))
```

The 1 in the denominator is "none of these". The bias _b_ decides how good the evidence must be
before a candidate beats "none".

_Why a choice model?_ The first version scored each candidate on its own with logistic
regression. It could not separate "Valium 5" from "Valium 10" when both names match perfectly,
so it abstained on 70% of strips. In a choice model the candidates compete: the one whose
strength agrees takes probability from the one whose strength contradicts, and two equally good
candidates split it, so neither looks sure.

**Fitting.** The weights are fitted by gradient descent on −log P(right option) over the
simulated development cases (section 7.1), with a small L2 penalty (2,000 epochs, rate 0.5,
λ = 0.001). Fitted weights: name 11.44, strength 1.39, ingredients 2.11, form 0.80, release 1.05,
maker 1.55, bias −11.54. The answer threshold is the lowest probability whose wrong-answer rate
on the development cases is at most 2%: **0.55**.

### 5.5 Abstention and safety rules

The learnt model optimises average accuracy on simulated data. It once gave "Potrate 10" 91%
for a strip that said "Potrate 5", because the name, form and maker agreed. So three rules come
before the threshold, and the model cannot override them:

1. **Contradiction:** never answer with a candidate that the strip contradicts in strength,
   form, ingredients or release type.
2. **Strength must be confirmed** for a brand sold in several strengths (a number in its name):
   the strip's name or ingredients must say which.
3. **Threshold:** otherwise answer only if the probability is at least 0.55.

An abstention says why ("not sure", "which strength?", "not in our list"), offers the top 3 with
how likely each is, and offers "Type the name instead". Two further rules protect the generic:

- **Identical composition key only** (section 3.3).
- **`compositionDiffers`:** if the ingredients the user confirmed from the strip differ from the
  chosen brand's record, no generic is shown, even if the user picked the brand by hand.

The calibration table in section 7.4 shows what the displayed confidence means in practice.

### 5.6 The checks (`web/lib/checks/`)

All four checks are pure functions with unit tests. "Couldn't check" is never shown as "nothing
found".

- **Batch safety.** An alert applies only if the batch number matches (normalised like the
  reader: "AOX-2402" = "AOX2402") **and** the product matches: brand-name similarity ≥ 0.6, or
  all of the medicine's salts in the alert's product name, or the same manufacturer. A batch
  number alone is not enough, because different companies reuse numbers. A batch that the reader
  was unsure of (below 0.6, not corrected or confirmed by the user) gives "couldn't check", never
  "safe". An alert uses the wording "This batch was reported in a government quality alert. The
  finding applies to the tested batch. Show this to your pharmacist.", with the month, the failed
  test, the laboratory and the date the alerts were checked up to.
- **Fair price.** NPPA ceilings are per unit and exclude GST. The check finds the ceiling by the
  exact composition key, computes MRP ÷ pack size, and compares it with ceiling × (1 + GST). GST on
  most medicines was 12% until 22 September 2025 and 5% since, and a strip made before the cut may
  legally carry the old price. So the margin is 5% for strips made from October 2025 and 12%
  otherwise, or when the date was not read. Testing on real prices found this: with a flat 5%, a
  correctly priced strip made in 2024 would have been called overpriced. When several ceilings
  exist, the newest list and the highest price are used, so a price is never called too high by
  mistake. Results: "within", "above the ceiling: show this to your pharmacist" (with NPPA's
  helpline), "not price-controlled", or "can't compare".
- **Banned combination.** An entry applies only if everything it names matches: the set of salts
  (an extra salt makes a different combination), and the form, release type and strengths if the
  entry names them. Each entry is _yes_, _maybe_ (something it names cannot be confirmed, for
  example on a two-ingredient record that may be cut short) or _no_. Only a certain match with a
  plainly prohibited entry is a red alert. Everything else that applies is an amber "show your
  pharmacist" note with the legal status in words (stayed, quashed, under examination, revoked
  with conditions, or "may apply").
- **Nearest Kendra.** India is divided into geohash squares of 3 characters (about 156 km). The
  pipeline writes one static file per square plus an index. The phone computes its own square,
  downloads it and the 8 neighbours (so a Kendra just across a border is not missed), computes
  great-circle distances with the haversine formula [9] (Earth radius 6,371 km) and shows the 3
  nearest. A PIN code uses the file for its first 3 digits.

---

## 6. Implementation

### 6.1 Technology

| Part         | Technology                                                                                                   | Why                                                                             |
| ------------ | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| Web app      | Next.js 16 (App Router, Cache Components, Turbopack), React 19, TypeScript strict, Tailwind CSS 4, shadcn/ui | Static pages from a CDN; one TypeScript codebase for the app and the evaluation |
| On the phone | Tesseract.js 7, Canvas, Web Worker + OffscreenCanvas, Leaflet + OpenStreetMap                                | No AI API, no cost, nothing uploaded                                            |
| Languages    | Next.js dictionaries (`web/messages/{en,hi,ta}.json`)                                                        | Three small files; no extra library; translations stay on the server            |
| Server       | Next.js route handlers on Vercel Hobby                                                                       | Free; deploys on every push                                                     |
| Database     | Supabase PostgreSQL with `pg_trgm`, Row Level Security                                                       | Free; fuzzy search in the database; read-only public key                        |
| Pipeline     | Python 3.12, `uv`, pandas, requests, pdfplumber, PyYAML                                                      | Good PDF and table tools                                                        |
| Scheduling   | GitHub Actions                                                                                               | Free; secrets stay in GitHub                                                    |
| Tests        | Vitest, pytest, Playwright + axe                                                                             | Unit, pipeline, end-to-end and accessibility tests                              |

All dependency versions are pinned exactly and the lock file is committed, so a build next
month uses the same code as today.

### 6.2 Code organisation

Logic lives in **small pure functions** with no DOM access or I/O, each with unit tests:
preprocessing, extraction, merging, matching and the four checks. Browser glue (`ocr.ts`,
components) is kept thin. **The evaluation scripts call the same code as the app**
(`lib/ai/reader.ts`, `rerank.ts`), so the reported numbers describe what users actually get.

### 6.3 Languages, accessibility and Demo mode

- English, Hindi and Tamil (`/en`, `/hi`, `/ta`); `proxy.ts` sends `/` to the browser's language.
  A unit test fails if a key is missing or empty in any language. The Hindi and Tamil texts were
  drafted with AI assistance and still need review by a native speaker.
- Body text at least 16 px; tap targets at least 48 px; never colour alone (icon + words); real
  form labels; `aria-live` for changing results; a large-text switch (125%); focus moves to the
  heading of each new screen.
- **Demo mode** has two strips built from real records (Telmikind 40 from the brand data; Omee
  with the batch, dates and maker of a real CDSCO alert), clearly marked DEMO. `demo/` holds 18
  more strips covering every feature, each verified through the live upload flow (18/18).

### 6.4 Testing and CI

| Suite                   | Count | What it covers                                                                                                         |
| ----------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------- |
| Vitest (web)            | 406   | Preprocessing, extraction (including real OCR snippets), merging, matching, checks, languages                          |
| pytest (pipeline)       | 197   | Parsers, normalisation, validation, the NPPA 30-price check, rule-file freshness                                       |
| Playwright (end to end) | 22    | Both demos end to end, typed search with all checks, Kendras by PIN, privacy network log, axe on every page and screen |

Vitest and pytest pass (run on 26 October 2026); the 22 Playwright tests pass in CI. Every push to `main` runs formatting, lint, type
checks, Vitest, the production build, Playwright against that build, and the pipeline's ruff and
pytest, then deploys to Vercel.

The **privacy test** (`web/e2e/privacy.spec.ts`) records every request during a real photo scan:
the only calls to the app's server are two small JSON requests (`/api/match`, `/api/checks`) with
no image bytes, and the only other host contacted is the OCR model's CDN. During a GPS Kendra search, nothing is uploaded and no URL contains
the coordinates. Both tests fail when a leak is deliberately planted.

### 6.5 Deployment

Vercel builds the `web/` folder on every push to `main`. The monthly data refresh commits the
rebuilt Kendra files, which triggers a redeploy. Live at https://dawacheck-psi.vercel.app.

---

## 7. Evaluation

### 7.1 Data and method

**Labelled photos.** No phone photos had been collected when evaluation began, and openly
licensed photos of Indian strips are rare. So 16 openly licensed photos were used: 5 Indian
strips and 11 foreign packs (English, German, French, Czech and Turkish), from Wikimedia Commons
and Flickr (credits in Appendix A). The photos are not in the repository; `eval/photo-sources.json`
says where to download each one.

- **Labels** were typed into a form that starts _empty_ (no pre-fill from DawaCheck's reading,
  which would bias the labeller towards accepting its mistakes). Anything not clearly readable was
  left unlabelled. The labels were drafted with AI assistance and checked by the author before the
  final run (no corrections were needed).
- **Split:** 1 photo in 4 is frozen into the test set by a hash of its ID: **13 development, 3
  test** (`augmentin875`, `diazepam10`, `sortis40`). The test photos were not opened until the
  final run, which was done **once**, on 25 October 2026.
- **"Wrong"** means a value was shown and it was incorrect. A field left empty counts as neither
  right nor wrong: the user is asked to type it. A wrong value is worse than an empty one.

**Simulated matching cases.** Only 5 labelled development photos show medicines that are in the
brand dataset, too few to fit anything. So the matching evaluation also takes 800 real brands
from the database and turns each into what OCR might read: letter swaps seen on the real photos
(rn→m, l→1, O→0), missing strengths, junk such as "Rx", and some ingredients misread. In 1 case in
4 the true brand is removed from the candidates, so the right answer is to abstain (like a brand
newer than 2022, or a foreign one). Split: **593 development** (weights and threshold fitted
here), **207 test** (never used for fitting).

_Caveat:_ the noise model and the name comparison share the same ideas about look-alike letters,
so the simulated numbers are probably optimistic.

### 7.2 Reading the strip

**Table 7.1 — Development photos (13), DawaCheck vs plain Tesseract on the untouched photo.**

| Field       | DawaCheck right | DawaCheck wrong | Plain OCR right |
| ----------- | --------------- | --------------- | --------------- |
| Batch no.   | 3/3             | 0/3             | 1/3             |
| Mfg date    | 3/4             | 0/4             | 1/4             |
| Expiry      | 3/4             | 0/4             | 1/4             |
| MRP         | 1/4             | 0/4             | 0/4             |
| Pack size   | 3/10            | 0/10            | 1/10            |
| Ingredients | 1/9             | 3/9             | 0/9             |
| Brand       | 0/13            | 3/13            | 0/13            |

The denominator is the number of photos where that field is readable and labelled.

For the safety-critical stamp fields (batch, dates, MRP, pack size), DawaCheck **never showed a
wrong value**: when unsure it left the field empty. Brand and ingredients, read from whole photos
of busy packs, are weak, and this is the main limitation of the reader.

**Character error rate** (CER, edits needed ÷ length of the true value; 0 is perfect) from
`eval/results.md`, measured over 15 strips (the 13 development photos plus the 2 demo strips):
batch 0.00 vs 0.80 for plain OCR, mfg and expiry 0.17 vs 0.83 and 0.50, MRP 0.50 vs 1.00, pack
size 0.58 vs 0.92, ingredients 0.64 vs 1.00, brand 0.82 vs 1.00. The batch number was read on
3/3 foil and 2/2 matte packs, against 1/3 and 0/2 for plain OCR.

**Table 7.2 — Frozen test photos (3), run once.**

| Field       | DawaCheck right | DawaCheck wrong | Plain OCR right | Plain OCR wrong |
| ----------- | --------------- | --------------- | --------------- | --------------- |
| Brand       | 0/3             | 1/3             | 0/3             | 1/3             |
| Ingredients | 0/2             | 2/2             | 0/2             | 1/2             |
| Pack size   | 0/2             | 0/2             | 1/2             | 0/2             |
| Batch no.   | 0/1             | 0/1             | 0/1             | 0/1             |
| Expiry      | 0/1             | 0/1             | 0/1             | 0/1             |

(MRP and manufacturing date were not labelled on any test photo.)

**No field was read correctly on the test set.** Two of the three are foreign packs (a French
Augmentin and a German Sortis) photographed at an angle, and Tesseract's own confidence was only
23–44%, so almost nothing was readable. With three photos, the test set is far too small to
generalise from, and the system was not re-tuned on it.

The test run also exposed a **defect** that the development photos had hidden. For a photo with
no back side, the merge step used a placeholder back reading with confidence 100, so averaging
front and back doubled a weak front's score (24% became 62%), and garbage ingredients such as
"Cee 8000 mg" passed the bar for showing free text. **This was fixed after the final run:** with
no back photo, only the front's confidence counts (two new unit tests fail on the old code). The
fix was checked on the development photos only: wrong values shown fell from 8 to 6, and batch,
dates, MRP, pack size, speed and every automatic match were unchanged. One correct but
low-confidence name ("Suhagra-100") is no longer pre-filled; its automatic match still succeeds
through the brand guesses. **The test-set numbers above were measured before the fix and were not
re-run.** Table 7.1 is after the fix.

### 7.3 Ablation: preprocessing

The brief's first baseline is plain Tesseract on the original photo file, untouched. (An early
version of the baseline resized and grayscaled the photo first, which made it read even less and
would have exaggerated the improvement. Tesseract still does its own simple thresholding.)

On the development photos (Table 7.1), the full pipeline read the batch 3/3 against 1/3, each
date 3/4 against 1/4, and pack size 3/10 against 1/10, with no wrong stamp values. Most of the
gain comes from the ink image and the stamp close-up with quarter turns (section 5.1). On the
test photos, neither method read anything correctly, because the OCR could not read those photos
at all.

### 7.4 Matching

**Table 7.3 — Simulated test cases (207; 163 in the dataset; never used for fitting).**

| Method                                    | Top-1     | Top-3     | Answered | Wrong (of answered) | Wrong generic | Abstained (in dataset) |
| ----------------------------------------- | --------- | --------- | -------- | ------------------- | ------------- | ---------------------- |
| Exact name only (baseline)                | 62.6%     | 62.6%     | 50.7%    | 2.9%                | 2.9%          | 36.2%                  |
| Trigram search, always answers (baseline) | 81.0%     | 90.8%     | 91.8%    | 30.5%               | 26.8%         | 6.1%                   |
| + re-ranking, no abstention               | 85.9%     | 90.2%     | 91.8%    | 26.3%               | 19.5%         | 6.1%                   |
| **DawaCheck (re-ranking + abstention)**   | **85.9%** | **90.2%** | 58.5%    | **3.3%**            | **0.0%**      | 28.2%                  |

**Development cases (593; fitted here):** DawaCheck top-1 89.1%, top-3 90.9%, wrong 1.0% of
answers, wrong generic 0.0%, abstained on 29.8% of in-dataset strips.

- **Re-ranking** adds 4.9 points of top-1 over trigram search alone on the test cases (7.1 on
  development).
- **Abstention and the safety rules** cut wrong answers from 26.3% to 3.3% at the same top-1.
  The cost is saying "not sure" on 28.2% of strips that are in the dataset.
- **Wrong generic: 0%.** Every remaining wrong answer was a brand with the same composition as
  the right one (for example "Etozoc 90" for "Etozox 90", both etoricoxib 90 mg), so the generic
  shown was still correct.
- **Why top-3 stops at about 90%:** for the in-dataset test strips DawaCheck did not answer
  correctly, the search never found the right brand in 15 cases (names too garbled), found it but
  ranked it below another in 8, and ranked it first but was not sure enough in 23 (8 of them
  because a same-name brand with another strength was also possible).

**Table 7.4 — Calibration (simulated test).**

| Confidence shown | Cases | Top choice right |
| ---------------- | ----- | ---------------- |
| 0.00–0.25        | 37    | 16.2%            |
| 0.25–0.50        | 24    | 54.2%            |
| 0.50–0.75        | 35    | 91.4%            |
| 0.75–0.90        | 41    | 90.2%            |
| 0.90–1.00        | 53    | 98.1%            |

When DawaCheck says 90–100%, it is right 98% of the time. Above 50% the confidence is, if
anything, cautious.

**Real photos, names as the user would confirm them.** Development (13 photos, 5 in the
dataset): 3 answered, all correct (Fincover 1mg, Suhagra 100, Neorelax MR); the top choice was
right for 4 of 5; **0 wrong**. Cialis asked "10 mg or 20 mg?" (no strength on the photo), and
Crocin Cold & Flu Max abstained at 47.7% (threshold 55%). All 8 foreign or not-in-dataset photos
abstained, including dangerous look-alikes: Sortis (atorvastatin) was not turned into Sortin
(rosuvastatin), Warfarin not into Heparin, Citalopram not into Escitalopram, and Favipill 800 not
into Favipill 400. The always-answer baselines got 63.6% of their answers wrong on the same
photos.

Test (3 photos, 2 in the dataset): Valium 10mg matched at 86% (right); Augmentin abstained (sold
in several strengths, none read); Sortis was correctly reported as not in the list. **1/2 right,
0 wrong**, while the always-answer baselines got 67–100% of their answers wrong.

### 7.5 Ablation: brand guesses

Brand guesses (section 5.3) were added because the brief asks for the brand to be "the biggest
text, confirmed by matching". Before the merge fix, they made **no difference** on the
development photos (1/5 right, 0 wrong, with or without), because the misses had no readable
name at all. After the fix, they recovered one match: Suhagra 100 is matched with guesses
(1/5 right) and not without (0/5), with 0 wrong either way. Word-level guesses were tried and
rejected: no gain, and a generic word like "Metformin 500" would match another company's brand.

### 7.6 Photo to medicine, fully automatic

Here the reader's fields go straight to the matcher, as if the user tapped Find without
correcting anything.

- Development photos: **1 right (Suhagra 100), 0 wrong**, the rest abstained.
- Test photos: **0 right, 0 wrong** (all three abstained).

With the user's corrections (section 7.4), 3/5 development and 1/2 test in-dataset photos
matched. The confirm screen is therefore part of the method, not an afterthought: the reader
rarely reads the brand name on real photos, and the matcher stays safe by abstaining.

### 7.7 Accuracy of the checks (`eval/m5-checks.md`)

| Check               | Test                                                                         | Result                                                     |
| ------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Banned combination  | 20 banned medicines (each with its notification) + 20 legal ones             | **40/40** correct                                          |
| Batch alerts        | Batches in CDSCO's April–June 2025 laboratory PDFs found in our data         | **170/172** (98.8%)                                        |
| Ceiling prices      | 30 scheduled medicines, ceiling read by hand from the Gazette order          | **30/30** exact                                            |
| Price verdicts      | Each of the 30 at ceiling + 4% ("within") and + 10% ("above"), made Jan 2026 | **60/60**                                                  |
| Generic lookup (M1) | 20 common chronic-disease brands, checked by hand                            | **16 right, 0 wrong**, 2 safe misses, 2 not in the dataset |

The 2 missing batches (a dextrose injection and a pantoprazole tablet) are missing from CDSCO's
own online table, which the pipeline copies; they are a gap between CDSCO's two publications,
not a parsing error. The online table actually holds _more_ laboratory alerts than the PDFs for
the same months. The 2 safe misses in the generic check are Ecosprin 75 (the record does not say
"gastro-resistant") and Met XL 50 (47.5 mg succinate vs 50 mg): no answer rather than a wrong one.

### 7.8 Speed

| Setting                                               | Median    | p95     |
| ----------------------------------------------------- | --------- | ------- |
| Laptop, 13 dev photos, 1 Tesseract worker (before M7) | 9.9 s     | 16.8 s  |
| Laptop, 13 dev photos, 2 workers + Web Worker (M7)    | 7.1 s     | 10.8 s  |
| Laptop, latest run after the merge fix                | 7.4 s     | 10.9 s  |
| Laptop, the 3 test photos                             | 3.4 s     | 3.8 s   |
| Live demo strip on a laptop                           | 1.3–1.5 s | –       |
| **Mid-range Android phone, live demo strips**         | [PHONE]   | [PHONE] |

Two workers cut the median by 28% with exactly the same fields read. A smaller picture (1200 px
instead of 1600 px) would have taken 4.6 s, but lost one manufacturing date and one expiry date,
so it was rejected: a missing expiry matters more than two seconds. The brief's target is 5 s
(p95) on a mid-range phone; [PHONE: say whether it was met.]

### 7.9 Usability

[SUS: number of participants _n_ and who they were (no names); mean SUS score with standard
deviation and 95% confidence interval from `docs/sus/sus_score.py`; share at or above 68; task
completion for each of the 5 tasks (done / done with help / not done); two or three anonymous
quotes; what you changed, if anything.]

Method: the System Usability Scale [10] (10 statements, each answered 1–5, scored 0–100; 68 is
the average across many studies [11]), after five tasks on the live site (`docs/sus/README.md`).
The Hindi version of the questionnaire is our own translation and has not been validated.

### 7.10 Accessibility

- **Lighthouse** (13.5.0, mobile, production build): accessibility **100** on /en, /en/scan,
  /en/search, /en/kendras, /en/about, /hi/about and /ta.
- **axe** (WCAG 2.1 A and AA) through Playwright: **0 violations** on all 5 pages in all 3
  languages, and on the confirm screen, result card, search results and Kendra list, which
  Lighthouse cannot see because they appear only after user actions.
- **Keyboard pass:** logical order and visible focus everywhere. It found one real problem:
  after reading, focus fell back to the top of the page. Focus now moves to the new screen's
  heading.

### 7.11 Brief targets

| Target (from the brief)                  | Result                       | Status          |
| ---------------------------------------- | ---------------------------- | --------------- |
| Matching top-1 ≥ 85%                     | 85.9% (simulated test)       | Met             |
| Matching top-3 ≥ 95%                     | 90.2%                        | Not met         |
| Wrong answers ≤ 2% of answered           | 1.0% dev, 3.3% test          | Met on dev only |
| Abstention ≤ 20% of in-dataset strips    | 28.2%                        | Not met         |
| Wrong generic                            | 0.0% (dev and test)          | Met             |
| Banned check correct on 40 cases         | 40/40                        | Met             |
| NSQ precision and recall ≥ 98%           | 98.8% recall vs CDSCO PDFs   | Met             |
| Price verdicts correct on 30 medicines   | 30/30 prices, 60/60 verdicts | Met             |
| Lighthouse accessibility ≥ 90            | 100                          | Met             |
| SUS ≥ 70 with 15–20 users                | [SUS]                        | [SUS]           |
| p95 ≤ 5 s on a mid-range Android phone   | [PHONE] (laptop: 10.8 s p95) | [PHONE]         |
| ~200 labelled photos, 50 frozen for test | 16 photos, 3 frozen          | Not met         |
| Running cost ₹0                          | ₹0                           | Met             |

---

## 8. Privacy, ethics and medical safety

### 8.1 Privacy

Section 3.5 lists what data exists where. There are no accounts, cookies, ads or analytics. The
location is turned into distances on the phone; the server can see at most which ~156 km squares
were downloaded. Map tiles are requested from OpenStreetMap only after the user asks for the map,
and the page says so. The privacy claims are enforced by an automated test on every push
(section 6.4), not just stated.

### 8.2 Medical safety

- DawaCheck **never** says "stop taking", "switch" or "unsafe for you". Every alert ends with
  "show this to your pharmacist or doctor", and every result carries the disclaimer.
- A generic is shown only on an identical composition key. Near misses (another strength, form or
  release type) are no answer.
- A missing or uncertain input gives "couldn't check", never "safe".
- Court-stayed or quashed bans are described as such, not as prohibitions.

### 8.3 Why abstain

The costs are not symmetric. If DawaCheck says "not sure", the user types a name or asks the
pharmacist. If it confidently names the wrong medicine, the user may be shown a generic with the
wrong strength. So the threshold was set for at most 2% wrong answers, and the safety rules sit
above the learnt model.

A concrete example came from testing the demo strip. An upright red "DEMO" mark was read as the
brand name and matched a real medicine, "Demo 20mg Capsule" (omeprazole 20 mg, the same salt and
strength as the strip), at 98%. Name and composition agreeing is strong evidence, and it was
still wrong. The mark is now printed sideways. This is why the user confirms what was read and
sees how sure the app is. A related weakness is still open: "CETZINE 10" matches another maker's
"Cetzin 10mg" at 93%, because GSK's Cetzine 10 is missing from the 2022 dataset and the matcher
cannot know a brand is missing.

### 8.4 Data ethics

- **Licences:** the brand dataset is CC BY-SA 4.0 (ShareAlike), so the brand tables built from it
  are shared under the same licence. Map data is ODbL. All evaluation photos are openly licensed
  and credited (Appendix A).
- **Personal data:** Kendra owners' names are dropped at fetch time.
- **Polite scraping:** rate limits, a clear User-Agent, caching, once a month; the NPPA dashboard
  was not scripted because it is protected; no CAPTCHA was bypassed.
- **Honest data:** no medicine data, price, batch number or Kendra location was invented. Demo
  strips print only values from real records and are marked DEMO.

### 8.5 Inclusion

Three languages, large text, large tap targets and a screen-reader-friendly structure aim at
older users and people more comfortable in Hindi or Tamil. But the OCR reads English only, so
Hindi text on a strip is ignored, and the translations have not yet been reviewed by native
speakers.

---

## 9. Limitations

1. **Small photo set.** 16 web photos (13 development, 3 test), against roughly 200 asked for by
   the brief. No photos taken on a phone have been evaluated yet, so the reading numbers are
   rough.
2. **Three-photo test set.** Too small to generalise from, and two of the three are foreign packs.
3. **Weak brand and ingredient reading** on busy real photos: 0/13 brands right on the development
   photos. The OCR is the bottleneck. The confirm screen and abstention keep it safe, but the user
   often has to type the name.
4. **Simulated matching data.** The matching numbers come from simulated strips that share
   assumptions with the matcher, so they are probably optimistic. The real-photo matching results
   are very small (5 + 2 in-dataset photos).
5. **Brand data is a 2022 snapshot.** New brands are missing, and prices may be out of date (the
   app asks for the MRP on the strip and never shows a 2022 price as today's).
6. **Two-ingredient records.** The brand dataset keeps two ingredients per medicine, so some
   combinations need the user to confirm the ingredients, and many banned-list matches can only
   be "may apply".
7. **English OCR only.**
8. **Speed on phones** not yet measured; 7 s median on a laptop misses a 5 s target.
9. **Labels drafted with AI assistance** and checked by the author, not by an independent
   labeller.
10. **Translations** not reviewed by a native speaker.
11. **No offline use or installation** (milestone M6 was dropped); the OCR model comes from a CDN
    on first use.
12. **The test-set reading numbers predate a fix** (section 7.2) and were deliberately not
    re-run.

---

## 10. Conclusion and future work

### 10.1 Conclusion

DawaCheck shows that five useful checks on a medicine strip can be made from public government
data alone, on the phone, at no cost, and without sending the photo or location anywhere. Against
the objectives: all five checks work from a photo, a typed name and Demo mode; reading runs in
the browser with no AI API; the running cost is ₹0; the privacy claims are tested on every push;
the interface is in three languages and scores 100 for accessibility.

The AI result that matters most is not the top-1 accuracy but the error profile. Abstention and
safety rules cut wrong answers from 26% to 3% on unseen simulated strips at the same top-1, and no
answer gave a wrong generic. On real photos, matching has made 0 wrong identifications. Reading
is the weak part: stamp fields are reliable on Indian strips when a close-up is taken, but brand
names and ingredients on busy packs are not, and the frozen test set, though tiny, showed this
plainly and exposed a defect that the development set had hidden. Reporting that result instead
of re-tuning on it is part of the method.

### 10.2 Future work

- A set of photos taken on phones, with a larger frozen test set (frozen before anyone looks).
- Faster reading on phones: a smaller first pass, WebGPU-based OCR.
- Reading the brand with a small on-device text detector instead of "tallest line".
- Hindi OCR.
- Offline use: install as an app (PWA) with a self-hosted OCR model.
- A fresher brand list.
- The family medicine cabinet with duplicate-ingredient and expiry checks (dropped milestone M6).

---

## References

[1] R. Smith, "An overview of the Tesseract OCR engine," in _Proc. 9th Int. Conf. Document
Analysis and Recognition (ICDAR)_, 2007, pp. 629–633.

[2] N. Otsu, "A threshold selection method from gray-level histograms," _IEEE Trans. Systems,
Man, and Cybernetics_, vol. 9, no. 1, pp. 62–66, 1979.

[3] D. Bradley and G. Roth, "Adaptive thresholding using the integral image," _Journal of
Graphics Tools_, vol. 12, no. 2, pp. 13–21, 2007.

[4] The PostgreSQL Global Development Group, "pg_trgm: support for similarity of text using
trigram matching," PostgreSQL documentation. [FILL: URL and access date]

[5] D. McFadden, "Conditional logit analysis of qualitative choice behavior," in _Frontiers in
Econometrics_, P. Zarembka, Ed. New York: Academic Press, 1974, pp. 105–142.

[6] C. K. Chow, "On optimum recognition error and reject tradeoff," _IEEE Trans. Information
Theory_, vol. 16, no. 1, pp. 41–46, 1970.

[7] Y. Geifman and R. El-Yaniv, "Selective classification for deep neural networks," in
_Advances in Neural Information Processing Systems 30 (NeurIPS)_, 2017.

[8] C. Guo, G. Pleiss, Y. Sun and K. Q. Weinberger, "On calibration of modern neural networks,"
in _Proc. 34th Int. Conf. Machine Learning (ICML)_, 2017.

[9] R. W. Sinnott, "Virtues of the haversine," _Sky and Telescope_, vol. 68, no. 2, p. 159, 1984.

[10] J. Brooke, "SUS: A 'quick and dirty' usability scale," in _Usability Evaluation in
Industry_, P. W. Jordan et al., Eds. London: Taylor & Francis, 1996, pp. 189–194.

[11] J. Sauro, _A Practical Guide to the System Usability Scale_. Denver: Measuring Usability
LLC, 2011.

[12] S. Singh, "A-Z Medicine Dataset of India," Kaggle, 2022. CC BY-SA 4.0.
https://www.kaggle.com/datasets/shudhanshusingh/az-medicine-dataset-of-india [FILL: access date]

[13] PMBI, "Product MRP list," https://janaushadhi.gov.in/product-portfolio/product-mrp-list
[FILL: access date]

[14] PMBI, "Nearby Kendra," https://janaushadhi.gov.in/near-by-kendra [FILL: access date]

[15] CDSCO, "NSQ alerts," https://cdsco.gov.in/opencms/opencms/en/Notifications/nsq-drugs/
[FILL: access date]

[16] CDSCO, "Fixed Dose Combinations," https://cdsco.gov.in/opencms/opencms/en/Drugs/FDC/
[FILL: access date]

[17] NPPA, S.O. 1575(E) and S.O. 1581(E), 25 March 2026, _Gazette of India: Extraordinary_.
https://nppa.gov.in/en/view_more?id=4 [FILL: access date]

[18] Department of Pharmaceuticals, _Drugs (Prices Control) Order, 2013_. [FILL: URL and access
date]

[19] OpenStreetMap contributors, map data © OpenStreetMap, ODbL; Nominatim geocoder.
https://www.openstreetmap.org/copyright [FILL: access date]

[20] Tesseract.js, https://github.com/naptha/tesseract.js [FILL: version 7 release, access date]

[CITE: add the 2–3 medicine-label OCR studies from section 2.2, and the out-of-pocket spending
source from section 1.1.]

---

## Appendix A: photograph credits

All evaluation photos are openly licensed. Where "stamp close-up" is noted, a crop of the stamp
was made by the project under the same licence.

| ID                     | Author                            | Licence       | Source                                                                                                            |
| ---------------------- | --------------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------- |
| favipill800            | Biswarup Ganguly                  | CC BY 3.0     | Wikimedia Commons, "Favipill 800 - Favipiravir Tablets 800 mg - Howrah 2023-05-15 9871.jpg" (stamp close-up)      |
| fincover1              | Kristoferb                        | CC BY-SA 3.0  | Wikimedia Commons, "Generic Propecia.jpg" (stamp close-up)                                                        |
| suhagra100             | Rohini                            | CC BY-SA 4.0  | Wikimedia Commons, "Generic Viagra -- Suhagra-100.jpg"                                                            |
| neorelax-mr            | Biswarup Ganguly                  | CC BY 3.0     | Wikimedia Commons, "Thiocolchicoside-Aceclofenac-Paracetamol Tablet - Howrah 20170920111151.jpg" (stamp close-up) |
| crocin-cold-flu        | joegoauk73                        | CC BY-SA 2.0  | Flickr, photo 10117764426                                                                                         |
| metformin500-zanza     | User:Ash                          | Public domain | Wikimedia Commons, "Metformin 500mg Tablets.jpg"                                                                  |
| warfarin2-label        | U.S. Food and Drug Administration | Public domain | Wikimedia Commons, "RECALLED – Warfarin 2 mg Tablets (9070553592).jpg"                                            |
| azithromycin250-sandoz | Anonymous1941                     | CC BY-SA 4.0  | Wikimedia Commons, "Zithromax (Azithromycin) tablets.jpg"                                                         |
| anterone50             | BlankEclair                       | CC BY-SA 4.0  | Wikimedia Commons, "Anterone (cyproterone acetate) tablets in Australia…"                                         |
| citalopram20           | Fimpelman                         | CC BY 3.0     | Wikimedia Commons, "Citalopram film-coated tablets.jpg"                                                           |
| cialis20               | Hanabishi                         | CC BY-SA 4.0  | Wikimedia Commons, "Cialis 20 mg.jpg"                                                                             |
| dexedrine5             | Adam from UK                      | CC BY 2.0     | Wikimedia Commons, "Dexedrine 5mg tablets.jpg"                                                                    |
| androcur50             | 沈澄心                            | CC0           | Wikimedia Commons, "A blister pack of Androcur 50mg tablets in Turkey (reverse).jpg"                              |
| augmentin875 (test)    | Bree                              | CC0           | Wikimedia Commons, "Augmentin Amoxicilline-acide clavulanique 875mg-125mg.JPG"                                    |
| diazepam10 (test)      | DMTrott                           | CC BY-SA 4.0  | Wikimedia Commons, "Diazepam, strips 10 mg (Valium).jpg"                                                          |
| sortis40 (test)        | Tomino de WS                      | CC BY-SA 4.0  | Wikimedia Commons, "Sortis 40 mg tbl.jpg"                                                                         |

Full URLs: `eval/photo-sources.json`.

## Appendix B: reproducing the results

```bash
pnpm install
cp web/.env.example web/.env.local   # SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY
pnpm test                            # 406 unit tests
pnpm build && pnpm test:e2e          # 22 end-to-end, privacy and accessibility tests
pnpm eval                            # strip reader on the development photos
pnpm eval:match                      # matching: simulated and labelled cases
cd pipeline && uv run pytest -q      # 197 pipeline tests
```

The photos must first be downloaded into `eval/photos/` (see `eval/README.md`). Do not run
`pnpm eval -- --final` again: the frozen test set was evaluated once, on 25 October 2026.

## Appendix C: milestones

| Milestone                                            | Status                           |
| ---------------------------------------------------- | -------------------------------- |
| M0 Setup (app, CI, three languages, deployment)      | Done                             |
| M1 Generic lookup                                    | Done                             |
| M2 Nearest Jan Aushadhi Kendra                       | Done                             |
| M3 Reading strips                                    | Done                             |
| M4 Matching OCR text to a medicine                   | Done                             |
| M5 Safety checks (batch, price, banned; result card) | Done                             |
| M6 Family cabinet, expiry alerts, PWA                | Dropped (25 Oct 2026)            |
| M7 Evaluation and polish                             | Done except SUS and phone timing |

Detailed notes for each milestone: `docs/milestones/`.
