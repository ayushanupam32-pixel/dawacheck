# M1 — Generic lookup

**Goal:** type a brand name and see the Jan Aushadhi generic with exactly the same composition,
with per-unit prices and monthly savings.

**Done when:** typing a brand shows the correct Jan Aushadhi generic for 20 test medicines.

## What was built

| Part         | File                                                   | What it does                                                                         |
| ------------ | ------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| Fetch        | `pipeline/dawacheck_pipeline/fetch_jan_aushadhi.py`    | Downloads the official PMBI Product & MRP list (2,439 products) in 2 polite requests |
| Rules        | `pipeline/dawacheck_pipeline/synonyms.yaml`            | Spellings, salt suffixes, dosage forms, release types: editable, commented           |
| Normalize    | `pipeline/dawacheck_pipeline/normalize.py`             | Turns any source's text into the same `composition_key`                              |
| Parse JA     | `pipeline/dawacheck_pipeline/parse_jan_aushadhi.py`    | Splits names like "A 100mg and B 325mg Tablets" into ingredients                     |
| Parse brands | `pipeline/dawacheck_pipeline/parse_brands.py`          | Reads the A-Z Medicine Dataset of India (254k rows)                                  |
| Load         | `pipeline/dawacheck_pipeline/load_supabase.py`         | Idempotent upserts into Supabase; refuses if counts move > 20%                       |
| Schedule     | `.github/workflows/data-refresh.yml`                   | 5th of every month: fetch → parse → validate → load → commit raw data                |
| Search       | `supabase/migrations/20261024000000_search_brands.sql` | Typo-tolerant trigram search                                                         |
| API          | `web/app/api/match/route.ts`                           | `?q=` → brand candidates, `?brand=` → exact generics                                 |
| Savings      | `web/lib/savings.ts`                                   | Per-unit comparison and monthly saving (unit-tested)                                 |
| Page         | `web/app/[locale]/search/page.tsx`                     | The search page in English, Hindi and Tamil                                          |

## The data

**Jan Aushadhi list.** The official page loads its table from a public JSON endpoint. Like every
visitor's browser, the fetcher first asks for an anonymous guest token (no login), then requests
the full list, the same request the page's own Download button sends. It runs once a month.

**Brand dataset.** A-Z Medicine Dataset of India (Kaggle, CC BY-SA 4.0, November 2022). The
original zip is stored in `pipeline/raw/brands/2022-11-17/` with a `SOURCE.md` (author, license,
checksum). Because of the ShareAlike license, our brand tables are also CC BY-SA.

## How a match works

Every product, from any source, becomes one **composition key**:

```
"Glycomet GP 1 Tablet"   -> glimepiride:1:mg|metformin:500:mg#tablet#ir
"Glimepiride 1mg + Metformin 500mg Tablets" (Jan Aushadhi) -> the same key
```

