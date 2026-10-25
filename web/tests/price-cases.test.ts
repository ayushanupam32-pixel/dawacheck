// The project brief's accuracy test for the fair-price check: "correct verdict on 30
// hand-verified scheduled medicines" (target 100%).
//
// Ceiling prices read by hand from NPPA order S.O. 1575(E), 25.03.2026, in force from 1.4.2026
// (pipeline/tests/test_nppa_30.py checks the parser gives exactly these). Ceiling prices exclude
// GST; for a strip made after the 22.09.2025 GST cut, at most 5% may be added. For each medicine,
// a 10-tablet strip made in January 2026:
// - priced at ceiling + 4% (allowed, inside the GST margin): "within";
// - priced at ceiling + 10% (more than the 5% GST allows): "above".

import { describe, expect, it } from "vitest";
import { checkPrice, type CeilingRow } from "@/lib/checks/price";

const OFFICIAL: [string, number][] = [
  ["albendazole:400:mg#tablet#ir", 7.21],
  ["amlodipine:5:mg#tablet#ir", 2.56],
  ["amlodipine:10:mg#tablet#ir", 5.58],
  ["amoxicillin:500:mg#capsule#ir", 7.54],
  ["atorvastatin:10:mg#tablet#ir", 5.09],
  ["atorvastatin:40:mg#tablet#ir", 19.77],
  ["azithromycin:500:mg#tablet#ir", 24.14],
  ["cefixime:200:mg#tablet#ir", 10.01],
  ["cetirizine:10:mg#tablet#ir", 1.92],
  ["ciprofloxacin:500:mg#tablet#ir", 4.35],
  ["clopidogrel:75:mg#tablet#ir", 6.82],
  ["diclofenac:50:mg#tablet#ir", 2.1],
  ["domperidone:10:mg#tablet#ir", 2.37],
  ["doxycycline:100:mg#capsule#ir", 3.15],
  ["enalapril:5:mg#tablet#ir", 3.78],
  ["escitalopram:10:mg#tablet#ir", 9.22],
  ["fluconazole:150:mg#tablet#ir", 12.35],
  ["folic acid:5:mg#tablet#ir", 1.55],
  ["furosemide:40:mg#tablet#ir", 0.94],
  ["glimepiride:2:mg#tablet#ir", 5.94],
  ["hydrochlorothiazide:12.5:mg#tablet#ir", 1.07],
  ["ibuprofen:400:mg#tablet#ir", 1.23],
  ["ivermectin:12:mg#tablet#ir", 38.27],
  ["levothyroxine:0.05:mg#tablet#ir", 1.06],
  ["levothyroxine:0.1:mg#tablet#ir", 1.35],
  ["metformin:500:mg#tablet#ir", 2.07],
  ["metformin:1000:mg#tablet#ir", 3.57],
  ["metoprolol:50:mg#tablet#ir", 5.98],
  ["telmisartan:40:mg#tablet#ir", 6.92],
  ["telmisartan:80:mg#tablet#ir", 10.65],
];

const row = (key: string, price: number): CeilingRow => ({
  composition_key: key,
  medicine: key.split(":")[0],
  dosage: "",
  unit: key.includes("capsule") ? "1 Capsule" : "1 Tablet",
  unit_kind: "unit",
  ceiling_price: price,
  order_no: "S.O. 1575(E)",
  effective_from: "2026-04-01",
  list: "NLEM 2022",
  source_url: "https://nppa.gov.in/",
});

/** MRP of a 10-tablet strip at `factor` × the ceiling price, rounded to the paisa. */
const strip = (key: string, price: number, factor: number) =>
  checkPrice(
    {
      compositionKey: key,
      saltsComplete: true,
      mrp: Math.round(price * factor * 10 * 100) / 100,
      packSize: 10,
      mfgDate: "2026-01", // made after the GST cut: at most 5% GST
    },
    [row(key, price)],
  );

describe("fair price: 30 hand-verified scheduled medicines (brief: 100%)", () => {
  it.each(OFFICIAL)("%s at ceiling + 4% is within (ceiling %s)", (key, price) => {
    expect(strip(key, price, 1.04)).toMatchObject({ status: "ok", reason: "within" });
  });

  it.each(OFFICIAL)("%s at ceiling + 10% is above (ceiling %s)", (key, price) => {
    expect(strip(key, price, 1.1)).toMatchObject({ status: "warn", reason: "above" });
  });
});
