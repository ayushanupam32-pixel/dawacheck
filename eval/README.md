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
```

`<id>` is anything without spaces, e.g. `telma40-a`, `glycomet-foil-2`. A strip without a back
photo is fine (only the fields visible on the front are scored).

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

## 3. Run the evaluation

```bash
pnpm eval            # dev + demo photos
pnpm eval --final    # the frozen test photos, once, for the final report
```

Each strip is read twice: by DawaCheck (with preprocessing) and by raw Tesseract (the original
photo, untouched: the baseline). `results.md` shows exact-match accuracy and character error rate
per field, batch-number accuracy for foil vs matte packs, and timing.
