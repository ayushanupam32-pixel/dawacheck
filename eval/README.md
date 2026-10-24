# Evaluation

This folder measures how well DawaCheck reads medicine strips. The numbers end up in
`results.md`, the About page and the report.

```
eval/
├── photos/              your strip photos (NOT in git: they stay on your computer)
├── labels.json          the true values you typed for each photo (in git)
├── results.md / .json   written by `pnpm eval` (in git)
├── make_demo_images.py  makes the two DEMO images in web/public/demo
└── .cache/              Tesseract's model, downloaded once (not in git)
```

## 1. Take the photos

Goal from the project spec: about 200 photos, at least 60 different medicines, foil and matte
packs, Hindi and English labels, good and poor light. Ask permission before photographing
anyone else's medicines, and keep personal details (names on prescriptions, bills) out of frame.

For each strip, take two photos and copy them into `eval/photos/` named:

```
<id>-front.jpg    the side with the medicine name
<id>-back.jpg     the side with batch number, expiry and MRP
<id>-stamp.jpg    optional: a close-up of the batch / dates / MRP stamp (it may be sideways)
```

`<id>` is anything without spaces, e.g. `telma40-a`, `glycomet-foil-2`. A strip without a back
photo is fine (only the fields visible on the front are scored).

**Current set:** 16 openly licensed web photos (`photo-sources.json` lists source, author and
licence for each; credit them in the report) plus the demo strip. The stamp close-ups were cut
from the same photos. The photos themselves are not in git; to set them up on another computer,
download each one from the source page listed in `photo-sources.json`.

## 2. Label them

```bash
pnpm dev
```

Open http://localhost:3000/en/eval/label and, for each photo, type exactly what is printed.
The form starts empty on purpose: pre-filling it with DawaCheck's reading would make you more
likely to accept a mistake, which would inflate the accuracy.

The first time a photo is saved it is put in the **dev** set (3 in 4) or the frozen **test**
set (1 in 4). Use dev photos while improving the reader. Don't look at test photos' results
until the final report.

For matching (M4), also fill in **matchBrand**: the exact name of this medicine in the brand
database (look it up at http://localhost:3000/en/search, e.g. `Telma 40 Tablet`), or leave it
empty if it is not in the database (a foreign or new brand). Then the right answer is for the
app to abstain.

## 3. Run the evaluation

```bash
pnpm eval            # dev + demo photos
pnpm eval --final    # the frozen test photos, once, for the final report
```

Each strip is read twice: by DawaCheck (with preprocessing) and by raw Tesseract (the original
photo, untouched: the baseline). `results.md` shows exact-match accuracy and character error rate
per field, batch-number accuracy for foil vs matte packs, and timing.

## 4. Matching (M4)

```bash
pnpm eval:match          # about a minute; needs web/.env.local (read-only database key)
pnpm eval:match --fit    # refit the matcher's weights and threshold on the dev cases first
```

Writes `match-results.md`: top-1 / top-3, wrong answers, abstentions and calibration on 800
simulated strips (real brands from the database, made to look like OCR output) and on every
labelled photo, compared with simpler baselines. See `docs/milestones/M4-matching.md`.
