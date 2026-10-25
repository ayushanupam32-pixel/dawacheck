// Check 3: fair price. Is the MRP on the strip within the government's ceiling price?
//
// NPPA fixes a ceiling price for each "scheduled" formulation (the essential medicines list),
// per unit (one tablet, one ml) and EXCLUDING GST. A company may charge at most the ceiling price
// plus GST. Most medicines carry 5% GST since 22.09.2025 (some lifesaving ones 0%), so the most a
// tablet may cost is ceiling × 1.05. Above that, the MRP is above the ceiling whatever the GST.
//
// The ceiling is found by the medicine's exact composition key (salts, strengths, form, release),
// like the generic. A medicine with no ceiling is "not price-controlled": its price is not capped
// (it may still only rise 10% a year, which we cannot check from one strip).

import type { CheckStatus } from "./types";

/** A row of ceiling_prices. */
export type CeilingRow = {
  composition_key: string;
  medicine: string;
  dosage: string;
  unit: string;
  unit_kind: "unit" | "ml" | "g" | "other";
  ceiling_price: number;
  order_no: string;
  effective_from: string;
  list: string;
  source_url: string;
};

/** The most GST on a medicine: 5% (most medicines since 22.09.2025; some are 0%). */
export const MAX_GST = 0.05;

export type PriceInput = {
  /** The medicine's exact composition key, or null if not known. */
  compositionKey: string | null;
  /** False when the ingredient list may be cut short (see describeMedicine). */
  saltsComplete: boolean;
  /** MRP printed on the strip (₹) and the number of tablets/capsules it covers. */
  mrp: number | null;
  packSize: number | null;
};

export type PriceResult = {
  status: CheckStatus;
  reason:
    | "within"
    | "above"
    | "not_scheduled"
    | "need_mrp"
    | "other_unit"
    | "unsure_composition"
    | "no_composition"
    | "no_data";
  ceiling: CeilingRow | null;
  /** MRP per tablet/capsule (₹), when it could be worked out. */
  perUnit: number | null;
  /** Ceiling price plus 5% GST: the most a unit may cost (₹). */
  maxWithGst: number | null;
};

/**
 * The ceiling that applies: from the newer list (NLEM 2022) when a medicine is in both, and the
 * highest if there are several (e.g. pack sizes), so we never call a price too high by mistake.
 */
export function pickCeiling(rows: CeilingRow[]): CeilingRow | null {
  if (!rows.length) return null;
  const newest = rows.filter((r) => r.list === "NLEM 2022");
  return (newest.length ? newest : rows).reduce((a, b) =>
    b.ceiling_price > a.ceiling_price ? b : a,
  );
}

const round2 = (x: number) => Math.round(x * 100) / 100;

/** `loaded`: whether the ceiling prices are in the database at all. */
export function checkPrice(input: PriceInput, rows: CeilingRow[], loaded = true): PriceResult {
  const none = { ceiling: null, perUnit: null, maxWithGst: null };
  if (!loaded) return { ...none, status: "unknown", reason: "no_data" };
  if (!input.compositionKey) return { ...none, status: "unknown", reason: "no_composition" };
  const salts = input.compositionKey.split("#")[0].split("|").length;
  // A cut-short ingredient list could match the ceiling of a different (smaller) combination.
  if (salts > 1 && !input.saltsComplete) {
    return { ...none, status: "unknown", reason: "unsure_composition" };
  }
  const ceiling = pickCeiling(rows.filter((r) => r.composition_key === input.compositionKey));
  if (!ceiling) return { ...none, status: "na", reason: "not_scheduled" };

  const maxWithGst = round2(ceiling.ceiling_price * (1 + MAX_GST));
  const base = { ceiling, maxWithGst, perUnit: null };
  if (ceiling.unit_kind !== "unit") return { ...base, status: "na", reason: "other_unit" };
  if (!input.mrp || !input.packSize || input.mrp <= 0 || input.packSize <= 0) {
    return { ...base, status: "unknown", reason: "need_mrp" };
  }
  const perUnit = round2(input.mrp / input.packSize);
  // Half a paisa of slack: MRPs are printed rounded, ceilings to the paisa.
  return perUnit <= maxWithGst + 0.005
    ? { ...base, perUnit, status: "ok", reason: "within" }
    : { ...base, perUnit, status: "warn", reason: "above" };
}
