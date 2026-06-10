export function LiveStatusBadge({ isLive, className = "" }: { isLive: boolean; className?: string }) {
  return (
    <span
      className={`${
        isLive
          ? "inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800"
          : "inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600"
      } ${className}`}
    >
      <span
        aria-hidden="true"
        className={isLive ? "h-2 w-2 animate-pulse rounded-full bg-emerald-500" : "h-2 w-2 rounded-full bg-slate-400"}
      />
      {isLive ? "Live" : "Niet live"}
    </span>
  );
}
