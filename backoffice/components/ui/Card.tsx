import { clsx } from "@/lib/ui";

export function Card({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={clsx("card p-5 sm:p-6", className)}>{children}</div>;
}

export function CardTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-white/60">
      {children}
    </h2>
  );
}
