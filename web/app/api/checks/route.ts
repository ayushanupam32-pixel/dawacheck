import { NextResponse, type NextRequest } from "next/server";
import { parseChecksInput, runChecks } from "@/lib/run-checks";
import { supabase } from "@/lib/supabase";

/**
 * POST /api/checks  body: the chosen brand, the strip's confirmed ingredients and batch number
 *                -> batch safety (CDSCO alerts), banned combination (CDSCO lists), generic count
 *
 * POST, not GET, so medicine details and batch numbers are not written into URLs (and server
 * logs). Read-only; nothing is stored or logged.
 */
export async function POST(request: NextRequest) {
  const input = parseChecksInput(await request.json().catch(() => null));
  if (!input) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  try {
    return NextResponse.json(await runChecks(supabase(), input));
  } catch {
    return NextResponse.json({ error: "Checks failed" }, { status: 502 });
  }
}
