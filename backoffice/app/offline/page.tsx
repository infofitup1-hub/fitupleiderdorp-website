import { Logo } from "@/components/ui/Logo";

export const metadata = { title: "Offline — FIT UP Backoffice" };

export default function OfflinePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <Logo className="text-lg" />
      <h1 className="text-xl font-bold text-white">Je bent offline</h1>
      <p className="max-w-sm text-sm text-white/50">
        Er is geen internetverbinding. De factuurimport werkt alleen online.
        Zodra je weer verbinding hebt, kun je verder waar je was.
      </p>
      <a href="/dashboard" className="btn-primary mt-2">
        Opnieuw proberen
      </a>
    </div>
  );
}
