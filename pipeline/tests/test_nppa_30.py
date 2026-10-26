"""The fair-price check's data on 30 hand-verified medicines (project brief: 100%).

Expected ceiling prices were read by hand from the English table of NPPA order S.O. 1575(E),
25.03.2026, in force from 1.4.2026 (raw/nppa/2026-03-27/nlem2022-767.pdf, pages 31-51). The test
parses that PDF with parse_nppa.py and checks each medicine gets the right composition key (the
key brands use) and exactly the official price.
"""

import pytest

from medicheck_pipeline.parse_nppa import parse
from medicheck_pipeline.paths import RAW_DIR

# (Sl. No. in the order, composition key, ceiling price in Rs. per tablet/capsule, excl. GST)
OFFICIAL = [
    (25, "albendazole:400:mg#tablet#ir", 7.21),
    (39, "amlodipine:5:mg#tablet#ir", 2.56),
    (40, "amlodipine:10:mg#tablet#ir", 5.58),
    (42, "amoxicillin:500:mg#capsule#ir", 7.54),
    (75, "atorvastatin:10:mg#tablet#ir", 5.09),
    (72, "atorvastatin:40:mg#tablet#ir", 19.77),
    (83, "azithromycin:500:mg#tablet#ir", 24.14),
    (147, "cefixime:200:mg#tablet#ir", 10.01),
    (163, "cetirizine:10:mg#tablet#ir", 1.92),
    (177, "ciprofloxacin:500:mg#tablet#ir", 4.35),
    (204, "clopidogrel:75:mg#tablet#ir", 6.82),
    (250, "diclofenac:50:mg#tablet#ir", 2.10),
    (270, "domperidone:10:mg#tablet#ir", 2.37),
    (276, "doxycycline:100:mg#capsule#ir", 3.15),
    (285, "enalapril:5:mg#tablet#ir", 3.78),
    (293, "escitalopram:10:mg#tablet#ir", 9.22),
    (310, "fluconazole:150:mg#tablet#ir", 12.35),
    (328, "folic acid:5:mg#tablet#ir", 1.55),
    (331, "furosemide:40:mg#tablet#ir", 0.94),
    (344, "glimepiride:2:mg#tablet#ir", 5.94),
    (373, "hydrochlorothiazide:12.5:mg#tablet#ir", 1.07),
    (385, "ibuprofen:400:mg#tablet#ir", 1.23),
    (412, "ivermectin:12:mg#tablet#ir", 38.27),
    (445, "levothyroxine:0.05:mg#tablet#ir", 1.06),  # 50 mcg = 0.05 mg
    (452, "levothyroxine:0.1:mg#tablet#ir", 1.35),
    (489, "metformin:500:mg#tablet#ir", 2.07),
    (488, "metformin:1000:mg#tablet#ir", 3.57),
    (502, "metoprolol:50:mg#tablet#ir", 5.98),
    (705, "telmisartan:40:mg#tablet#ir", 6.92),
    (706, "telmisartan:80:mg#tablet#ir", 10.65),
]


@pytest.fixture(scope="module")
def prices():
    df = parse(RAW_DIR / "nppa" / "2026-03-27")
    return df[(df.parse_status == "ok") & (df.list == "NLEM 2022")]


def test_thirty_are_distinct_medicines() -> None:
    assert len({key for _, key, _ in OFFICIAL}) == 30


@pytest.mark.parametrize(("sl", "key", "price"), OFFICIAL)
def test_official_ceiling_price(prices, sl: int, key: str, price: float) -> None:
    rows = prices[prices.composition_key == key]
    assert len(rows) >= 1, f"Sl. {sl}: {key} not parsed"
    assert set(rows.ceiling_price.astype(float)) == {price}, f"Sl. {sl}"
    assert set(rows.unit_kind) == {"unit"}
    assert set(rows.order) == {"S.O. 1575(E)"}
