import { describe, expect, it } from "vitest";
import { cellsAround, encode } from "@/lib/geo/geohash";
import {
  directionsUrl,
  haversineKm,
  nearestKendras,
  parseKendraFile,
  type Kendra,
} from "@/lib/geo/nearest";

describe("geohash encode", () => {
  // Same table as pipeline/tests/test_geo.py (values from the pygeohash library), so the
  // browser and the pipeline always put a Kendra in the same file.
  it.each([
    [28.6139, 77.209, 5, "ttnfu"], // New Delhi
    [19.076, 72.8777, 5, "te7ud"], // Mumbai
    [13.0827, 80.2707, 5, "tf346"], // Chennai
    [57.64911, 10.40744, 11, "u4pruydqqvj"],
  ])("(%f, %f) at precision %i -> %s", (lat, lng, precision, expected) => {
    expect(encode(lat, lng, precision)).toBe(expected);
  });
});

describe("cellsAround", () => {
  it("returns the user's cell and its 8 neighbours", () => {
    const cells = cellsAround(28.6139, 77.209);
    expect(cells).toHaveLength(9);
    expect(cells).toContain("ttn");
  });

  it("includes the cell across the border for a point near an edge", () => {
    // 77.3437° is just west of a cell border (cells are 1.40625° wide).
    const cells = cellsAround(28.6, 77.34);
    expect(cells).toContain(encode(28.6, 77.36, 3));
  });
});

describe("haversineKm", () => {
  it("Delhi to Mumbai is about 1,153 km", () => {
    expect(haversineKm(28.6139, 77.209, 19.076, 72.8777)).toBeCloseTo(1153, -1);
  });
  it("is zero for the same point", () => {
    expect(haversineKm(12.97, 77.59, 12.97, 77.59)).toBe(0);
  });
});

const kendra = (code: string, lat: number, lng: number): Kendra => ({
  code,
  address: "",
  district: "",
  state: "",
  pin: null,
  phone: null,
  lat,
  lng,
  precision: "official",
});

describe("nearestKendras", () => {
  const user = { lat: 28.6139, lng: 77.209 };
  const list = [
    kendra("far", 28.9, 77.5), // ~42 km
    kendra("near", 28.62, 77.21), // ~0.7 km
    kendra("mid", 28.65, 77.25), // ~5.6 km
    kendra("next", 28.7, 77.3), // ~13 km
  ];

  it("returns the 3 closest, closest first", () => {
    const { kendras } = nearestKendras(user.lat, user.lng, list);
    expect(kendras.map((k) => k.code)).toEqual(["near", "mid", "next"]);
    expect(kendras[0].km).toBeLessThan(1);
  });

  it("flags when nothing is within 10 km, but still returns the closest", () => {
    const { kendras, anyNearby } = nearestKendras(user.lat, user.lng, [list[0], list[3]]);
    expect(anyNearby).toBe(false);
    expect(kendras[0].code).toBe("next");
  });

  it("handles an area with no Kendras at all", () => {
    expect(nearestKendras(user.lat, user.lng, [])).toEqual({ kendras: [], anyNearby: false });
  });
});

describe("parseKendraFile", () => {
  it("reads the compact format written by the pipeline", () => {
    const [k] = parseKendraFile({
      updated: "2026-10-24",
      fields: ["code", "address", "district", "state", "pin", "phone", "lat", "lng", "precision"],
      rows: [
        [
          "PMBJK00455",
          "Shop 1",
          "Central",
          "Delhi",
          "110001",
          null,
          28.61649,
          77.21667,
          "official",
        ],
      ],
    });
    expect(k).toMatchObject({ code: "PMBJK00455", pin: "110001", phone: null, lat: 28.61649 });
  });
});

describe("directionsUrl", () => {
  it("contains only the destination, never the user's location", () => {
    expect(directionsUrl({ lat: 28.61649, lng: 77.21667 })).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=28.61649,77.21667",
    );
  });
});
