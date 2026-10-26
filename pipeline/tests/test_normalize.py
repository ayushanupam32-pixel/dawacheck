import re
from decimal import Decimal

import pytest

from medicheck_pipeline.normalize import (
    STRENGTH_RE,
    Ingredient,
    Strength,
    clean_text,
    composition_key,
    extract_phrases,
    normalize_salt,
    parse_strength,
)


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("Metformin Hydrochloride", "metformin"),
        ("Metformin Hydrochloride IP", "metformin"),
        ("Amlodipine Besilate", "amlodipine"),
        ("Atorvastatin Calcium", "atorvastatin"),
        ("Amoxycillin", "amoxicillin"),  # Indian spelling -> international
        ("Amoxycillin Trihydrate", "amoxicillin"),  # strip suffix, then synonym
        ("Acetaminophen", "paracetamol"),
        ("Vitamin D3", "cholecalciferol"),
        ("Vitamin-C", "ascorbic acid"),
        ("Torasemide", "torsemide"),
        ("Hyoscine Butylbromide", "hyoscine"),
        ("Fexofenadine\xa0Hydrochloride", "fexofenadine"),  # non-breaking space in source
        # Protected: the "suffix" is the medicine itself.
        ("Potassium Chloride", "potassium chloride"),
        ("Sodium Bicarbonate", "sodium bicarbonate"),
        ("Sodium Valproate", "valproate"),  # explicit synonym, not suffix stripping
        # A single word is never stripped to nothing.
        ("Calcium", "calcium"),
    ],
)
def test_normalize_salt(raw: str, expected: str) -> None:
    assert normalize_salt(raw) == expected


def strength(text: str) -> Strength:
    match = STRENGTH_RE.search(text)
    assert match, text
    return parse_strength(match)


@pytest.mark.parametrize(
    ("text", "value", "unit"),
    [
        ("500mg", "500", "mg"),
        ("500 MG", "500", "mg"),
        ("12.5 mg", "12.5", "mg"),
        ("500mcg", "0.5", "mg"),  # mass is always converted to mg
        ("1g", "1000", "mg"),
        ("1 gm", "1000", "mg"),
        ("100IU", "100", "iu"),
        ("2% w/w", "2", "%"),
        ("1.16%w/w", "1.16", "%"),
        ("5mg per 5ml", "1", "mg/ml"),
        ("125mg/5ml", "25", "mg/ml"),
        ("40 mg/ml", "40", "mg/ml"),
        ("40 IU per ml", "40", "iu/ml"),
    ],
)
def test_parse_strength(text: str, value: str, unit: str) -> None:
    assert strength(text) == Strength(Decimal(value), unit)


def test_equal_strengths_written_differently_are_equal() -> None:
    assert strength("0.5 mg") == strength("500mcg")
    assert strength("1g") == strength("1000 mg")


def test_clean_text_collapses_spaces_and_nbsp() -> None:
    assert clean_text("  Montelukast\xa0Sodium 10mg\xa0\xa0and ") == "Montelukast Sodium 10mg and"


def test_extract_forms_prefers_longest_phrase() -> None:
    forms, rest = extract_phrases("Tropicamide Eye Drops IP 1%", "forms")
    assert forms == ["eye_drops"]
    assert rest == "Tropicamide IP 1%"


def test_extract_release_matches_hyphenated_words() -> None:
    release, rest = extract_phrases("Metformin (Sustained-release) 500mg", "releases")
    assert release == ["er"]
    assert "Sustained" not in rest


def test_short_release_codes_only_match_whole_words() -> None:
    # 'er' must not match inside 'Paracetamol Water', nor 'sr' inside other words.
    release, _ = extract_phrases("Ferrous Water Syrup", "releases")
    assert release == []


def test_composition_key_is_order_independent() -> None:
    a = Ingredient("metformin", "Metformin", Strength(Decimal(500), "mg"))
    b = Ingredient("glimepiride", "Glimepiride", Strength(Decimal(1), "mg"))
    assert composition_key([a, b], "tablet", []) == composition_key([b, a], "tablet", [])
    assert composition_key([a, b], "tablet", []) == "glimepiride:1:mg|metformin:500:mg#tablet#ir"


def test_composition_key_separates_release_types() -> None:
    a = Ingredient("metformin", "Metformin", Strength(Decimal(500), "mg"))
    assert composition_key([a], "tablet", []) != composition_key([a], "tablet", ["er"])


def test_key_has_no_scientific_notation() -> None:
    a = Ingredient("formoterol", "Formoterol", Strength(Decimal("0.006"), "mg"))
    assert not re.search(r"[eE][+-]", composition_key([a], "inhaler", []))
