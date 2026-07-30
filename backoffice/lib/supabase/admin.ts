import { createClient } from "@supabase/supabase-js";

// Service-role client. SERVER ONLY — bypasses RLS. Import this ONLY from
// route handlers / server code that has already authenticated the user and
// scopes every query by that user's id. Never import from client components.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      "Supabase admin client requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    );
  }
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export const STORAGE_BUCKET =
  process.env.SUPABASE_STORAGE_BUCKET || "invoices";
