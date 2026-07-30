import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { importRequestSchema } from "@/lib/validation/schemas";
import { runImport } from "@/lib/invoices/import";
import type { GmailConnection } from "@/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // allow long imports (seconds) on supported hosts

// POST /api/gmail/import  { year, quarter, mailbox: "all" | <connectionId> }
export async function POST(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = importRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { year, quarter, mailbox } = parsed.data;

  // Load the target connections (RLS ensures these belong to the user).
  let query = supabase
    .from("gmail_connections")
    .select("*")
    .eq("user_id", user.id)
    .eq("status", "connected");
  if (mailbox !== "all") {
    query = query.eq("id", mailbox);
  }
  const { data: connections, error: connErr } = await query;
  if (connErr) {
    return NextResponse.json({ error: "db_error" }, { status: 500 });
  }
  if (!connections || connections.length === 0) {
    return NextResponse.json(
      { error: "no_connected_mailboxes" },
      { status: 400 },
    );
  }

  try {
    const admin = createAdminClient();
    const { importRunId, summary } = await runImport({
      admin,
      userId: user.id,
      year,
      quarter,
      connections: connections as GmailConnection[],
    });
    return NextResponse.json({ ok: true, importRunId, summary });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(
      `[import] run failed: ${e instanceof Error ? e.message : "unknown"}`,
    );
    return NextResponse.json({ error: "import_failed" }, { status: 500 });
  }
}
