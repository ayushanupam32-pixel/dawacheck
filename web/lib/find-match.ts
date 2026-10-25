// Stage 4 with the database: fetch candidate brands, then let lib/ai/rerank.ts decide.
// Shared by /api/match (the app) and scripts/eval-match.ts (the evaluation), so the evaluation
// measures exactly what the app does. Takes the database client as a parameter, so the script
// can pass its own (lib/supabase.ts is server-only).

import type { SupabaseClient } from "@supabase/supabase-js";
import { coreName } from "./ai/normalize";
import { MAX_GUESSES } from "./ai/merge";
import { combineDecisions, decide, type Decision, type MatchInput } from "./ai/rerank";
import type { BrandCandidate, Ingredient } from "./match";

export type BrandRow = {
  id: number;
  name: string;
  manufacturer: string | null;
  form: string | null;
  release: string | null;
  pack_size: number | null;
  pack_unit: string | null;
  mrp_2022: number | null;
  composition_key: string | null;
  composition_complete: boolean;
  discontinued?: boolean;
  ingredients: Ingredient[] | null;
  score: number;
};

export function toCandidate(row: BrandRow): BrandCandidate {
  return {
    id: row.id,
    name: row.name,
    manufacturer: row.manufacturer,
    form: row.form,
    release: row.release,
    packSize: row.pack_size,
    packUnit: row.pack_unit,
    mrp2022: row.mrp_2022,
    compositionKey: row.composition_key,
    compositionComplete: row.composition_complete,
    discontinued: row.discontinued ?? false,
    ingredients: row.ingredients ?? [],
    score: row.score,
  };
}

/** How many brands the trigram search hands to the re-ranker. */
export const CANDIDATES = 10;

/**
 * The name as OCR probably meant it, for a second search: junk, form words and strengths
 * dropped, and digits inside words turned back into the letters they look like
 * ("SERT0SH 100mg Talet" -> "sertosh", "1EVOET" -> "levoet").
 */
export function cleanedQuery(brand: string): string {
  return coreName(brand)
    .split(" ")
    .filter((word) => /[a-z]/.test(word))
    .map((word) =>
      word
        .replace(/[015826]/g, (d) => ({ 0: "o", 1: "l", 5: "s", 8: "b", 2: "z", 6: "g" })[d] ?? d)
        .replace(/rn/g, "m")
        .replace(/vv/g, "w"),
    )
    .join(" ");
}

/**
 * Brands whose names look like the name read from the strip. Two searches, merged: the text as
 * read, and the cleaned-up text (OCR slips fixed). If both find nothing, try the longest word.
 */
export async function findCandidates(db: SupabaseClient, brand: string): Promise<BrandCandidate[]> {
  const search = async (q: string) => {
    // Discontinued brands too: the strip in someone's hand may be old stock.
    const { data, error } = await db.rpc("search_brands", {
      q,
      max_results: CANDIDATES,
      include_discontinued: true,
    });
    if (error) throw new Error(`search_brands failed for "${q}": ${error.message}`);
    return (data as BrandRow[]).map(toCandidate);
  };
  const cleaned = cleanedQuery(brand);
  // The text as read is always searched ("Pan 40" is a real brand). The cleaned text only if it
  // has a word of 4+ letters: a short leftover like "m cin" matches so many names that the
  // database times out, and finds nothing useful.
  const queries = [brand, ...(cleaned !== brand && /[a-z]{4}/.test(cleaned) ? [cleaned] : [])];
  const settled = await Promise.allSettled(queries.map(search));
  // One failed search is survivable (the other may have found it); all failing is an error.
  if (settled.length && settled.every((r) => r.status === "rejected")) {
    throw (settled[0] as PromiseRejectedResult).reason;
  }
  const results = settled.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  // Merge, best search score first, one row per brand.
  const seen = new Set<number>();
  const found = results
    .sort((a, b) => b.score - a.score)
    .filter((c) => !seen.has(c.id) && seen.add(c.id))
    .slice(0, CANDIDATES);
  if (found.length) return found;
  const longest = cleaned.split(" ").sort((a, b) => b.length - a.length)[0];
  return longest && longest.length >= 5 && longest !== cleaned ? search(longest) : [];
}

export async function matchStrip(
  db: SupabaseClient,
  input: MatchInput,
): Promise<Decision<BrandCandidate>> {
  const candidates = input.brand?.trim() ? await findCandidates(db, input.brand) : [];
  return decide(input, candidates);
}

/**
 * Stage 3 "confirmed by matching": try the name on the confirm screen and the reader's other
 * brand guesses (all searched at once), then combine the answers (rerank.ts combineDecisions).
 * A guess is accepted only through the same safety rules as a typed name, and if two guesses
 * match different products nothing is accepted. With no guesses this is just matchStrip.
 */
export async function matchGuesses(
  db: SupabaseClient,
  input: MatchInput,
  guesses: string[] = [],
): Promise<Decision<BrandCandidate>> {
  const seen = new Set<string>();
  const names = [input.brand ?? "", ...guesses]
    .map((name) => name.trim())
    .filter((name) => name && !seen.has(name.toUpperCase()) && seen.add(name.toUpperCase()))
    .slice(0, 1 + MAX_GUESSES);
  if (names.length <= 1) return matchStrip(db, { ...input, brand: names[0] ?? null });
  const decisions = await Promise.all(names.map((brand) => matchStrip(db, { ...input, brand })));
  return combineDecisions(decisions);
}

const text = (value: unknown, max: number) =>
  typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;

/** The reader's brand guesses from a POST body: at most MAX_GUESSES short strings. */
export function parseGuesses(body: unknown): string[] {
  const guesses = (body as Record<string, unknown> | null)?.brandGuesses;
  return Array.isArray(guesses)
    ? guesses.flatMap((g) => text(g, 60) ?? []).slice(0, MAX_GUESSES)
    : [];
}

/** Check a POST body from the scan page; anything unexpected is dropped, never trusted. */
export function parseMatchInput(body: unknown): MatchInput | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const ingredients = Array.isArray(b.ingredients)
    ? b.ingredients
        .slice(0, 8)
        .map((i) => i as Record<string, unknown>)
        .filter(
          (i) =>
            text(i?.salt, 80) &&
            typeof i.value === "number" &&
            Number.isFinite(i.value) &&
            text(i.unit, 10),
        )
        .map((i) => ({
          salt: text(i.salt, 80)!,
          value: i.value as number,
          unit: text(i.unit, 10)!,
        }))
    : [];
  return {
    brand: text(b.brand, 60),
    ingredients: ingredients.length ? ingredients : null,
    form: text(b.form, 30),
    manufacturer: text(b.manufacturer, 100),
    releases: Array.isArray(b.releases)
      ? b.releases.filter((r): r is string => typeof r === "string" && r.length <= 15).slice(0, 5)
      : [],
  };
}
