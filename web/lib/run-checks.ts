// The safety checks with the database: look up what each check needs, then run the pure check
// functions (lib/checks/*). Used by POST /api/checks. Takes the database client as a parameter,
// like lib/find-match.ts.

import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeBatch } from "./ai/extract";
import { normalizeSalt, parseCompositionKey, type Composition } from "./ai/normalize";
import { checkBanned, combinationKey, type BannedResult, type Medicine } from "./checks/banned";
import { checkBatch, type BatchResult } from "./checks/batch";
import type { AlertRow, BannedRow } from "./checks/types";

export type ChecksInput = {
  /** The brand chosen after matching (gives the composition), or null. */
  brandId: number | null;
  /** Ingredients confirmed from the strip, with strengths: used instead of the brand's when
   * they include all of them (the dataset may have cut a brand's list short, e.g. Neorelax MR). */
  stripIngredients: { salt: string; value: number; unit: string }[];
  batchNo: string;
  batchConfidence: number;
  names: string[];
  manufacturer: string | null;
};

export type ChecksResponse = {
  generic: { found: number };
  batch: BatchResult;
  banned: BannedResult;
  sources: Record<"alerts" | "fdc", { url: string; updatedOn: string | null }>;
};

const ALERTS_URL = "https://cdsco.gov.in/opencms/opencms/en/Notifications/nsq-drugs/";
const FDC_URL = "https://cdsco.gov.in/opencms/opencms/en/Drugs/FDC/";

/**
 * Which salts the checks use. The strip's (as confirmed by the user) when they include all of the
 * brand's: the dataset keeps at most 2 per brand, so a strip listing 3 is more complete. The
 * brand's when the strip lists fewer: the reader probably missed one.
 */
export function chooseSalts(strip: string[], brand: string[]): string[] {
  const s = [...new Set(strip)];
  if (!brand.length) return s;
  return brand.every((b) => s.includes(b)) ? s : brand;
}

/**
 * The medicine as the banned check sees it: salts (chooseSalts), strength per salt (the brand's
 * record first, then the strip's), form and release type (from the brand's record; unknown
 * without one).
 */
export function describeMedicine(
  composition: Composition | null,
  strip: { salt: string; value: number; unit: string }[],
  brandComplete = true,
): Medicine {
  const brand = composition?.ingredients ?? [];
  const fromStrip = strip.map((i) => ({ ...i, salt: normalizeSalt(i.salt) }));
  const salts = chooseSalts(
    fromStrip.map((i) => i.salt),
    brand.map((i) => i.salt),
  );
  const strengths: Medicine["strengths"] = {};
  for (const i of [...brand, ...fromStrip]) {
    if (salts.includes(i.salt) && !strengths[i.salt]) {
      strengths[i.salt] = { value: i.value, unit: i.unit };
    }
  }
  // Are these ALL the salts? Yes if the brand record is complete. Otherwise only if the strip
  // lists more salts than the record (proof the record was cut short, and the strip was
  // confirmed by the user). A strip listing the same salts as a cut-short record proves
  // nothing: the reader misses ingredients often, and the user may not add them.
  const saltsComplete =
    (!!composition && brandComplete) ||
    (fromStrip.length > brand.length && salts.length > brand.length);
  return {
    salts,
    saltsComplete,
    strengths,
    form: composition?.form ?? null,
    releases: composition
      ? composition.release === "ir"
        ? []
        : composition.release.split("+")
      : null,
  };
}

export async function runChecks(db: SupabaseClient, input: ChecksInput): Promise<ChecksResponse> {
  let brandKey: string | null = null;
  let brandMaker: string | null = null;
  let brandComplete = false;
  if (input.brandId) {
    const { data } = await db
      .from("brands")
      .select("composition_key, composition_complete, manufacturer")
      .eq("id", input.brandId)
      .maybeSingle();
    brandKey = data?.composition_key ?? null;
    brandMaker = data?.manufacturer ?? null;
    brandComplete = data?.composition_complete ?? false;
  }
  const composition = brandKey ? parseCompositionKey(brandKey) : null;
  const medicine = describeMedicine(composition, input.stripIngredients, brandComplete);
  const salts = medicine.salts;
  const batchNo = normalizeBatch(input.batchNo);

  const [alerts, latest, banned, generics, sources] = await Promise.all([
    batchNo
      ? db.from("nsq_alerts").select("*").eq("batch_no_norm", batchNo).limit(50)
      : Promise.resolve({ data: [], error: null }),
    db.from("nsq_alerts").select("alert_month").order("alert_month", { ascending: false }).limit(1),
    salts.length
      ? db
          .from("banned_fdcs")
          .select("*")
          .in("combination_key", [combinationKey(salts), ...salts])
      : Promise.resolve({ data: [], error: null }),
    brandKey
      ? db
          .from("ja_products")
          .select("drug_code", { count: "exact", head: true })
          .eq("composition_key", brandKey)
      : Promise.resolve({ count: 0, error: null }),
    db
      .from("data_sources")
      .select("source, last_run_at")
      .in("source", ["cdsco_alerts", "cdsco_fdc"]),
  ]);
  for (const r of [alerts, latest, banned, generics, sources]) {
    if (r.error) throw new Error(r.error.message);
  }

  const lastRun = (source: string) =>
    (sources.data as { source: string; last_run_at: string }[] | null)?.find(
      (s) => s.source === source,
    )?.last_run_at ?? null;
  const checkedThrough = (latest.data?.[0]?.alert_month as string | undefined)?.slice(0, 7) ?? null;

  return {
    generic: { found: generics.count ?? 0 },
    batch: checkBatch(
      {
        batchNo,
        batchConfidence: input.batchConfidence,
        names: input.names,
        salts,
        manufacturer: input.manufacturer ?? brandMaker,
      },
      (alerts.data ?? []) as AlertRow[],
      checkedThrough,
    ),
    banned: checkBanned(medicine, (banned.data ?? []) as BannedRow[], !!lastRun("cdsco_fdc")),
    sources: {
      alerts: { url: ALERTS_URL, updatedOn: lastRun("cdsco_alerts") },
      fdc: { url: FDC_URL, updatedOn: lastRun("cdsco_fdc") },
    },
  };
}

const text = (value: unknown, max: number) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

/** Check a POST body from the scan page; anything unexpected is dropped, never trusted. */
export function parseChecksInput(body: unknown): ChecksInput | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const list = (v: unknown, n: number, max: number) =>
    Array.isArray(v)
      ? v
          .map((x) => text(x, max))
          .filter(Boolean)
          .slice(0, n)
      : [];
  const confidence = Number(b.batchConfidence);
  return {
    brandId:
      Number.isInteger(b.brandId) && (b.brandId as number) > 0 ? (b.brandId as number) : null,
    stripIngredients: Array.isArray(b.stripIngredients)
      ? b.stripIngredients
          .slice(0, 8)
          .map((i) => i as Record<string, unknown>)
          .filter((i) => text(i?.salt, 80) && Number.isFinite(i.value) && text(i.unit, 10))
          .map((i) => ({ salt: text(i.salt, 80), value: Number(i.value), unit: text(i.unit, 10) }))
      : [],
    batchNo: text(b.batchNo, 30),
    batchConfidence: Number.isFinite(confidence) ? Math.min(1, Math.max(0, confidence)) : 0,
    names: list(b.names, 4, 80),
    manufacturer: text(b.manufacturer, 120) || null,
  };
}
