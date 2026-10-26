import { cacheLife } from "next/cache";
import { supabase } from "@/lib/supabase";

// When the monthly refresh last loaded each source, and how many rows (the `data_sources` table).
// Shared by the About page (dates) and the home page (counts).

export type SourceRow = { source: string; last_run_at: string; rows_loaded: number };

/**
 * Cached for an hour, so pages stay fast static pages and the database is asked at most once an
 * hour. If the database can't be reached (e.g. a build without its keys), returns null and the
 * pages say the numbers aren't available instead of failing.
 */
export async function refreshDates(): Promise<SourceRow[] | null> {
  "use cache";
  cacheLife("hours");
  try {
    const { data, error } = await supabase()
      .from("data_sources")
      .select("source, last_run_at, rows_loaded");
    return error ? null : (data as SourceRow[]);
  } catch {
    return null;
  }
}
