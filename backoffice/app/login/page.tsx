import { Logo } from "@/components/ui/Logo";
import { LoginForm } from "@/components/auth/LoginForm";

export const dynamic = "force-dynamic";

export default function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string; sent?: string; redirect?: string };
}) {
  const error = searchParams.error;
  const sent = searchParams.sent === "1";

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Logo className="text-lg" />
        </div>

        <div className="card p-6 sm:p-7">
          <h1 className="text-lg font-bold text-white">Inloggen</h1>
          <p className="mt-1 text-sm text-white/50">
            Toegang tot de FIT UP factuurmodule.
          </p>

          {error ? (
            <p className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {error}
            </p>
          ) : null}
          {sent ? (
            <p className="mt-4 rounded-xl border border-lime/30 bg-lime/10 px-3 py-2 text-sm text-lime">
              We hebben je een inloglink gemaild. Check je inbox.
            </p>
          ) : null}

          <LoginForm />
        </div>

        <p className="mt-6 text-center text-xs text-white/30">
          Beveiligd met Supabase Auth · Alleen jij ziet je eigen gegevens.
        </p>
      </div>
    </div>
  );
}
