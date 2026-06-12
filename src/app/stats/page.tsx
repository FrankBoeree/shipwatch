import { AppShell } from "@/components/app-shell";
import { DirectionCard } from "@/components/dashboard/direction-card";
import { HourlyProfileChart } from "@/components/dashboard/hourly-profile-chart";
import { KpiCards } from "@/components/dashboard/kpi-cards";
import { PeakHeatmap } from "@/components/dashboard/peak-heatmap";
import { ShipTypeDonut } from "@/components/dashboard/ship-type-donut";
import { TopShipsCard } from "@/components/dashboard/top-ships-card";
import { TrafficChart } from "@/components/dashboard/traffic-chart";
import { buildDashboardStats } from "@/lib/dashboard-stats";
import { getDashboardEvents, listShips } from "@/lib/db";
import { formatCount } from "@/lib/format";

export const revalidate = 60;

export default async function StatsPage() {
  const [events, ships] = await Promise.all([getDashboardEvents(), listShips()]);
  const stats = buildDashboardStats(events, ships);

  return (
    <AppShell>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-cyan-800">Dashboard</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Statistieken</h1>
          <p className="mt-2 max-w-2xl text-slate-600">
            Inzicht in het scheepvaartverkeer op het IJ: drukte, piekmomenten en wie er voorbij vaart.
          </p>
        </div>
        <p className="text-sm text-slate-500">
          <span className="font-semibold text-slate-900">{formatCount(stats.total12Months)}</span> passages en{" "}
          <span className="font-semibold text-slate-900">{formatCount(stats.uniqueShips)}</span> bekende schepen in het
          afgelopen jaar
        </p>
      </div>

      <KpiCards stats={stats} />

      <div className="mt-6">
        <TrafficChart series={stats.series} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <HourlyProfileChart profile={stats.hourlyProfile} />
        </div>
        <div className="lg:col-span-3">
          <PeakHeatmap heatmap={stats.heatmap} />
        </div>
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        <ShipTypeDonut shipTypes={stats.shipTypes} />
        <DirectionCard direction={stats.direction30d} newVsReturning={stats.newVsReturning} />
        <div className="md:col-span-2 xl:col-span-1">
          <TopShipsCard topShips={stats.topShips} />
        </div>
      </div>
    </AppShell>
  );
}
