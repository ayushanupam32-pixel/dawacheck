"""Export Kendras as small static JSON files for the browser.

web/public/data/kendras/<geohash3>.json  one file per ~156 km cell
web/public/data/pins/<3-digit prefix>.json  PIN code -> approximate (lat, lng)

The browser downloads only the files for the user's area and computes distances itself, so the
user's exact location (or typed PIN) never leaves the phone. Vercel serves these as plain files,
with no database query per visit.

Run: uv run python -m medicheck_pipeline.build_static
"""

import json
import shutil
import statistics
from collections import defaultdict
from datetime import date

import pandas as pd

from medicheck_pipeline.geohash import encode
from medicheck_pipeline.paths import CLEAN_DIR, PIPELINE_DIR

WEB_DATA = PIPELINE_DIR.parent / "web" / "public" / "data"
FIELDS = ["code", "address", "district", "state", "pin", "phone", "lat", "lng", "precision"]


def write_json(path, data) -> None:
    # Compact: no spaces. These files are downloaded on slow phones.
    # allow_nan=False: Python would otherwise write NaN, which is not valid JSON and breaks
    # the browser's JSON.parse. An empty CSV cell must become null (see `text` below).
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":"), allow_nan=False))


def text(value) -> str | None:
    """pandas reads an empty CSV cell as NaN (a float); turn it into None (JSON null)."""
    return value if isinstance(value, str) and value.strip() else None


def main() -> None:
    df = pd.read_csv(
        CLEAN_DIR / "kendras.csv", dtype={"pincode": str, "phone": str, "district": str}
    )
    df = df[df["lat"].notna()]
    today = date.today().isoformat()

    cells: dict[str, list] = defaultdict(list)
    for r in df.itertuples(index=False):
        cells[encode(r.lat, r.lng, 3)].append(
            [
                r.kendra_code,
                text(r.address),
                text(r.district),
                text(r.state),
                text(r.pincode),
                text(r.phone),
                round(r.lat, 5),  # 5 decimals ≈ 1 metre
                round(r.lng, 5),
                r.geo_precision,
            ]
        )

    kendra_dir = WEB_DATA / "kendras"
    shutil.rmtree(kendra_dir, ignore_errors=True)  # cells that became empty must disappear
    kendra_dir.mkdir(parents=True)
    for cell, rows in sorted(cells.items()):
        write_json(kendra_dir / f"{cell}.json", {"updated": today, "fields": FIELDS, "rows": rows})
    # Which cells exist, so the browser never requests an empty one (a 404 looks like an error).
    write_json(kendra_dir / "index.json", {"updated": today, "cells": sorted(cells)})

    # PIN -> centre of the Kendras with trusted coordinates in that PIN. A PIN with no Kendra
    # falls back to its 3-digit prefix (the postal sorting district), marked as approximate.
    trusted = df[(df.geo_precision == "official") & df.pincode.notna()]
    by_pin = defaultdict(list)
    for r in trusted.itertuples(index=False):
        by_pin[r.pincode].append((r.lat, r.lng))
    by_prefix = defaultdict(list)
    for pin, pts in by_pin.items():
        by_prefix[pin[:3]].extend(pts)

    pin_dir = WEB_DATA / "pins"
    shutil.rmtree(pin_dir, ignore_errors=True)
    pin_dir.mkdir(parents=True)
    for prefix, pts in sorted(by_prefix.items()):
        pins = {
            pin: [
                round(statistics.median(p[0] for p in v), 4),
                round(statistics.median(p[1] for p in v), 4),
            ]
            for pin, v in sorted(by_pin.items())
            if pin.startswith(prefix)
        }
        centre = [
            round(statistics.median(p[0] for p in pts), 4),
            round(statistics.median(p[1] for p in pts), 4),
        ]
        write_json(pin_dir / f"{prefix}.json", {"updated": today, "prefix": centre, "pins": pins})

    print(f"{len(df)} Kendras in {len(cells)} cells; {len(by_pin)} PINs in {len(by_prefix)} files")
    biggest = max(cells.items(), key=lambda kv: len(kv[1]))
    print(f"Biggest cell: {biggest[0]} with {len(biggest[1])} Kendras")


if __name__ == "__main__":
    main()
