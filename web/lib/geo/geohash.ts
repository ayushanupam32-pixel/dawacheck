// Geohash: a short string naming a rectangle on the map. Same algorithm as
// pipeline/medicheck_pipeline/geohash.py, tested against the same known values.
// With 3 characters a cell is 1.40625° × 1.40625° (about 156 km × 156 km in India).

const BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";

export function encode(lat: number, lng: number, precision = 3): string {
  const latRange = [-90, 90];
  const lngRange = [-180, 180];
  let code = "";
  let bits = 0;
  let bitCount = 0;
  let even = true; // even bits split longitude, odd bits split latitude

  while (code.length < precision) {
    const range = even ? lngRange : latRange;
    const value = even ? lng : lat;
    const mid = (range[0] + range[1]) / 2;
    if (value >= mid) {
      bits = (bits << 1) | 1;
      range[0] = mid;
    } else {
      bits <<= 1;
      range[1] = mid;
    }
    even = !even;
    if (++bitCount === 5) {
      code += BASE32[bits];
      bits = 0;
      bitCount = 0;
    }
  }
  return code;
}

/** Size of a 3-character cell in degrees (8 longitude bits and 7 latitude bits). */
const CELL_LNG = 360 / 2 ** 8;
const CELL_LAT = 180 / 2 ** 7;

/**
 * The 3-character cell containing the point plus its 8 neighbours. A Kendra 2 km away can sit
 * just across a cell border, so we always load the whole 3 × 3 block around the user.
 */
export function cellsAround(lat: number, lng: number): string[] {
  const cells = new Set<string>();
  for (const dLat of [-CELL_LAT, 0, CELL_LAT]) {
    for (const dLng of [-CELL_LNG, 0, CELL_LNG]) {
      const la = lat + dLat;
      if (la < -90 || la > 90) continue;
      const ln = ((lng + dLng + 540) % 360) - 180; // wrap around the date line
      cells.add(encode(la, ln, 3));
    }
  }
  return [...cells];
}
