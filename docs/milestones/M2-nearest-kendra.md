# M2 — Nearest Jan Aushadhi Kendra

**Goal:** show the 3 nearest Jan Aushadhi Kendras with distance, address, a Call button and a
Directions button, plus a map, without the user's location ever leaving their phone.

**Done when:** correct nearest Kendras for 5 test locations; location never sent to the server.

## What was built

| Part         | File                                                                    | What it does                                                                              |
| ------------ | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Fetch        | `pipeline/dawacheck_pipeline/fetch_kendras.py`                          | Downloads the official Kendra list, one request per state (36), 2 s apart                 |
| Parse        | `pipeline/dawacheck_pipeline/parse_kendras.py`                          | Cleans rows, checks every coordinate, fixes the bad ones                                  |
| Geocode      | `pipeline/dawacheck_pipeline/geocode.py`                                | OpenStreetMap Nominatim, 1 request/second, cached in `pipeline/cache/geocode.json`        |
| Geohash      | `pipeline/dawacheck_pipeline/geohash.py`, `web/lib/geo/geohash.ts`      | Same algorithm in Python and TypeScript, tested on the same values                        |
| Static files | `pipeline/dawacheck_pipeline/build_static.py`                           | `web/public/data/kendras/<cell>.json`, `index.json`, `web/public/data/pins/<prefix>.json` |
| Nearest      | `web/lib/geo/nearest.ts`                                                | Haversine distance, top 3, "nothing within 10 km" flag                                    |
| Page         | `web/app/[locale]/kendras/page.tsx`, `web/components/kendra-finder.tsx` | Location or PIN, the list, Call and Directions buttons                                    |
| Map          | `web/components/kendra-map.tsx`                                         | Leaflet + OpenStreetMap, loaded only when the user taps "Show on map"                     |

## The data

The "Locate Kendra" feature on janaushadhi.gov.in loads Kendras per state from a public JSON
endpoint (same anonymous guest token as the product list). It refuses an "all India" request,
so the fetcher asks for each of the 36 states and UTs in turn.

October 2026: **21,541 Kendras**, every one with a store code, address, district, state and PIN;
21,527 with a phone number. Each row also has the owner's personal name, which we do not copy.

## Key decisions, in plain words

**Official coordinates instead of geocoding every address.** The spec planned to geocode all
addresses with Nominatim. But the official list already has coordinates for 99.9% of Kendras,
and Nominatim could not read most Indian addresses in our test (about 1 in 30 succeeded).
Geocoding 21,541 addresses at 1 per second would also take 6 hours a month. So we trust the
official coordinates after checking them, and geocode only the few that fail the checks.
Every Kendra records where its location came from: `geo_precision` = `official`, `address`
or `pincode`.

**Checking every coordinate.** A coordinate is not trusted if it is missing, outside India,
more than 600 km from the middle of its own state, or more than 100 km from the middle of its own
district. "Middle" means the median of the other Kendras there, which a few wrong points cannot
drag away. The district check matters: one Kendra registered in Ganganagar (Rajasthan) had
coordinates in central Delhi, 349 km away, so Connaught Place users would have been told it was
0.5 km away. A unit test now covers exactly this case.

Result: 21,273 official, 3 fixed from the address, 175 placed at the centre of their PIN code area
(marked "Location is approximate"), 90 (0.4%) left off the map rather than shown in a wrong place.

**How "nearest" works without sending the location anywhere.**

1. India is cut into squares about 156 km wide. Each square has a 3-letter **geohash** name, for
   example `ttn` for the Delhi area.
2. The pipeline writes one small file per square (`/data/kendras/ttn.json`, 182 files, the
   biggest 192 KB) plus `index.json` listing which squares have Kendras.
3. The phone works out its own square and the 8 around it, downloads only those files, and
   calculates the distance to each Kendra itself (Haversine formula). The 3 closest are shown.

