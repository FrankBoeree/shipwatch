import { CalendarDays, Clock, Ship, TrendingUp, type LucideIcon } from "lucide-react";
import { formatCount } from "@/lib/format";
import type { DashboardStats } from "@/lib/dashboard-stats";

function TrendChip({ pct, context }: { pct: number | null; context: string }) {
  if (pct === null) {
    return <p className="mt-2 text-xs text-slate-400">Nog onvoldoende gegevens</p>;
  }

  const up = pct > 0;
  const flat = pct === 0;
  const chipClass = flat
    ? "bg-slate-100 text-slate-600"
    : up
      ? "bg-emerald-50 text-emerald-700"
      : "bg-rose-50 text-rose-600";

  return (
    <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
      <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-semibold ${chipClass}`}>
        {flat ? "±0%" : `${up ? "+" : ""}${pct}%`}
      </span>
      {context}
    </p>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  children,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  children?: React.ReactNode;
}) {
  return (
    <section className="relative overflow-hidden rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="absolute -right-4 -top-4 flex h-16 w-16 items-end justify-start rounded-full bg-cyan-50 pb-3 pl-3 text-cyan-700">
        <Icon size={20} strokeWidth={1.8} />
      </div>
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">{value}</p>
      {children}
    </section>
  );
}

export function KpiCards({ stats }: { stats: DashboardStats }) {
  const { today, last7Days, peakHour, peakWeekday } = stats.kpis;

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <KpiCard icon={Ship} label="Passages vandaag" value={formatCount(today.total)}>
        <TrendChip pct={today.trendPct} context="t.o.v. een gemiddelde dag" />
      </KpiCard>

      <KpiCard icon={CalendarDays} label="Laatste 7 dagen" value={formatCount(last7Days.total)}>
        <TrendChip pct={last7Days.trendPct} context="t.o.v. de week ervoor" />
      </KpiCard>

      <KpiCard icon={Clock} label="Drukste uur" value={peakHour ? peakHour.label : "–"}>
        <p className="mt-2 text-xs text-slate-500">
          {peakHour ? `Gemiddeld ${peakHour.avg} passages per dag` : "Nog onvoldoende gegevens"}
        </p>
      </KpiCard>

      <KpiCard icon={TrendingUp} label="Drukste dag" value={peakWeekday ? peakWeekday.label : "–"}>
        <p className="mt-2 text-xs text-slate-500">
          {stats.recordDay
            ? `Record: ${formatCount(stats.recordDay.count)} op ${stats.recordDay.label}`
            : "Nog geen record bekend"}
        </p>
      </KpiCard>
    </div>
  );
}
