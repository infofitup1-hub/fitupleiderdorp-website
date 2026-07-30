import { clsx } from "@/lib/ui";

export function Stat({
  label,
  value,
  accent = false,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  accent?: boolean;
  hint?: string;
}) {
  return (
    <div className="card p-4 sm:p-5">
      <div className="text-xs font-medium uppercase tracking-wide text-white/50">
        {label}
      </div>
      <div
        className={clsx(
          "mt-1 text-2xl font-bold tabular-nums sm:text-3xl",
          accent ? "text-lime" : "text-white",
        )}
      >
        {value}
      </div>
      {hint ? <div className="mt-1 text-xs text-white/40">{hint}</div> : null}
    </div>
  );
}
