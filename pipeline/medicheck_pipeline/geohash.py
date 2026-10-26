"""Geohash: turn (lat, lng) into a short string that names a rectangle on the map.

Each character halves the area 5 times, alternating longitude and latitude. With 3 characters
a cell is about 156 km x 156 km. Nearby points share a prefix, so "all Kendras near me" means
"the Kendras in my cell and the 8 cells around it". The same algorithm runs in the browser
(web/lib/geo/geohash.ts); the two are tested against the same known values.
"""

BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz"


def encode(lat: float, lng: float, precision: int = 3) -> str:
    lat_range, lng_range = [-90.0, 90.0], [-180.0, 180.0]
    code, bits, bit_count, even = [], 0, 0, True
    while len(code) < precision:
        rng, value = (lng_range, lng) if even else (lat_range, lat)
        mid = (rng[0] + rng[1]) / 2
        if value >= mid:
            bits = (bits << 1) | 1
            rng[0] = mid
        else:
            bits <<= 1
            rng[1] = mid
        even = not even
        bit_count += 1
        if bit_count == 5:
            code.append(BASE32[bits])
            bits, bit_count = 0, 0
    return "".join(code)
