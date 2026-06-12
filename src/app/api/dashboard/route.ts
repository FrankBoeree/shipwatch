import { NextResponse } from "next/server";
import { buildDashboardStats } from "@/lib/dashboard-stats";
import { getDashboardEvents, getLiveSnapshot, getStatsSummary, listPassages, listShips } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const [passages, stats, snapshot, events, ships] = await Promise.all([
    listPassages(10),
    getStatsSummary(),
    getLiveSnapshot(),
    getDashboardEvents(),
    listShips(),
  ]);

  return NextResponse.json({
    passages,
    stats,
    snapshot,
    dashboardStats: buildDashboardStats(events, ships),
  });
}
