import { AppShell } from "@/components/app-shell";
import { PassageBarChart } from "@/components/passage-bar-chart";
import { StatCard } from "@/components/stat-card";
import { getPassagesOverTime, getStatsSummary } from "@/lib/db";

export const revalidate = 15;

export default async function StatsPage() {
  const [stats, passagesOverTime] = await Promise.all([getStatsSummary(), getPassagesOverTime("day")]);
  const total = stats.passagesPerDay.reduce((sum, row) => sum + row.passageCount, 0);

  return (
    <AppShell>
      <div className="mb-6">
        <p className="text-sm font-semibold uppercase tracking-wide text-cyan-800">Read-only</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Statistieken</h1>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="Passages in periode" value={total} />
        <StatCard label="Nieuwe schepen" value={stats.newVsReturning.newShips} />
        <StatCard label="Eerder gezien" value={stats.newVsReturning.returningShips} />
      </div>
      <div className="mt-8">
        <PassageBarChart initialBuckets={passagesOverTime} />
      </div>
    </AppShell>
  );
}
