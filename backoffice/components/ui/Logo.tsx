export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-extrabold tracking-tight ${className}`}>
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-lime text-black">
        <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
          <path
            fill="currentColor"
            d="M4 7h5v2H6v2h3v2H6v4H4V7Zm7 0h9v2h-3v8h-2V9h-4V7Z"
          />
        </svg>
      </span>
      <span className="text-white">
        FIT UP<span className="text-lime"> Backoffice</span>
      </span>
    </span>
  );
}
