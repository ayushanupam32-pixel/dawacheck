import pytest

from dawacheck_pipeline.parse_cdsco_fdc import entries, latest_date, repair, split_salts, status_of

VOCAB = {
    "cetirizine",
    "paracetamol",
    "phenylephrine",
    "dextromethorphan",
    "glimepiride",
    "metformin",
    "pioglitazone",
    "adenosine triphosphate",
    "rabeprazole",
    "domperidone",
}


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("S.O. 3068(E) dated 11.06.2026", "2026-06-11"),
        # Line wraps in the PDF put spaces inside dates.
        ("GSR NO. 731(E)Dated3 0.09.1994", "1994-09-30"),
        ("S.O.713 (E) Dated10.03 .2016", "2016-03-10"),
        ("Initial suspension vide G.S.R.No. 379 (E) dt 18- 6-2013", "2013-06-18"),
        # Several dates: the latest counts.
        ("S.O. No. 705 (E) dated 10.03.2016 [S.O. No. 4379 (E) dated 07.09.2018]", "2018-09-07"),
        ("S.O.4596", ""),
    ],
)
def test_latest_date(raw: str, expected: str) -> None:
    assert latest_date(raw) == expected


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("cetir izine", "cetirizine"),  # word split by the PDF
        ("aden osine triphosphate", "adenosine triphosphate"),
        ("dextromethophen", "dextromethorphan"),  # 2 letters off, long name
        ("paracetamol", "paracetamol"),
        ("aloe", "aloe"),  # unknown and not close to anything: unchanged
    ],
)
def test_repair(raw: str, expected: str) -> None:
    assert repair(raw, VOCAB) == expected


def test_split_salts_removes_strengths_forms_and_descriptors() -> None:
    salts, kind, strengths = split_salts(
        "Glimepiride 1mg/2mg + Pioglitazone 15mg/15mg + Metformin 850mg/850mg", VOCAB
    )
    assert (salts, kind) == (["glimepiride", "metformin", "pioglitazone"], "combination")
    assert "850mg/850mg" in strengths
    salts, _, _ = split_salts("Cetir izine HCl + Paracetamol + Phenylephrine HCl", VOCAB)
    assert salts == ["cetirizine", "paracetamol", "phenylephrine"]
    salts, _, _ = split_salts(
        "Rabeprazole Sodium (As enteric coated tablet) + Domperidone (sustained release)", VOCAB
    )
    assert salts == ["domperidone", "rabeprazole"]


def test_s_plus_is_part_of_the_name_not_a_separator() -> None:
    salts, kind, _ = split_salts("S(+) Etodolac + Paracetamol", VOCAB)
    assert (salts, kind) == (["paracetamol", "s-etodolac"], "combination")


def test_single_drugs_and_categories() -> None:
    assert split_salts("Phenacetin.", VOCAB)[:2] == (["phenacetin"], "single")
    assert split_salts("Fixed dose combinations of Vitamins with Analgesics.", VOCAB)[1] == (
        "category"
    )
    # Only some forms banned: shown, never matched (tetracycline capsules are legal).
    assert split_salts("Tetracycline Liquid Oral preparations.", VOCAB)[1] == "category"
    assert split_salts("Methapyrilene, its salts.", VOCAB)[:2] == (["methapyrilene"], "single")
    assert split_salts("Chloral Hydrate as a drug.", VOCAB)[:2] == (["chloral hydrate"], "single")
    salts, kind, _ = split_salts("Corticosteroids + any other drug excluding Tamsulosin", VOCAB)
    assert (salts, kind) == ([], "category")


def test_entries_join_rows_and_collect_footnotes() -> None:
    # Rows as pdfplumber returns them from the consolidated list (page 9).
    rows = [
        ["Sr. No.", "Drugs Name", "Notification"],
        ["112.", "Salbutamol + Hydroxy ethyl theophylline (Etofylline)+", "S.O.4687(E)"],
        ["4#", "", "Dated"],
        ["", "Bromhexine", "07.09.2018"],
        ["113.", "Paracetamol + Propyphenazone + Caffeine", "S.O.4689(E)"],
        ["", "", "Dated 07.09.2018"],
    ]
    first, second = entries(rows)
    assert first["description"] == (
        "Salbutamol + Hydroxy ethyl theophylline (Etofylline)+ Bromhexine"
    )
    assert first["notification"] == "S.O.4687(E) Dated 07.09.2018"
    assert first["notes"] == {"4"}
    assert status_of(first, restricted=False) == "under_examination"
    assert status_of(second, restricted=False) == "prohibited"


@pytest.mark.parametrize(
    ("notes", "notification", "expected"),
    [
        ({"1"}, "", "stayed"),
        ({"5"}, "", "quashed"),
        ({"6"}, "", "revoked_with_conditions"),
        (
            set(),
            "Initial suspension ... Was revoked allowing the use of drug",
            "revoked_with_conditions",
        ),
    ],
)
def test_status_from_footnotes(notes: set, notification: str, expected: str) -> None:
    entry = {"description": "x", "notification": notification, "notes": notes}
    assert status_of(entry, restricted=False) == expected
    assert status_of(entry, restricted=True) == "restricted"
