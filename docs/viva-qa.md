# Viva preparation: likely questions and short answers

Answer in your own words; these are the points to hit. Each milestone note
(`docs/milestones/M0…M7`) ends with more questions for that part.

1. **Why Tesseract and not a cloud vision API (Google, GPT-4o)?**
   ₹0 is a hard rule and cloud APIs bill per image; the photo would leave the phone (privacy);
   it must work with no AI API at all. Cost of the choice: Tesseract reads busy strips worse,
   which we handle with preprocessing, a confirm screen and abstention. A cloud fallback could
   sit behind `ENABLE_VISION_FALLBACK=false`; we didn't build one.

2. **What does preprocessing do, and does it help?**
   Scale, straighten (projection profile), contrast stretch, adaptive black-and-white (Bradley,
   integral image), inverted, and the "ink" image (max − min of RGB) that removes silver-foil
   glare. Ablation: plain Tesseract on the untouched photo read the batch 1/3, DawaCheck 3/3 on
   dev photos. On the 3 frozen test photos neither read anything right (foreign packs, OCR
   confidence 23–44%). The baseline is deliberately the original file, so the gain isn't
   exaggerated.

3. **How does it know which medicine it is?**
   Trigram search gives up to 10 candidate brands; for each, evidence: name similarity (OCR
   look-alikes like 0/O, rn/m), strength, ingredients, form, release type, maker. A conditional
   logit (softmax across candidates + "none") turns that into probabilities. Then safety rules.

4. **How is abstention tuned?**
   Weights by gradient descent on simulated dev cases; the threshold is the lowest whose wrong
   rate on dev is ≤ 2% (0.55). Checked on 207 test cases never used for fitting: 3.3% wrong of
   answers vs 26.3% without abstention, same top-1 (85.9%). Calibration: 90–100% confidence was
   right 98% of the time.

5. **Why rules the model can't override?**
   The model is fitted on simulated data and optimises average accuracy; a contradicted strength
   ("Potrate 5" vs "Potrate 10") is a safety issue, not an accuracy one. So: never answer a
   candidate the strip contradicts; brands sold in several strengths need the strength confirmed.

6. **Why is a wrong generic worse than no generic, and how do you prevent it?**
   A wrong strength or release type can harm. Generics match only on an identical composition
   key (`salt:value:unit` sorted + form + release). Near misses are "no answer". Wrong generic on
   test: 0%.

7. **What happens when OCR misreads a batch number?**
   Characters that look alike (O/0, I/1/L) lower the confidence; a batch below 0.6 is marked
   "Please check" and the batch check says "couldn't check", never "safe". The user corrects it or
   ticks "It matches my strip". An alert needs the same batch **and** the same product or maker,
   so a misread can't attach someone else's alert.

8. **How does the NSQ pipeline avoid false alarms?**
   Same batch number alone is not enough (companies reuse numbers): also similar brand name
   (≥ 0.6), the medicine's salts in the alert's product, or the same maker. Placeholder batches
   ("Not given") are dropped. Checked against CDSCO's PDFs: 170/172. The banned-list check had a
   real false alarm on the live site (it flagged common legal medicines); we switched it off,
   added strengths/forms/releases and "maybe", and went from 18,278 flagged brands to 62 certain.

9. **Why does the location stay on the device? How does "nearest" work then?**
   Kendras are static files, one per ~156 km geohash square. The phone downloads its square and
   the 8 around it and computes Haversine distances itself; the server sees at most the rough
   square, never the point. PIN code works the same way by its first 3 digits. No server cost.

10. **How does the data stay fresh?**
    GitHub Actions on the 5th of each month: fetch (polite, cached), parse, validate (refuse if a
    table changes by > 20%), load, rebuild static files, commit → Vercel redeploys. The About page
    shows each source's last refresh. NPPA prices change yearly (April); that file is added by
    hand.

11. **How did you evaluate, and how do you avoid fooling yourself?**
    Labels typed with an empty form (no pre-fill bias), checked by a person; 1 in 4 photos frozen
    as a test set by a hash and run once (`--final`); baselines for every addition (raw OCR, exact
    name, trigram only, no abstention); evaluation uses the same code as the app.

12. **Why simulated strips for matching?**
    Only 5 labelled photos are in the brand list — too few to fit anything. Simulated strips are
    real database brands turned into OCR-like text (typos, missing parts), 1 in 4 with the brand
    hidden. Limitation: the noise model and the matcher share ideas about look-alike letters, so
    the numbers are probably optimistic; real-photo results are reported separately.

13. **Is it fast enough?**
    7.1 s median on a laptop after running two OCR workers in parallel (from 9.9 s, same accuracy);
    the target is 5 s on a phone, [PHONE] measured on a phone. Smaller images would be faster but
    lost dates in our test, so we kept accuracy.

14. **How is it accessible?**
    Lighthouse accessibility 100 on every page; axe finds 0 WCAG 2.1 AA problems on every screen
    (Playwright); 16 px text, 48 px tap targets, icon + words (never colour alone), large-text
    switch, three languages, focus moves to each new screen.

15. **What is the biggest limitation?**
    Reading brand names and ingredients on real, busy photos: 1/13 brands right on dev photos
    (4 wrong). The app stays safe (the user confirms, it abstains, 0 wrong medicines), but the user
    often types the name. Also: only 16 labelled photos.

16. **What would you do with more time?**
    Collect ~200 phone photos and freeze a real test set; a small on-device text detector for the
    brand; Hindi OCR; faster on phones; offline PWA; fresher brand data.

17. **Why Next.js / Supabase / Vercel?**
    Free tiers that cover the load; Postgres with `pg_trgm` for fuzzy search; Row Level Security
    so the public key is read-only; Vercel deploys on every push; one TypeScript codebase shares
    the AI code between the app and the evaluation.

18. **What does the "DEMO" watermark story show?**
    An upright "DEMO" on a demo strip was read as the name and matched a real "Demo 20mg Capsule"
    (same salt, same strength) at 98%. Name + composition agreeing is strong evidence, yet wrong:
    the confirm screen and the shown confidence exist for exactly this.

19. **Your test-set reading results are 0 right. Doesn't that mean it doesn't work?**
    It means Tesseract can't read those photos: two are foreign packs and the OCR's own confidence
    was 23–44%. What matters for safety held: 0 wrong medicines, and with the names a user
    confirms, Valium 10 matched and the others said "not sure". The test also caught a real defect
    (a missing back photo was counted as a confident reading, letting garbage ingredients show),
    which the dev photos had hidden. That's what a frozen test set is for; we report it rather than
    re-tune on it. With 3 photos, it is also far too small to generalise.
