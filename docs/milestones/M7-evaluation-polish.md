# M7 — Evaluation and polish

**Goal (brief):** final test-set evaluation, ablations, SUS study, accessibility pass, docs.
**Done when:** results table on the About page; Lighthouse accessibility ≥ 90.

**Status (2026-10-25):** everything that can be built is built, tested and live. Two things wait
for people, by design: **(1)** a person checks the labels (`eval/SPOT-CHECK.md`), then the final
test-set evaluation runs once; **(2)** the usability study with 15–20 users (`docs/sus/`). The
report, slides and README have marked places (**[SUS]**, and **[PHONE]** for phone timing) for
those numbers. **Update:** the user checked the labels (no corrections) and the final evaluation
ran once on 2026-10-25; see "Final test-set run" below.

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
Medicheck appears after you act. Playwright drives every flow and runs axe (the same rules) on
each new screen. A keyboard pass found one real problem: after reading, focus fell back to the
top of the page; it now moves to the new screen's heading.

## Results

| Measure (brief target)               | Result                                                                                                            |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| Speed per strip (≤ 5 s p95 on phone) | 7.1 s median, 10.8 s p95 on a laptop (was 9.9 / 16.8); phone: [PHONE]                                             |
| Lighthouse accessibility (≥ 90)      | 100 on every page tested                                                                                          |
| axe WCAG 2.1 AA                      | 0 violations, 5 pages × 3 languages + 4 interactive screens                                                       |
| Playwright end to end                | 33 tests pass (both demos, search + checks, Kendras, privacy, theme, reduced motion, axe light + dark)            |
| Brand guesses (ablation)             | no change on dev photos: 1/5 right, 0 wrong, with or without                                                      |
| SUS (≥ 70)                           | [SUS]                                                                                                             |
| Final test set (3 photos, run once)  | reading: 0 fields right, wrong brand 1/3, wrong ingredients 2/2; matching with confirmed names 1/2 right, 0 wrong |

## Final test-set run (2026-10-25)

Labels checked by the user (no corrections), then `pnpm eval -- --final` and
`pnpm eval:match -- --final`, once. Results in `eval/results-final.md` and the "TEST (frozen)"
section of `eval/match-results.md`; the About page shows them (`readerFinal`).

- **Reading:** no field right on any of the 3 photos; wrong values shown: brand 1/3 (a French
  salt line), ingredients 2/2 (garbage like "Cee 8000 mg"); plain OCR read 1 of 2 pack sizes.
  OCR confidence was 23–44%: two are foreign packs (French Augmentin, German Sortis) photographed
  at an angle.
- **Matching** (names as a user would confirm them): Valium 10mg matched at 86% (right), Augmentin
  abstained (sold in several strengths, none read), Sortis correctly not in the list: 1/2 right,
  0 wrong. Baselines that always answer: 67–100% of answers wrong.
- **Fully automatic:** 0 right, 0 wrong (all abstained).
- **Defect found:** for a photo without a back side, `mergeReadings` uses a placeholder back
  reading with confidence 100, so `(front + back) / 200` doubles a weak front's score (24% → 62%)
  and garbage passes `MIN_SHOW`. The dev set hid this. The test numbers stand as measured.
- **Fixed after the final run** (checked on dev photos only, `--final` not re-run): with no
  back photo, only the front's confidence counts (`mergeReadings`; 2 new unit tests, which fail
  on the old code). Dev photos: wrong values shown 8 → 6; batch, dates, MRP, pack size, speed
  and every automatic match unchanged; the correct but low-confidence "Suhagra-100" is no longer
  pre-filled, but its automatic match still succeeds through the brand guesses (their first real
  win). All 19 Playwright tests pass.

## Demo strips (after the final run)

`demo/` holds 18 generated strips (front, back, zoomed stamp) by feature: 10 everyday medicines,
4 expensive ones (two above the NPPA ceiling), 2 real CDSCO alert batches, 2 banned medicines.
Values come from real records (`demo/strips.json`). `web/scripts/verify-demo-strips.ts` puts
each through the website's upload flow and checks the match and every result row: **18/18**.

Building them found two things:

- **A real extraction bug, fixed:** a salt printed over two lines ("Amlodipine Besilate IP" /
  "eq. to Amlodipine 5 mg", the usual Indian format) was read as the salt "To Amlodipine", so
  the matcher found nothing and abstained. The salt line is now joined with an "eq. to /
  equivalent to" line, and "to / eq / equivalent / anhydrous" are dropped from salt names (5 new
  unit tests). No change on the dev photos (none has that layout readable); the test set is not
  re-run.
