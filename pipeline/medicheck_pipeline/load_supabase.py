"""Load the cleaned CSVs into Supabase. Safe to run any number of times (idempotent).

Needs two environment variables, which live only in GitHub Actions secrets (never in the repo):
  SUPABASE_URL          e.g. https://abcd.supabase.co
  SUPABASE_SERVICE_KEY  the project's secret / service_role key (bypasses Row Level Security)

How it stays idempotent: every row has a stable id taken from its source (Jan Aushadhi drug code,
dataset row id), and every write is an "upsert" (insert, or update if the id already exists).
Jan Aushadhi products that disappeared from the official list are deleted, so the table always
mirrors the latest list.

Run: uv run python -m medicheck_pipeline.load_supabase [--with-brands]
"""

import argparse
import hashlib
import json
import math
import os
from datetime import UTC, date, datetime

import pandas as pd
import requests

from medicheck_pipeline.fetch_cdsco_fdc import PAGE as FDC_SOURCE_PAGE
from medicheck_pipeline.fetch_jan_aushadhi import SOURCE_PAGE as JA_SOURCE_PAGE
from medicheck_pipeline.fetch_kendras import SOURCE_PAGE as KENDRAS_SOURCE_PAGE
from medicheck_pipeline.parse_brands import SOURCE_NAME as BRANDS_SOURCE
from medicheck_pipeline.parse_cdsco_alerts import SOURCE_URL as ALERTS_SOURCE_PAGE
from medicheck_pipeline.paths import CLEAN_DIR

BATCH = 1000
BRANDS_URL = "https://www.kaggle.com/datasets/shudhanshusingh/az-medicine-dataset-of-india"


class Supabase:
    """Tiny client for Supabase's REST API (PostgREST): just what the loader needs."""

    def __init__(self, url: str, service_key: str) -> None:
        self.base = url.rstrip("/") + "/rest/v1"
        self.session = requests.Session()
        self.session.headers.update({"apikey": service_key, "Content-Type": "application/json"})
        # Old-style service_role keys are JWTs ("eyJ...") and also go in the Authorization header.
        # New-style "sb_secret_..." keys are not JWTs and must only be sent as `apikey`.
        if service_key.startswith("eyJ"):
            self.session.headers["Authorization"] = f"Bearer {service_key}"

    def upsert(self, table: str, rows: list[dict], on_conflict: str) -> None:
        for start in range(0, len(rows), BATCH):
            resp = self.session.post(
                f"{self.base}/{table}",
                params={"on_conflict": on_conflict},
                headers={"Prefer": "resolution=merge-duplicates,return=minimal"},
                data=json.dumps(rows[start : start + BATCH]),
                timeout=120,
            )
            if not resp.ok:
                raise RuntimeError(f"Upsert into {table} failed: {resp.status_code} {resp.text}")

    def select_all(self, table: str, columns: str) -> list[dict]:
        rows: list[dict] = []
        while True:
            resp = self.session.get(
                f"{self.base}/{table}",
                params={"select": columns, "order": "id"},
                headers={"Range": f"{len(rows)}-{len(rows) + BATCH - 1}"},
                timeout=120,
            )
            resp.raise_for_status()
            page = resp.json()
            rows.extend(page)
            if len(page) < BATCH:
                return rows

    def delete_where(self, table: str, column: str, condition: str) -> None:
        resp = self.session.delete(f"{self.base}/{table}", params={column: condition}, timeout=120)
        if not resp.ok:
            raise RuntimeError(f"Delete from {table} failed: {resp.status_code} {resp.text}")

    def rows_loaded(self, source: str) -> int | None:
        """How many rows the previous run of a source loaded (None if it never ran)."""
        resp = self.session.get(
            f"{self.base}/data_sources",
            params={"source": f"eq.{source}", "select": "rows_loaded"},
            timeout=60,
        )
        resp.raise_for_status()
        found = resp.json()
        return found[0]["rows_loaded"] if found else None

    def count(self, table: str) -> int:
        resp = self.session.head(
            f"{self.base}/{table}", params={"select": "id"}, headers={"Prefer": "count=exact"}
        )
        resp.raise_for_status()
        return int(resp.headers["Content-Range"].split("/")[-1])


def clean(value):
    """pandas NaN -> None (JSON null); numpy numbers -> plain Python numbers."""
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return None
    if hasattr(value, "item"):
        return value.item()
    return value