The key is: salts sorted alphabetically (so order doesn't matter), each with its strength in a
canonical unit (500 mcg = 0.5 mg; 125 mg per 5 ml = 25 mg/ml), then the dosage form, then the
release type. **A generic is suggested only when the keys are identical.** We never suggest the
same salt at a different strength, form or release.

## Key decisions, in plain words

**Strict matching, on purpose.** Your spec says a wrong generic is worse than no answer. So the
parser refuses anything unclear: kits of separate tablets, strength ranges ("13-15mg"), names
with two dosage forms. On the Jan Aushadhi list, 1,882 of 2,439 names parse; most of the rest are
surgical items. Coverage for the target users is high: anti-diabetic 139/148, heart 296/304,
thyroid 13/13.

**Release type is part of the key.** Metformin 500 mg extended-release is not interchangeable
with plain metformin 500 mg. "Glycomet 500 SR" matches only the prolonged-release generic.

**Medicines that are always gastro-resistant.** Pantoprazole, rabeprazole, esomeprazole,
omeprazole and lansoprazole tablets are always coated (acid destroys them). Brand records often
omit the word, so a rule in `synonyms.yaml` adds it. This recovered about 9,900 brands, including
"Pan 40". Aspirin is deliberately excluded because plain aspirin tablets exist.

**The two-ingredient problem.** The brand dataset keeps at most two ingredients per medicine,
so "Telma-AM H" (three ingredients) looks like a two-ingredient medicine. We can't tell from the
data, so two-ingredient brands get `composition_complete = false`, and the app asks _"Does your
strip list exactly these ingredients, and nothing else?"_ before showing any generic. "No, or not
sure" gives: "Couldn't match confidently — please check with your pharmacist."

**Old prices are never shown as today's.** Dataset prices are from November 2022. They only
pre-fill the "MRP printed on your strip" box, with a note asking the user to correct it.
Savings are computed from what the user enters.

**Typo-tolerant search with abstention.** PostgreSQL's `pg_trgm` compares 3-letter pieces of
words, so "glycomt" still finds "Glycomet". Results below a score of 0.35 are hidden, and if
nothing passes, the app says it couldn't find the name rather than guessing. The user always
picks their medicine from a list; nothing is auto-selected.

**Security.** The website reads Supabase with the _publishable_ key; Row Level Security allows
only `SELECT`, so the key cannot change data. The _secret_ key exists only as a GitHub Actions
secret, used by the monthly pipeline.

**Monthly refresh you can trust.** The loader uses stable source ids and upserts, so running it
twice changes nothing. Products that leave the official list are deleted. If the new list is more
than 20% bigger or smaller than what is live, the job fails and the old data stays.

## Results

Data loaded (October 2026): 1,627 priced Jan Aushadhi generics, 241,046 brands, 1,736 salts.
**124,781 brands still sold have an exact Jan Aushadhi generic.**

20-medicine check (common chronic-disease brands):

| Result                                                               | Count | Brands                                                                                                                                                                                          |
| -------------------------------------------------------------------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Correct generic                                                      | 16    | Telma 40, Telma H, Amlong-A, Thyronorm 25, Thyronorm 50, Glycomet 500 SR, Janumet 50/500, Galvus Met 50/500, Amaryl 1, Rosuvas 10, Storvas 20, Clopilet, Dolo 650, Losar 50, Cilacar 10, Pan 40 |
| No generic shown (safe miss)                                         | 2     | Ecosprin 75 (record doesn't say "coated"), Met XL 50 (47.5 mg succinate vs 50 mg)                                                                                                               |
| Exact name not in the dataset; search lists close names to pick from | 2     | Amlong 5, Atorva 10                                                                                                                                                                             |
| **Wrong generic**                                                    | **0** |                                                                                                                                                                                                 |

## How to test it

```bash
pnpm dev
```

1. Open http://localhost:3000/en/search, type `telma 40`, pick **Telma 40 Tablet**. You should see
   Telmisartan Tablets IP 40mg at ₹12.38 for 10 and "Save ₹209 a month" (with ₹122.98 for 15).
2. Type `telma ln`, pick **Telma-LN 40**: you get the "Please check your strip" question first.
   Answer "No, or not sure": no generic is shown.
3. Type `zzqx`: "Couldn't find this name confidently".
4. Try `/hi/search` and `/ta/search`.
5. `pnpm test` (21 tests) and `cd pipeline && uv run pytest` (94 tests).

## Limitations (say these in the viva before they ask)

- Brand data is from November 2022; new brands since then are missing.
- The two-ingredient limit means some combinations need the user's confirmation.
- Some correct matches are missed when a record leaves out the release type (Ecosprin).
- The search threshold (0.35) was set by hand; M4 tunes it on the evaluation set.

## Viva questions this milestone answers

- _Why not match on salt name only?_ Different strengths, forms and release types are different
  medicines. Matching on salts alone could suggest the wrong one.
- _How do you know a generic is the same medicine?_ Identical composition key: same salts, same
  strengths in canonical units, same form, same release type.
- _What if the data source changes format?_ The parser marks unclear rows "unparsed", and the
  loader refuses a ±20% change, so bad data never replaces good data.
- _Why is the dataset's price not used for savings?_ It is from 2022. The user's strip price is
  the only current price we have.
