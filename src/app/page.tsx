import { AppShell } from "@/components/app-shell";
import { HomeDashboard } from "@/components/dashboard/home-dashboard";
import { buildDashboardStats } from "@/lib/dashboard-stats";
import { getDashboardEvents, getLiveSnapshot, getStatsSummary, listPassages, listShips } from "@/lib/db";

export const revalidate = 15;

export default async function Home() {
  const [passages, stats, snapshot, events, ships] = await Promise.all([
    listPassages(10),
    getStatsSummary(),
    getLiveSnapshot(),
    getDashboardEvents(),
    listShips(),
  ]);
  const dashboardStats = buildDashboardStats(events, ships);

  return (
    <AppShell>
      <HomeDashboard
        passages={passages}
        stats={stats}
        snapshot={snapshot}
        dashboardStats={dashboardStats}
      />
    </AppShell>
  );
}
