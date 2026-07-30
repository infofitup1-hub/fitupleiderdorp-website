import { requireUser } from "@/lib/auth/session";
import { AppShell } from "@/components/layout/AppShell";
import { FacturenClient } from "@/components/invoices/FacturenClient";
import type { GmailConnection, Invoice } from "@/types";

export const dynamic = "force-dynamic";

export default async function FacturenPage() {
  const { user, supabase } = await requireUser();

  const [{ data: connections }, { data: invoices }] = await Promise.all([
    supabase
      .from("gmail_connections")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("invoices")
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "stored")
      .order("email_date", { ascending: false })
      .limit(500),
  ]);

  return (
    <AppShell email={user.email ?? null} title="Facturen">
      <FacturenClient
        connections={(connections ?? []) as GmailConnection[]}
        invoices={(invoices ?? []) as Invoice[]}
      />
    </AppShell>
  );
}
