import { NextResponse, type NextRequest } from "next/server";
import { matchStrip, parseMatchInput, toCandidate, type BrandRow } from "@/lib/find-match";
import {
  MIN_SEARCH_SCORE,
  type Generic,
  type GenericResponse,
  type ScanMatchResponse,
  type SearchResponse,
} from "@/lib/match";
import { supabase } from "@/lib/supabase";

const JA_SOURCE_URL = "https://janaushadhi.gov.in/product-portfolio/product-mrp-list";

/**
 * GET /api/match?q=telma        -> up to 8 brands whose names look like the query
 * GET /api/match?brand=12345    -> that brand + Jan Aushadhi products with the exact same
 *                                  composition (salts, strengths, form, release)
 *
 * Read-only. Nothing about the user is stored or logged.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const brandId = Number(params.get("brand"));
  if (Number.isInteger(brandId) && brandId > 0) return genericFor(brandId);

  const q = (params.get("q") ?? "").trim().slice(0, 60);
  if (q.length < 3) {
    return NextResponse.json({ error: "Type at least 3 letters" }, { status: 400 });
  }

  const { data, error } = await supabase().rpc("search_brands", { q, max_results: 8 });
  if (error) return NextResponse.json({ error: "Search failed" }, { status: 502 });

  // Abstain: only offer names that are a confident match for what was typed.
  const candidates = (data as BrandRow[])
    .filter((row) => row.score >= MIN_SEARCH_SCORE)
    .map(toCandidate);
  const body: SearchResponse = candidates.length
    ? { status: "ok", candidates }
    : { status: "no_match" };
  return NextResponse.json(body);
}

async function genericFor(brandId: number) {
  const db = supabase();
  const { data: brand, error } = await db
    .from("brands")
    .select(
      "id, name, manufacturer, form, release, pack_size, pack_unit, mrp_2022, composition_key, composition_complete, discontinued, brand_ingredients(strength_value, strength_unit, salts(display_name))",
    )
    .eq("id", brandId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: "Lookup failed" }, { status: 502 });
  if (!brand) return NextResponse.json({ error: "Brand not found" }, { status: 404 });

  type IngredientRow = {
    strength_value: number;
    strength_unit: string;
    salts: { display_name: string } | null;
  };
  const ingredients = (brand.brand_ingredients as unknown as IngredientRow[])
    .map((i) => ({
      salt: i.salts?.display_name ?? "",
      value: i.strength_value,
      unit: i.strength_unit,
    }))
    .sort((a, b) => a.salt.localeCompare(b.salt));

  // Exact composition only. Never fall back to "same salt, different strength".
  let generics: Generic[] = [];
  if (brand.composition_key) {
    const { data: rows, error: jaError } = await db
      .from("ja_products")
      .select("drug_code, generic_name, unit_size, pack_size, pack_unit, mrp")
      .eq("composition_key", brand.composition_key)
      .order("mrp");
    if (jaError) return NextResponse.json({ error: "Lookup failed" }, { status: 502 });
    generics = rows.map((r) => ({
      drugCode: r.drug_code,
      name: r.generic_name,
      unitSize: r.unit_size,
      packSize: r.pack_size,
      packUnit: r.pack_unit,
      mrp: Number(r.mrp),
    }));
  }

  const { data: source } = await db
    .from("data_sources")
    .select("last_run_at")
    .eq("source", "ja_products")
    .maybeSingle();

  const body: GenericResponse = {
    brand: toCandidate({ ...brand, ingredients, score: 1 } as BrandRow),
    generics,
    source: {
      name: "Jan Aushadhi (PMBI) Product & MRP List",
      url: JA_SOURCE_URL,
      updatedOn: source?.last_run_at ?? null,
    },
  };
  return NextResponse.json(body);
}

/**
 * POST /api/match  body: what the scan read and the user confirmed (lib/ai/rerank.ts MatchInput)
 *               -> the matched brand, or "abstain" with up to 3 options to pick from
 *
 * POST, not GET, so the medicine details are not written into URLs (and server logs).
 * Nothing is stored or logged.
 */
export async function POST(request: NextRequest) {
  const input = parseMatchInput(await request.json().catch(() => null));
  if (!input) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  let decision;
  try {
    decision = await matchStrip(supabase(), input);
  } catch {
    return NextResponse.json({ error: "Match failed" }, { status: 502 });
  }
  const options = decision.ranked
    .slice(0, 3)
    .map((r) => ({ brand: r.candidate, probability: r.probability, features: r.features }));
  const body: ScanMatchResponse =
    decision.status === "match"
      ? {
          status: "match",
          brand: decision.best.candidate,
          confidence: decision.confidence,
          options,
        }
      : { status: "abstain", reason: decision.reason, confidence: decision.confidence, options };
  return NextResponse.json(body);
}
