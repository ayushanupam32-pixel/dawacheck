"""Every name here is copied from the real Jan Aushadhi product list (October 2026)."""

from decimal import Decimal

import pytest

from dawacheck_pipeline.parse_jan_aushadhi import parse_generic_name, parse_pack

# (name in the source, expected composition_key)
PARSED_OK = [
    ("Famotidine Tablets IP 40 mg", "famotidine:40:mg#tablet#ir"),
    (
        "Aceclofenac 100mg and Paracetamol 325mg Tablets",
        "aceclofenac:100:mg|paracetamol:325:mg#tablet#ir",
    ),
    ("Atorvastatin 20mg + Ezetimibe 10mg Tablets", "atorvastatin:20:mg|ezetimibe:10:mg#tablet#ir"),
    ("Fluoxetine Hydrochloride Capsules IP 20mg", "fluoxetine:20:mg#capsule#ir"),
    ("Safinamide Tablet (50 Mg)", "safinamide:50:mg#tablet#ir"),
    ("Fexofenadine\xa0Hydrochloride\xa0Tablets IP 120mg", "fexofenadine:120:mg#tablet#ir"),
    ("Selexipag Tablets 200mcg", "selexipag:0.2:mg#tablet#ir"),
    ("Ceftazidime Injection IP 1g", "ceftazidime:1000:mg#injection#ir"),
    # Release types are part of the key.
    ("Metoprolol Extended release Tablets IP 50mg", "metoprolol:50:mg#tablet#er"),
    ("Mycophenolate Sodium Gastro-resistant Tablets 360mg", "mycophenolate:360:mg#tablet#dr"),
    ("Prednisolone Dispersible Tablet (20Mg)", "prednisolone:20:mg#tablet#dispersible"),
    (
        "Dapagliflozin 5mg and Metformin Hydrochloride (Extended Release) 1000mg Tablets",
        "dapagliflozin:5:mg|metformin:1000:mg#tablet#er",
    ),
    # Three ingredients separated by commas and "and".
    (
        "Calcium Citrate Malate 250mg , Vitamin D3 100IU and Folic Acid 50mcg Tablets",
        "calcium citrate malate:250:mg|cholecalciferol:100:iu|folic acid:0.05:mg#tablet#ir",
    ),
    # Strengths written together at the end.
    (
        "Voglibose + Metformin + Gliclazide Tablet (0.2/500/80 Mg)",
        "gliclazide:80:mg|metformin:500:mg|voglibose:0.2:mg#tablet#ir",
    ),
    # Liquids become a concentration per ml.
    ("Promethazine Syrup IP 5mg per 5ml", "promethazine:1:mg/ml#syrup#ir"),
    ("Amoxycillin Oral Suspension IP 125mg per 5ml", "amoxicillin:25:mg/ml#suspension#ir"),
    # A final "per 5ml" in a combination applies to every ingredient.
    (
        "Guaifenesin 100mg, Terbutaline 1.25 mg and Ambroxol 15mg Syrup per 5ml (Suger free)",
        "ambroxol:3:mg/ml|guaifenesin:20:mg/ml|terbutaline:0.25:mg/ml#syrup#ir",
    ),
    ("Tropicamide Eye Drops IP 1% W/V", "tropicamide:1:%#eye_drops#ir"),
    ("Ketoconazole Cream 2% w/w", "ketoconazole:2:%#cream#ir"),
    ("Nicoumalone (Acenocoumarol) 2mg Tablets", "acenocoumarol:2:mg#tablet#ir"),
    (
        "Losartan Potassium 50mg and Hydrochlorothiazide 12.5mg Tabelts IP",
        "hydrochlorothiazide:12.5:mg|losartan:50:mg#tablet#ir",
    ),
]


@pytest.mark.parametrize(("name", "key"), PARSED_OK)
def test_parses_real_names(name: str, key: str) -> None:
    parsed = parse_generic_name(name)
    assert parsed.status == "ok", parsed.reason
    assert parsed.key == key


# Names the parser must REFUSE to read. Guessing here could suggest the wrong medicine.
@pytest.mark.parametrize(
    ("name", "group", "status"),
    [
        (
            "Surgical Cap, Disposable(for Surgeons/Nurses)",
            "Surgical & Medical Consumables",
            "non_drug",
        ),
        ("Calamine Lotion IP", "", "no_strength"),
        # A kit of two separate tablets is not one combined tablet.
        ("Combi kit of Torasemide 20mg Tablets and Eplerenone 25mg Tablets", "", "unparsed"),
        # Sodium valproate and valproic acid both normalize to 'valproate'.
        (
            "Sodium Valproate 333mg and Valproic acid 145mg Controlled Release Tablets",
            "",
            "unparsed",
        ),
        # Two different dosage forms in one name.
        (
            "Somatotropin 4 IU (Recombinant Human Growth Hormone) Powder for Injection",
            "",
            "unparsed",
        ),
        # Strength given as a range.
        ("Diphenhydramine 13-15mg, Ammonium Chloride 135-150mg Cough Syrup", "", "unparsed"),
        # No dosage form word at all.
        ("Evening Primrose Oil 1000 mg", "", "unparsed"),
    ],
)
def test_abstains_when_unsure(name: str, group: str, status: str) -> None:
    parsed = parse_generic_name(name, group)
    assert parsed.status == status
    assert parsed.key is None


@pytest.mark.parametrize(
    ("unit_size", "expected"),
    [
        ("10's", (Decimal(10), "unit")),
        ("1's mono-carton", (Decimal(1), "unit")),
        ("100 ml", (Decimal(100), "ml")),
        ("100ml", (Decimal(100), "ml")),
        ("15 gm Tube", (Decimal(15), "g")),
        ("Vial & Wfi", (None, None)),
        ("One in Mono-Pack", (None, None)),
    ],
)
def test_parse_pack(unit_size: str, expected: tuple) -> None:
    assert parse_pack(unit_size) == expected
