"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "@/lib/ui";

const ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: DashboardIcon },
  { href: "/facturen", label: "Facturen", icon: InvoiceIcon },
  { href: "/instellingen", label: "Instellingen", icon: SettingsIcon },
];

export function DesktopNav({ email }: { email: string | null }) {
  const pathname = usePathname();
  return (
    <nav className="flex h-full flex-col gap-1">
      {ITEMS.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(href + "/");
        return (
          <Link
            key={href}
            href={href}
            className={clsx(
              "flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors",
              active
                ? "bg-lime/15 text-lime"
                : "text-white/70 hover:bg-white/5 hover:text-white",
            )}
          >
            <Icon className="h-5 w-5" />
            {label}
          </Link>
        );
      })}
      <div className="mt-auto pt-4">
        {email ? (
          <p className="truncate px-3.5 pb-2 text-xs text-white/40" title={email}>
            {email}
          </p>
        ) : null}
        <form action="/auth/signout" method="post">
          <button type="submit" className="btn-ghost w-full justify-start">
            <LogoutIcon className="h-5 w-5" />
            Uitloggen
          </button>
        </form>
      </div>
    </nav>
  );
}

export function MobileNav() {
  const pathname = usePathname();
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-ink-800/95 backdrop-blur md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="mx-auto grid max-w-lg grid-cols-3">
        {ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={clsx(
                "flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium",
                active ? "text-lime" : "text-white/60",
              )}
            >
              <Icon className="h-5 w-5" />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function DashboardIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <path d="M4 13h6V4H4v9Zm0 7h6v-5H4v5Zm10 0h6v-9h-6v9Zm0-16v5h6V4h-6Z" fill="currentColor" />
    </svg>
  );
}
function InvoiceIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <path d="M6 2h9l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1Zm8 1.5V8h4.5L14 3.5ZM8 12h8v1.5H8V12Zm0 3.5h8V17H8v-1.5Z" fill="currentColor" />
    </svg>
  );
}
function SettingsIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm9 4-2.1-.4a6.9 6.9 0 0 0-.6-1.5l1.2-1.8-1.4-1.4-1.8 1.2a6.9 6.9 0 0 0-1.5-.6L14 3h-2l-.4 2.1a6.9 6.9 0 0 0-1.5.6L8.3 4.5 6.9 5.9l1.2 1.8a6.9 6.9 0 0 0-.6 1.5L5 12l2.1.4c.1.5.3 1 .6 1.5l-1.2 1.8 1.4 1.4 1.8-1.2c.5.3 1 .5 1.5.6L12 21h2l.4-2.1c.5-.1 1-.3 1.5-.6l1.8 1.2 1.4-1.4-1.2-1.8c.3-.5.5-1 .6-1.5L21 12Z" fill="currentColor" />
    </svg>
  );
}
function LogoutIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <path d="M10 3H5a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h5v-2H6V5h4V3Zm6.2 4.8-1.4 1.4L16.6 11H9v2h7.6l-1.8 1.8 1.4 1.4L20.4 12l-4.2-4.2Z" fill="currentColor" />
    </svg>
  );
}