def ingredient_lists(df: pd.DataFrame) -> list[tuple[int, list[dict]]]:
    return [
        (int(row_id), json.loads(raw))
        for row_id, raw in zip(df["id"], df["ingredients"], strict=True)
    ]


def load_salts(db: Supabase, *frames: pd.DataFrame) -> dict[str, int]:
    """Upsert every salt seen in any source, then return {name_norm: id}."""
    names: dict[str, str] = {}
    for df in frames:
        for _, ingredients in ingredient_lists(df):
            for i in ingredients:
                names.setdefault(i["salt"], i["display"])
    db.upsert(
        "salts",
        [{"name_norm": n, "display_name": d} for n, d in sorted(names.items())],
        on_conflict="name_norm",
    )
    return {row["name_norm"]: row["id"] for row in db.select_all("salts", "id,name_norm")}


def ingredient_rows(df: pd.DataFrame, salt_ids: dict[str, int], fk: str) -> list[dict]:
    return [
        {
            fk: row_id,
            "salt_id": salt_ids[i["salt"]],
            "strength_value": float(i["value"]),
            "strength_unit": i["unit"],
        }
        for row_id, ingredients in ingredient_lists(df)
        for i in ingredients
    ]


def load_ja_products(db: Supabase, salt_ids: dict[str, int], ja: pd.DataFrame) -> int:
    today = date.today().isoformat()
    rows = [
        {
            "id": int(r.drug_code),
            "drug_code": str(r.drug_code),
            "generic_name": r.generic_name,
            "group_name": clean(r.group_name),
            "form": r.form,
            "release": clean(r.release),
            "unit_size": clean(r.unit_size),
            "pack_size": clean(r.pack_size),
            "pack_unit": clean(r.pack_unit),
            "mrp": float(r.mrp),
            "composition_key": r.composition_key,
            "updated_on": today,
        }
        for r in ja.itertuples(index=False)
    ]
    db.upsert("ja_products", rows, on_conflict="id")
    db.upsert(
        "ja_product_ingredients",
        ingredient_rows(ja, salt_ids, "product_id"),
        on_conflict="product_id,salt_id",
    )
    # Every product in today's list now has updated_on = today. Anything older was removed from
    # the official list, so remove it here too (its ingredient rows go with it: on delete cascade).
    db.delete_where("ja_products", "updated_on", f"lt.{today}")
    return len(rows)


def load_brands(db: Supabase, salt_ids: dict[str, int], brands: pd.DataFrame) -> int:
    rows = [
        {
            "id": int(r.id),
            "name": r.name,
            "name_norm": r.name_norm,
            "manufacturer": clean(r.manufacturer),
            "form": r.form,
            "release": clean(r.release),
            "pack_size": clean(r.pack_size),
            "pack_unit": clean(r.pack_unit),
            "mrp_2022": clean(r.mrp_2022) if clean(r.mrp_2022) and r.mrp_2022 > 0 else None,
            "discontinued": bool(r.discontinued),
            "composition_key": r.composition_key,
            "composition_complete": bool(r.composition_complete),
            "source": BRANDS_SOURCE,
        }
        for r in brands.itertuples(index=False)
    ]
    db.upsert("brands", rows, on_conflict="id")
    db.upsert(
        "brand_ingredients",
        ingredient_rows(brands, salt_ids, "brand_id"),
        on_conflict="brand_id,salt_id",
    )
    return len(rows)


def load_kendras(db: Supabase, kendras: pd.DataFrame) -> int:
    today = date.today().isoformat()
    rows = [
        {
            "kendra_code": r.kendra_code,
            "address": clean(r.address),
            "district": clean(r.district),
            "state": clean(r.state),
            "pincode": clean(r.pincode),
            "phone": clean(r.phone),
            "lat": clean(r.lat),
            "lng": clean(r.lng),
            "geo_precision": clean(r.geo_precision),
            "last_seen": today,
        }
        for r in kendras.itertuples(index=False)
    ]
    db.upsert("kendras", rows, on_conflict="kendra_code")
    # Kendras missing from today's official list have closed or been de-listed.
    db.delete_where("kendras", "last_seen", f"lt.{today}")
    return len(rows)


def row_id(*parts) -> str:
    """A stable id from a row's content: the same alert gets the same id on every reload."""
    return hashlib.sha1("|".join(str(p) for p in parts).encode()).hexdigest()[:24]