- **A matcher weakness, noted (not fixed):** "CETZINE 10" matched another company's "Cetzin
  10mg" at 93%, because GSK's Cetzine 10 is not in the 2022 dataset and the names look alike.
  The confirm screen shows the maker, but the matcher has no way to know a brand is missing.
  "Azithral 500" also abstains because of a look-alike sibling ("Azithral 5D"): correct caution.

## How to test it

- `pnpm build && pnpm test:e2e` (needs `web/.env.local`): 33 tests, ~35 s.
- Live: Scan → "Demo: blood-pressure strip" → Find; "Demo: strip with a quality alert" → type
  "Omee", tick "It matches my strip" → Find → red alert. About page: refresh dates + results.
- `python3 docs/sus/sus_score.py docs/sus/responses.csv` once responses exist.

## Limitations

- Final test set is only 3 photos; labels typed by the developer until a person checks them.
- Not yet measured on a phone; 7 s on a laptop misses the 5 s target.
- In the browser the OCR misses the short "OMEE" name on the demo strip (the presenter types it).
- (Fixed 2026-10-26: Playwright now runs in CI, with the read-only publishable key as a
  GitHub secret.)
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

## UI/UX redesign and dark mode (2026-10-26)

Asked for by the user after the final evaluation; it changes how things look, not what the reader
or matcher do, so the evaluation numbers are unaffected.

**What changed**

- **One header on every page** (`components/site-header.tsx`): brand, Scan / Search / Kendras /
  About with the current page marked, language, large text, theme. On phones these move into a
  menu sheet (Base UI Dialog: focus stays inside, Escape closes it). Switching language now keeps
  you on the same page. A "skip to main content" link comes first for keyboard users.
- **One footer** (`site-footer.tsx`): the medical disclaimer first, the privacy line, links, data
  credits and the Skiper UI credit. The per-page back links and footers are gone.
- **Theme: light, dark or "same as phone"** (default). `lib/theme.ts` holds the logic (unit-tested)
  and a tiny script that applies the saved choice before the first paint, so there is no flash.
  `components/theme-toggle.tsx`: a header menu (Base UI Menu, keyboard-friendly) and a three-way
  switch in the phone menu. "Same as phone" follows the operating system live.
- **Design system** (`app/globals.css`, `components/ui/field.tsx`): one accent (first the brand teal; replaced by Ink + Marigold in the second pass below),
  cool neutrals, status colours tuned separately for light and dark, input borders with 3:1
  contrast, soft tinted shadows, one corner-radius rule, shared input, panel and skeleton styles.
  Noto Sans stays: it is the one family that matches across Latin, Devanagari and Tamil.
- **Pages:** a new home page (headline and the two main actions next to a real demo strip; the five
  checks, led by a real price example from our data: Telmikind 40 at ₹3.86 a tablet vs ₹1.24 for
  the Jan Aushadhi equivalent; ways to start). Scan has a progress bar for the three photos and a
  checklist while reading; results show skeletons while loading; the result card uses status chips
  and gives a government alert a tinted band with a red edge; About has a sticky contents list.