The server only ever sees which ~156 km squares were downloaded, never the exact point. Loading
the 8 neighbours too means a Kendra just across a square's border is never missed.

**PIN code instead of location.** If the user doesn't share their location, they can type a PIN
code. The phone downloads the file for the PIN's first 3 digits (the postal sorting district),
which gives the centre of the Kendras in that PIN, or the centre of the 3-digit area if the PIN
has no Kendra. The full PIN is never sent.

**The map is opt-in.** OpenStreetMap map tiles are downloaded from OpenStreetMap's servers, which
would reveal the map area. So the map only loads when the user taps "Show on map", and the page
says so. The Directions link contains only the Kendra's location, never the user's.

**No stock claims.** Stock levels are not public, so the button says "Call to check stock".

**Monthly refresh.** The same GitHub Action now also fetches Kendras, checks and geocodes them
(cached, so only new addresses), loads them into Supabase (refusing a ±20% change), rebuilds the
static files and commits them, which redeploys the site on Vercel.

## Results: the 5 test locations

The test `web/tests/kendra-data.test.ts` runs on the real files. For each place it checks that the
9-square search gives exactly the same 3 Kendras as a search over all 21,451 placed Kendras.

| Place                             | Nearest 3 (store code, distance, district)                                       |
| --------------------------------- | -------------------------------------------------------------------------------- |
| Connaught Place, New Delhi        | PMBJK05537 0.78 km (New Delhi), PMBJK17436 0.83 km, PMBJK19665 1.13 km (Central) |
| CST, Mumbai                       | PMBJK23147 0.08 km, PMBJK23337 0.08 km (Thane), PMBJK05919 0.28 km               |
| Chennai Central                   | PMBJK05501 0.83 km, PMBJK13207 1.03 km, PMBJK12842 1.03 km                       |
| Kempegowda Bus Station, Bengaluru | PMBJK05836 0.89 km, PMBJK07560 0.98 km, PMBJK05336 1.12 km                       |
| Jaisalmer (sparse area)           | PMBJK24455 0.49 km, PMBJK23320 2.57 km, PMBJK12207 58.16 km                      |

All 5 match the full search. Privacy was checked in the browser's Network tab: searching by
PIN 600003 downloaded only `/data/pins/600.json`, `/data/kendras/index.json` and the square
files; no request contained the PIN or any coordinates.

## How to test it

```bash
pnpm dev
```

1. Open http://localhost:3000/en/kendras and type PIN `600003`: three Kendras near Chennai Central.
2. Tap "Show on map": a map with the three numbered Kendras.
3. Open the browser's DevTools → Network tab and repeat: only `/data/...` files are requested.
4. On a phone, tap "Use my location".
5. `pnpm test` (42 tests, including the 5 places) and `cd pipeline && uv run pytest` (105 tests).

## Limitations

- Distances are straight-line; roads are usually 20–40% longer (the page says so).
- 90 Kendras (0.4%) have no usable location and are not shown.
- A Kendra whose wrong coordinates are still inside its own district (under 100 km off) is not
  caught. Example worth checking by hand: PMBJK23337, registered in Thane, placed at CST Mumbai.
- PIN lookup only knows PINs that have a Kendra (8,840); other PINs use their 3-digit area.

## Viva questions this milestone answers

- _How do you find the nearest Kendra without sending the location?_ Static files per geohash
  square; the phone downloads its 3 × 3 block and computes distances itself.
- _Why load 9 squares, not 1?_ A Kendra 1 km away can be across a square's border.
- _Why not geocode every address as planned?_ The official coordinates exist for 99.9%, and
  checking them catches mistakes; geocoding is only needed for the rest.
- _How did you catch wrong coordinates?_ Distance from the median of the same district and
  state. Real example: Ganganagar Kendra placed in Delhi.
- _What is the Haversine formula?_ The distance between two points on a sphere from their
  latitudes and longitudes, using the Earth's radius (6,371 km).
