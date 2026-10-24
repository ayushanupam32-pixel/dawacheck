# M3 — Reading strips

**Goal:** photograph the front and back of a strip; the phone reads the medicine name,
ingredients, MRP, pack size, batch number and dates, and the user checks and corrects them.

**Done when:** fields extracted from the first 30 photos; the evaluation script runs.

**Status:** built, evaluated on 16 real, openly licensed strip photos (plus the demo strip),
and improved using what failed. The "30 photos" target is not reached yet: openly licensed photos
of Indian strips are rare (see "Real photos" below), so more of your own photos are still needed.

## What was built

| Stage            | File                                                      | What it does                                                                                                                                                |
| ---------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Preprocessing | `web/lib/ai/preprocess.ts`                                | Resize to 1600 px, grayscale, contrast stretch (with glare clipping), adaptive black-and-white, inversion, colour "ink" image, tilt estimate, quarter turns |
| 2. OCR           | `web/lib/ai/ocr.ts`, `reader.ts`                          | Tesseract.js in the browser; reads the best variant first, more only if needed                                                                              |
| 2b. Merge        | `web/lib/ai/merge.ts`                                     | Per field, keeps the reading with the highest pattern confidence × OCR confidence                                                                           |
| 3. Extraction    | `web/lib/ai/extract.ts`                                   | Rules for MRP, pack size, batch, dates, ingredients, form, maker, brand; a confidence for each                                                              |
| Pages            | `web/app/[locale]/scan`, `web/components/scan-client.tsx` | Front → back → optional stamp close-up → reading → "Check what we read" (every field editable) → find generic                                               |
| Demo mode        | `web/public/demo`, `eval/make_demo_images.py`             | "Try a demo strip": sample images clearly labelled DEMO                                                                                                     |
| Labeling         | `web/app/[locale]/eval/label`, `web/app/api/eval`         | Local-only tool to type the true values for each photo                                                                                                      |
| Evaluation       | `web/scripts/eval.ts`, `web/lib/ai/score.ts`              | `pnpm eval`: accuracy and character error rate per field, against a baseline                                                                                |

All stages are pure functions with unit tests except the thin browser glue in `ocr.ts`:
136 extraction tests (112 synthetic OCR-style snippets plus snippets of real OCR output),
16 preprocessing, 6 merge, 10 image, 7 scoring. Web total: 214 tests.

## How a photo becomes fields

1. **Load** the photo, honouring the phone's rotation flag (EXIF), and scale the long side to
   1600 px: enough for small print, small enough to be fast.
2. **Make 3 versions**:
   - _enhanced_: grayscale with the contrast stretched so the darkest 2% become black and the
     brightest 2% white. Clipping the top 2% stops a few glare pixels from washing out the rest.
   - _binary_: black and white with an **adaptive threshold**. Each pixel is compared with the
     average brightness of the square around it, not one value for the whole photo, so a strip
     half in shadow and half shining still works. The averages come from a summed-area table
     (integral image), so each pixel costs the same however big the square is.
   - _inverted_: the binary version flipped, for light print on dark foil.
3. **Straighten**: for every angle from -10° to +10°, count the dark pixels in each rotated row.
   At the right angle, rows are either full of ink or empty, so the counts vary the most.
4. **Read** with Tesseract (an LSTM neural network for text) in the phone's browser.
5. **Extract** fields with rules: e.g. MRP = the number after "M.R.P."/"MRP"/"Max. Retail Price",
   with O→0, l→1, S→5, B→8 fixed inside numbers only.
6. **Merge**: for each field, keep the value with the highest pattern confidence × OCR confidence.
7. **Confirm**: the user checks every field; anything below 60% confidence is marked
   "Please check". Corrections are used for this scan only and never stored.

## Key decisions, in plain words

**Canvas instead of OpenCV.js.** OpenCV.js is an 8–10 MB download, too heavy for a ₹10,000 phone
on mobile data. The operations we need (grayscale, contrast, adaptive threshold, rotation) are a
few dozen lines each, and being our own code they can be unit-tested and explained.

