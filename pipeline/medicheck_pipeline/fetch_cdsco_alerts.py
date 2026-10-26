"""Download CDSCO's monthly drug alerts: Not of Standard Quality (NSQ) and spurious drugs.

Source: the "NSQ Alerts" page on cdsco.gov.in
(https://cdsco.gov.in/opencms/opencms/en/Notifications/nsq-drugs/), which since August 2025 shows
the alerts as a searchable table. The table is loaded from public JSON endpoints on
cdscoonline.gov.in, the same requests every visitor's browser makes: the list of years, the months
of a year, then one month's rows. No login, no robots.txt restrictions.

Polite: 2 seconds between requests. The first run downloads every month (NSQ since 2019, spurious
since 2025; about 110 requests, 4 minutes). Later runs re-download only the latest 3 months (CDSCO
sometimes corrects recent alerts) and months not seen before, and copy the rest from the previous
download.

The responses are Latin-1 encoded (the "®" in brand names is byte 0xAE), not UTF-8.

Output: pipeline/raw/cdsco_alerts/<today>/<tab>_<YYYY-MM>.json (nsq_2026-09.json, ...), each the
response as received (decoded to UTF-8), plus months.json listing what was fetched.

Run: uv run python -m medicheck_pipeline.fetch_cdsco_alerts
"""

import json
import shutil
from datetime import datetime

from medicheck_pipeline.http import PoliteSession
from medicheck_pipeline.paths import RAW_DIR, raw_dir

SOURCE = "cdsco_alerts"
API = "https://cdscoonline.gov.in/CDSCO"
PAGE = f"{API}/viewPublicNSQDrug"
TABLES = {"nsq": "filteredNsqDrugTable", "spurious": "filteredSpuriousDrugTable"}
REFRESH_LATEST = 3  # months re-downloaded every time


def get_json(session: PoliteSession, path: str, **params: str):
    resp = session.get(f"{API}/{path}", params=params)
    resp.raise_for_status()
    return json.loads(resp.content.decode("latin-1"))


def month_key(month: str, year: str) -> str:
    """("Sep", "2026") -> "2026-09"."""
    return datetime.strptime(f"{month} {year}", "%b %Y").strftime("%Y-%m")


def previous_dir(today_dir):
    """The most recent earlier download folder, if any."""
    base = RAW_DIR / SOURCE
    earlier = sorted(p for p in base.iterdir() if p.is_dir() and p != today_dir)
    return earlier[-1] if earlier else None


def main() -> None:
    session = PoliteSession(min_interval=2.0)
    session.headers["Referer"] = PAGE
    out = raw_dir(SOURCE)
    previous = previous_dir(out)

    fetched: dict[str, list[str]] = {}
    for tab, table in TABLES.items():
        months = []
        for year in get_json(session, "reportingYears", tab=tab):
            for month in get_json(session, "publicReportingMonths", year=year, tab=tab):
                months.append((month_key(month, year), f"{month}-{year}"))
        months.sort()
        fetched[tab] = [key for key, _ in months]

        latest = {key for key, _ in months[-REFRESH_LATEST:]}
        for key, label in months:
            name = f"{tab}_{key}.json"
            if key not in latest and previous and (previous / name).exists():
                shutil.copy(previous / name, out / name)
                continue
            data = get_json(session, table, month=label, source="All", tab=tab)
            (out / name).write_text(json.dumps(data, ensure_ascii=False, indent=1))
            print(f"{tab} {key}: {len(data.get('aaData') or [])} rows")

    (out / "months.json").write_text(json.dumps(fetched, indent=1))
    print(f"Saved {sum(len(m) for m in fetched.values())} months to {out}")


if __name__ == "__main__":
    main()
