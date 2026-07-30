"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { GmailConnection } from "@/types";
import { clsx } from "@/lib/ui";

const MAX_MAILBOXES = 3;

function statusBadge(status: string) {
  switch (status) {
    case "connected":
      return "badge bg-lime/15 text-lime";
    case "error":
      return "badge bg-red-500/15 text-red-300";
    default:
      return "badge bg-white/10 text-white/60";
  }
}
function statusLabel(status: string) {
  switch (status) {
    case "connected":
      return "Verbonden";
    case "error":
      return "Fout — opnieuw koppelen";
    default:
      return "Losgekoppeld";
  }
}

export function MailboxManager({
  connections,
}: {
  connections: GmailConnection[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  const canAddMore = connections.length < MAX_MAILBOXES;

  function connect(loginHint?: string, reconnect?: boolean) {
    const params = new URLSearchParams();
    if (loginHint) params.set("loginHint", loginHint);
    if (reconnect) params.set("reconnect", "1");
    // Full-page navigation into the server-side OAuth flow.
    window.location.href = `/api/gmail/connect${params.toString() ? `?${params}` : ""}`;
  }

  async function disconnect(id: string) {
    if (!confirm("Deze mailbox loskoppelen? De opgeslagen facturen blijven bewaard.")) {
      return;
    }
    setBusy(id);
    try {
      const res = await fetch("/api/gmail/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId: id }),
      });
      if (res.ok) {
        router.refresh();
      } else {
        alert("Loskoppelen mislukt.");
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      {connections.length === 0 ? (
        <p className="text-sm text-white/50">Nog geen mailboxen gekoppeld.</p>
      ) : (
        <ul className="divide-y divide-white/5">
          {connections.map((c) => (
            <li
              key={c.id}
              className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-white">
                  {c.email_address}
                </p>
                <span className={clsx("mt-1", statusBadge(c.status))}>
                  {statusLabel(c.status)}
                </span>
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  className="btn-secondary px-3 py-1.5 text-xs"
                  onClick={() => connect(c.email_address, true)}
                  disabled={busy === c.id}
                >
                  Opnieuw koppelen
                </button>
                <button
                  className="btn-danger px-3 py-1.5 text-xs"
                  onClick={() => disconnect(c.id)}
                  disabled={busy === c.id}
                >
                  Loskoppelen
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="pt-2">
        <button
          className="btn-primary"
          onClick={() => connect()}
          disabled={!canAddMore}
          title={canAddMore ? undefined : "Maximaal 3 mailboxen"}
        >
          Mailbox koppelen
        </button>
        {!canAddMore ? (
          <p className="mt-2 text-xs text-white/40">
            Je hebt het maximum van 3 mailboxen bereikt.
          </p>
        ) : null}
      </div>
    </div>
  );
}
