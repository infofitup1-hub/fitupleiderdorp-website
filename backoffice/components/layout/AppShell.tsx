import { Logo } from "@/components/ui/Logo";
import { DesktopNav, MobileNav } from "./Nav";

// Authenticated layout: fixed sidebar on desktop, bottom nav on mobile.
export function AppShell({
  email,
  title,
  children,
}: {
  email: string | null;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen md:grid md:grid-cols-[16rem_1fr]">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen flex-col border-r border-white/10 bg-ink-800/60 p-4 md:flex">
        <div className="mb-8 px-2 pt-2">
          <Logo />
        </div>
        <DesktopNav email={email} />
      </aside>

      {/* Main column */}
      <div className="flex min-h-screen flex-col">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-white/10 bg-ink-800/80 px-4 py-3 backdrop-blur md:hidden">
          <Logo />
        </header>

        <main className="flex-1 px-4 pb-24 pt-5 sm:px-6 md:px-8 md:pb-10 md:pt-8">
          <div className="mx-auto w-full max-w-5xl">
            <h1 className="mb-6 text-xl font-bold text-white sm:text-2xl">
              {title}
            </h1>
            {children}
          </div>
        </main>
      </div>

      <MobileNav />
    </div>
  );
}
