import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, STORAGE_BUCKET } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// GET /api/gmail/../invoices/signed-url?id=<invoiceId>&download=1
// Returns a short-lived signed URL for a stored PDF the user owns.
export async function GET(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const id = request.nextUrl.searchParams.get("id");
  const download = request.nextUrl.searchParams.get("download") === "1";
  if (!id) {
    return NextResponse.json({ error: "missing_id" }, { status: 400 });
  }

  // Fetch the invoice via the user-scoped client (RLS guarantees ownership).
  const { data: invoice, error } = await supabase
    .from("invoices")
    .select("storage_path, stored_filename")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error || !invoice) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const admin = createAdminClient();
  const { data: signed, error: signErr } = await admin.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(invoice.storage_path, 120, {
      download: download ? invoice.stored_filename : undefined,
    });
  if (signErr || !signed) {
    return NextResponse.json({ error: "sign_failed" }, { status: 500 });
  }

  return NextResponse.json({ url: signed.signedUrl });
}
