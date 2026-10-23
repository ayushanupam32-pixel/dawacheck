// M2 "done when": correct nearest Kendras for 5 test locations.
//
// Uses the REAL generated files in public/data/kendras. For each place it compares what the app
// does (load only the 3 × 3 block of cells around the user) with a brute-force search over every
// Kendra in India. If the cell trick ever missed a closer Kendra, this would fail.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { cellsAround } from "@/lib/geo/geohash";
import { nearestKendras, parseKendraFile, type Kendra, type KendraFile } from "@/lib/geo/nearest";

const DATA_DIR = join(__dirname, "..", "public", "data", "kendras");
const files = readdirSync(DATA_DIR).filter((f) => f.endsWith(".json") && f !== "index.json");

function loadCell(cell: string): Kendra[] {
  const name = `${cell}.json`;
  if (!files.includes(name)) return [];
  return parseKendraFile(JSON.parse(readFileSync(join(DATA_DIR, name), "utf8")) as KendraFile);
}

const allKendras = files.flatMap((f) => loadCell(f.replace(".json", "")));

const places = [
  { name: "Connaught Place, New Delhi", lat: 28.6315, lng: 77.2167 },
  { name: "Chhatrapati Shivaji Terminus, Mumbai", lat: 18.9398, lng: 72.8355 },
  { name: "Chennai Central", lat: 13.0827, lng: 80.2707 },
  { name: "Kempegowda Bus Station, Bengaluru", lat: 12.9767, lng: 77.5713 },
  { name: "Jaisalmer, Rajasthan (sparse area)", lat: 26.9157, lng: 70.9083 },
];

describe("nearest Kendras on the real data", () => {
  it("has the whole country loaded", () => {
    expect(allKendras.length).toBeGreaterThan(20000);
  });

  it("index.json lists exactly the cell files that exist", () => {
    const index = JSON.parse(readFileSync(join(DATA_DIR, "index.json"), "utf8")) as {
      cells: string[];
    };
    expect(index.cells.map((c) => `${c}.json`).sort()).toEqual([...files].sort());
  });

  it.each(places)("$name: the 9-cell search equals a search over all of India", (place) => {
    const nearby = cellsAround(place.lat, place.lng).flatMap(loadCell);
    const fast = nearestKendras(place.lat, place.lng, nearby);
    const exact = nearestKendras(place.lat, place.lng, allKendras);

    expect(fast.kendras.map((k) => k.code)).toEqual(exact.kendras.map((k) => k.code));
    expect(fast.kendras).toHaveLength(3);
    // Print the answer so it can be checked by hand against janaushadhi.gov.in.
    console.log(
      `${place.name}: ` +
        fast.kendras.map((k) => `${k.code} ${k.km.toFixed(2)} km (${k.district})`).join(" | "),
    );
  });

  it("big cities have a Kendra within 10 km", () => {
    for (const place of places.slice(0, 4)) {
      expect(nearestKendras(place.lat, place.lng, allKendras).anyNearby).toBe(true);
    }
  });
});
