"""Turn NPPA's ceiling-price orders into one table: pipeline/clean/ceiling_prices.csv.

Source: the yearly NPPA orders that re-issue the ceiling price of every scheduled formulation
(the April revision for the wholesale price index), published in the Gazette of India and on
https://nppa.gov.in/en/view_more?id=4 ("Circulars / Orders"). For 2026: S.O. 1575(E) (767
formulations, NLEM 2022) and S.O. 1581(E) (138 formulations, NLEM 2015), both dated 25.03.2026,
in force from 1.4.2026. Saved in pipeline/raw/nppa/<date>/ (see SOURCE.md there).

Each PDF has the table twice, in Hindi and in English; we read the English rows. A row is
"5-aminosalicylic Acid | Tablet 400 mg | 1 Tablet | 8.11", or for combinations
"Levodopa (A) +Carbidopa(B) | Tablet 250mg(A) +25mg(B) | 1 Tablet | 4.53". Each row is rewritten
in the style of a Jan Aushadhi product name ("Levodopa 250mg + Carbidopa 25mg Tablet") and read
by the same parser, so its composition key is built exactly like the brands' and generics'.

Ceiling prices EXCLUDE GST (the order says "exclusive of Goods and Services Tax applicable").

Run: uv run python -m medicheck_pipeline.parse_nppa
"""

import re
from pathlib import Path

import pandas as pd
import pdfplumber

from medicheck_pipeline.normalize import STRENGTH_RE, clean_text
from medicheck_pipeline.parse_jan_aushadhi import parse_generic_name
from medicheck_pipeline.paths import CLEAN_DIR, latest_raw_dir

ORDERS_PAGE = "https://nppa.gov.in/en/view_more?id=4"
DEVANAGARI = re.compile(r"[ऀ-ॿ]")
LABEL = re.compile(r"\(\s*([A-H])\s*\)")

COLUMNS = [
    "composition_key",
    "medicine",
    "dosage",
    "unit",
    "unit_kind",  # "unit" (1 tablet / capsule), "ml", "g", or "other"
    "ceiling_price",
    "order",
    "effective_from",
    "list",
    "parse_status",
    "parse_reason",
    "source_file",
]


def table_rows(pdf_path: Path) -> list[list[str]]:
    """English table rows (Sl. No., medicine, dosage, unit, price), continuation lines joined."""
    rows: list[list[str]] = []
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            for table in page.extract_tables():
                for raw in table:
                    cells = [clean_text(c or "") for c in raw]
                    if len(cells) < 5 or any(DEVANAGARI.search(c) for c in cells[:5]):
                        continue
                    if re.fullmatch(r"\d+", cells[0]):
                        rows.append(cells[:5])
                    elif rows and not cells[0] and any(cells[1:5]):
                        # A row split across a page break: continue the previous entry.
                        rows[-1] = [
                            f"{a} {b}".strip() if i else a
                            for i, (a, b) in enumerate(zip(rows[-1], cells[:5], strict=True))
                        ]
    return rows


def unit_kind(unit: str) -> str:
    u = unit.lower()
    if re.fullmatch(r"1\s*(tablet|capsule)s?", u):
        return "unit"
    if re.fullmatch(r"1\s*ml", u):
        return "ml"
    if re.fullmatch(r"1\s*(g|gm)", u):
        return "g"
    return "other"


