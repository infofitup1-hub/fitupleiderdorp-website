import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// POST /api/gmail/disconnect  { connectionId }
// Removes the stored (encrypted) tokens and marks the mailbox disconnected.
// The row is kept so historical invoices remain linked; tokens are cleared.
export async function POST(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { connectionId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const connectionId = body.connectionId;
  if (!connectionId) {
    return NextResponse.json({ error: "missing_connectionId" }, { status: 400 });
  }

  // Verify ownership via the user-scoped client (RLS).
  const { data: conn, error } = await supabase
    .from("gmail_connections")
    .select("id")
    .eq("id", connectionId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error || !conn) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Clear tokens with the admin client and mark disconnected.
  const admin = createAdminClient();
  const { error: updErr } = await admin
    .from("gmail_connections")
    .update({
      encrypted_access_token: null,
      encrypted_refresh_token: null,
      token_expiry: null,
      status: "disconnected",
      updated_at: new Date().toISOString(),
    })
    .eq("id", connectionId)
    .eq("user_id", user.id);
  if (updErr) {
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
