import { describe, expect, it } from "vitest";
import { computeSavings, formatRupees } from "@/lib/savings";

const strip = (mrp: number, size = 10) => ({ mrp, size, unit: "unit" });

describe("computeSavings", () => {
  it("compares price per tablet, not per pack", () => {
    // Brand: ₹150 for 15 tablets = ₹10 each. Generic: ₹12.38 for 10 = ₹1.238 each.
    const s = computeSavings(strip(150, 15), strip(12.38, 10))!;
    expect(s.brandPerUnit).toBeCloseTo(10);
    expect(s.genericPerUnit).toBeCloseTo(1.238);
    expect(s.perPack).toBeCloseTo((10 - 1.238) * 15);
  });

  it("monthly saving uses doses per day and 30 days", () => {
    const s = computeSavings(strip(100), strip(20), 2)!;
    // (₹10 - ₹2) per tablet × 2 a day × 30 days
    expect(s.perMonth).toBeCloseTo(480);
  });

  it("defaults to 1 dose a day for missing or invalid input", () => {
    expect(computeSavings(strip(100), strip(20), Number.NaN)!.perMonth).toBeCloseTo(240);
    expect(computeSavings(strip(100), strip(20), 0)!.perMonth).toBeCloseTo(240);
  });

  it("reports when the generic is NOT cheaper instead of hiding it", () => {
    const s = computeSavings(strip(10), strip(30))!;
    expect(s.perUnit).toBeLessThan(0);
  });

  it("refuses to compare different units (per ml vs per tablet)", () => {
    expect(computeSavings({ mrp: 100, size: 100, unit: "ml" }, strip(20))).toBeNull();
  });

  it("has no monthly figure for liquids", () => {
    const s = computeSavings(
      { mrp: 120, size: 100, unit: "ml" },
      { mrp: 30, size: 60, unit: "ml" },
    )!;
    expect(s.perMonth).toBeNull();
    expect(s.perPack).toBeCloseTo((1.2 - 0.5) * 100);
  });

  it("refuses missing or zero prices", () => {
    expect(computeSavings(strip(0), strip(20))).toBeNull();
    expect(computeSavings(strip(Number.NaN), strip(20))).toBeNull();
    expect(computeSavings(strip(100, 0), strip(20))).toBeNull();
  });
});

describe("formatRupees", () => {
  it("shows paise for small amounts and whole rupees for large ones", () => {
    expect(formatRupees(1.238)).toBe("₹1.24");
    expect(formatRupees(640.4)).toBe("₹640");
  });

  it("uses Indian digit grouping", () => {
    expect(formatRupees(123456)).toBe("₹1,23,456");
  });
});