def check_size(db: Supabase, source: str, new: int) -> None:
    """Validate step: a sudden jump or drop usually means the source changed format.

    Compared with what the previous run of this source loaded (data_sources.rows_loaded), not
    with the table's row count, which can include leftovers a failed or interrupted run left.
    """
    previous = db.rows_loaded(source)
    if previous and not 0.8 * previous <= new <= 1.2 * previous:
        raise SystemExit(f"Refusing to load: {new} {source} rows vs {previous} last time (±20%)")


def load_alerts(db: Supabase, alerts: pd.DataFrame, run_started: str) -> int:
    rows = {}
    for r in alerts.itertuples(index=False):
        key = row_id(r.kind, r.alert_month, r.batch_no_norm, r.product_name, r.reported_by)
        rows[key] = {
            "id": key,
            "kind": r.kind,
            "alert_month": f"{r.alert_month}-01",
            "product_name": clean(r.product_name) or "",
            "brand_name": clean(r.brand_name) or None,
            "batch_no": r.batch_no,
            "batch_no_norm": r.batch_no_norm,
            "mfg_date": clean(r.mfg_date) or None,
            "exp_date": clean(r.exp_date) or None,
            "manufacturer": clean(r.manufacturer) or None,
            "failed_parameter": clean(r.failed_parameter) or None,
            "reporting_source": clean(r.reporting_source) or None,
            "reported_by": clean(r.reported_by) or None,
            "remarks": clean(r.remarks) or None,
            "source_url": r.source_url,
            "last_seen": run_started,
        }
    check_size(db, "cdsco_alerts", len(rows))
    db.upsert("nsq_alerts", list(rows.values()), on_conflict="id")
    # Alerts CDSCO has withdrawn were not in this run's download. Rows are compared with the
    # run's start time, not its date: two runs on one day must not keep each other's rows.
    db.delete_where("nsq_alerts", "last_seen", f"lt.{run_started}")
    return len(rows)


def load_banned_fdcs(db: Supabase, banned: pd.DataFrame, run_started: str) -> int:
    rows = {}
    for r in banned.itertuples(index=False):
        key = row_id(
            r.combination_key, r.salt_strengths, r.forms, r.releases, r.description, r.notification
        )
        rows[key] = {
            "id": key,
            "combination_key": clean(r.combination_key) or None,
            "salts": json.loads(r.salts),
            "kind": r.kind,
            "status": r.status,
            "description": r.description,
            "strengths": clean(r.strengths) or None,
            "salt_strengths": json.loads(r.salt_strengths or "{}"),
            "forms": json.loads(r.forms or "[]"),
            "releases": json.loads(r.releases or "[]"),
            "notification": clean(r.notification) or None,
            "notified_on": clean(r.notified_on) or None,
            "status_note": clean(r.status_note) or None,
            "source_title": r.source_title,
            "source_url": clean(r.source_url) or FDC_SOURCE_PAGE,
            "last_seen": run_started,
        }
    check_size(db, "cdsco_fdc", len(rows))
    db.upsert("banned_fdcs", list(rows.values()), on_conflict="id")
    db.delete_where("banned_fdcs", "last_seen", f"lt.{run_started}")
    return len(rows)


NPPA_URLS = {
    "nlem2022-767.pdf": "https://nppa.gov.in/storage/uploads/tender/0fd8be342c35d5a46a13b281cadc5e4f.pdf",
    "nlem2015-138.pdf": "https://nppa.gov.in/storage/uploads/tender/0d883ca9b600c8a13cec452376176fc4.pdf",
}


def load_ceiling_prices(db: Supabase, prices: pd.DataFrame, run_started: str) -> int:
    """Only rows whose composition was read (a key that can match a medicine) are loaded."""
    rows = {}
    for r in prices[prices.parse_status == "ok"].itertuples(index=False):
        key = row_id(r.composition_key, r.medicine, r.dosage, r.unit, r.order)
        rows[key] = {
            "id": key,
            "composition_key": r.composition_key,
            "medicine": r.medicine,
            "dosage": r.dosage,
            "unit": r.unit,
            "unit_kind": r.unit_kind,
            "ceiling_price": float(r.ceiling_price),
            "order_no": r.order,
            "effective_from": r.effective_from,
            "list": r.list,
            "source_url": NPPA_URLS.get(r.source_file, "https://nppa.gov.in/en/view_more?id=4"),
            "last_seen": run_started,
        }
    check_size(db, "nppa", len(rows))
    db.upsert("ceiling_prices", list(rows.values()), on_conflict="id")
    db.delete_where("ceiling_prices", "last_seen", f"lt.{run_started}")
    return len(rows)