**Black-and-white first, more only if needed.** On the demo strip (tilt, shadow, glare stripe)
the enhanced version read at 32–48% OCR confidence and the black-and-white version at 88–89%.
Reading enhanced first meant always needing a second pass: 6.9 s. Reading black-and-white
first: all 7 fields correct after one pass, 0.7 s (on a laptop, model already cached). The other
versions are read only if a key field is missing or unsure. The evaluation checks this choice on
real photos.

**Rules, not a trained model, for extraction.** Indian strips use a small set of fixed labels
("B.No.", "MFG", "EXP", "M.R.P."), so rules work, need no training data, and each one is
testable. Machine learning would need hundreds of labelled photos we don't have yet.

**Refuse rather than misread.** "MRP ₹1,245.00" used to be read as ₹1.24 (the comma looked like
a decimal point). Now, if digits continue right after what was read, the MRP is left empty.
A batch code with characters that look alike (O/0, I/1/L) gets a low confidence; in M5 an
uncertain batch makes the safety check say "couldn't check", never "safe".

**The native camera, not a live in-page camera.** The phone's own camera app focuses and handles
flash much better on cheap Android phones, and it works everywhere. The page gives the tips
(flat, good light, tilt against glare) and a strip-shaped guide.

**Privacy.** Photos are read in the browser's memory and never uploaded. The network log during
a scan shows only the app's own files; the OCR model is downloaded once from a CDN.

**A fair baseline.** "Raw Tesseract" means the original photo file, untouched. An earlier version
of the baseline resized and grayscaled the photo first, which made it read even less and would
have exaggerated our improvement. Tesseract still does its own simple black-and-white step.

**Labeling without bias.** The labeling form starts empty. If it were pre-filled with DawaCheck's
reading, people would tend to accept its mistakes, and the measured accuracy would be inflated.
About 1 in 4 photos is frozen as the test set on first save (by a hash of its id).

## Real photos: what we found and fixed

**The photos.** No real photos were collected yet, so 16 openly licensed photos were downloaded:
5 Indian strips from Wikimedia Commons and Flickr (Favipill 800, Fincover 1 mg, Suhagra-100,
Neorelax MR, Crocin Cold & Flu) and 11 English, German, French, Czech or Turkish packs. Licences
(CC0, public domain, CC BY, CC BY-SA) and authors are in `eval/photo-sources.json` and must be
credited in the report. They were labelled by Claude by reading each full-size image by eye, and
anything not clearly readable (a faded batch number, tiny or non-English ingredient text) was
left unlabelled rather than guessed. **Spot-check a few labels before the final report.**
3 photos are frozen as the test set; the numbers below are the 13 dev photos plus the demo.

**First run: weak.** Brand 1/14, MRP 1/5, batch 2/4. The OCR could barely read the real photos
(20–30% confidence against 86–91% on the demo). An experiment (`web/scripts/ocr-experiment.ts`)
ruled out image size and Tesseract's page mode as the cause, and showed three real problems:

1. **Silver foil.** Its embossed diamond pattern turns into a black mesh when the photo is made
   black-and-white, as dark as the letters. Fix: a new **"ink" image** that measures how
   _colourful_ each pixel is (max − min of R, G, B). Foil is grey whatever its brightness, while
   batch/date/MRP stamps are purple, blue or red ink, so only the ink survives. On the Favipill
   stamp OCR confidence went from 25% to 65%.
2. **Sideways stamps.** Indian strips often print batch, dates and MRP at 90°, and the stamp is a
   small part of the photo. Fix: an **optional third photo, a close-up of the stamp**, which the
   reader also tries turned 90° and 270°, then straightens again (a stamp at 78° is at 12° after a
   quarter turn).
