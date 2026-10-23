import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Server-only, read-only access with the PUBLISHABLE key. Row Level Security on every table
// allows only SELECT for this key, so even if it leaked it could not change any data.
// The secret (service) key is never used by the web app; only the GitHub pipeline has it.
let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (client) return client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY must be set (see web/.env.example)");
  }
  client = createClient(url, key, { auth: { persistSession: false } });
  return client;
}
