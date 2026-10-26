"""Shared normalization: salt names, strengths and dosage forms.

Every data source (Jan Aushadhi, brand dataset, NPPA, CDSCO) goes through these functions, so the
same medicine from two sources produces the same `composition_key` and can be matched exactly.
The rules themselves live in synonyms.yaml so they can be reviewed and edited without code changes.
"""

import re
import unicodedata
from dataclasses import dataclass
from decimal import Decimal
from functools import cache
from pathlib import Path

import yaml

RULES_FILE = Path(__file__).with_name("synonyms.yaml")


@cache
def rules() -> dict:
    return yaml.safe_load(RULES_FILE.read_text())


def clean_text(text: str) -> str:
    """Unicode-normalize (non-breaking spaces etc.), unify dashes, collapse whitespace."""
    text = unicodedata.normalize("NFKC", text)
    text = text.replace("–", "-").replace("—", "-")
    return re.sub(r"\s+", " ", text).strip()


# ---------------------------------------------------------------- salts


def normalize_salt(name: str) -> str:
    """'Metformin Hydrochloride IP' -> 'metformin'; 'Amoxycillin' -> 'amoxicillin'.

    Order: lowercase -> synonym -> strip salt-form suffixes -> synonym again (a stripped name may
    itself have a synonym, e.g. 'amoxycillin trihydrate' -> 'amoxycillin' -> 'amoxicillin').
    """
    r = rules()
    synonyms: dict[str, str] = r["synonyms"]
    suffixes = set(r["strip_suffixes"])
    protected = tuple(r["protect_prefixes"])

    s = clean_text(name).lower()
    s = re.sub(r"\bvitamin-", "vitamin ", s)  # "Vitamin-C" -> "vitamin c"
    s = re.sub(r"[^a-z0-9\s\-]", " ", s)  # drop punctuation like ( ) , .
    s = re.sub(r"\s+", " ", s).strip()
    s = synonyms.get(s, s)

    if not s.startswith(protected):
        words = s.split(" ")
        # Remove suffix words from the end, but never remove the first word.
        while len(words) > 1 and words[-1] in suffixes:
            words.pop()
        s = " ".join(words)
    return synonyms.get(s, s)


# ---------------------------------------------------------------- strengths

_NUM = r"\d+(?:\.\d+)?"
_MASS_TO_MG = {"mg": Decimal(1), "mcg": Decimal("0.001"), "g": Decimal(1000)}
_UNIT_ALIASES = {
    "mg": "mg",
    "mcg": "mcg",
    "µg": "mcg",
    "μg": "mcg",
    "ug": "mcg",
    "g": "g",
    "gm": "g",
    "gms": "g",
    "iu": "iu",
    "i.u.": "iu",
    "%": "%",
}

STRENGTH_RE = re.compile(
    rf"""
    (?P<value>{_NUM})\s*
    (?P<unit>mg|mcg|µg|μg|ug|gms|gm|g|i\.u\.|iu|%)
    (?:\s*(?:w/w|w/v|v/v))?                      # % qualifier, ignored
    (?:\s*(?:/|per)\s*(?P<per_value>{_NUM})?\s*(?P<per_unit>ml|g|gm))?   # e.g. 5mg per 5ml
    """,
    re.IGNORECASE | re.VERBOSE,
)


@dataclass(frozen=True)
class Strength:
    value: Decimal
    unit: str  # canonical: 'mg', 'iu', '%', 'mg/ml', 'iu/ml', 'mg/g'

    def __str__(self) -> str:
        return f"{format_decimal(self.value)} {self.unit}"


def format_decimal(value: Decimal) -> str:
    """Decimal('500.000') -> '500', Decimal('0.50') -> '0.5' (no scientific notation)."""
    text = format(value.normalize(), "f")
    return text


def parse_strength(match: re.Match[str]) -> Strength:
    """Turn a STRENGTH_RE match into a canonical Strength.

    Mass is converted to mg (500 mcg -> 0.5 mg, 1 g -> 1000 mg) so '0.5mg' and '500mcg' compare
    equal. Concentrations become per 1 ml or per 1 g ('5mg per 5ml' -> 1 mg/ml).
    """
    value = Decimal(match["value"])
    unit = _UNIT_ALIASES[match["unit"].lower()]
    if unit in _MASS_TO_MG:
        value, unit = value * _MASS_TO_MG[unit], "mg"

    if match["per_unit"]:
        per_value = Decimal(match["per_value"] or 1)
        per_unit = "g" if match["per_unit"].lower() in ("g", "gm") else "ml"
        value, unit = value / per_value, f"{unit}/{per_unit}"
    return Strength(value=value.quantize(Decimal("0.0001")).normalize(), unit=unit)


# ---------------------------------------------------------------- forms and release types


def _phrase_table(section: str) -> list[tuple[str, str]]:
    """[(phrase, canonical)], longest phrase first so 'eye drops' wins over 'drops'."""
    table = [
        (phrase.lower(), canonical)
        for canonical, phrases in rules()[section].items()
        for phrase in phrases
    ]
    return sorted(table, key=lambda item: -len(item[0]))


def _phrase_pattern(phrase: str) -> re.Pattern[str]:
    # Whole words only, so 'tab' never matches inside 'tablet' and 'er' never inside 'water'.
    # A space in a phrase also matches a hyphen: 'sustained release' finds 'Sustained-release'.
    body = r"[\s\-]+".join(re.escape(word) for word in phrase.split(" "))
    return re.compile(rf"(?<![a-z]){body}(?![a-z])", re.IGNORECASE)


def extract_phrases(text: str, section: str) -> tuple[list[str], str]:
    """Find every phrase from a rules section ('forms' or 'releases') and remove it from the text.

    Returns (canonical values found, in order, without duplicates; remaining text).
    """
    found: list[str] = []
    for phrase, canonical in _phrase_table(section):
        pattern = _phrase_pattern(phrase)
        if pattern.search(text):
            text = pattern.sub(" ", text)
            if canonical not in found:
                found.append(canonical)
    return found, re.sub(r"\s+", " ", text).strip()


# ---------------------------------------------------------------- composition key


@dataclass(frozen=True)
class Ingredient:
    salt: str  # normalized, e.g. 'metformin'
    display: str  # as written in the source, e.g. 'Metformin Hydrochloride'
    strength: Strength


def implied_release(ingredients: list[Ingredient], form: str, release: list[str]) -> list[str]:
    """Add 'dr' for medicines that only exist as gastro-resistant tablets/capsules.

    'Pan 40 Tablet' (pantoprazole, no release word in the record) -> ['dr'], the same as
    Jan Aushadhi's 'Pantoprazole Gastro-resistant Tablets IP 40 mg'. See synonyms.yaml.
    """
    always_dr = set(rules()["always_delayed_release"])
    if form in ("tablet", "capsule") and any(i.salt in always_dr for i in ingredients):
        return sorted(set(release) | {"dr"})
    return sorted(release)


def composition_key(ingredients: list[Ingredient], form: str, release: list[str]) -> str:
    """Exact-match key: sorted salts with strengths + form + release type.

    'metformin:500:mg|glimepiride:1:mg' sorted -> 'glimepiride:1:mg|metformin:500:mg#tablet#er'.
    Two products are interchangeable candidates only if their keys are identical.
    """
    parts = sorted(
        f"{i.salt}:{format_decimal(i.strength.value)}:{i.strength.unit}" for i in ingredients
    )
    return "|".join(parts) + f"#{form}#{'+'.join(sorted(release)) or 'ir'}"
