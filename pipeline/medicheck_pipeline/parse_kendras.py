"""Clean the raw Kendra list and decide which coordinates to trust.

The official list already has latitude/longitude for 99.9% of Kendras, so we use those
(geo_precision = 'official') and only fix the few that are clearly wrong:

  - missing or zero coordinates, or outside India's bounding box
  - more than 600 km from the middle of the Kendra's own state (e.g. a West Bengal Kendra
    placed in Maharashtra), or more than 100 km from the middle of its own district (e.g. a
    Ganganagar Kendra placed in Delhi): almost certainly data-entry mistakes. Most districts
    are much smaller than 100 km across.

Those rows are geocoded from their address with OpenStreetMap Nominatim
(geo_precision = 'address'), falling back to the middle of the other Kendras with the same
PIN code (geo_precision = 'pincode'). Rows we still cannot place are kept out of the map.

The owner's personal name (contactPerson) is not copied: Medicheck doesn't need it.

Run: uv run python -m medicheck_pipeline.parse_kendras
Output: pipeline/clean/kendras.csv
"""

import json
import re
import statistics
from collections import defaultdict
from math import asin, cos, radians, sin, sqrt

import pandas as pd

from medicheck_pipeline.geocode import geocode_address
from medicheck_pipeline.normalize import clean_text
from medicheck_pipeline.paths import CLEAN_DIR, latest_raw_dir

INDIA_BOX = {"lat": (6.0, 37.5), "lng": (68.0, 97.5)}
MAX_KM_FROM_STATE_CENTRE = 600
MAX_KM_FROM_DISTRICT_CENTRE = 100
MIN_KENDRAS_FOR_DISTRICT_CHECK = 3  # with fewer, the district's "middle" is not reliable


def median_point(points: list[tuple[float, float]]) -> tuple[float, float]:
    return statistics.median(p[0] for p in points), statistics.median(p[1] for p in points)


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Great-circle distance between two points on Earth, in km."""
    lat1, lng1, lat2, lng2 = map(radians, (lat1, lng1, lat2, lng2))
    a = sin((lat2 - lat1) / 2) ** 2 + cos(lat1) * cos(lat2) * sin((lng2 - lng1) / 2) ** 2
    return 2 * 6371 * asin(sqrt(a))


def to_float(value) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if number != 0 else None


def in_india(lat: float | None, lng: float | None) -> bool:
    return (
        lat is not None
        and lng is not None
        and INDIA_BOX["lat"][0] <= lat <= INDIA_BOX["lat"][1]
        and INDIA_BOX["lng"][0] <= lng <= INDIA_BOX["lng"][1]
    )


def clean_phone(value) -> str | None:
    """Keep digits only; a valid Indian number has 10 digits (or 11-12 with 0 / 91 prefix)."""
    digits = re.sub(r"\D", "", str(value or ""))
    if digits.startswith("91") and len(digits) == 12:
        digits = digits[2:]
    digits = digits.lstrip("0") if len(digits) == 11 else digits
    return digits if len(digits) == 10 else None


def load_raw() -> list[dict]:
    rows: list[dict] = []
    for path in sorted(latest_raw_dir("kendras").glob("state_*.json")):
        body = json.loads(path.read_text()).get("responseBody") or {}
        rows.extend(body.get("addKendraResponseList") or [])
    return rows


def build_rows(raw: list[dict], geocode=geocode_address) -> pd.DataFrame:
    rows = []
    for r in raw:
        if r.get("status") != 1:
            continue  # inactive Kendra
        lat, lng = to_float(r.get("latitude")), to_float(r.get("longitude"))
        pin = str(r.get("pinCode") or "").strip()
        rows.append(
            {
                "kendra_code": r["storeCode"],
                "address": clean_text(r.get("kendraAddress") or ""),
                "district": clean_text(r.get("districtName") or ""),
                "state": clean_text(r.get("stateName") or ""),
                "pincode": pin if re.fullmatch(r"[1-9]\d{5}", pin) else None,
                "phone": clean_phone(r.get("contactNumber")),
                "lat": lat if in_india(lat, lng) else None,
                "lng": lng if in_india(lat, lng) else None,
            }
        )

    # Middle of each state and each district = median of its Kendras. A median ignores a few
    # wrong points, so the misplaced Kendras we are looking for cannot drag it away.
    by_state, by_district = defaultdict(list), defaultdict(list)
    for row in rows:
        if row["lat"] is not None:
            by_state[row["state"]].append((row["lat"], row["lng"]))
            by_district[(row["state"], row["district"])].append((row["lat"], row["lng"]))
    centre = {state: median_point(pts) for state, pts in by_state.items()}
    district_centre = {
        key: median_point(pts)
        for key, pts in by_district.items()
        if len(pts) >= MIN_KENDRAS_FOR_DISTRICT_CHECK
    }

    for row in rows:
        ok = row["lat"] is not None and (
            haversine_km(row["lat"], row["lng"], *centre[row["state"]]) <= MAX_KM_FROM_STATE_CENTRE
        )
        district = district_centre.get((row["state"], row["district"]))
        if ok and district:
            # e.g. a Kendra registered in Ganganagar (Rajasthan) with coordinates in central
            # Delhi, 349 km away: users would be told it is 0.5 km from Connaught Place.
            ok = haversine_km(row["lat"], row["lng"], *district) <= MAX_KM_FROM_DISTRICT_CENTRE
        row["geo_precision"] = "official" if ok else None
        if not ok:
            row["lat"] = row["lng"] = None

    # PIN code centres from Kendras we trust, for the last-resort fallback.
    by_pin = defaultdict(list)
    for row in rows:
        if row["geo_precision"] == "official" and row["pincode"]:
            by_pin[row["pincode"]].append((row["lat"], row["lng"]))
    pin_centre = {pin: median_point(pts) for pin, pts in by_pin.items()}

    for row in rows:
        if row["geo_precision"]:
            continue
        query = ", ".join(
            x for x in (row["address"], row["district"], row["state"], row["pincode"]) if x
        )
        point = geocode(query)
        if (
            point
            and in_india(*point)
            and row["state"] in centre
            and haversine_km(*point, *centre[row["state"]]) <= MAX_KM_FROM_STATE_CENTRE
        ):
            row["lat"], row["lng"], row["geo_precision"] = *point, "address"
        elif row["pincode"] in pin_centre:
            row["lat"], row["lng"] = pin_centre[row["pincode"]]
            row["geo_precision"] = "pincode"

    return pd.DataFrame(rows)


def main() -> None:
    df = build_rows(load_raw())
    CLEAN_DIR.mkdir(exist_ok=True)
    out = CLEAN_DIR / "kendras.csv"
    df.to_csv(out, index=False)
    print(f"Kendras: {len(df)}")
    print(df["geo_precision"].value_counts(dropna=False).to_string())
    print(f"Wrote {out}")


if __name__ == "__main__":
    main()
