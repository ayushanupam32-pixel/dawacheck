"""Parse the A-Z Medicine Dataset of India (Kaggle, CC BY-SA 4.0) into clean brand rows.

Source columns used: name, manufacturer_name, pack_size_label, short_composition1/2,
Is_discontinued. Each composition column holds one ingredient, e.g. "Amoxycillin  (500mg) ".

Important limitation: the dataset has only TWO composition columns. A medicine with three or more
ingredients is cut to its first two (e.g. "Coldlift Plus" lists only caffeine + cetirizine).
We cannot tell from the data alone whether a two-ingredient row is complete, so such rows get
composition_complete = False and the app must ask the user to confirm the ingredients printed on
their strip before showing a generic. One-ingredient rows are always complete.

Run: uv run python -m dawacheck_pipeline.parse_brands
Output: pipeline/clean/brands.csv
"""

import json
import re
from dataclasses import dataclass, field
from decimal import Decimal

import pandas as pd

from dawacheck_pipeline.normalize import (
    STRENGTH_RE,
    Ingredient,
    clean_text,
    composition_key,
    extract_phrases,
    format_decimal,
    normalize_salt,
    parse_strength,
)
from dawacheck_pipeline.paths import CLEAN_DIR, latest_raw_dir

SOURCE_NAME = "kaggle:shudhanshusingh/az-medicine-dataset-of-india (CC BY-SA 4.0)"

# "Progesterone (Natural Micronized) (200mg)": the LAST bracket is the strength.
_COMPOSITION_RE = re.compile(r"^(?P<salt>.+?)\s*\((?P<strength>[^()]*\d[^()]*)\)\s*$")
_PACK_RE = re.compile(
    r"\bof\s+(?P<n>\d+(?:\.\d+)?)\s*(?P<unit>ml|gm|g|tablets?|capsules?|soft|sachets?|strips?)\b",
    re.IGNORECASE,
)


@dataclass
class ParsedBrand:
    status: str  # 'ok' | 'unparsed'
    ingredients: list[Ingredient] = field(default_factory=list)
    form: str | None = None
    release: list[str] = field(default_factory=list)
    reason: str = ""

    @property
    def key(self) -> str | None:
        if self.status != "ok" or self.form is None:
            return None
        return composition_key(self.ingredients, self.form, self.release)


def parse_composition(text: str) -> Ingredient | None:
    """'Amoxycillin  (500mg) ' -> Ingredient('amoxicillin', 'Amoxycillin', 500 mg)."""
    match = _COMPOSITION_RE.match(clean_text(text))
    if not match:
        return None
    strength_text = match["strength"]
    if re.search(r"\d\s*-\s*\d", strength_text):
        return None  # a range like "13-15mg" is not one strength
    strength_match = STRENGTH_RE.fullmatch(strength_text.strip())
    if not strength_match:
        return None
    # Brackets without numbers describe the salt: "Vitamin B6 (Pyridoxine)" -> "Vitamin B6".
    display = re.sub(r"\s*\([^()\d]*\)", "", match["salt"]).strip()
    return Ingredient(normalize_salt(display), display, parse_strength(strength_match))


def parse_brand(name: str, pack_label: str, compositions: list[str]) -> ParsedBrand:
    ingredients = []
    for text in compositions:
        ingredient = parse_composition(text)
        if ingredient is None:
            return ParsedBrand("unparsed", reason=f"can't read composition {text.strip()!r}")
        ingredients.append(ingredient)
    if not ingredients:
        return ParsedBrand("unparsed", reason="no composition")
    if len({i.salt for i in ingredients}) != len(ingredients):
        return ParsedBrand("unparsed", reason="same salt listed twice")

    # The pack label ("strip of 10 tablet sr") is the most reliable place for form and release;
    # the brand name ("Pregalin SR 75 Tablet") adds release codes the label sometimes omits.
    label_forms, _ = extract_phrases(clean_text(pack_label or ""), "forms")
    name_forms, _ = extract_phrases(clean_text(name), "forms")
    forms = label_forms or name_forms
    if len(forms) != 1:
        return ParsedBrand("unparsed", reason=f"expected 1 dosage form, found {forms or 'none'}")
    label_release, _ = extract_phrases(clean_text(pack_label or ""), "releases")
    name_release, _ = extract_phrases(clean_text(name), "releases")
    release = sorted(set(label_release) | set(name_release))
    return ParsedBrand("ok", ingredients, forms[0], release)


def parse_pack(label: str) -> tuple[Decimal | None, str | None]:
    """'strip of 10 tablets' -> (10, 'unit'); 'bottle of 100 ml Syrup' -> (100, 'ml')."""
    match = _PACK_RE.search(clean_text(label or ""))
    if not match:
        return None, None
    unit = match["unit"].lower()
    unit = "ml" if unit == "ml" else "g" if unit in ("g", "gm") else "unit"
    return Decimal(match["n"]), unit


def normalize_brand_name(name: str) -> str:
    """'Augmentin 625 Duo Tablet' -> 'augmentin 625 duo tablet' (lowercase, no punctuation)."""
    text = clean_text(name).lower()
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return text.strip()


def build_rows(df: pd.DataFrame) -> pd.DataFrame:
    rows = []
    for record in df.itertuples(index=False):
        compositions = [
            c for c in (record.short_composition1, record.short_composition2) if isinstance(c, str)
        ]
        compositions = [c for c in compositions if c.strip()]
        parsed = parse_brand(record.name, record.pack_size_label, compositions)
        pack_size, pack_unit = parse_pack(record.pack_size_label)
        rows.append(
            {
                "source_id": record.id,
                "name": clean_text(record.name),
                "name_norm": normalize_brand_name(record.name),
                "manufacturer": clean_text(record.manufacturer_name or ""),
                "pack_label": record.pack_size_label,
                "pack_size": pack_size,
                "pack_unit": pack_unit,
                # Recorded Nov 2022; shown only as an old reference, never as today's price.
                "mrp_2022": record.price,
                "discontinued": bool(record.Is_discontinued),
                "parse_status": parsed.status,
                "parse_reason": parsed.reason,
                "form": parsed.form,
                "release": "+".join(parsed.release) or None,
                "ingredient_count": len(parsed.ingredients),
                "composition_complete": len(parsed.ingredients) == 1,
                "ingredients": json.dumps(
                    [
                        {
                            "salt": i.salt,
                            "display": i.display,
                            "value": format_decimal(i.strength.value),
                            "unit": i.strength.unit,
                        }
                        for i in parsed.ingredients
                    ]
                )
                if parsed.ingredients
                else None,
                "composition_key": parsed.key,
            }
        )
    return pd.DataFrame(rows)


def main() -> None:
    # The original Kaggle zip is kept as-is (7 MB instead of a 32 MB CSV); pandas reads the CSV
    # inside it directly.
    source = latest_raw_dir("brands") / "az-medicine-dataset-of-india.zip"
    # "price(₹)" is not a valid Python attribute name; rename it before itertuples().
    df = build_rows(pd.read_csv(source).rename(columns={"price(₹)": "price"}))
    CLEAN_DIR.mkdir(exist_ok=True)
    out = CLEAN_DIR / "brands.csv"
    df.to_csv(out, index=False)
    print(f"Read {len(df)} brands from {source}")
    print(df["parse_status"].value_counts().to_string())
    print(f"Wrote {out}")


if __name__ == "__main__":
    main()