def jan_aushadhi_style(medicine: str, dosage: str) -> str:
    """Rewrite one NPPA row as a product name the Jan Aushadhi parser reads.

    "Telmisartan" + "Tablet 40 mg" -> "Telmisartan Tablet 40 mg".
    "Levodopa (A) +Carbidopa(B)" + "Tablet 250mg(A) +25mg(B)" ->
    "Levodopa 250mg + Carbidopa 25mg Tablet".
    """
    dosage = re.sub(r"\s*[–-]\s+|\s+[–-]\s*", " ", dosage)  # "Modified Release - Tablet"
    if len(LABEL.findall(medicine)) < 2:
        return f"{medicine} {dosage}"
    # Salt names by label: "Levodopa (A)" -> {"A": "Levodopa"}.
    salts = {
        m["label"]: m["name"].strip(" +,")
        for m in re.finditer(r"(?P<name>[^()+]+?)\s*\(\s*(?P<label>[A-H])\s*\)", medicine)
    }
    # The form words come before the first strength: "Modified Release Tablet 100 mg (A) ...".
    first = STRENGTH_RE.search(dosage)
    form = dosage[: first.start()].strip() if first else dosage
    # Named groups: STRENGTH_RE has groups of its own, so numbered ones would shift.
    strengths = {
        m["label"]: m["strength"].strip()
        for m in re.finditer(
            rf"(?P<strength>{STRENGTH_RE.pattern})\s*\(\s*(?P<label>[A-H])\s*\)",
            dosage,
            re.I | re.X,
        )
    }
    if not salts or set(salts) != set(strengths):
        return f"{medicine} {dosage}"  # labels do not line up: let the parser refuse it
    return " + ".join(f"{salts[k]} {strengths[k]}" for k in sorted(salts)) + f" {form}"


def alternatives(dosage: str) -> list[str]:
    """One price for several forms: "Conventional / Effervescent / Dispersible / Enteric coated
    Tablets 150 mg" -> four dosages, one per form, each with the same ceiling price."""
    first = STRENGTH_RE.search(dosage)
    head, rest = (dosage[: first.start()], dosage[first.start() :]) if first else (dosage, "")
    if "/" not in head:
        return [dosage]
    options = [o.strip() for o in head.split("/")]
    last = options[-1].split()
    noun = last[-1] if last and re.fullmatch(r"tablets?|capsules?", last[-1], re.I) else ""
    out = []
    for o in options:
        o = re.sub(r"\s+", " ", o).replace("D ispersible", "Dispersible").strip()
        if not o:
            continue
        if noun and not o.lower().endswith(noun.lower()):
            o = f"{o} {noun}"
        out.append(f"{o.replace('Conventional', '').strip()} {rest}".strip())
    return out


def order_number(pdf_path: Path) -> str:
    """'S.O. 1575(E)' from the English text of the order."""
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            text = page.extract_text() or ""
            m = re.search(r"S\.\s*O\.\s*(\d+)\s*\(E\)", text)
            if m:
                return f"S.O. {m[1]}(E)"
    return ""


def parse(folder: Path) -> pd.DataFrame:
    rows = []
    for pdf_path in sorted(folder.glob("*.pdf")):
        order = order_number(pdf_path)
        nlem = "NLEM 2015" if "2015" in pdf_path.stem else "NLEM 2022"
        for _sl, medicine, dosage, unit, price in table_rows(pdf_path):
            try:
                value = float(price.replace(",", ""))
            except ValueError:
                continue  # notes rows, not prices
            for form_dosage in alternatives(dosage):
                parsed = parse_generic_name(jan_aushadhi_style(medicine, form_dosage))
                rows.append(
                    {
                        "composition_key": parsed.key or "",
                        "medicine": medicine,
                        "dosage": form_dosage,
                        "unit": unit,
                        "unit_kind": unit_kind(unit),
                        "ceiling_price": value,
                        "order": order,
                        "effective_from": "2026-04-01",
                        "list": nlem,
                        "parse_status": parsed.status,
                        "parse_reason": parsed.reason,
                        "source_file": pdf_path.name,
                    }
                )
    return pd.DataFrame(rows, columns=COLUMNS)


def main() -> None:
    folder = latest_raw_dir("nppa")
    df = parse(folder)
    CLEAN_DIR.mkdir(exist_ok=True)
    out = CLEAN_DIR / "ceiling_prices.csv"
    df.to_csv(out, index=False)
    print(f"{len(df)} ceiling prices from {folder.name} -> {out}")
    print(df.groupby(["list", "parse_status"]).size().to_string())


if __name__ == "__main__":
    main()
