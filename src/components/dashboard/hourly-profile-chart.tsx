"use client";

import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { DashboardStats } from "@/lib/dashboard-stats";

type HourPoint = DashboardStats["hourlyProfile"][number];
type ProfileTooltipProps = { active?: boolean; payload?: ReadonlyArray<{ payload: HourPoint }> };

function ProfileTooltip({ active, payload }: ProfileTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  const point = payload[0].payload as HourPoint;

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-lg">
      <p className="font-semibold text-slate-900">{point.hour}</p>
      <p className="mt-1 text-slate-600">
        Gemiddeld <span className="font-semibold text-slate-900">{point.avg.toLocaleString("nl-NL")}</span> passages
      </p>
      <p className="text-slate-600">Vandaag: {point.today}</p>
    </div>
  );
}

export function HourlyProfileChart({ profile }: { profile: DashboardStats["hourlyProfile"] }) {
  const maxAvg = Math.max(...profile.map((point) => point.avg), 0);
  const isEmpty = maxAvg === 0;

  return (
    <section className="flex h-full flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <h2 className="text-lg font-semibold text-slate-950">Gemiddeld dagverloop</h2>
      <p className="mt-1 text-sm text-slate-500">
        Gemiddeld aantal passages per uur, op basis van de laatste 4 weken. Het drukste uur licht op.
      </p>
      <div className="mt-6 h-56 flex-1">
        {isEmpty ? (
          <div className="flex h-full items-center justify-center rounded-lg bg-slate-50">
            <p className="text-sm text-slate-500">Nog onvoldoende gegevens.</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={profile} margin={{ top: 8, right: 8, left: -24, bottom: 0 }} barCategoryGap="18%">
              <XAxis
                dataKey="hour"
                tickLine={false}
                axisLine={false}
                interval={3}
                tick={{ fontSize: 11, fill: "#64748b" }}
                dy={6}
              />
              <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#64748b" }} />
              <Tooltip content={<ProfileTooltip />} cursor={{ fill: "rgba(14, 116, 144, 0.06)" }} />
              <Bar dataKey="avg" name="Gemiddeld" radius={[4, 4, 0, 0]}>
                {profile.map((point) => (
                  <Cell key={point.hour} fill={point.avg === maxAvg ? "#d97706" : "#67e8f9"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}
