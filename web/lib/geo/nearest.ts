// Nearest Jan Aushadhi Kendras, computed entirely in the browser.
// The user's location is only ever passed to these functions, never to a server.

export type Kendra = {
  code: string;
  address: string;
  district: string;
  state: string;
  pin: string | null;
  phone: string | null;
  lat: number;
  lng: number;
  /** Where the coordinates came from: 'official' | 'address' | 'pincode'. */
  precision: string;
};

export type KendraWithDistance = Kendra & { km: number };

/** The compact file format written by pipeline/build_static.py. */
export type KendraFile = { updated: string; fields: string[]; rows: unknown[][] };

const EARTH_RADIUS_KM = 6371;
export const NEARBY_KM = 10;

/** Great-circle ("as the crow flies") distance in km. Roads are usually 20–40% longer. */
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const a =
    Math.sin(rad(lat2 - lat1) / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

export function parseKendraFile(file: KendraFile): Kendra[] {
  const index = (name: string) => file.fields.indexOf(name);
  const at = Object.fromEntries(
    ["code", "address", "district", "state", "pin", "phone", "lat", "lng", "precision"].map((f) => [
      f,
      index(f),
    ]),
  );
  return file.rows.map((row) => ({
    code: String(row[at.code]),
    address: String(row[at.address] ?? ""),
    district: String(row[at.district] ?? ""),
    state: String(row[at.state] ?? ""),
    pin: (row[at.pin] as string | null) ?? null,
    phone: (row[at.phone] as string | null) ?? null,
    lat: Number(row[at.lat]),
    lng: Number(row[at.lng]),
    precision: String(row[at.precision] ?? ""),
  }));
}

export type NearestResult = {
  kendras: KendraWithDistance[];
  /** False when even the closest Kendra is more than 10 km away. */
  anyNearby: boolean;
};

export function nearestKendras(
  lat: number,
  lng: number,
  kendras: Kendra[],
  count = 3,
): NearestResult {
  const sorted = kendras
    .map((k) => ({ ...k, km: haversineKm(lat, lng, k.lat, k.lng) }))
    .sort((a, b) => a.km - b.km)
    .slice(0, count);
  return { kendras: sorted, anyNearby: sorted.length > 0 && sorted[0].km <= NEARBY_KM };
}

/** Google Maps directions to the Kendra. Only the destination is in the link, not the user. */
export function directionsUrl(k: Pick<Kendra, "lat" | "lng">): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${k.lat},${k.lng}`;
}
