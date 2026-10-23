// Price comparison between the user's brand and a Jan Aushadhi generic.
// Pure functions (no I/O), so every rule here is unit-tested in tests/savings.test.ts.

export type Pack = {
  /** Price printed on the pack (MRP), in rupees. */
  mrp: number;
  /** How many units the pack holds, e.g. 10 tablets or 100 ml. */
  size: number;
  /** 'unit' = tablets/capsules counted one by one; otherwise 'ml' or 'g'. */
  unit: string;
};

export type Savings = {
  brandPerUnit: number;
  genericPerUnit: number;
  perUnit: number;
  /** Saving on one pack the size of the user's own pack. */
  perPack: number;
  /** Only for tablets/capsules, where "doses per day" makes sense. */
  perMonth: number | null;
};

const DAYS_PER_MONTH = 30;

function isValid(pack: Pack): boolean {
  return Number.isFinite(pack.mrp) && pack.mrp > 0 && Number.isFinite(pack.size) && pack.size > 0;
}

/**
 * Compares price per unit. Returns null when the two cannot be compared honestly:
 * missing or zero prices, or different units (per ml vs per tablet).
 * A negative saving is returned as-is: the generic is not always cheaper, and we say so.
 */
export function computeSavings(brand: Pack, generic: Pack, dosesPerDay = 1): Savings | null {
  if (!isValid(brand) || !isValid(generic) || brand.unit !== generic.unit) return null;

  const brandPerUnit = brand.mrp / brand.size;
  const genericPerUnit = generic.mrp / generic.size;
  const perUnit = brandPerUnit - genericPerUnit;
  const doses = Number.isFinite(dosesPerDay) && dosesPerDay > 0 ? dosesPerDay : 1;

  return {
    brandPerUnit,
    genericPerUnit,
    perUnit,
    perPack: perUnit * brand.size,
    perMonth: brand.unit === "unit" ? perUnit * doses * DAYS_PER_MONTH : null,
  };
}

/** ₹ amounts: whole rupees above ₹100, paise below, Indian digit grouping (1,00,000). */
export function formatRupees(amount: number, locale = "en-IN"): string {
  const digits = Math.abs(amount) >= 100 ? 0 : 2;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(amount);
}
