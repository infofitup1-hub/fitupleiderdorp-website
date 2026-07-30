import { requireUser } from "@/lib/auth/session";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardTitle } from "@/components/ui/Card";
import { MailboxManager } from "@/components/invoices/MailboxManager";
import type { GmailConnection } from "@/types";

export const dynamic = "force-dynamic";

export default async function InstellingenPage({
  searchParams,
}: {
  searchParams: { gmail?: string; mailbox?: string; reason?: string };
}) {
  const { user, supabase } = await requireUser();

  const { data: connections } = await supabase
    .from("gmail_connections")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  const conns = (connections ?? []) as GmailConnection[];
  const storageBucket = process.env.SUPABASE_STORAGE_BUCKET || "invoices";

  const notice =
    searchParams.gmail === "connected"
      ? { type: "ok" as const, text: `Mailbox gekoppeld: ${searchParams.mailbox ?? ""}` }
      : searchParams.gmail === "error"
        ? { type: "error" as const, text: `Koppelen mislukt (${searchParams.reason ?? "onbekend"}).` }
        : null;

  return (
    <AppShell email={user.email ?? null} title="Instellingen">
      <div className="space-y-6">
        {notice ? (
          <div
            className={
              notice.type === "ok"
                ? "rounded-xl border border-lime/30 bg-lime/10 px-4 py-3 text-sm text-lime"
                : "rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300"
            }
          >
            {notice.text}
          </div>
        ) : null}

        <Card>
          <CardTitle>Gekoppelde mailboxen</CardTitle>
          <p className="mb-4 text-sm text-white/50">
            Koppel tot drie Gmail-accounts. We gebruiken uitsluitend read-only
            toegang en bewaren tokens versleuteld op de server.
          </p>
          <MailboxManager connections={conns} />
        </Card>

        <Card>
          <CardTitle>Opslag</CardTitle>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-white/40">Bucket</dt>
              <dd className="text-white">{storageBucket} (privé)</dd>
            </div>
            <div>
              <dt className="text-white/40">Padstructuur</dt>
              <dd className="text-white">
                invoices/&#123;user_id&#125;/&#123;jaar&#125;/Q&#123;kwartaal&#125;/
              </dd>
            </div>
          </dl>
        </Card>

        <Card>
          <CardTitle>Account</CardTitle>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-white/40">E-mailadres</dt>
              <dd className="text-white">{user.email}</dd>
            </div>
            <div>
              <dt className="text-white/40">Gebruiker-ID</dt>
              <dd className="truncate font-mono text-xs text-white/60">{user.id}</dd>
            </div>
          </dl>
          <form action="/auth/signout" method="post" className="mt-5">
            <button type="submit" className="btn-danger">
              Uitloggen
            </button>
          </form>
        </Card>
      </div>
    </AppShell>
  );
}
