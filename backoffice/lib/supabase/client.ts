"use client";

import { createBrowserClient } from "@supabase/ssr";

// Browser Supabase client. Uses the public anon key; RLS guarantees a user can
// only read/write their own rows. Never used for privileged operations.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
