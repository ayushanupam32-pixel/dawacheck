"""Load the cleaned CSVs into Supabase. Safe to run any number of times (idempotent).

Needs two environment variables, which live only in GitHub Actions secrets (never in the repo):
  SUPABASE_URL          e.g. https://abcd.supabase.co
  SUPABASE_SERVICE_KEY  the project's secret / service_role key (bypasses Row Level Security)

How it stays idempotent: every row has a stable id taken from its source (Jan Aushadhi drug code,
dataset row id), and every write is an "upsert" (insert, or update if the id already exists).
Jan Aushadhi products that disappeared from the official list are deleted, so the table always
mirrors the latest list.

Run: uv run python -m dawacheck_pipeline.load_supabase [--with-brands]
"""

import argparse
import json
import math
import os
from datetime import UTC, date, datetime

import pandas as pd
import requests

from dawacheck_pipeline.fetch_jan_aushadhi import SOURCE_PAGE as JA_SOURCE_PAGE
from dawacheck_pipeline.parse_brands import SOURCE_NAME as BRANDS_SOURCE
from dawacheck_pipeline.paths import CLEAN_DIR

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

    salt_ids = load_salts(db, *frames)
    print(f"salts: {len(salt_ids)}")

    n = load_ja_products(db, salt_ids, ja)
    record_run(db, "ja_products", n, JA_SOURCE_PAGE)
    print(f"ja_products: {n}")

    if brands is not None:
        n = load_brands(db, salt_ids, brands)
        record_run(db, "brands", n, BRANDS_URL)
        print(f"brands: {n}")


if __name__ == "__main__":
    main()