3. **Extraction rules that real labels break:** "Metformin" and "500mg" on separate lines;
   "M.R.P. FOR 10 TABS. Rs.33-00" (the first number is the count, and the decimal point is a
   dash); OCR noise after a batch code ("FCR 004 ii"); "BR. No." for "B.No."; "NOV, 12" with a
   comma; garbage lines like "pe fav TRE ER Ema" chosen as the brand; "Rs. 5TABS" or "Rs. Sm"
   read as ₹5. Each fix has a unit test built from the real OCR text.

**After the fixes** (`eval/results.md`):

| Field        | DawaCheck correct | DawaCheck **wrong** | Raw Tesseract correct |
| ------------ | ----------------- | ------------------- | --------------------- |
| Batch number | 4/4 (100%)        | 0                   | 1/4                   |
| Mfg date     | 4/5 (80%)         | 0                   | 1/5                   |
| Expiry date  | 4/5 (80%)         | 0                   | 2/5                   |
| MRP          | 2/5 (40%)         | 0                   | 0/5                   |
| Pack size    | 4/11 (36%)        | 0                   | 1/11                  |
| Ingredients  | 2/10 (20%)        | 4/10                | 0/10                  |
| Brand        | 2/14 (14%)        | 4/14                | 0/14                  |

**What this means:**

- For the safety-critical stamp fields (batch, dates, MRP, pack) DawaCheck was **never wrong**:
  when unsure it leaves the field empty and the user types it. That is the behaviour the spec
  asks for ("a wrong answer is worse than no answer").
- With a stamp close-up, the Indian strips' batch numbers and dates are read reliably; Favipill
  is read completely (batch XFA20002, Nov 2020, Apr 2021, ₹1400 for 10).
- Brand and ingredients from whole photos of busy packs are weak. Low-confidence brand and
  ingredient readings are now hidden instead of pre-filled with garbage (wrong brands went from
  12/14 to 4/14). In M4 the brand is matched against the brand database, and the user always
  picks it from a list, so a misread brand never silently becomes a wrong medicine.
- **Speed is the biggest open problem:** median 10 s per strip on a laptop (up to 17 s), against
  the 5-second target on a phone. Most time goes into extra passes on hard photos.

**Caveats for the report:** 14 strips is a small sample; web photos are not phone photos; the
close-ups were cut from the same photos rather than taken separately; and the rules were tuned on
these same dev photos, so the final numbers must come from the frozen test set (`pnpm eval
--final`) and from new photos taken on a phone.

## How to test it

1. `pnpm dev`, open http://localhost:3000/en/scan, tap **Try a demo strip**. All 7 fields should
   be filled in; open "How we read this" for timing, confidence and the raw text.
2. On a phone: take photos of a real strip (front, then back) and check the fields.
3. Put photos in `eval/photos/`, label them at /en/eval/label, run `pnpm eval`.
4. `pnpm test` (214 tests).

## Limitations

- **Too slow on hard photos:** median 10 s on a laptop against a 5 s phone target.
- Brand and ingredients are often unreadable from whole photos of busy packs.
- Preprocessing runs on the browser's main thread (about 100–300 ms per photo). Moving it to a
  Web Worker would keep the page smoother on slow phones.
- English labels only (Tesseract `eng`); Hindi text on labels is not read yet.
- Brand detection uses "tallest line on the front"; M4 checks it against the brand database.
- No "How we read this" boxes drawn on the photo yet, only text.

## Viva questions this milestone answers

- _Why preprocess at all?_ Foil glare and shadows break a single global threshold. Our adaptive
  threshold compares each pixel with its neighbourhood. The evaluation compares with and without.
- _What is an integral image?_ A table where each cell holds the sum of all pixels above and to
  the left, so the sum of any rectangle needs only 4 look-ups.
- _How do you know a field is wrong?_ Pattern checks (an MRP between ₹0.50 and ₹20,000, an expiry
  after manufacture and within 6 years) plus OCR confidence; low scores are shown to the user.
- _What happens when OCR misreads a batch number?_ Ambiguous characters lower its confidence,
  the confirm screen asks the user to check it, and the batch check will say "couldn't check".
- _Why rules and not deep learning?_ No labelled data yet; rules are explainable and testable.