**Skiper UI** (https://skiper-ui.com, free tier; its licence asks for the footer credit): the
sun/moon icon (skiper04), the circle reveal when switching theme (skiper26, here with our own small
theme store instead of next-themes), the rolling savings number (skiper37, Number Flow) and the
external-link style (skiper40). Not used: the letter-by-letter text animations, because splitting
text into single characters breaks Hindi and Tamil letters, which are built from several
characters. New dependencies: `framer-motion` 14.1.0, `@number-flow/react` 0.6.2.

**Decisions, in plain words**

- **Motion is small and has a reason:** the theme reveal shows what changed, the rolling number
  shows the saving update as you type, panels fade in once. Everything is off with "reduce motion".
  The result card does not fade, because it refreshes on every keystroke in the batch box and would
  flicker.
- **No em-dashes in the interface text** and plain " | Medicheck" in page titles.
- **Buttons may wrap to two lines** (still at least 48 px tall): a Tamil label that cannot wrap made
  the page wider than a 320 px phone.

**How it was checked**

- Playwright now runs axe in dark mode too (5 pages, the result card with a red alert, the Kendra
  list) and tests the theme menu (dark survives a reload; "same as phone" follows the system) and
  the language switch. 31 tests, 3 runs in a row green. The axe helper waits for entrance
  animations to finish, or it measures half-faded text.
- A responsive sweep: every page in all 3 languages, 8 widths from 320 to 1920 px, both themes
  (240 views): no sideways scrolling, no tap target under 44 px.
- Lighthouse accessibility, re-run after the redesign: 100 on /en, /en/scan, /en/search,
  /en/kendras, /en/about, /hi/about, /ta.
- Found while checking: Turbopack's build cache once served the old stylesheet; delete `web/.next`
  before `pnpm build` when checking CSS.

**Limitations:** the new Hindi and Tamil texts were written by Claude and need a native speaker's
review, like the rest; Lighthouse was run on a laptop, not a phone.

## Second pass: Ink + Marigold and motion (2026-10-26)

The user found the first redesign too plain: the demo-strip photo in the hero looked cheap, there
was little motion on entering the site, and the teal palette looked generic. They chose a palette
from three options: **Ink + Marigold**.

**Palette.** Deep ink blue for text and for "stages" (the hero and the footer), marigold as the one
accent. Marigold is a fill colour (buttons, highlights) with ink text on it; text and icons on the
page use a deeper marigold token, `--brand`, that passes 4.5:1. The warning colour moved to a rust
orange so it is never confused with the brand. (Fonts, final: Inter for English, Anek for Hindi and
Tamil; see the end of this note.) At first, headings used Bricolage Grotesque for Latin letters
(Hindi and Tamil headings still use Noto, which matches those scripts).

**Home page, rebuilt.**

- The demo-strip photo is gone. The hero is a deep-ink stage with two slowly drifting lights, a
  fine dot grid and a marigold glow that follows the mouse (Skiper UI skiper61). The headline rises
  word by word, and the highlighted phrase ("government data") gets a hand-drawn underline that
  draws itself (the idea of skiper19). Next to it, a **live check** of the demo strip: the five
  checks tick in one by one and the saving counts up. Every value in it is a real result for that
  strip (₹78.63 a month at one tablet a day, shown as ₹79), marked DEMO.
- Real counts from the latest data refresh (Kendras, CDSCO alerts, brands, NPPA prices) count up
  as they come into view (skiper37, Number Flow). They are read from `data_sources`, never typed in.
- The five checks build into a **card stack** while scrolling (skiper16): each card pins and the
  ones behind it shrink. Marigold, ink and three quieter cards, each with its data source.
- "Same medicine. Less money." assembles letter by letter as it scrolls in (skiper31), above the
  real price example (₹3.86 vs ₹1.24 a tablet).
- The footer is an ink stage too, so every page ends on the brand colours. Inner page headers rise
  in on load with a marigold icon tile.

**How the motion is built (`components/motion.tsx`, `app/globals.css`).** Above-the-fold entrances
are pure CSS animations, so they play as soon as the page appears without waiting for scripts.
Scroll reveals use an IntersectionObserver and only hide content once JavaScript has run (a `js`
class set by the pre-paint script). Scroll-linked pieces use framer-motion. Only transform and
opacity are animated. With "reduce motion" everything is still: no entrance animation, reveals
shown at once, the card stack a plain list (an e2e test checks this). **Letters are split with
`Intl.Segmenter`** (`lib/segment.ts`, unit-tested), not `split("")`, which would cut a Hindi or
Tamil letter from its vowel sign; this is what made letter animations possible in all three
languages.

**Checks.** 416 Vitest (new `segment.test.ts`), 33 Playwright (new `motion.spec.ts`: reduced
motion, live numbers, headline), axe 0 violations in light and dark; responsive sweep of 240 views
clean after two fixes (the Tamil hero and Search headings were too wide at 320-375 px; headings now
scale with the screen); Lighthouse accessibility 100 on 7 pages. Found by axe: the scroll letters
first faded from 15%, which is unreadable; they now move at full strength.

## Fonts (2026-10-26)

After the second pass the user found the fonts basic. A web search of current pairings found only
Latin-only fonts, so the first choice was **Anek** (Ek Type, Mumbai), the one family designed
together for Latin, Devanagari and Tamil. The user then asked for an Apple-like look. Apple's San
Francisco cannot be used on a website (its licence) and covers neither Hindi nor Tamil, so after a
side-by-side comparison the user chose **Inter** for English (its optical-size axis gives display
headings tighter shapes, like SF Pro Display) and **Anek Devanagari / Anek Tamil** for Hindi and
Tamil. All fonts are SIL OFL and served from our own site by `next/font` (no request to Google from
the visitor's browser). The project was also renamed from DawaCheck to **Medicheck** in everything
users see; the repository, the Vercel address and internal identifiers keep the old name.
