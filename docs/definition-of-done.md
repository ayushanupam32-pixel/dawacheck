# Definition of done: audit (2026-10-26)

The brief's checklist, item by item, with the evidence. **Met**, **partly** or **not met**;
nothing is ticked without a test, a run or a file to point at.

| #   | Brief's item                                                                                | Status     | Evidence / what is missing                                                                                                                                                                                                                                                                                   |
| --- | ------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | All six checks work from a photo, from a typed name, and in Demo mode                       | **Partly** | **Five** checks (the sixth, family-cabinet duplicates, was M6, dropped by the user). Photo: 18/18 demo strips through the upload flow (`demo/VERIFIED.md`). Typed name: all five since 2026-10-26 (before, only the generic; Playwright `typed search runs all five checks`). Demo mode: `e2e/demo.spec.ts`. |
| 2   | Works on a mid-range Android phone and on desktop; installable as a PWA                     | **Partly** | Desktop Chrome and a phone-sized screen (Pixel 7 emulation) in every Playwright test. **Not yet timed on a real Android phone** ([PHONE]). **No PWA** (it was M6, dropped).                                                                                                                                  |
| 3   | English, Hindi and Tamil interface                                                          | **Met**    | `web/messages/{en,hi,ta}.json`; a unit test fails if keys differ or a text is empty; axe passes on every page in all three. Hindi/Tamil written by Claude: a native speaker should review.                                                                                                                   |
| 4   | Monthly data refresh runs automatically and shows "last updated" dates                      | **Partly** | `.github/workflows/data-refresh.yml`, cron `30 3 5 * *`; 7 manual runs succeeded (latest 2026-10-25). The **first scheduled run is due 5 Nov 2026**, so "automatically" isn't observed yet. Dates: About page (each source) and every check row.                                                             |
| 5   | Evaluation results with baselines published on the About page and in the README             | **Met**    | About page (generated from `web/lib/eval-summary.json`), README "Results", `eval/results*.md`, `eval/match-results.md`; baselines: raw Tesseract, exact name, trigram only, no abstention.                                                                                                                   |
| 6   | No paid service used; total running cost ₹0                                                 | **Met**    | Vercel Hobby, Supabase free, GitHub Actions, OpenStreetMap; no API keys for paid services; no cloud AI.                                                                                                                                                                                                      |
| 7   | No photos, locations or cabinet data leave the device (verified in the browser Network tab) | **Met**    | `web/e2e/privacy.spec.ts` records every request: a photo scan sends only two small JSON calls to `/api/match` and `/api/checks` (no image bytes); GPS Kendra search sends nothing and no URL contains the coordinates. Both fail when a leak is planted. No cabinet (M6).                                    |
| 8   | Disclaimer on every result; app abstains when unsure                                        | **Met**    | Disclaimer in the result card and every page footer (Playwright checks it); abstention: `decide()` + safety rules, unit tests, 3.3% wrong of answers vs 26.3% without (simulated test), 0 wrong medicines on real photos.                                                                                    |
| 9   | Tests and CI green; README, report, slides, demo script and viva notes complete             | **Partly** | CI green (format, lint, types, 406 Vitest, build, 197 pytest); 22 Playwright tests pass locally (not in CI: needs the publishable key as a GitHub secret). README, demo script, viva notes done. Report and slides: **outlines** (what the brief asks Claude for); writing them is the student's.            |

## Also from the brief

- Live app on Vercel with an in-app Demo mode labelled "Demo": **met** (two demo buttons) + `demo/`
  with 18 strips.
- Lighthouse accessibility ≥ 90: **met** (100 on every page tested).
- SUS ≥ 70 with 15–20 users: **not yet run** (kit in `docs/sus/`).
- Speed p95 ≤ 5 s on a mid-range Android: **not measured**; laptop 7.1 s median.
- Matching: top-1 ≥ 85% **met** (85.9% simulated test); top-3 ≥ 95% **not met** (90.2%);
  abstention ≤ 20% **not met** (28%).
- ~200 photos / 50 frozen test photos: **not met** (16 / 3).
