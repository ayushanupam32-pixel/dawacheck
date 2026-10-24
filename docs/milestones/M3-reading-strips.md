# M3 — Reading strips

**Goal:** photograph the front and back of a strip; the phone reads the medicine name,
ingredients, MRP, pack size, batch number and dates, and the user checks and corrects them.

**Done when:** fields extracted from the first 30 photos; the evaluation script runs.

**Status:** everything is built and tested on a generated demo strip, and `pnpm eval` runs.
The "first 30 photos" part needs your real strip photos (see `eval/README.md`).

## What was built

| Stage            | File                                                      | What it does                                                                                                             |
| ---------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 1. Preprocessing | `web/lib/ai/preprocess.ts`                                | Resize to 1600 px, grayscale, contrast stretch (with glare clipping), adaptive black-and-white, inversion, tilt estimate |
| 2. OCR           | `web/lib/ai/ocr.ts`, `reader.ts`                          | Tesseract.js in the browser; reads the best variant first, more only if needed                                           |
| 2b. Merge        | `web/lib/ai/merge.ts`                                     | Per field, keeps the reading with the highest pattern confidence × OCR confidence                                        |
| 3. Extraction    | `web/lib/ai/extract.ts`                                   | Rules for MRP, pack size, batch, dates, ingredients, form, maker, brand; a confidence for each                           |
| Pages            | `web/app/[locale]/scan`, `web/components/scan-client.tsx` | Front → back → reading → "Check what we read" (every field editable) → find generic                                      |
| Demo mode        | `web/public/demo`, `eval/make_demo_images.py`             | "Try a demo strip": sample images clearly labelled DEMO                                                                  |
| Labeling         | `web/app/[locale]/eval/label`, `web/app/api/eval`         | Local-only tool to type the true values for each photo                                                                   |
| Evaluation       | `web/scripts/eval.ts`, `web/lib/ai/score.ts`              | `pnpm eval`: accuracy and character error rate per field, against a baseline                                             |

All stages are pure functions with unit tests except the thin browser glue in `ocr.ts`:
123 extraction tests (from a fixture of 112 OCR-style snippets), 11 preprocessing, 5 merge,
10 image, 7 scoring. Web total: 198 tests.

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

## Results so far

On the generated demo strip (`pnpm eval`, `eval/results.md`):

| Field                                               | DawaCheck   | Raw Tesseract |
| --------------------------------------------------- | ----------- | ------------- |
| brand, ingredients, MRP, pack size, batch, mfg date | 6/6 correct | 0/6           |
| expiry                                              | correct     | correct       |

One generated image shows the pipeline works end to end; it is not evidence of accuracy.
**Real numbers need real photos**: that is the next step.

## How to test it

1. `pnpm dev`, open http://localhost:3000/en/scan, tap **Try a demo strip**. All 7 fields should
   be filled in; open "How we read this" for timing, confidence and the raw text.
2. On a phone: take photos of a real strip (front, then back) and check the fields.
3. Put photos in `eval/photos/`, label them at /en/eval/label, run `pnpm eval`.
4. `pnpm test` (198 tests).

## Limitations

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
