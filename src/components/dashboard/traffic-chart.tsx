"use client";

import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatCount } from "@/lib/format";
import type { DashboardStats, SeriesPoint } from "@/lib/dashboard-stats";

const COLORS = {
  total: "#0e7490",
  ijmeer: "#0e7490",
  ijmuiden: "#d97706",
};

type RangeKey = "today" | "week" | "month" | "year";

const rangeOptions: Array<{ value: RangeKey; label: string; description: string }> = [
  { value: "today", label: "Vandaag", description: "per uur" },
  { value: "week", label: "Week", description: "laatste 7 dagen" },
  { value: "month", label: "Maand", description: "laatste 30 dagen" },
  { value: "year", label: "Jaar", description: "laatste 12 maanden" },
];

type ChartTooltipProps = { active?: boolean; payload?: ReadonlyArray<{ payload: SeriesPoint }> };

function ChartTooltip({ active, payload }: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  const point = payload[0].payload as SeriesPoint;

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-lg">
      <p className="font-semibold text-slate-900">{point.fullLabel}</p>
      <p className="mt-1 text-slate-600">
        Totaal: <span className="font-semibold text-slate-900">{formatCount(point.total)}</span>
      </p>
      <p className="flex items-center gap-1.5 text-slate-600">
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: COLORS.ijmuiden }} />
        Richting IJmuiden: {formatCount(point.towardIJmuiden)}
      </p>
      <p className="flex items-center gap-1.5 text-slate-600">
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: COLORS.ijmeer }} />
        Richting IJmeer: {formatCount(point.towardIJmeer)}
      </p>
    </div>
  );
}

export function TrafficChart({
  series,
  initialRange = "week",
  initialSplitByDirection = false,
}: {
  series: DashboardStats["series"];
  initialRange?: RangeKey;
  initialSplitByDirection?: boolean;
}) {
  const [range, setRange] = useState<RangeKey>(initialRange);
  const [splitByDirection, setSplitByDirection] = useState(initialSplitByDirection);

  const data = series[range];
  const activeOption = rangeOptions.find((option) => option.value === range)!;
  const isEmpty = data.every((point) => point.total === 0);
  const tickInterval = range === "month" ? 4 : range === "today" ? 2 : 0;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">Scheepvaartverkeer</h2>
          <p className="mt-1 text-sm text-slate-500">Aantal passages {activeOption.description}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1">
            {rangeOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setRange(option.value)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                  range === option.value
                    ? "bg-white text-cyan-900 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setSplitByDirection((value) => !value)}
            aria-pressed={splitByDirection}
            className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
              splitByDirection
                ? "border-cyan-700 bg-cyan-50 text-cyan-900"
                : "border-slate-200 bg-white text-slate-600 hover:text-slate-900"
            }`}
          >
            Per richting
          </button>
        </div>
      </div>

      {splitByDirection ? (
        <div className="mt-4 flex flex-wrap gap-4 text-sm text-slate-600">
          <span className="inline-flex items-center gap-2">
            <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: COLORS.ijmuiden }} />
            Richting IJmuiden
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: COLORS.ijmeer }} />
            Richting IJmeer
          </span>
        </div>
      ) : null}

      <div className="mt-6 h-80">
        {isEmpty ? (
          <div className="flex h-full items-center justify-center rounded-lg bg-slate-50">
            <p className="text-sm text-slate-500">Geen passages in deze periode.</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }} barCategoryGap="22%">
              <defs>
                <linearGradient id="trafficTotal" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#06b6d4" />
                  <stop offset="100%" stopColor="#0e7490" />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                interval={tickInterval}
                tick={{ fontSize: 11, fill: "#64748b" }}
                dy={6}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
                tick={{ fontSize: 11, fill: "#64748b" }}
              />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(14, 116, 144, 0.06)" }} />
              {splitByDirection ? (
                <>
                  <Bar dataKey="towardIJmuiden" stackId="direction" fill={COLORS.ijmuiden} name="Richting IJmuiden" />
                  <Bar
                    dataKey="towardIJmeer"
                    stackId="direction"
                    fill={COLORS.ijmeer}
                    name="Richting IJmeer"
                    radius={[4, 4, 0, 0]}
                  />
                </>
              ) : (
                <Bar dataKey="total" fill="url(#trafficTotal)" name="Totaal" radius={[5, 5, 0, 0]} />
              )}
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}
