import Link from "next/link";
import { Trophy } from "lucide-react";
import { ShipTypeBadge } from "@/components/ship-type-badge";
import { formatCount } from "@/lib/format";
import type { DashboardStats } from "@/lib/dashboard-stats";

const rankStyles = [
  "bg-amber-100 text-amber-800",
  "bg-slate-200 text-slate-700",
  "bg-orange-100 text-orange-800",
];

export function TopShipsCard({ topShips }: { topShips: DashboardStats["topShips"] }) {
  const maxCount = Math.max(...topShips.map((ship) => ship.count), 1);

  return (
    <section className="flex h-full flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-950">
        <Trophy size={18} className="text-amber-500" /> Vaste gasten
      </h2>
      <p className="mt-1 text-sm text-slate-500">De vaakst gespotte schepen</p>

      {topShips.length === 0 ? (
        <div className="mt-6 flex flex-1 items-center justify-center rounded-lg bg-slate-50 py-12">
          <p className="text-sm text-slate-500">Nog geen schepen herkend.</p>
        </div>
      ) : (
        <ul className="mt-5 space-y-4">
          {topShips.map((ship, index) => (
            <li key={ship.id}>
              <Link href={`/ships/${ship.id}`} className="group block">
                <div className="flex items-center gap-3">
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                      rankStyles[index] ?? "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900 group-hover:text-cyan-800">
                    {ship.name}
                  </span>
                  <ShipTypeBadge type={ship.type} />
                  <span className="w-10 shrink-0 text-right text-sm font-semibold text-slate-900">
                    {formatCount(ship.count)}
                  </span>
                </div>
                <div className="ml-9 mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-cyan-700 transition-all duration-500"
                    style={{ width: `${Math.max(6, (ship.count / maxCount) * 100)}%` }}
                  />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
