import { labelShipType } from "@/lib/format";
import type { ShipType } from "@/lib/types";

const badgeStyles: Record<ShipType, string> = {
  pleasure_craft: "bg-sky-100 text-sky-950 ring-sky-200",
  cargo: "bg-amber-100 text-amber-950 ring-amber-200",
  ferry: "bg-violet-100 text-violet-950 ring-violet-200",
  container: "bg-orange-100 text-orange-950 ring-orange-200",
  tanker: "bg-rose-100 text-rose-950 ring-rose-200",
  passenger: "bg-indigo-100 text-indigo-950 ring-indigo-200",
  tour_boat: "bg-teal-100 text-teal-950 ring-teal-200",
  tug: "bg-slate-200 text-slate-900 ring-slate-300",
  other: "bg-slate-100 text-slate-700 ring-slate-200",
  unknown: "bg-slate-100 text-slate-500 ring-slate-200",
};

export function ShipTypeBadge({
  type,
  className = "",
}: {
  type: ShipType;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-semibold ring-1 ring-inset ${badgeStyles[type]} ${className}`}
    >
      {labelShipType(type)}
    </span>
  );
}
