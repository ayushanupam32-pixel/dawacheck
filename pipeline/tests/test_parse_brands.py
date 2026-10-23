"""Rows copied from the A-Z Medicine Dataset of India (Kaggle, Nov 2022)."""

from decimal import Decimal

import pytest

from dawacheck_pipeline.parse_brands import (
    normalize_brand_name,
    parse_brand,
    parse_composition,
    parse_pack,
)


@pytest.mark.parametrize(
    ("text", "salt", "value", "unit"),
    [
        ("Amoxycillin  (500mg) ", "amoxicillin", "500", "mg"),
        ("  Clavulanic Acid (125mg)", "clavulanic acid", "125", "mg"),
        ("Methylcobalamin (750mcg) ", "methylcobalamin", "0.75", "mg"),
        ("Ambroxol (30mg/5ml) ", "ambroxol", "6", "mg/ml"),
        ("Imatinib mesylate (100mg)", "imatinib", "100", "mg"),
        # Descriptive brackets are dropped; the last bracket is the strength.
        (
            "Progesterone (Natural Micronized) (200mg)",
            "progesterone",
            "200",
            "mg",
        ),
        (" Vitamin B6 (Pyridoxine) (20mg)", "pyridoxine", "20", "mg"),
    ],
)
def test_parse_composition(text: str, salt: str, value: str, unit: str) -> None:
    ingredient = parse_composition(text)
    assert ingredient is not None
    assert (ingredient.salt, ingredient.strength.value, ingredient.strength.unit) == (
        salt,
        Decimal(value),
        unit,
    )


@pytest.mark.parametrize(
    "text", ["Diclofenac (NA)", "Paracetamol", "Lactobacillus (60Million spores)"]
)
def test_parse_composition_refuses_unclear_strengths(text: str) -> None:
    assert parse_composition(text) is None


def test_brand_and_generic_produce_the_same_key() -> None:
    # "Telma 40" must get the same key as Jan Aushadhi's "Telmisartan Tablets IP 40mg".
    parsed = parse_brand("Telma 40 Tablet", "strip of 15 tablets", ["Telmisartan (40mg)"])
    assert parsed.key == "telmisartan:40:mg#tablet#ir"


def test_release_type_read_from_name_and_label() -> None:
    parsed = parse_brand("Aclova 200mg Tablet SR", "strip of 10 tablet sr", ["Aceclofenac (200mg)"])
    assert parsed.key == "aceclofenac:200:mg#tablet#er"


def test_combination_order_does_not_matter() -> None:
    a = parse_brand("X", "strip of 10 tablets", ["Glimepiride (1mg)", "Metformin (500mg)"])
    b = parse_brand("Y", "strip of 10 tablets", ["Metformin (500mg)", "Glimepiride (1mg)"])
    assert a.key == b.key == "glimepiride:1:mg|metformin:500:mg#tablet#ir"


def test_unreadable_ingredient_makes_whole_brand_unparsed() -> None:
    parsed = parse_brand("Z", "strip of 10 tablets", ["Paracetamol (500mg)", "Diclofenac (NA)"])
    assert parsed.status == "unparsed"
    assert parsed.key is None


@pytest.mark.parametrize(
    ("label", "expected"),
    [
        ("strip of 10 tablets", (Decimal(10), "unit")),
        ("strip of 15 tablet sr", (Decimal(15), "unit")),
        ("bottle of 100 ml Syrup", (Decimal(100), "ml")),
        ("tube of 15 gm Cream", (Decimal(15), "g")),
        ("vial of 1 Injection", (None, None)),
    ],
)
def test_parse_pack(label: str, expected: tuple) -> None:
    assert parse_pack(label) == expected


def test_normalize_brand_name() -> None:
    assert normalize_brand_name("Augmentin 625 Duo Tablet") == "augmentin 625 duo tablet"
    assert normalize_brand_name("Domrit-O Capsule") == "domrit o capsule"
