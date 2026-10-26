"""Parse the raw Jan Aushadhi product list into clean, matchable rows.

The source has no separate salt / strength / form columns; everything is in one name, e.g.
  "Aceclofenac 100mg and Paracetamol 325mg Tablets"
  "Famotidine Tablets IP 40 mg"
  "Dapagliflozin 5mg and Metformin Hydrochloride (Extended Release) 1000mg Tablets"

`parse_generic_name` splits such names into ingredients, a dosage form and a release type.
It is strict on purpose: if any part is unclear the row is marked 'unparsed' and is never used for
a generic suggestion. Missing a match is safe; a wrong match is not.

Run: uv run python -m medicheck_pipeline.parse_jan_aushadhi
Output: pipeline/clean/ja_products.csv
"""

import json
import re
from dataclasses import dataclass, field
from decimal import Decimal

import pandas as pd

from medicheck_pipeline.normalize import (
    STRENGTH_RE,
    Ingredient,
    Strength,
    clean_text,
    composition_key,
    extract_phrases,
    format_decimal,
    implied_release,
    normalize_salt,
    parse_strength,
    rules,
)
from medicheck_pipeline.paths import CLEAN_DIR, latest_raw_dir

NON_DRUG_GROUPS = {"surgical & medical consumables"}

# Separators between ingredients: "+", ",", "&", "and", "with".
_SPLIT_RE = re.compile(r"\s*(?:\+|,|&|\band\b|\bwith\b)\s*", re.IGNORECASE)
# Pharmacopoeia tags (Indian, British, US, National Formulary of India) carry no matching meaning.
_PHARMACOPOEIA_RE = re.compile(r"\b(?:IP|BP|USP|NF|NFI)\b")
_TRAILING_PER_ML_RE = re.compile(r"\s*(?:per|/)\s*(?P<n>\d+(?:\.\d+)?)\s*ml\s*$", re.IGNORECASE)
# One ingredient: a name, then a strength at the end, optionally in brackets: "Safinamide (50 mg)".
_SEGMENT_RE = re.compile(
    rf"^(?P<salt>[A-Za-z][A-Za-z0-9 \-'.]*?)\s*\(?\s*(?P<strength>{STRENGTH_RE.pattern})\s*\)?$",
    re.IGNORECASE | re.VERBOSE,
)


# Strengths written together at the end: "Voglibose + Metformin + Gliclazide (0.2/500/80 Mg)".
_SHARED_STRENGTHS_RE = re.compile(
    r"^(?P<names>[^()\d]+?)\s*\(\s*(?P<values>\d+(?:\.\d+)?(?:\s*/\s*\d+(?:\.\d+)?)+)\s*"
    r"(?P<unit>mg|mcg|g|iu)\s*\)$",
    re.IGNORECASE,
)


def _expand_shared_strengths(text: str) -> str:
    """'A + B (3/5 Mg)' -> 'A 3 Mg + B 5 Mg'. Unchanged if the counts of names and values differ."""
    match = _SHARED_STRENGTHS_RE.match(text)
    if not match:
        return text
    names = [n.strip() for n in _SPLIT_RE.split(match["names"]) if n.strip()]
    values = [v.strip() for v in match["values"].split("/")]
    if len(names) != len(values):
        return text
    return " + ".join(f"{n} {v} {match['unit']}" for n, v in zip(names, values, strict=True))


@dataclass
class ParsedName:
    status: str  # 'ok' | 'non_drug' | 'no_strength' | 'unparsed'
    ingredients: list[Ingredient] = field(default_factory=list)
    form: str | None = None
    release: list[str] = field(default_factory=list)
    reason: str = ""

    @property
    def key(self) -> str | None:
        if self.status != "ok" or self.form is None:
            return None
        return composition_key(self.ingredients, self.form, self.release)


