// Check 2: batch safety. Is this batch in a CDSCO Not of Standard Quality (NSQ) or spurious alert?
//
// The rule from the project brief: a match needs the SAME batch number and a similar product name
// or manufacturer (similarity >= 0.6). Batch numbers alone repeat across companies, so "batch
// AT250938 failed" says nothing about another firm's AT250938.
//
// An unreadable or uncertain batch number gives "unknown", never "ok": we only say "not in the
// alerts" when we are sure which batch we looked up.

import { nameSimilarity, normalizeSalt, sameMaker } from "../ai/normalize";
import type { AlertRow, CheckStatus } from "./types";

export const NAME_SIMILAR = 0.6;
/**
 * Below this reading confidence a batch number is treated as unreadable: the same level at which
 * the confirm screen marks a field "Please check" (CHECK_BELOW in scan-client.tsx). A batch the
 * user corrected counts as fully confident (1).
 */
export const BATCH_SURE = 0.6;

export type BatchInput = {
  /** Normalized batch number from the strip (or typed by the user), "" if none. */
  batchNo: string;
  /** Reader's confidence in the batch number, 0–1; 1 when the user typed or confirmed it. */
  batchConfidence: number;
  /** Names the medicine is known by: brand read from the strip, matched brand name. */
  names: string[];
  /** The medicine's salts, e.g. ["aceclofenac", "paracetamol"], to compare with product names. */
  salts: string[];
  manufacturer: string | null;
};

export type BatchResult = {
  status: CheckStatus;
  reason: "match" | "batch_only" | "not_found" | "no_batch" | "uncertain_batch" | "no_data";
  /** Alerts for this batch that also match the product or manufacturer. */
  matches: AlertRow[];
  /** Latest alert month in the data, "YYYY-MM": "checked against alerts up to …". */
  checkedThrough: string | null;
};

/** Brand names inside an alert's product name: "Levetiracetam Tablets IP (Levipil 500)". */
function namesInAlert(alert: AlertRow): string[] {
  const inBrackets = [...alert.product_name.matchAll(/\(([^)]+)\)/g)].map((m) => m[1]);
  return [alert.brand_name ?? "", alert.product_name, ...inBrackets].filter(Boolean);
}

/** True when every salt of the medicine appears in the alert's product name. */
function saltsInProduct(salts: string[], product: string): boolean {
  if (!salts.length) return false;
  const words = product
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  const text = ` ${words.join(" ")} `;
  // Normalize each run of words the same way the salts were ("Metformin Hydrochloride" ->
  // "metformin"), so a salt matches however the alert names it.
  const normalized = ` ${words.map((w) => normalizeSalt(w)).join(" ")} `;
  return salts.every((s) => text.includes(` ${s} `) || normalized.includes(` ${s} `));
}

export function alertMatches(input: BatchInput, alert: AlertRow): boolean {
  const byName = input.names.some((n) =>
    namesInAlert(alert).some((a) => nameSimilarity(n, a) >= NAME_SIMILAR),
  );
  const bySalts = saltsInProduct(input.salts, alert.product_name);
  const byMaker =
    !!input.manufacturer &&
    !!alert.manufacturer &&
    sameMaker(input.manufacturer, alert.manufacturer);
  return byName || bySalts || byMaker;
}

/**
 * `alerts`: the alerts with this exact normalized batch number (the database looks them up by
 * batch_no_norm). `checkedThrough`: the latest alert month loaded.
 */
export function checkBatch(
  input: BatchInput,
  alerts: AlertRow[],
  checkedThrough: string | null,
): BatchResult {
  const base = { matches: [], checkedThrough };
  // No alerts loaded (e.g. before the first data refresh): we checked nothing, so we say so.
  // "Not found" here would be false reassurance.
  if (!checkedThrough) return { ...base, status: "unknown", reason: "no_data" };
  if (!input.batchNo) return { ...base, status: "unknown", reason: "no_batch" };
  if (input.batchConfidence < BATCH_SURE) {
    return { ...base, status: "unknown", reason: "uncertain_batch" };
  }
  const sameBatch = alerts.filter((a) => a.batch_no_norm === input.batchNo);
  const matches = sameBatch
    .filter((a) => alertMatches(input, a))
    .sort((a, b) => b.alert_month.localeCompare(a.alert_month));
  if (matches.length) return { ...base, matches, status: "alert", reason: "match" };
  // The same batch number for a different product: not this medicine. Said, not hidden.
  if (sameBatch.length) return { ...base, status: "ok", reason: "batch_only" };
  return { ...base, status: "ok", reason: "not_found" };
}
