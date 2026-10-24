"""Download CDSCO's lists of prohibited fixed-dose combinations (FDCs) as published PDFs.

Source: https://cdsco.gov.in/opencms/opencms/en/Drugs/FDC/ , a table of documents. We keep the
ones that list prohibited or restricted drugs: the consolidated "List of drugs prohibited for
manufacture and sale ... under section 26A" and the later lists ("List of 16 FDCs banned dated
11.06.2026", "List of Prohibited FDC drugs 156 FDCs ..."). Circulars and committee minutes are
skipped.

Each document link returns a small page with an <iframe> pointing at the PDF; we follow it.
2 seconds between requests.

Output: pipeline/raw/cdsco_fdc/<today>/<n>.pdf and documents.json (title, release date, PDF URL).

Run: uv run python -m dawacheck_pipeline.fetch_cdsco_fdc
"""

import html
import json
import re
from urllib.parse import quote

from dawacheck_pipeline.http import PoliteSession
from dawacheck_pipeline.paths import raw_dir

SITE = "https://cdsco.gov.in"
PAGE = f"{SITE}/opencms/opencms/en/Drugs/FDC/"
WANTED = re.compile(r"prohibit|banned|restricted", re.I)
NOT_A_LIST = re.compile(r"circular|procedure|policy|meeting", re.I)

ROW = re.compile(
    r"<td>\s*\d+\s*</td>\s*<td>(?P<title>.*?)</td>\s*<td>(?P<date>[^<]*)</td>\s*"
    r"<td><a href='(?P<link>[^']+)'",
    re.S,
)


def documents(page_html: str) -> list[dict]:
    """Rows of the FDC page's document tables that list prohibited/restricted FDCs."""
    found = []
    for m in ROW.finditer(page_html):
        title = html.unescape(re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", m["title"]))).strip()
        if WANTED.search(title) and not NOT_A_LIST.search(title):
            found.append({"title": title, "released": m["date"].strip(), "link": SITE + m["link"]})
    return found


def main() -> None:
    session = PoliteSession(min_interval=2.0)
    page = session.get(PAGE)
    page.raise_for_status()
    docs = documents(page.text)
    out = raw_dir("cdsco_fdc")
    for i, doc in enumerate(docs, 1):
        frame = session.get(doc["link"])
        frame.raise_for_status()
        src = re.search(r"src='([^']+)'", frame.text)
        if not src:
            raise RuntimeError(f"No PDF behind {doc['title']!r}")
        doc["pdf_url"] = SITE + quote(src[1])
        pdf = session.get(doc["pdf_url"])
        pdf.raise_for_status()
        if not pdf.content.startswith(b"%PDF"):
            raise RuntimeError(f"Not a PDF: {doc['pdf_url']}")
        doc["file"] = f"{i:02d}.pdf"
        (out / doc["file"]).write_bytes(pdf.content)
        print(f"{doc['file']}  {doc['released']}  {doc['title']}")
    (out / "documents.json").write_text(json.dumps(docs, ensure_ascii=False, indent=1))
    print(f"Saved {len(docs)} documents to {out}")


if __name__ == "__main__":
    main()
