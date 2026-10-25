# M7 — Evaluation and polish

**Goal (brief):** final test-set evaluation, ablations, SUS study, accessibility pass, docs.
**Done when:** results table on the About page; Lighthouse accessibility ≥ 90.

**Status (2026-10-25):** everything that can be built is built, tested and live. Two things wait
for people, by design: **(1)** a person checks the labels (`eval/SPOT-CHECK.md`), then the final
test-set evaluation runs once; **(2)** the usability study with 15–20 users (`docs/sus/`). The
report, slides and README have marked places (**[FINAL]**, **[SUS]**) for those numbers.

The order was agreed with the user: improvements that change the reader or matcher first (the
final evaluation may run only once), then the About page, accessibility and Playwright, then docs.

## What was built

| Part                       | Where                                                                                                                      |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Faster reading             | `web/lib/ai/reader.ts` (a pass's reads start together), `ocr.ts` (2 Tesseract workers)                                     |
| Preparing photos off-page  | `web/lib/ai/prepare.ts`, `prepare.worker.ts` (Web Worker + OffscreenCanvas)                                                |
| Brand guesses              | `brandGuesses()` in `lib/ai/merge.ts`, `matchGuesses()` in `lib/find-match.ts`, `combineDecisions()` in `lib/ai/rerank.ts` |
| Real-brand demo strips     | `eval/make_demo_images.py` → `web/public/demo/{telmikind,omee}-{front,back}.jpg`                                           |
| "It matches my strip"      | `components/scan-client.tsx` (tick box under a batch marked "Please check")                                                |
| About page                 | `web/app/[locale]/about/page.tsx`, texts in `messages/*.json` → `about`                                                    |
| Generated results          | `web/lib/eval-summary.{ts,json}`, written by `pnpm eval` / `pnpm eval:match`                                               |
| Accessibility + end-to-end | `web/e2e/*.spec.ts`, `web/playwright.config.ts` (`pnpm build && pnpm test:e2e`)                                            |
| Docs                       | README, `docs/architecture.*`, `demo.gif`, report outline, slides, demo script, viva Q&A                                   |
| Usability study kit        | `docs/sus/` (tasks, questionnaire en/hi, `sus_score.py`)                                                                   |
| Label spot-check           | `eval/SPOT-CHECK.md`                                                                                                       |

## Key decisions, in plain words

**Two OCR workers, same picture size.** Tesseract already ran in its own worker; the time went
into the number of reads. Reading a pass's image versions at the same time on two workers cut
the median from 9.9 s to 7.1 s on the same 13 photos, with exactly the same fields read. A
smaller picture (1200 px) would have been 4.6 s but lost a manufacturing and an expiry date, so
we kept 1600 px: a wrong or missing expiry matters more than 2 seconds.

**Results in a fixed order whatever finishes first.** With two workers, reads finish in any
order. The reader keeps them in the order they were asked for, so the merged answer never
depends on timing (a unit test races fake reads to check this).

**Brand guesses must be confirmed by matching.** The brief says the brand is "the biggest text,
confirmed by matching". The reader now sends the 3 tallest plausible lines; a guess counts only
if the matcher accepts it under the same safety rules, and if two guesses match different
medicines, nothing is accepted. On the dev photos it changed nothing (the misses have no readable
name at all), and we say so. Word-level guesses were tried and rejected: no gain, and a generic
word like "Metformin 500" would match another company's brand.

**Demo strips from real records.** The old demo brand was made up, so Demo mode ended in "not
found". The new strips print only real values (a brand's dataset row; a real CDSCO alert's
batch, dates and maker), are clearly marked DEMO, and show a match + savings and a red alert.

**A real wrong match, found by testing the demo.** An upright red "DEMO" mark was read as the
name and matched a real "Demo 20mg Capsule" (same salt and strength) at 98%. The mark is now
sideways. Lesson: name and composition agreeing is strong evidence, and still not proof; this is
why the user confirms and sees the confidence.

**The user must be able to confirm a batch.** A correctly read batch with a "1" in it is always
marked unsure, and retyping it changed nothing, so its alert check could never run. Now "It
matches my strip" confirms it.

**Numbers on the About page are generated.** The evaluation scripts write a small JSON file the
page reads, so nobody types a number in by hand, and the final run replaces the dev numbers by
itself. Demo strips are kept out of the metrics.

**Accessibility beyond the first screen.** Lighthouse only sees a page as it loads; most of
DawaCheck appears after you act. Playwright drives every flow and runs axe (the same rules) on
each new screen. A keyboard pass found one real problem: after reading, focus fell back to the
top of the page; it now moves to the new screen's heading.

## Results

| Measure (brief target)               | Result                                                                |
| ------------------------------------ | --------------------------------------------------------------------- |
| Speed per strip (≤ 5 s p95 on phone) | 7.1 s median, 10.8 s p95 on a laptop (was 9.9 / 16.8); phone: [FINAL] |
| Lighthouse accessibility (≥ 90)      | 100 on every page tested                                              |
| axe WCAG 2.1 AA                      | 0 violations, 5 pages × 3 languages + 4 interactive screens           |
| Playwright end to end                | 19 tests pass (both demos, search, Kendras, accessibility)            |
| Brand guesses (ablation)             | no change on dev photos: 1/5 right, 0 wrong, with or without          |
| SUS (≥ 70)                           | [SUS]                                                                 |
| Final test set                       | [FINAL]                                                               |

## How to test it

- `pnpm build && pnpm test:e2e` (needs `web/.env.local`): 19 tests, ~15 s.
- Live: Scan → "Demo: blood-pressure strip" → Find; "Demo: strip with a quality alert" → type
  "Omee", tick "It matches my strip" → Find → red alert. About page: refresh dates + results.
- `python3 docs/sus/sus_score.py docs/sus/responses.csv` once responses exist.

## Limitations

- Final test set is only 3 photos; labels typed by the developer until a person checks them.
- Not yet measured on a phone; 7 s on a laptop misses the 5 s target.
- In the browser the OCR misses the short "OMEE" name on the demo strip (the presenter types it).
- Playwright runs locally only (CI lacks the database's publishable key as a secret).
- Hindi/Tamil texts (incl. the SUS Hindi version) not reviewed by a native speaker.

## Viva questions this milestone answers

- _How did you make it faster without making it worse?_ Measured first; parallel reads on two
  workers; rejected the smaller image because it lost dates.
- _Did brand guesses help?_ Not on our photos, and we report that; they're safe by construction.
- _How do you know the app is accessible?_ Lighthouse 100, axe on every screen via Playwright,
  and a keyboard pass that found and fixed a focus problem.
- _Where do the About page's numbers come from?_ Written by the evaluation scripts; never typed.
- _What would make the final numbers trustworthy?_ A person-checked label set, a bigger frozen
  test set, one final run.
