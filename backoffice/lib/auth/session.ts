import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Returns the authenticated user or redirects to /login. Use at the top of
// every protected Server Component / page.
export async function requireUser() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { user, supabase };
}
