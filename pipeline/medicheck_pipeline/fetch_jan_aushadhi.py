"""Download the Jan Aushadhi (PMBI) product & MRP list.

Source: the "Product & MRP List" page on janaushadhi.gov.in. That page loads its table from a
public JSON endpoint. Like every visitor's browser, we first ask the site for an anonymous guest
token (no login, no password), then request the whole list in one call, exactly as the page's own
"Download" button does. One run = 2 requests, once a month.

Output: pipeline/raw/ja_products/<today>/products.json (the untouched API response).

Run: uv run python -m medicheck_pipeline.fetch_jan_aushadhi
"""

import json

from medicheck_pipeline.http import PoliteSession
from medicheck_pipeline.paths import raw_dir

API_BASE = "https://janaushadhi.gov.in:8443"
SOURCE_PAGE = "https://janaushadhi.gov.in/product-portfolio/product-mrp-list"


def fetch() -> dict:
    session = PoliteSession(min_interval=2.0)
    session.headers.update({"Origin": "https://janaushadhi.gov.in", "Referer": SOURCE_PAGE})

    token_resp = session.get(f"{API_BASE}/auth/generateGuestToken")
    token_resp.raise_for_status()
    token = token_resp.json()["responseBody"]

    resp = session.post(
        f"{API_BASE}/api/v1/website/getAllProductForWeb",
        headers={"Authorization": f"Bearer {token}"},
        # Same request the website's own "Download Files" button sends: everything, in one page.
        json={
            "pageIndex": 0,
            "pageSize": 1_000_000,
            "searchText": "",
            "columnName": "drug_code",
            "orderBy": "asc",
        },
    )
    resp.raise_for_status()
    data = resp.json()
    if data.get("responseCode") != 200:
        raise RuntimeError(f"Unexpected response: {json.dumps(data)[:300]}")
    return data


def main() -> None:
    data = fetch()
    products = data["responseBody"]["newProductResponsesList"]
    out = raw_dir("ja_products") / "products.json"
    out.write_text(json.dumps(data, ensure_ascii=False, indent=1))
    print(f"Saved {len(products)} products to {out}")


if __name__ == "__main__":
    main()
