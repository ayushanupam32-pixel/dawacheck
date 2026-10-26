import pytest

from medicheck_pipeline.parse_jan_aushadhi import parse_generic_name
from medicheck_pipeline.parse_nppa import alternatives, jan_aushadhi_style, unit_kind


def key(medicine: str, dosage: str) -> str | None:
    return parse_generic_name(jan_aushadhi_style(medicine, dosage)).key


@pytest.mark.parametrize(
    ("medicine", "dosage", "expected"),
    [
        # Real rows of NPPA order S.O. 1575(E), 25.03.2026.
        ("Telmisartan", "Tablet 40mg", "telmisartan:40:mg#tablet#ir"),
        ("Metformin", "Tablet 500mg", "metformin:500:mg#tablet#ir"),
        (
            "Levodopa (A) +Carbidopa(B)",
            "Tablet 250mg(A) +25mg(B)",
            "carbidopa:25:mg|levodopa:250:mg#tablet#ir",
        ),
        (
            "Levodopa (A) +Carbidopa(B)",
            "Modified Release-Tablet 200mg (A) + 50mg (B)",
            "carbidopa:50:mg|levodopa:200:mg#tablet#er",
        ),
        (
            "Amoxicillin (A) +Clavulanic acid (B)",
            "Tablet 500 mg (A) + 125 mg (B)",
            "amoxicillin:500:mg|clavulanic acid:125:mg#tablet#ir",
        ),
        # "Modified Release - Tablet": the dash must not stick to the salt name.
        ("Sodium Valproate", "Modified Release - Tablet 500mg", "valproate:500:mg#tablet#er"),
        ("Oxytocin", "Injection 10IU/mL", "oxytocin:10:iu/ml#injection#ir"),
    ],
)
def test_rows_get_the_same_keys_as_brands(medicine: str, dosage: str, expected: str) -> None:
    assert key(medicine, dosage) == expected


def test_one_price_for_several_forms_becomes_one_row_per_form() -> None:
    dosages = alternatives(
        "Conventional / Effervescent / Dispersible / Enteric coated Tablets 325 mg"
    )
    keys = {key("Acetylsalicylic acid", d) for d in dosages}
    # "Acetylsalicylic acid" is aspirin (synonyms.yaml), as the brands call it.
    assert keys == {
        "aspirin:325:mg#tablet#ir",
        "aspirin:325:mg#tablet#effervescent",
        "aspirin:325:mg#tablet#dispersible",
        "aspirin:325:mg#tablet#dr",
    }
    assert alternatives("Tablet 40mg") == ["Tablet 40mg"]


def test_unclear_rows_are_refused_not_guessed() -> None:
    # Labels that do not line up, or a bracketed group name: no key rather than a wrong one.
    assert (
        key("Co-trimoxazole [Sulphamethoxazole (A) +Trimethoprim(B)]*", "Tablet 400 mg (A)") is None
    )


@pytest.mark.parametrize(
    ("unit", "kind"),
    [
        ("1 Tablet", "unit"),
        ("1 Capsule", "unit"),
        ("1 ML", "ml"),
        ("1 GM", "g"),
        ("1 Vial", "other"),
    ],
)
def test_unit_kind(unit: str, kind: str) -> None:
    assert unit_kind(unit) == kind
