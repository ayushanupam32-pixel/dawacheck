At the start of every session, read PROGRESS.md first.

# DawaCheck

A B.Tech CSE (AI & ML) class project by Ayush (GitHub `ayushanupam32-pixel`). A user photographs
the front and back of an Indian medicine strip; the phone reads it and runs five checks from public
government data: cheaper Jan Aushadhi generic, batch safety (CDSCO alerts), fair price (NPPA),
banned combinations, and the nearest Jan Aushadhi Kendra. The full brief is in
`~/Downloads/DawaCheck Build Prompt.docx` (milestones M0–M7). **The user dropped M6** (family
cabinet, duplicate-ingredient check, expiry alerts, PWA install) on 2026-10-25: do not build it;
after M5 comes M7.

- Live: https://dawacheck-psi.vercel.app (`dawacheck.vercel.app` belongs to someone else)
- Repo: https://github.com/ayushanupam32-pixel/dawacheck (public)

## Hard rules (from the brief; never break them)

- **₹0 cost.** Free tiers only: Vercel Hobby, Supabase free, GitHub Actions, OpenStreetMap.
- **Works with no AI API.** OCR runs in the browser (Tesseract.js). Any cloud vision fallback
  must sit behind `ENABLE_VISION_FALLBACK=false`.
- **Privacy.** Photos and location never leave the device. Kendra distances are computed in the
  browser from static files. No analytics.
- **Medical safety.** Never say "stop taking", "switch" or "unsafe for you"; say "show this to your
  pharmacist or doctor". Every result shows the disclaimer. When unsure, abstain. A wrong generic
  is worse than no answer: generics are matched only on an identical composition key.
- **Honest data.** Never invent medicine data, prices, batch numbers or Kendra locations. Inspect a
  new source and show a sample before writing a parser. Be polite to government sites (rate
  limit, clear User-Agent, cache), never bypass CAPTCHAs or logins.
- **Secrets.** The Supabase secret key lives only in GitHub Actions secrets. The web app uses the
  publishable key (read-only through Row Level Security).

## Tech stack

| Part                   | Tech                                                                                                                                   |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Web app (`web/`)       | Next.js 16 (App Router, Cache Components, Turbopack), React 19, TypeScript strict, Tailwind CSS 4, shadcn/ui (base-nova), lucide-react |
| On-device              | Tesseract.js 7 (OCR), Canvas (preprocessing), Leaflet + OpenStreetMap                                                                  |
| i18n                   | Built-in Next.js dictionaries (`web/messages/{en,hi,ta}.json`), not next-intl                                                          |
| Server                 | Next.js route handlers on Vercel; `@supabase/supabase-js` with the publishable key                                                     |
| Database               | Supabase Postgres (project `hmfflngfvzhmrcfskfkp`, Mumbai, free) with `pg_trgm`                                                        |
| Pipeline (`pipeline/`) | Python 3.12 via `uv`, pandas, requests, PyYAML, pytest, ruff                                                                           |
| Scheduling             | GitHub Actions (`data-refresh.yml`, 5th of each month)                                                                                 |
| Tests                  | Vitest (web), pytest (pipeline); Playwright not set up yet                                                                             |
| Package manager        | pnpm 12 (workspace), exact versions only (`saveExact`)                                                                                 |

**Next.js 16 is newer than most training data.** Before writing Next.js code, read the relevant
guide in `web/node_modules/next/dist/docs/` (see `web/AGENTS.md`). Notable: `proxy.ts` replaces
middleware; `PageProps<"/[locale]/…">` / `LayoutProps` are global types (run `next typegen`);
with Cache Components, anything that awaits request data (e.g. `connection()`) must be inside
`<Suspense>`.

## Folder structure

```
dawacheck/
├── web/                          Next.js app (Vercel Root Directory = web)
│   ├── app/[locale]/             every page is under /en, /hi or /ta
│   │   ├── page.tsx              home
│   │   ├── search/               type a brand -> generic + savings (M1)
│   │   ├── kendras/              nearest Jan Aushadhi Kendra (M2)
│   │   ├── scan/                 photo -> fields -> confirm screen (M3)
│   │   └── eval/label/           local-only labeling tool (404 in production)
│   ├── app/api/match/            GET: brand search, generic lookup; POST: scan matching (M4)
│   ├── app/api/eval/             labeling-tool backend (dev only)
│   ├── components/               client components (*-client.tsx, kendra-*, label-tool)
│   ├── lib/ai/                   AI core: preprocess, prepare (+ prepare.worker), ocr, reader,
│   │                             merge, extract, image, score,
│   │                             normalize + rerank (M4 matcher), salt-rules.json (GENERATED),
│   │                             match-weights.json (written by `pnpm eval:match --fit`)
│   ├── lib/geo/                  geohash, nearest Kendras (Haversine)
│   ├── lib/i18n/                 locale detection, dictionary loading
│   ├── lib/checks/               M5 checks, pure: batch, banned, price (+ types)
│   ├── lib/{match,find-match,run-checks,savings,supabase}.ts
│   ├── messages/                 en.json, hi.json, ta.json (same keys; a test enforces it)
│   ├── public/data/              GENERATED Kendra/PIN files (pipeline/build_static.py)
│   ├── public/demo/              generated DEMO strips (telmikind, omee) for Demo mode
│   ├── scripts/                  eval.ts (`pnpm eval`), eval-match.ts (`pnpm eval:match`),
│   │                             ocr-experiment.ts, speed-experiment.ts
│   ├── tests/                    Vitest tests; tests/fixtures/ocr-snippets.ts
│   └── proxy.ts                  redirects / to the browser's language
├── pipeline/                     Python data pipeline
│   ├── dawacheck_pipeline/       fetch_*, parse_*, normalize, synonyms.yaml, geocode,
│   │                             geohash, build_static, load_supabase
│   ├── raw/<source>/<date>/      raw downloads, committed (owner names stripped)
│   ├── cache/geocode.json        Nominatim cache, committed
│   ├── clean/                    generated CSVs (git-ignored)
│   └── tests/
├── supabase/migrations/          SQL schema (applied through the Supabase connector)
├── eval/                         labels.json, photo-sources.json, results.md; photos/ is git-ignored
├── docs/milestones/              viva notes per milestone (M0–M4)
└── .github/workflows/            ci.yml, data-refresh.yml
```

