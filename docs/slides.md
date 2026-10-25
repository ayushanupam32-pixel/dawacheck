# Slides outline (14 slides, ~12 minutes + 3-minute live demo)

One idea per slide, big text, one picture each. **[PHONE]** / **[SUS]**: numbers to fill in
after timing a phone and after the usability study.

1. **DawaCheck** — "Photograph your medicine strip; check it against public government data."
   Name, roll number, guide, college. Picture: app on a phone (frame from `docs/demo.gif`).

2. **The problem** — Same medicine, very different price: Telmikind 40 ₹3.86 per tablet vs Jan
   Aushadhi telmisartan 40 ₹1.24. Quality alerts, ceiling prices and banned lists are public, but
   in PDFs nobody reads at the pharmacy counter.

3. **What exists, and the gap** — Jan Aushadhi Sugam (must know the generic name), Pharma Sahi
   Daam (prices only), pharmacy apps (commercial, accounts, no batch alerts). Gap: one photo → all
   checks, private, free, honest when unsure.

4. **What DawaCheck does** — The five checks with their icons (generic, batch, fair price, banned,
   Kendra). Three ways in: scan, type, demo. Three languages.

5. **Architecture** — `docs/architecture.png`. Say: photo stays on the phone; server sees only
   the confirmed medicine details; data refreshed monthly by GitHub Actions; ₹0.

6. **Reading a strip (AI part 1)** — One strip shown 4 ways: original, black-and-white (adaptive
   threshold), ink (foil glare removed), straightened stamp. Tesseract in the browser,
   progressive passes. "Plain OCR read the batch 1/3; DawaCheck 3/3" (dev photos). Be honest about the test set:
   3 hard photos (French and German packs), 0 fields read right — the OCR limit.

7. **Finding the medicine (AI part 2)** — Trigram candidates → evidence features → choice model
   (softmax over candidates + "none") → safety rules → answer or "not sure". Valium 2/5/10 example:
   no strength read → shares probability → asks.

8. **Why "not sure" matters** — Table: always-answer re-ranking 26.3% wrong answers vs DawaCheck
   3.3% (207 unseen simulated strips), same top-1 85.9%. Wrong generic: 0%. The "DEMO"
   watermark that matched a real "Demo 20mg Capsule": why we never trust a name alone.

9. **The checks, done carefully** — Batch alert needs same batch AND same product/maker; banned
   list compares strengths and forms (the false-alarm we caught: 18,278 → 62 certain); price per
   unit with GST by manufacturing date. Accuracy: 40/40, 170/172, 30/30.

10. **Privacy and safety by design** — Nothing to log in; photos never uploaded; location used on
    the phone (only a ~150 km area is visible); disclaimer on every result; never "stop" or
    "switch".

11. **Results summary** — Table of brief targets vs achieved: matching top-1 ≥ 85% ✓ (85.9%),
    top-3 ≥ 95% ✗ (90.2%), wrong answers ≤ 2% ~ (1.0% dev, 3.3% test), Lighthouse ≥ 90 ✓ (100),
    SUS ≥ 70 **[SUS]**, speed ≤ 5 s **[PHONE]** (7.1 s laptop), ₹0 ✓.

12. **Usability study** — **[SUS]** n, mean SUS with 95% CI, task completion, two quotes.

13. **Limitations** — Test set: 0/3 photos read well, 0 wrong medicines; a front-only
    photo defect found by the test run (fixed after it, checked on dev photos); small photo set (16), weak brand reading on real photos, simulated matching
    data, 2022 brand snapshot, English OCR only, phone speed. Say them before you're asked.

14. **Future work and thanks** — Phone photo set, on-device speed, Hindi OCR, offline PWA,
    fresher brand list. Live link + QR code to https://dawacheck-psi.vercel.app. Questions.

Backup slides (only if asked): evaluation method and splits; calibration table; data pipeline
validation (±20%); Kendra coordinate checks; test counts (406 unit, 197 pipeline, 22 end-to-end).
