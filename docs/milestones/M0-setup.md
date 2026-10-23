# M0 — Setup

**Goal:** a live home page and green CI, so there is always something to demo.

## What was built

- A **pnpm monorepo**. The root `package.json` runs scripts in `web/`; `pipeline/` (Python)
  will sit next to it in M1. One repo, one CI, one place to look.
- **Next.js 16** app in `web/` with TypeScript strict mode, Tailwind CSS 4 and shadcn/ui.
- **Three languages** (English, Hindi, Tamil) with URLs like `/hi`. `web/proxy.ts` sends a
  visitor who opens `/` to their browser's preferred language.
- A **home page** with the three ways to start a check (marked "Coming soon"), the list of six
  checks, the privacy line and the medical disclaimer.
- A **large-text toggle** that scales the whole page to 125%.
- The **database schema** in `supabase/migrations/`, with read-only Row Level Security.
- **CI** in `.github/workflows/ci.yml`: format check, lint, type-check, unit tests, build.

## Key decisions, in plain words

**Built-in Next.js dictionaries instead of `next-intl`.** The build prompt lists `next-intl`.
Next.js 16 now has a documented pattern for this: one JSON file per language, loaded on the
server by `lib/i18n/dictionaries.ts`. It needs no extra library, and translations never reach
the browser's JavaScript, which keeps the app light on a cheap phone. A unit test fails if Hindi
or Tamil is missing any key that English has. If we later need features like plurals, we can
switch to `next-intl` with little change.

**How the language is picked.** Browsers send an `Accept-Language` header such as
`ta-IN,ta;q=0.9,en;q=0.8`. `pickLocale()` sorts entries by their `q` weight and returns the first
language we support. It is a pure function, so it has its own unit tests.

**Pages are static files.** `generateStaticParams` makes Next.js render `/en`, `/hi` and `/ta`
at build time. Vercel serves them from its CDN, with no server work per visit.

**Noto fonts for three scripts.** Noto Sans, Noto Sans Devanagari and Noto Sans Tamil are listed
in one font stack. The browser picks the right font per character, so mixed text looks consistent.

**Accessibility from day one.** Body text is at least 16px. Every tap target is at least 48px.
Icons are hidden from screen readers (`aria-hidden`) because the words next to them already say
the same thing. The large-text toggle is a real `role="switch"` with `aria-checked`. A small
inline script applies the saved large-text setting before the page paints, so the page does not
jump in size.

**Row Level Security (RLS).** Supabase exposes tables through a public API. RLS is switched on
for every table, with one policy that allows reading. There is no policy for insert, update or
delete, so the public key cannot change any data. Only the pipeline's service key (kept in
GitHub secrets) can write, because the service role bypasses RLS.

**`pg_trgm` in the `extensions` schema.** Trigram similarity powers fuzzy brand search in M4.
Supabase recommends keeping extensions out of the `public` schema.

**Pinned versions.** Every dependency has an exact version (no `^`), and `pnpm-lock.yaml` is
committed, so a build next month uses the same code as today.

## How to test it

```bash
pnpm dev
```

1. Open http://localhost:3000. You land on `/en`, `/hi` or `/ta` depending on your browser
   language.
2. Switch languages with the buttons. Check that Hindi and Tamil text render properly.
3. Turn on **Large text**, reload the page, and check it stays on.
4. In Chrome DevTools, use the device toolbar at 375px wide. Nothing should scroll sideways.
5. Run `pnpm test`. All 12 tests should pass.

## Viva questions this milestone answers

- _Why are translations loaded on the server?_ So the browser downloads only the HTML for one
  language, not all three dictionaries.
- _Can someone change your data with the key in the browser?_ No. RLS allows only `select` for
  the public roles.
- _What does CI check?_ Formatting, lint rules, types, unit tests, and that the app builds.
