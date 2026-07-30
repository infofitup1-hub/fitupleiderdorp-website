"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardTitle } from "@/components/ui/Card";
import type { GmailConnection, Invoice, ImportSummary } from "@/types";
import { clsx } from "@/lib/ui";

const QUARTERS = [1, 2, 3, 4];

function currentYear() {
  return new Date().getUTCFullYear();
}
function quarterOf(dateIso: string | null): number | null {
  if (!dateIso) return null;
  const m = new Date(dateIso).getUTCMonth();
  return Math.floor(m / 3) + 1;
}
function yearOf(dateIso: string | null): number | null {
  if (!dateIso) return null;
  return new Date(dateIso).getUTCFullYear();
}
function fmtBytes(n: number): string {
  if (!n) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("nl-NL", { day: "2-digit", month: "short", year: "numeric" });
}

export function FacturenClient({
  connections,
  invoices,
}: {
  connections: GmailConnection[];
  invoices: Invoice[];
}) {
  const router = useRouter();
  const connected = connections.filter((c) => c.status === "connected");

  const years = useMemo(() => {
    const set = new Set<number>([currentYear()]);
    for (const inv of invoices) {
      const y = yearOf(inv.email_date);
      if (y) set.add(y);
    }
    return Array.from(set).sort((a, b) => b - a);
  }, [invoices]);

  const [mailbox, setMailbox] = useState<string>("all");
  const [year, setYear] = useState<number>(currentYear());
  const [quarter, setQuarter] = useState<number>(
    Math.floor(new Date().getUTCMonth() / 3) + 1,
  );

  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [result, setResult] = useState<ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Filters for the stored list.
  const [filterMailbox, setFilterMailbox] = useState<string>("all");
  const [filterYear, setFilterYear] = useState<string>("all");
  const [filterQuarter, setFilterQuarter] = useState<string>("all");

  const connById = useMemo(() => {
    const m = new Map<string, GmailConnection>();
    for (const c of connections) m.set(c.id, c);
    return m;
  }, [connections]);

  const filtered = useMemo(() => {
    return invoices.filter((inv) => {
      if (filterMailbox !== "all" && inv.gmail_connection_id !== filterMailbox)
        return false;
      if (filterYear !== "all" && String(yearOf(inv.email_date)) !== filterYear)
        return false;
      if (
        filterQuarter !== "all" &&
        String(quarterOf(inv.email_date)) !== filterQuarter
      )
        return false;
      return true;
    });
  }, [invoices, filterMailbox, filterYear, filterQuarter]);

  async function runImport() {
    setRunning(true);
    setError(null);
    setResult(null);
    setProgress("Verbinden met Gmail en facturen ophalen…");
    try {
      const res = await fetch("/api/gmail/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mailbox, year, quarter }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(
          data?.error === "no_connected_mailboxes"
            ? "Geen gekoppelde mailbox gevonden. Koppel eerst een mailbox in Instellingen."
            : "Import mislukt. Probeer het later opnieuw.",
        );
      } else {
        setResult(data.summary as ImportSummary);
        router.refresh(); // reload stored list + history
      }
    } catch {
      setError("Netwerkfout tijdens de import.");
    } finally {
      setRunning(false);
      setProgress(null);
    }
  }

  async function openInvoice(id: string, download: boolean) {
    try {
      const res = await fetch(
        `/api/invoices/signed-url?id=${encodeURIComponent(id)}${download ? "&download=1" : ""}`,
      );
      const data = await res.json();
      if (res.ok && data.url) {
        window.open(data.url, "_blank", "noopener,noreferrer");
      } else {
        alert("Kon het bestand niet openen.");
      }
    } catch {
      alert("Netwerkfout bij het openen van het bestand.");
    }
  }

  return (
    <div className="space-y-6">
      {/* Import panel */}
      <Card>
        <CardTitle>Facturen ophalen</CardTitle>
        {connected.length === 0 ? (
          <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
            Er is nog geen mailbox gekoppeld. Ga naar Instellingen om te koppelen.
          </p>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="label" htmlFor="mailbox">
              Mailbox
            </label>
            <select
              id="mailbox"
              className="input"
              value={mailbox}
              onChange={(e) => setMailbox(e.target.value)}
            >
              <option value="all">Alle mailboxen</option>
              {connected.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.email_address}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="year">
              Jaar
            </label>
            <select
              id="year"
              className="input"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="quarter">
              Kwartaal
            </label>
            <select
              id="quarter"
              className="input"
              value={quarter}
              onChange={(e) => setQuarter(Number(e.target.value))}
            >
              {QUARTERS.map((q) => (
                <option key={q} value={q}>
                  Q{q}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            className="btn-primary"
            onClick={runImport}
            disabled={running || connected.length === 0}
          >
            {running ? <Spinner /> : null}
            {running ? "Bezig met ophalen…" : "Facturen ophalen"}
          </button>
          {progress ? (
            <span className="text-sm text-white/60">{progress}</span>
          ) : null}
        </div>

        {error ? (
          <p className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        ) : null}

        {result ? (
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <ResultTile label="Nieuw" value={result.new_files} accent />
            <ResultTile label="Dubbel" value={result.duplicate_files} />
            <ResultTile label="Overgeslagen" value={result.skipped_files} />
            <ResultTile label="Fouten" value={result.error_count} danger={result.error_count > 0} />
          </div>
        ) : null}
      </Card>

      {/* Stored invoices */}
      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <CardTitle>
            <span className="normal-case">Opgeslagen facturen ({filtered.length})</span>
          </CardTitle>
        </div>

        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <select
            className="input"
            value={filterMailbox}
            onChange={(e) => setFilterMailbox(e.target.value)}
            aria-label="Filter op mailbox"
          >
            <option value="all">Alle mailboxen</option>
            {connections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.email_address}
              </option>
            ))}
          </select>
          <select
            className="input"
            value={filterYear}
            onChange={(e) => setFilterYear(e.target.value)}
            aria-label="Filter op jaar"
          >
            <option value="all">Alle jaren</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <select
            className="input"
            value={filterQuarter}
            onChange={(e) => setFilterQuarter(e.target.value)}
            aria-label="Filter op kwartaal"
          >
            <option value="all">Alle kwartalen</option>
            {QUARTERS.map((q) => (
              <option key={q} value={q}>
                Q{q}
              </option>
            ))}
          </select>
        </div>

        {filtered.length === 0 ? (
          <p className="text-sm text-white/50">
            Geen facturen gevonden voor deze selectie.
          </p>
        ) : (
          <ul className="divide-y divide-white/5">
            {filtered.map((inv) => (
              <li
                key={inv.id}
                className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-white">
                    {inv.stored_filename}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-white/40">
                    {fmtDate(inv.email_date)} ·{" "}
                    {inv.sender_name || inv.sender_email || "onbekend"} ·{" "}
                    {fmtBytes(inv.file_size)} ·{" "}
                    {connById.get(inv.gmail_connection_id)?.email_address ?? ""}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    className="btn-secondary px-3 py-1.5 text-xs"
                    onClick={() => openInvoice(inv.id, false)}
                  >
                    Bekijken
                  </button>
                  <button
                    className="btn-ghost px-3 py-1.5 text-xs"
                    onClick={() => openInvoice(inv.id, true)}
                  >
                    Downloaden
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function ResultTile({
  label,
  value,
  accent = false,
  danger = false,
}: {
  label: string;
  value: number;
  accent?: boolean;
  danger?: boolean;
}) {
  return (
    <div className="rounded-xl border border-white/5 bg-ink-800 p-3 text-center">
      <div
        className={clsx(
          "text-2xl font-bold tabular-nums",
          danger ? "text-red-400" : accent ? "text-lime" : "text-white",
        )}
      >
        {value}
      </div>
      <div className="mt-0.5 text-xs text-white/50">{label}</div>
    </div>
  );
}

function Spinner() {
  return (
    <svg
      className="h-4 w-4 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4Z" />
    </svg>
  );
}
