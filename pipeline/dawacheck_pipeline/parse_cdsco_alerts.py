"""Turn the downloaded CDSCO alerts into one clean table: pipeline/clean/cdsco_alerts.csv.

One row per alert (a product + batch that a government lab found Not of Standard Quality, or
that was declared spurious). Nothing is guessed: a value CDSCO wrote as "NA" or left empty
becomes empty, and a date that cannot be read is kept as written in `*_raw` and left empty.

The batch number is normalized exactly like the strip reader does (web/lib/ai/extract.ts,
normalizeBatch): uppercase, no spaces, dashes or slashes. "AOX-2402" on the alert and
"B.No. AOX 2402" on a strip both become "AOX2402".

Run: uv run python -m dawacheck_pipeline.parse_cdsco_alerts
"""

import json
import re
from datetime import datetime
from pathlib import Path

import pandas as pd

from dawacheck_pipeline.normalize import clean_text
from dawacheck_pipeline.paths import CLEAN_DIR, latest_raw_dir

SOURCE_URL = "https://cdsco.gov.in/opencms/opencms/en/Notifications/nsq-drugs/"
# Placeholders CDSCO writes where there is no value. "Not applicable" appears as a batch number on
# 22 alerts (devices, cosmetics); kept, it would look like a batch called NOTAPPLICABLE.
MISSING = {
    "",
    "na",
    "n/a",
    "nil",
    "-",
    "--",
    "not available",
    "not mentioned",
    "not applicable",
    "not given",
    "null",
}

COLUMNS = [
    "kind",  # "nsq" (failed a quality test) or "spurious" (fake)
    "alert_month",  # YYYY-MM the alert was published for
    "product_name",
    "brand_name",
    "batch_no",
    "batch_no_norm",
    "mfg_date",  # YYYY-MM or empty
    "exp_date",
    "mfg_date_raw",
    "exp_date_raw",
    "manufacturer",
    "failed_parameter",
    "reporting_source",
    "reported_by",
    "remarks",  # spurious only: CDSCO's remark and the firm's reply
    "source_url",
]


def text(value) -> str:
    """Clean a field; CDSCO's "NA"-style placeholders become empty."""
    if value is None:
        return ""
    cleaned = clean_text(str(value))
    return "" if cleaned.lower().strip(" .") in MISSING else cleaned


def normalize_batch(batch: str) -> str:
    """Same as normalizeBatch in web/lib/ai/extract.ts."""
    return re.sub(r"[\s\-/]", "", batch.upper())


def split_batches(batch: str) -> list[str]:
    """One cell can hold several batches or a note; return each batch on its own.

    "PFB-701, OPCP-195" -> ["PFB-701", "OPCP-195"]; "AHT-1239," -> ["AHT-1239"];
    "AB301008C (Drug) WM21E005 (WFI)" -> ["AB301008C", "WM21E005"];
    "AS-9057 (Two different samples ...)" -> ["AS-9057"].
    A batch printed with spaces ("22VC 1 03A") stays one batch.
    """
    has_notes = "(" in batch
    without_notes = re.sub(r"\([^)]*\)?", ",", batch)  # a note in brackets separates batches
    parts = re.split(r"\s*(?:,|;|&|\band\b)\s*", without_notes)
    out = [p.strip(" .:-") for p in parts if p.strip(" .:-")]
    return out if has_notes or len(out) > 1 else [batch.strip(" .,;:")]


_MONTH_FORMATS = ["%b-%Y", "%b %Y", "%b-%y", "%B-%Y", "%B %Y", "%m/%Y", "%m-%Y", "%m/%y", "%m.%Y"]


def parse_month(value: str) -> str:
    """ "Feb-2026", "FEB 2026", "02/2026", "Sept-2026" -> "2026-02". Empty if not a month."""
    v = value.strip().replace("Sept", "Sep").replace("SEPT", "SEP")
    for fmt in _MONTH_FORMATS:
        try:
            return datetime.strptime(v.title() if "%b" in fmt or "%B" in fmt else v, fmt).strftime(
                "%Y-%m"
            )
        except ValueError:
            continue
    return ""


def rows_from_file(path: Path) -> list[dict]:
    kind, key = path.stem.split("_", 1)  # "nsq_2026-09"
    data = json.loads(path.read_text())
    out = []
    for r in data.get("aaData") or []:
        product = text(r.get("str_product_name") or r.get("product_name_from_dtl"))
        mfg_raw = text(r.get("dt_manufacturing_date"))
        exp_raw = text(r.get("dt_expiry_date"))
        remarks = " ".join(
            t for t in (text(r.get("str_nsq_remarks")), text(r.get("str_firm_reply"))) if t
        )
        for batch in split_batches(text(r.get("str_batch_no"))) or [""]:
            out.append(
                {
                    "kind": kind,
                    "alert_month": key,
                    "product_name": product,
                    # Sometimes written in brackets: "(Sporlac-DS)".
                    "brand_name": text(r.get("str_brand_name")).strip("() "),
                    "batch_no": batch,
                    "batch_no_norm": normalize_batch(batch),
                    "mfg_date": parse_month(mfg_raw),
                    "exp_date": parse_month(exp_raw),
                    "mfg_date_raw": mfg_raw,
                    "exp_date_raw": exp_raw,
                    "manufacturer": text(r.get("str_manufactured_by")),
                    "failed_parameter": text(r.get("str_nsq_result")),
                    "reporting_source": text(r.get("str_reporting_source")),
                    "reported_by": text(r.get("str_reported_by_lab_or_state")),
                    "remarks": remarks,
                    "source_url": SOURCE_URL,
                }
            )
    return out


def parse(folder: Path) -> pd.DataFrame:
    rows = [row for path in sorted(folder.glob("*_????-??.json")) for row in rows_from_file(path)]
    return pd.DataFrame(rows, columns=COLUMNS)


def main() -> None:
    folder = latest_raw_dir("cdsco_alerts")
    df = parse(folder)
    usable = df[df["batch_no_norm"].str.len() >= 3]
    CLEAN_DIR.mkdir(exist_ok=True)
    out = CLEAN_DIR / "cdsco_alerts.csv"
    usable.to_csv(out, index=False)
    print(f"{len(df)} alerts from {folder.name}; {len(usable)} with a batch number -> {out}")
    print(df.groupby("kind").size().to_string())


if __name__ == "__main__":
    main()
