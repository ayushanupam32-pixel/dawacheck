# DawaCheck

Photograph a medicine strip and get six checks from public Indian government data: a cheaper
Jan Aushadhi generic, batch safety alerts, fair price, banned combinations, duplicate
ingredients in your family's medicines, and the nearest Jan Aushadhi Kendra.

> DawaCheck gives information from public government data. It is not medical advice. Always
> consult your doctor or pharmacist before changing any medicine.

**Live:** https://dawacheck-psi.vercel.app

**Status:** M0 (setup), M1 (type a brand → cheaper Jan Aushadhi generic) and M2 (nearest
Jan Aushadhi Kendra, computed on your phone) done. See
[docs/milestones](docs/milestones) for what each milestone built and why.

## Repository layout

```
dawacheck/
├── web/                  Next.js app (deployed to Vercel)
│   ├── app/[locale]/     Pages; every URL starts with /en, /hi or /ta
│   ├── lib/i18n/         Language detection and translation loading
│   ├── messages/         English, Hindi and Tamil text
│   └── tests/            Vitest unit tests
├── supabase/migrations/  Database schema (Postgres + Row Level Security)
├── docs/                 Milestone notes, architecture, report material
└── .github/workflows/    CI (lint, type-check, test, build on every push)
```

Coming in later milestones: `pipeline/` (Python data pipeline), `eval/` (evaluation harness).

## Run it locally

Needs Node 24 and pnpm 12.

```bash
pnpm install
pnpm dev          # http://localhost:3000
```

Other commands, all run from the repo root:

| Command          | What it does                                       |
| ---------------- | -------------------------------------------------- |
| `pnpm test`      | Unit tests (Vitest)                                |
| `pnpm lint`      | ESLint                                             |
| `pnpm typecheck` | Generates route types, then TypeScript strict mode |
| `pnpm format`    | Prettier                                           |
| `pnpm build`     | Production build                                   |

## Privacy

Photos are read on the device and never uploaded. Your location never leaves the device.
The family medicine cabinet is stored only in your browser. No analytics.

## Cost

₹0. Vercel Hobby, Supabase free tier, GitHub Actions and OpenStreetMap only.
