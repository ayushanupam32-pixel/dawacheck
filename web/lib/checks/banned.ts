// Check 4: is this medicine on CDSCO's lists of prohibited fixed-dose combinations?
//
// An entry applies only if EVERYTHING it names matches the medicine:
// - the salts, as a set ("A + B" = "B + A"; a medicine with an extra salt is a different
//   combination). A single-drug ban (phenacetin) applies to any medicine containing it;
// - the form, if named: "Diclofenac + Paracetamol injection" bans only the injection;
// - the release type, if named: "Aceclofenac (SR) + Paracetamol" bans only sustained release;
// - the strengths, if named: "Gliclazide 80mg + Metformin 325 mg" bans only those strengths.
// Ignoring these called thousands of legal medicines banned (found on the live site, fixed).
//
// Each entry is a "match" (all confirmed), "maybe" (something it names is unknown for this
// medicine, e.g. the strength was not read) or does not apply. Only a confirmed match with a
// plainly prohibited entry is an "alert". Court/committee statuses (stayed, quashed, under
// examination, revoked with conditions, restricted) and "maybe" are a "warn" for the pharmacist.
// Category entries ("FDCs of vitamins with analgesics") are descriptions and never matched.

import type { BannedRow, CheckStatus } from "./types";

export type Medicine = {
  salts: string[];
  /**
   * False when the list of salts may be cut short: the brand dataset keeps at most 2
   * ingredients, so "Acemiz-MR" (aceclofenac + paracetamol + chlorzoxazone) is recorded as
   * aceclofenac + paracetamol. An exact "these salts and nothing else" match then cannot be
   * confirmed. See describeMedicine in lib/run-checks.ts for when a list counts as complete.
   */
  saltsComplete: boolean;
  /** Strength per salt when known: { metformin: { value: 500, unit: "mg" } }. */
  strengths: Record<string, { value: number; unit: string }>;
  /** Canonical form ("tablet", "injection") or null when unknown. */
  form: string | null;
  /** Release types ([] = immediate release) or null when unknown. */
  releases: string[] | null;
};

export type BannedMatch = BannedRow & { certain: boolean };

export type BannedResult = {
  status: CheckStatus;
  reason: "prohibited" | "review" | "not_listed" | "no_composition" | "no_data";
  matches: BannedMatch[];
};

export const combinationKey = (salts: string[]) => [...new Set(salts)].sort().join("|");

/** "80:mg" -> { value: 80, unit: "mg" }. */
const parseStrength = (s: string) => {
  const [value, unit] = s.split(":");
  return { value: Number(value), unit };
};

/** Does this entry apply to the medicine? "yes", "maybe" (cannot tell) or "no". */
export function applies(entry: BannedRow, m: Medicine): "yes" | "maybe" | "no" {
  const key = combinationKey(m.salts);
  const salts =
    (entry.kind === "combination" && entry.combination_key === key) ||
    (entry.kind === "single" && !!entry.combination_key && m.salts.includes(entry.combination_key));
  if (!salts) return "no";

  // A combination ban needs the exact set of salts; a cut-short list cannot confirm that.
  // (A single-drug ban only needs the drug to be present, which a short list can confirm.)
  let unknown = entry.kind === "combination" && !m.saltsComplete;
  if (entry.forms.length) {
    if (m.form === null) unknown = true;
    else if (!entry.forms.includes(m.form)) return "no";
  }
  if (entry.releases.length) {
    if (m.releases === null) unknown = true;
    else if (!entry.releases.every((r) => m.releases!.includes(r))) return "no";
  }
  for (const [salt, listed] of Object.entries(entry.salt_strengths ?? {})) {
    const ours = m.strengths[salt];
    if (!ours) {
      unknown = true;
      continue;
    }
    const same = listed
      .map(parseStrength)
      .some((s) => s.unit === ours.unit && Math.abs(s.value - ours.value) < 1e-6);
    if (!same) return "no";
  }
  return unknown ? "maybe" : "yes";
}

/** `loaded`: whether the lists are in the database at all (else "not listed" would be a guess). */
export function checkBanned(m: Medicine, entries: BannedRow[], loaded = true): BannedResult {
  if (!loaded) return { status: "unknown", reason: "no_data", matches: [] };
  if (!m.salts.length) return { status: "unknown", reason: "no_composition", matches: [] };
  const matches: BannedMatch[] = [];
  for (const e of entries) {
    const a = applies(e, m);
    if (a !== "no") matches.push({ ...e, certain: a === "yes" });
  }
  if (!matches.length) return { status: "ok", reason: "not_listed", matches };
  const banned = matches.filter((x) => x.certain && x.status === "prohibited");
  return banned.length
    ? { status: "alert", reason: "prohibited", matches: banned }
    : { status: "warn", reason: "review", matches };
}
