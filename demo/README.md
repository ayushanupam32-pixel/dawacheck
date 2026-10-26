# Demo strips

18 ready-made medicine strips for showing every Medicheck feature, each as the three photos the
website asks for: **front.jpg**, **back.jpg** and **stamp.jpg** (the zoomed-in batch / dates /
MRP stamp). Every one was checked on the website through the same upload steps you will use
(see [VERIFIED.md](VERIFIED.md)).

These are **generated demo images, not photos of real packs** (each says DEMO). What is printed
on them is real: brand, maker, pack size and MRP come from the brand dataset (A-Z Medicine
Dataset of India, Nov 2022, CC BY-SA 4.0); the batch, dates and maker on the two alert strips come
from real CDSCO alerts. Batch numbers starting with **DM** are demo numbers in no alert list.
`strips.json` lists every value and its source; `make_strips.py` draws the images.

## How to use them

1. Put this folder on the phone you'll demo with (AirDrop, Google Drive, or WhatsApp it to
   yourself), or use a laptop browser in a narrow window.
2. Open https://dawacheck-psi.vercel.app/en → **Scan medicine strip**.
3. **Choose from gallery** → `front.jpg` → **Next** → `back.jpg` → **Next** → `stamp.jpg` →
   **Next**. Reading takes a few seconds.
4. On "Check what we read", point at the fields, then **Find a cheaper generic**.
   On Azee 500 and Galvus 50 the name may show a stray "|" in front ("| AZEE 500"): an OCR
   artefact from the card's edge; matching still works, or delete it on screen.
5. Scroll: the match ("This looks like…", with how sure it is), the five checks, and the saving.

Before the demo, open the site once on that phone so the reading model is downloaded and cached.
If a step ever stalls (we saw about one stall in 18 strips on a home connection, and the same
strip worked when tried again), reload the page and choose the photos again.

## What each folder shows

### 1-everyday — the normal case: matched, cheaper generic, all clear

| Strip              | For                   | Fair price            |
| ------------------ | --------------------- | --------------------- |
| 01-telmikind-40    | Blood pressure        | within the ceiling    |
| 02-dolo-650        | Fever, pain           | within the ceiling    |
| 03-amlokind-5      | Blood pressure        | within the ceiling    |
| 04-pantop-40       | Acidity               | no government ceiling |
| 05-glycomet-500-sr | Diabetes (SR tablet)  | no government ceiling |
| 06-losar-50        | Blood pressure        | no government ceiling |
| 07-thyronorm-50    | Thyroid (50 mcg)      | within the ceiling    |
| 08-azee-500        | Antibiotic            | within the ceiling    |
| 09-allegra-120     | Allergy               | no government ceiling |
| 10-concor-5        | Heart, blood pressure | no government ceiling |

All: Cheaper generic **Available**, Batch safety **Nothing found**, Banned **Nothing found**.
Say: "Same ingredients, strength and form at Jan Aushadhi, and here is the saving."
Glycomet 500 SR is a good one to explain _release type_: it matches only the prolonged-release
generic, never plain metformin.

### 2-expensive — big savings, and the fair-price warning

| Strip         | Shows                                                                   |
| ------------- | ----------------------------------------------------------------------- |
| 01-montair-10 | MRP **above the NPPA ceiling** → "Show your pharmacist" + NPPA helpline |
| 02-storvas-10 | MRP **above the NPPA ceiling**                                          |
| 03-rosuvas-10 | ₹19.47 per tablet vs about ₹1.29 at Jan Aushadhi: a very large saving   |
| 04-galvus-50  | ₹21.83 per tablet vs about ₹1.38 at Jan Aushadhi                        |

Note for questions: the MRP on these strips is the brand's **2022** listed price; the ceiling is
the **2026** NPPA order. A strip bought today may be priced differently. That's why the app
always asks for the MRP printed on _your_ strip.

### 3-batch-alert — a batch named in a real government quality alert (red)

| Strip          | Real alert                                                                                                                                                                   |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 01-omee        | CDSCO, Sep 2026: Omee batch 25281124 (Alkem, Baddi) failed dissolution. **Tick "It matches my strip"** under the batch: it has a "1", which the reader always double-checks. |
| 02-taxim-o-200 | CDSCO, Jul 2026: Taxim-O 200 batch 25460922 (Alkem) failed identification. Its price is also above the ceiling.                                                              |

Say: "Same batch and same product, so the alert applies. It says show your pharmacist, never
stop the medicine."

### 4-banned — banned medicines

| Strip         | Shows                                                                                                                                                                                                                                       |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 01-enselin-2  | Rosiglitazone, **prohibited** (GSR 910(E), 12.11.2010) → red **Alert**. An old strip: dates are from before the ban.                                                                                                                        |
| 02-cefolac-az | Cefixime + azithromycin combination, prohibited 2018 → amber **"Show your pharmacist"** (may apply: the brand list keeps only two ingredients per medicine, so the app won't be more certain than its data). Dates are from before the ban. |

No generic is offered for either (Cheaper generic: Not available).

## Features that need no strip

- **Type a name:** home → "Type the medicine name" → `Taxim-O 200` → pick it → all five checks
  and the generic. Type batch `25460922` in "Details from your strip": batch safety turns red (the
  real CDSCO alert); add MRP `119.31`, `10`, `05/2025` and the price shows above the ceiling.
- **"Not sure" instead of a guess:** on the confirm screen type `Valium` and clear the
  ingredients → it offers Valium 2, 5 and 10 mg instead of guessing.
- **Nearest Jan Aushadhi Kendra:** home → "Find a Jan Aushadhi Kendra" → PIN `110001` (or "Use my
  location") → 3 nearest with distance, Call and Directions.
- **Languages:** switch to हिन्दी or தமிழ் on the home page; large-text switch next to it.
- **About page:** data sources with refresh dates, results table, privacy.
- **Demo buttons on the scan page** (no files needed): "Demo: blood-pressure strip" and
  "Demo: strip with a quality alert".

## Regenerate or re-check

```bash
uv run --with pillow python demo/make_strips.py                       # redraw the images
cd web && pnpm exec tsx scripts/verify-demo-strips.ts https://dawacheck-psi.vercel.app   # re-check all
```

Re-check before the viva: alerts and prices come from live government data, refreshed monthly.
