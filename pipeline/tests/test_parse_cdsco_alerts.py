from pathlib import Path

import pytest

from dawacheck_pipeline.parse_cdsco_alerts import (
    normalize_batch,
    parse,
    parse_month,
    split_batches,
    text,
)

FIXTURES = Path(__file__).parent / "fixtures" / "cdsco_alerts"


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("AT25-0938A", "AT250938A"),
        ("aox 2402", "AOX2402"),
        ("Z24/185", "Z24185"),
        ("1-3098", "13098"),
    ],
)
def test_normalize_batch_matches_the_strip_reader(raw: str, expected: str) -> None:
    # Must stay identical to normalizeBatch in web/lib/ai/extract.ts.
    assert normalize_batch(raw) == expected


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        # Real cells from the CDSCO data.
        ("PFB-701, OPCP-195", ["PFB-701", "OPCP-195"]),
        ("AHT-1239,", ["AHT-1239"]),
        ("AB301008C (Drug) WM21E005 (WFI)", ["AB301008C", "WM21E005"]),
        ("AS-9057 (Two different samples received with same batch number)", ["AS-9057"]),
        ("22VC 1 03A", ["22VC 1 03A"]),  # one batch printed with spaces
        ("1-3098", ["1-3098"]),
        ("", [""]),
    ],
)
def test_split_batches(raw: str, expected: list[str]) -> None:
    assert (split_batches(raw) or [""]) == expected


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("Feb-2026", "2026-02"),
        ("FEB-2026", "2026-02"),
        ("Sept-2026", "2026-09"),
        ("02/2026", "2026-02"),
        ("Jan 2028", "2028-01"),
        ("NA", ""),
        ("Under Investigation", ""),
    ],
)
def test_parse_month(raw: str, expected: str) -> None:
    assert parse_month(raw) == expected


def test_placeholders_become_empty() -> None:
    assert text("NA") == ""
    assert text(" n/a ") == ""
    assert text(None) == ""
    assert text("Alzomac-0.5 Tablets") == "Alzomac-0.5 Tablets"


def test_parse_real_rows() -> None:
    df = parse(FIXTURES)
    nsq = df[df["kind"] == "nsq"]
    assert len(nsq) == 3
    first = nsq.iloc[0]
    assert first["alert_month"] == "2026-09"
    assert first["brand_name"] == "Alzomac-0.5 Tablets"
    assert first["batch_no_norm"] == "60098"
    assert (first["mfg_date"], first["exp_date"]) == ("2026-02", "2028-01")
    assert "Dissolution" in first["failed_parameter"]
    # "NA" brand -> empty, never the text "NA".
    assert nsq.iloc[1]["brand_name"] == ""
    assert nsq.iloc[2]["batch_no_norm"] == "AT250938A"


def test_spurious_rows_keep_remarks() -> None:
    spurious = parse(FIXTURES).query("kind == 'spurious'").iloc[0]
    assert spurious["batch_no_norm"] == "18230791"
    assert "TELMA AM" in spurious["product_name"]
    assert spurious["brand_name"] == ""
    assert "not been manufactured by them" in spurious["remarks"]
    # "Under Investigation" is a status, not a manufacturer; kept as written (it is true).
    assert spurious["manufacturer"] == "Under Investigation"


def test_brand_in_brackets_loses_them(tmp_path: Path) -> None:
    (tmp_path / "spurious_2026-09.json").write_text(
        '{"aaData": [{"str_brand_name": "(Sporlac-DS)", "str_batch_no": "BDS25003"}]}'
    )
    assert parse(tmp_path).iloc[0]["brand_name"] == "Sporlac-DS"
