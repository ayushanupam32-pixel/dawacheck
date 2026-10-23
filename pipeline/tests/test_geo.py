import pytest

from dawacheck_pipeline.geohash import encode
from dawacheck_pipeline.parse_kendras import clean_phone, haversine_km


# Known values, computed with the independent pygeohash library. The browser version
# (web/lib/geo/geohash.ts) is tested against the same table.
@pytest.mark.parametrize(
    ("lat", "lng", "precision", "expected"),
    [
        (28.6139, 77.2090, 5, "ttnfu"),  # New Delhi
        (19.0760, 72.8777, 5, "te7ud"),  # Mumbai
        (13.0827, 80.2707, 5, "tf346"),  # Chennai
        (57.64911, 10.40744, 11, "u4pruydqqvj"),  # textbook example
    ],
)
def test_encode(lat: float, lng: float, precision: int, expected: str) -> None:
    assert encode(lat, lng, precision) == expected


def test_haversine_delhi_to_mumbai() -> None:
    assert haversine_km(28.6139, 77.2090, 19.0760, 72.8777) == pytest.approx(1153, abs=5)


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("9876543210", "9876543210"),
        ("+91 98765 43210", "9876543210"),
        ("09876543210", "9876543210"),
        ("12345", None),
        (None, None),
    ],
)
def test_clean_phone(raw, expected) -> None:
    assert clean_phone(raw) == expected


def _kendra(code: str, district: str, lat: float, lng: float) -> dict:
    return {
        "storeCode": code,
        "status": 1,
        "kendraAddress": "Shop 1",
        "districtName": district,
        "stateName": "Rajasthan",
        "pinCode": 335001,
        "contactNumber": "9876543210",
        "latitude": str(lat),
        "longitude": str(lng),
    }


def test_kendra_far_from_its_own_district_is_not_trusted() -> None:
    from dawacheck_pipeline.parse_kendras import build_rows

    raw = [_kendra(f"G{i}", "Ganganagar", 29.9 + i / 100, 73.88) for i in range(5)]
    # Same state, but placed in central Delhi, ~350 km from Ganganagar.
    raw.append(_kendra("WRONG", "Ganganagar", 28.6315, 77.2167))
    df = build_rows(raw, geocode=lambda query: None).set_index("kendra_code")

    assert (df.loc[["G0", "G1", "G2", "G3", "G4"], "geo_precision"] == "official").all()
    # Not trusted: re-placed at the centre of its PIN code area instead of central Delhi.
    assert df.loc["WRONG", "geo_precision"] == "pincode"
    assert df.loc["WRONG", "lat"] > 29.8
