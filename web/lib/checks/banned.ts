// Check 4: is this combination of salts on CDSCO's lists of prohibited fixed-dose combinations?
//
// Matching is on the SET of normalized salts (order does not matter): "Paracetamol + Caffeine +
// Phenylephrine" = "Phenylephrine + Paracetamol + Caffeine". A medicine with an extra salt is a
// different combination. A single-drug ban (e.g. phenacetin) matches any medicine containing it.
// Category entries ("FDCs of vitamins with analgesics") are never matched: they are descriptions.
//
// Only one case is an "alert": a single prohibited entry, with no strengths named. Everything
// else that matches is a "warn" for the pharmacist:
// - stayed / quashed / under examination / revoked with conditions / restricted: the legal status
//   is not a plain ban (see pipeline/dawacheck_pipeline/parse_cdsco_fdc.py);
// - the entry names strengths ("Glimepiride 1mg/2mg + Pioglitazone 15mg + Metformin 850mg"),
//   which we do not compare automatically;
// - several entries with different statuses (prohibited in some strengths, quashed in others).

import type { BannedRow, CheckStatus } from "./types";

export type BannedResult = {
  status: CheckStatus;
  reason: "prohibited" | "review" | "not_listed" | "no_composition" | "no_data";
  matches: BannedRow[];
};

export const combinationKey = (salts: string[]) => [...new Set(salts)].sort().join("|");

/** `loaded`: whether the lists are in the database at all (else "not listed" would be a guess). */
export function checkBanned(salts: string[], entries: BannedRow[], loaded = true): BannedResult {
  if (!loaded) return { status: "unknown", reason: "no_data", matches: [] };
  if (!salts.length) return { status: "unknown", reason: "no_composition", matches: [] };
  const key = combinationKey(salts);
  const matches = entries.filter(
    (e) =>
      (e.kind === "combination" && e.combination_key === key) ||
      (e.kind === "single" && !!e.combination_key && salts.includes(e.combination_key)),
  );
  if (!matches.length) return { status: "ok", reason: "not_listed", matches };
  const plainBan =
    matches.length === 1 && matches[0].status === "prohibited" && !matches[0].strengths;
  return plainBan
    ? { status: "alert", reason: "prohibited", matches }
    : { status: "warn", reason: "review", matches };
}