def record_run(db: Supabase, source: str, rows_loaded: int, url: str) -> None:
    db.upsert(
        "data_sources",
        [
            {
                "source": source,
                "last_run_at": datetime.now(UTC).isoformat(),
                "rows_loaded": rows_loaded,
                "status": "ok",
                "source_url": url,
            }
        ],
        on_conflict="source",
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--with-brands",
        action="store_true",
        help="Also load the brand dataset (only needed when it changes; it is large).",
    )
    args = parser.parse_args()

    # A missing GitHub secret arrives as an empty string, not as a missing variable.
    missing = [v for v in ("SUPABASE_URL", "SUPABASE_SERVICE_KEY") if not os.environ.get(v)]
    if missing:
        raise SystemExit(f"Missing {', '.join(missing)}: add it as a GitHub Actions secret")
    db = Supabase(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])

    # Only rows that are fully understood (parsed, and priced for Jan Aushadhi) are loaded.
    ja = pd.read_csv(CLEAN_DIR / "ja_products.csv", dtype={"drug_code": str})
    ja = ja[(ja.parse_status == "ok") & ja.mrp.notna()].copy()
    ja["id"] = ja["drug_code"].astype(int)

    frames = [ja]
    brands = None
    if args.with_brands:
        brands = pd.read_csv(CLEAN_DIR / "brands.csv")
        brands = brands[brands.parse_status == "ok"].rename(columns={"source_id": "id"})
        frames.append(brands)

    # Sanity check (validate step): a sudden jump or drop usually means the source changed format.
    # Fail loudly and leave the data that is already live untouched.
    live = db.count("ja_products")
    if live and not 0.8 * live <= len(ja) <= 1.2 * live:
        raise SystemExit(f"Refusing to load: {len(ja)} Jan Aushadhi rows vs {live} live (±20%)")
    if (ja.mrp <= 0).any():
        raise SystemExit("Refusing to load: a Jan Aushadhi price is not positive")

    kendras = pd.read_csv(
        CLEAN_DIR / "kendras.csv", dtype={"pincode": str, "phone": str, "district": str}
    )
    live_kendras = db.count("kendras")
    if live_kendras and not 0.8 * live_kendras <= len(kendras) <= 1.2 * live_kendras:
        raise SystemExit(f"Refusing to load: {len(kendras)} Kendras vs {live_kendras} live (±20%)")
    placed = kendras.lat.notna()
    if (
        not kendras[placed].lat.between(6, 37.5).all()
        or not kendras[placed].lng.between(68, 97.5).all()
    ):
        raise SystemExit("Refusing to load: a Kendra is outside India's bounding box")

    salt_ids = load_salts(db, *frames)
    print(f"salts: {len(salt_ids)}")

    n = load_ja_products(db, salt_ids, ja)
    record_run(db, "ja_products", n, JA_SOURCE_PAGE)
    print(f"ja_products: {n}")

    n = load_kendras(db, kendras)
    record_run(db, "kendras", n, KENDRAS_SOURCE_PAGE)
    print(f"kendras: {n}")

    # Safety-check data (M5). Text columns stay text: "" means "not given", never NaN.
    alerts = pd.read_csv(CLEAN_DIR / "cdsco_alerts.csv", dtype=str, keep_default_na=False)
    # One timestamp for the whole run: rows this run did not load are deleted afterwards.
    run_started = datetime.now(UTC).isoformat()
    n = load_alerts(db, alerts, run_started)
    record_run(db, "cdsco_alerts", n, ALERTS_SOURCE_PAGE)
    print(f"nsq_alerts: {n}")

    prices = pd.read_csv(CLEAN_DIR / "ceiling_prices.csv", dtype=str, keep_default_na=False)
    n = load_ceiling_prices(db, prices, run_started)
    record_run(db, "nppa", n, "https://nppa.gov.in/en/view_more?id=4")
    print(f"ceiling_prices: {n}")

    banned = pd.read_csv(CLEAN_DIR / "banned_fdcs.csv", dtype=str, keep_default_na=False)
    n = load_banned_fdcs(db, banned, run_started)
    record_run(db, "cdsco_fdc", n, FDC_SOURCE_PAGE)
    print(f"banned_fdcs: {n}")

    if brands is not None:
        n = load_brands(db, salt_ids, brands)
        record_run(db, "brands", n, BRANDS_URL)
        print(f"brands: {n}")


if __name__ == "__main__":
    main()
