"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { formatCount, labelShipType } from "@/lib/format";
import type { ShipType } from "@/lib/types";
import type { DashboardStats } from "@/lib/dashboard-stats";

const typeColors: Record<ShipType, string> = {
  ferry: "#8b5cf6",
  pleasure_craft: "#0ea5e9",
  cargo: "#f59e0b",
  sailboat: "#10b981",
  container: "#f97316",
  tanker: "#f43f5e",
  passenger: "#6366f1",
  tour_boat: "#14b8a6",
  tug: "#64748b",
  other: "#94a3b8",
  unknown: "#cbd5e1",
};

type DonutSlice = { name: string; value: number; sharePct: number; color: string };

type DonutTooltipProps = { active?: boolean; payload?: ReadonlyArray<{ payload: DonutSlice }> };

function DonutTooltip({ active, payload }: DonutTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  const slice = payload[0].payload as DonutSlice;

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-lg">
      <p className="font-semibold text-slate-900">{slice.name}</p>
      <p className="text-slate-600">
        {formatCount(slice.value)} passages ({slice.sharePct}%)
      </p>
    </div>
  );
}

export function ShipTypeDonut({ shipTypes }: { shipTypes: DashboardStats["shipTypes"] }) {
  const top = shipTypes.slice(0, 5);
  const rest = shipTypes.slice(5);
  const restCount = rest.reduce((sum, entry) => sum + entry.count, 0);
  const restShare = rest.reduce((sum, entry) => sum + entry.sharePct, 0);

  const slices: DonutSlice[] = top.map((entry) => ({
    name: labelShipType(entry.type),
    value: entry.count,
    sharePct: entry.sharePct,
    color: typeColors[entry.type] ?? typeColors.other,
  }));

  if (restCount > 0) {
    slices.push({ name: "Overig", value: restCount, sharePct: restShare, color: typeColors.other });
  }

  const total = slices.reduce((sum, slice) => sum + slice.value, 0);

  return (
    <section className="flex h-full flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <h2 className="text-lg font-semibold text-slate-950">Soorten schepen</h2>
      <p className="mt-1 text-sm text-slate-500">Verdeling in de laatste 30 dagen</p>

      {total === 0 ? (
        <div className="mt-6 flex flex-1 items-center justify-center rounded-lg bg-slate-50 py-12">
          <p className="text-sm text-slate-500">Nog geen passages in deze periode.</p>
        </div>
      ) : (
        <>
          <div className="relative mx-auto mt-4 h-44 w-44">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Tooltip content={<DonutTooltip />} />
                <Pie
                  data={slices}
                  dataKey="value"
                  nameKey="name"
                  innerRadius="68%"
                  outerRadius="100%"
                  paddingAngle={2}
                  strokeWidth={0}
                >
                  {slices.map((slice) => (
                    <Cell key={slice.name} fill={slice.color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <p className="text-2xl font-semibold text-slate-950">{formatCount(total)}</p>
              <p className="text-xs text-slate-500">passages</p>
            </div>
          </div>

          <ul className="mt-5 space-y-2">
            {slices.map((slice) => (
              <li key={slice.name} className="flex items-center gap-2 text-sm">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: slice.color }} />
                <span className="flex-1 text-slate-700">{slice.name}</span>
                <span className="font-semibold text-slate-900">{slice.sharePct}%</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
