import { AppShell } from "@/components/app-shell";
import { HomeDashboard } from "@/components/dashboard/home-dashboard";
import { buildDashboardStats } from "@/lib/dashboard-stats";
import { getDashboardEvents, getLiveSnapshot, getStatsSummary, listPassages, listShips } from "@/lib/db";
import { VIEWER_REVALIDATE_SECONDS } from "@/lib/viewer-cache";

export const revalidate = VIEWER_REVALIDATE_SECONDS;

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