## Commands (run from the repo root)

```bash
pnpm install
pnpm dev                 # http://localhost:3000
pnpm build               # production build
pnpm test                # Vitest (web)
pnpm lint                # ESLint
pnpm typecheck           # next typegen && tsc --noEmit
pnpm format              # Prettier (format:check in CI)
pnpm eval                # evaluate the strip reader on eval/photos (dev + demo)
pnpm eval -- --final     # frozen test set only, for the final report
pnpm eval:match          # matching (M4): simulated + labelled cases; needs web/.env.local
pnpm eval:match --fit    # refit the matcher's weights and threshold (dev cases only)

cd pipeline
uv run pytest -q                                   # pipeline tests
uv run ruff check . && uv run ruff format .
uv run python -m dawacheck_pipeline.fetch_jan_aushadhi   # then parse_jan_aushadhi
uv run python -m dawacheck_pipeline.fetch_kendras        # then parse_kendras, build_static
uv run python -m dawacheck_pipeline.parse_brands
uv run python -m dawacheck_pipeline.export_rules         # after editing synonyms.yaml
```

Loading Supabase needs `SUPABASE_URL` and `SUPABASE_SERVICE_KEY`; it normally runs only in GitHub
Actions: `gh workflow run data-refresh.yml -f with_brands=true` (brands only when their parsing
changed). Local web dev needs `web/.env.local` with `SUPABASE_URL` and
`SUPABASE_PUBLISHABLE_KEY` (see `web/.env.example`).

Every push to `main` runs CI (format, lint, types, Vitest, build, pipeline ruff + pytest) and
deploys to Vercel.

## Coding conventions

- **Small, pure, tested modules.** Logic goes in pure functions (no DOM, no I/O) with unit tests;
  browser glue stays thin (`lib/ai/ocr.ts`, `components/*`). The evaluation and the app share the
  same code (`lib/ai/reader.ts`) so the numbers describe what users get.
- **Explain non-obvious logic in comments**, in plain words; the student must explain every part
  in a viva. Match the surrounding comment density and naming.
- **Refuse rather than guess.** Unclear data is marked unparsed/unknown, never filled in.
  Prefer an empty field over a wrong value. Composition keys must match exactly.
- **Accessibility.** Body text ≥ 16 px, tap targets ≥ 48 px (`min-h-12`), never colour alone
  (icon + words), real labels, `aria-live` for changing results, large-text toggle respected.
- **All user-facing text in three languages.** Add keys to `en.json`, `hi.json` and `ta.json`
  together; pass only the needed dictionary slice to client components.
- **Exact dependency versions.** pnpm 12 fails installs if a new package has an install script
  that is neither allowed nor denied: decide it in `pnpm-workspace.yaml` (`allowBuilds`).
- **Formatting:** Prettier (printWidth 100, Tailwind plugin), ruff for Python. Generated data
  (`web/public/data`, `pipeline/raw`) is excluded from Prettier.
- **Commits** end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Commit or push
  only when the user asks or the agreed plan includes it.
- **After each milestone:** write `docs/milestones/M<n>-*.md` (what was built, decisions in plain
  words, results, how to test, limitations, likely viva questions) and update PROGRESS.md.

## Environment quirks on this Mac

- `~/.config` is owned by root, so the GitHub CLI uses `GH_CONFIG_DIR=$HOME/.gh`; the repo has a
  local git credential helper set up for that.
- Vercel: use the `vercel` CLI (logged in). The Vercel connector has no access to the team.
- Supabase: the Supabase connector works (migrations, SQL, keys).
- The user finds typing into terminal tabs unreliable: give device-login codes in chat, and pipe
  copied secrets with `pbpaste` rather than asking them to paste into a prompt.
- `~/.zshrc` line 20 has an unmatched quote (harmless warning in every new shell).
