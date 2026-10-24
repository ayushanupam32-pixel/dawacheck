// Shapes returned by /api/match, shared by the route and the search page.

import type { AbstainReason, Features } from "./ai/rerank";

export type Ingredient = { salt: string; value: number; unit: string };

export type BrandCandidate = {
  id: number;
  name: string;
  manufacturer: string | null;
  form: string | null;
  release: string | null;
  packSize: number | null;
  packUnit: string | null;
  /** From the Nov 2022 dataset: a starting value for the user to correct, never "today's price". */
  mrp2022: number | null;
  /** Exact-match key, e.g. "diazepam:10:mg#tablet#ir" (pipeline/normalize.py). */
  compositionKey: string | null;
  /** False when the dataset may have cut the ingredient list short (2-ingredient rows). */
  compositionComplete: boolean;
  /** The dataset marks it as no longer sold (old stock may still be in a cabinet). */
  discontinued: boolean;
  ingredients: Ingredient[];
  score: number;
};

export type Generic = {
  drugCode: string;
  name: string;
  unitSize: string | null;
  packSize: number | null;
  packUnit: string | null;
  mrp: number;
};

export type SearchResponse =
  { status: "ok"; candidates: BrandCandidate[] } | { status: "no_match" };

export type GenericResponse = {
  brand: BrandCandidate;
  /** Exact composition matches (same salts, strengths, form and release), cheapest first. */
  generics: Generic[];
  source: { name: string; url: string; updatedOn: string | null };
};

/** One option the scan matcher considered, with its probability (shown as "How sure"). */
export type ScanOption = {
  brand: BrandCandidate;
  probability: number;
  /** The evidence behind the probability, shown in "Why we think so". */
  features: Features;
};

/** POST /api/match: what the scan matcher decided. */
export type ScanMatchResponse =
  | { status: "match"; brand: BrandCandidate; confidence: number; options: ScanOption[] }
  | {
      status: "abstain";
      reason: AbstainReason;
      confidence: number;
      /** Up to 3 brands for the user to pick from. */
      options: ScanOption[];
    };

/**
 * Below this score a typed name is too far from every brand to be trusted, so we show nothing
 * and ask the user to check the spelling (abstain) rather than offer a wrong medicine.
 * Chosen from manual tests; to be tuned on the evaluation set in M4.
 */
export const MIN_SEARCH_SCORE = 0.35;