def parse_generic_name(name: str, group: str = "") -> ParsedName:
    if group.strip().lower() in NON_DRUG_GROUPS:
        return ParsedName("non_drug", reason="surgical/medical consumable")

    text = clean_text(name)
    text = re.sub(r"(?<=\d),(?=\d)", "", text)  # "1,00,000 IU" -> "100000 IU"

    if not STRENGTH_RE.search(text):
        return ParsedName("no_strength", reason="no strength in name")
    if re.search(r"\d\s*-\s*\d", text):
        # "13-15mg" is a range, not one strength; there is no single value to match on.
        return ParsedName("unparsed", reason="strength given as a range")
    if re.search(r"\bkit\b", text, re.IGNORECASE):
        # A kit holds separate products (e.g. two different tablets), not one combined medicine.
        return ParsedName("unparsed", reason="kit of separate products")

    release, text = extract_phrases(text, "releases")
    forms, text = extract_phrases(text, "forms")
    if len(forms) != 1:
        return ParsedName("unparsed", reason=f"expected 1 dosage form, found {forms or 'none'}")
    for word in rules()["descriptor_words"]:
        text = re.sub(rf"(?<![a-z]){re.escape(word)}(?![a-z])", " ", text, flags=re.IGNORECASE)

    text = _PHARMACOPOEIA_RE.sub(" ", text)
    # Brackets without numbers are descriptions, not ingredients: "(Sugar Free)", "(Lyophilised)",
    # "(Acenocoumarol)" after "Nicoumalone". Drop them, and "per vial"-style pack wording.
    text = re.sub(r"\([^()\d]*\)", " ", text)
    text = re.sub(r"\bper\s+(?:vial|ampoule|bottle|sachet|pack)\b", " ", text, flags=re.IGNORECASE)
    text = re.sub(r"\bfor\s+inhalation\b", " ", text, flags=re.IGNORECASE)
    text = _expand_shared_strengths(re.sub(r"\s+", " ", text).strip(" -,"))

    # "A 100mg, B 1.25mg and C 15mg per 5ml": in a combination, a final "per 5ml" applies to
    # every ingredient, not only the last one. Cut it off here and apply it to all below.
    shared_per: Decimal | None = None
    segments = _SPLIT_RE.split(text)
    per_match = _TRAILING_PER_ML_RE.search(text)
    if len(segments) > 1 and per_match:
        shared_per = Decimal(per_match["n"])
        segments = _SPLIT_RE.split(text[: per_match.start()].strip())

    ingredients: list[Ingredient] = []
    for segment in segments:
        segment = segment.strip(" -")
        match = _SEGMENT_RE.match(segment)
        if not match:
            return ParsedName("unparsed", reason=f"can't read ingredient {segment!r}")
        strength_match = STRENGTH_RE.search(match["strength"])
        assert strength_match is not None  # the segment regex already matched it
        display = match["salt"].strip()
        strength = parse_strength(strength_match)
        if shared_per is not None:
            if strength.unit not in ("mg", "iu"):
                return ParsedName("unparsed", reason="mixed per-volume strengths")
            strength = Strength(strength.value / shared_per, f"{strength.unit}/ml")
        ingredients.append(Ingredient(normalize_salt(display), display, strength))

    salts = [i.salt for i in ingredients]
    if len(set(salts)) != len(salts):
        return ParsedName("unparsed", reason="same salt listed twice")

    return ParsedName("ok", ingredients, forms[0], implied_release(ingredients, forms[0], release))


_PACK_RE = re.compile(r"^\s*(?P<n>\d+(?:\.\d+)?)\s*(?P<unit>'s|s|ml|g|gm|gms)\b", re.IGNORECASE)


def parse_pack(unit_size: str) -> tuple[Decimal | None, str | None]:
    """ "10's" -> (10, 'unit'); "100 ml" -> (100, 'ml'); "15 gm Tube" -> (15, 'g').

    Anything else ("Vial & Wfi", "One in Mono-Pack") -> (None, None): pack size unknown.
    """
    match = _PACK_RE.match(clean_text(unit_size or ""))
    if not match:
        return None, None
    unit = match["unit"].lower()
    unit = "unit" if unit in ("'s", "s") else "g" if unit.startswith("g") else "ml"
    return Decimal(match["n"]), unit


def build_rows(products: list[dict]) -> pd.DataFrame:
    rows = []
    for p in products:
        parsed = parse_generic_name(p["genericName"], p.get("groupName") or "")
        pack_size, pack_unit = parse_pack(p.get("unitSize") or "")
        mrp = p.get("mrp") or 0
        rows.append(
            {
                "drug_code": str(p["drugCode"]),
                "generic_name": clean_text(p["genericName"]),
                "group_name": p.get("groupName"),
                "unit_size": p.get("unitSize"),
                "pack_size": pack_size,
                "pack_unit": pack_unit,
                # The source lists unpriced items as 0 ("under process"); store them as unknown.
                "mrp": mrp if mrp > 0 else None,
                "parse_status": parsed.status,
                "parse_reason": parsed.reason,
                "form": parsed.form,
                "release": "+".join(parsed.release) or None,
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
    source = latest_raw_dir("ja_products") / "products.json"
    products = json.loads(source.read_text())["responseBody"]["newProductResponsesList"]
    df = build_rows(products)

    CLEAN_DIR.mkdir(exist_ok=True)
    out = CLEAN_DIR / "ja_products.csv"
    df.to_csv(out, index=False)

    print(f"Read {len(df)} products from {source}")
    print(df["parse_status"].value_counts().to_string())
    usable = df[(df.parse_status == "ok") & df.mrp.notna()]
    print(f"Usable for generic matching (parsed + priced): {len(usable)}")
    print(f"Wrote {out}")


if __name__ == "__main__":
    main()
