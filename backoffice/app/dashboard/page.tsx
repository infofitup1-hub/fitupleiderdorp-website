import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { AppShell } from "@/components/layout/AppShell";
import { Stat } from "@/components/ui/Stat";
import { Card, CardTitle } from "@/components/ui/Card";
import type { GmailConnection, ImportRun } from "@/types";

export const dynamic = "force-dynamic";

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("nl-NL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function DashboardPage() {
  const { user, supabase } = await requireUser();

  const [{ data: connections }, { data: runs }] = await Promise.all([
    supabase
      .from("gmail_connections")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("import_runs")
      .select("*")
      .eq("user_id", user.id)
      .order("started_at", { ascending: false })
      .limit(5),
  ]);

  const conns = (connections ?? []) as GmailConnection[];
  const connectedCount = conns.filter((c) => c.status === "connected").length;
  const history = (runs ?? []) as ImportRun[];
  const last = history[0];

  return (
    <AppShell email={user.email ?? null} title="Dashboard">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        <Stat
          label="Gekoppelde mailboxen"
          value={`${connectedCount}/3`}
          accent
        />
        <Stat
          label="Laatste import"
          value={last ? formatDateTime(last.started_at) : "—"}
        />
        <Stat
          label="Nieuwe bestanden"
          value={last?.new_files ?? 0}
          accent
          hint="laatste import"
        />
        <Stat label="Dubbelen" value={last?.duplicate_files ?? 0} hint="laatste import" />
        <Stat
          label="Overgeslagen"
          value={last?.skipped_files ?? 0}
          hint="laatste import"
        />
        <Stat label="Fouten" value={last?.error_count ?? 0} hint="laatste import" />
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <Link href="/facturen" className="btn-primary">
          Facturen ophalen
        </Link>
        <Link href="/instellingen" className="btn-secondary">
          Mailboxen beheren
        </Link>
      </div>

      <div className="mt-8">
        <Card>
          <CardTitle>Importhistorie</CardTitle>
          {history.length === 0 ? (
            <p className="text-sm text-white/50">
              Nog geen imports uitgevoerd. Ga naar{" "}
              <Link href="/facturen" className="text-lime underline">
                Facturen
              </Link>{" "}
              om te starten.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-white/40">
                    <th className="pb-2 pr-4 font-medium">Periode</th>
                    <th className="pb-2 pr-4 font-medium">Mailbox</th>
                    <th className="pb-2 pr-4 font-medium">Gestart</th>
                    <th className="pb-2 pr-4 font-medium">Nieuw</th>
                    <th className="pb-2 pr-4 font-medium">Dubbel</th>
                    <th className="pb-2 pr-4 font-medium">Overgeslagen</th>
                    <th className="pb-2 font-medium">Fouten</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {history.map((r) => (
                    <tr key={r.id} className="text-white/80">
                      <td className="py-2 pr-4">
                        {r.year} · Q{r.quarter}
                      </td>
                      <td className="py-2 pr-4">
                        {r.mailbox_selection === "all" ? "Alle" : r.mailbox_selection}
                      </td>
                      <td className="py-2 pr-4">{formatDateTime(r.started_at)}</td>
                      <td className="py-2 pr-4 font-semibold text-lime">{r.new_files}</td>
                      <td className="py-2 pr-4">{r.duplicate_files}</td>
                      <td className="py-2 pr-4">{r.skipped_files}</td>
                      <td className="py-2">{r.error_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </AppShell>
  );
}
