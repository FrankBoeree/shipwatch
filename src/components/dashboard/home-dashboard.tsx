"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { CameraImage, CameraPlaceholder } from "@/components/camera-frame";
import { TrafficChart } from "@/components/dashboard/traffic-chart";
import { LiveStatusBadge } from "@/components/live-status-badge";
import { PassageCarousel } from "@/components/passage-carousel";
import { StatCard } from "@/components/stat-card";
import type { DashboardStats } from "@/lib/dashboard-stats";
import { formatTime } from "@/lib/format";
import { isSnapshotLive } from "@/lib/live-snapshot";
import type { Passage, StatsSummary } from "@/lib/types";
import { directionDestinationLabels } from "@/lib/types";
import { VIEWER_REFRESH_INTERVAL_MS, snapshotUrlWithCacheBuster } from "@/lib/viewer-cache";

type LiveSnapshot = {
  latestSnapshotUrl: string | null;
  latestSnapshotUpdatedAt: string | null;
  lastSyncAt: string | null;
};

type DashboardPayload = {
  passages: Passage[];
  stats: StatsSummary;
  snapshot: LiveSnapshot;
  dashboardStats: DashboardStats;
};

type HomeDashboardProps = DashboardPayload;

export function HomeDashboard({ passages: initialPassages, stats: initialStats, snapshot: initialSnapshot, dashboardStats: initialDashboardStats }: HomeDashboardProps) {
  const [passages, setPassages] = useState(initialPassages);
  const [stats, setStats] = useState(initialStats);
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [dashboardStats, setDashboardStats] = useState(initialDashboardStats);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/dashboard", { cache: "no-store" });
      if (!response.ok) return;

      const payload = (await response.json()) as DashboardPayload;
      setPassages(payload.passages);
      setStats(payload.stats);
      setSnapshot(payload.snapshot);
      setDashboardStats(payload.dashboardStats);
    } catch {
      // Keep showing the last known data when a refresh fails.
    }
  }, []);

  useEffect(() => {
    const refreshIfVisible = () => {
      if (document.visibilityState === "visible") {
        void refresh();
      }
    };

    const intervalId = window.setInterval(refreshIfVisible, VIEWER_REFRESH_INTERVAL_MS);
    document.addEventListener("visibilitychange", refreshIfVisible);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", refreshIfVisible);
    };
  }, [refresh]);

  const { total: totalToday, towardIJmuiden, towardIJmeer } = stats.passagesToday;
  const snapshotUrl = snapshotUrlWithCacheBuster(snapshot.latestSnapshotUrl, snapshot.latestSnapshotUpdatedAt);
  const isLive = isSnapshotLive(snapshot.latestSnapshotUpdatedAt);

  return (
    <>
      <section className="grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-cyan-800">Amsterdam IJ</p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight">Scheepspassages vanaf de kade</h1>
          <p className="mt-3 max-w-2xl text-slate-600">
            Publieke viewer voor gedetecteerde passages, bijna-live snapshot en eenvoudige verkeersstatistieken.
          </p>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <StatCard label="Vandaag" value={totalToday} detail="Geregistreerde passages" />
            <StatCard
              label={directionDestinationLabels.towardIJmuiden}
              value={towardIJmuiden}
              detail="Schepen"
            />
            <StatCard
              label={directionDestinationLabels.towardIJmeer}
              value={towardIJmeer}
              detail="Schepen"
            />
          </div>
        </div>
        <aside className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <h2 className="font-semibold">Laatste snapshot</h2>
              <LiveStatusBadge isLive={isLive} />
            </div>
            <span className="shrink-0 text-xs text-slate-500">
              {snapshot.latestSnapshotUpdatedAt ? formatTime(snapshot.latestSnapshotUpdatedAt) : "Demo"}
            </span>
          </div>
          {snapshotUrl ? (
            <div className="relative mt-3">
              <CameraImage
                key={snapshotUrl}
                src={snapshotUrl}
                alt="Laatste live snapshot van het IJ"
                frameClassName="rounded-md"
              />
              <div className="pointer-events-none absolute bottom-2 left-2">
                <LiveStatusBadge isLive={isLive} className="shadow-md ring-1 ring-black/10" />
              </div>
            </div>
          ) : (
            <CameraPlaceholder className="mt-3 rounded-md">Nog geen live snapshot beschikbaar</CameraPlaceholder>
          )}
        </aside>
      </section>
      <section className="mt-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Laatst gespotte schepen</h2>
        </div>
        <PassageCarousel passages={passages} />
        <div className="mt-4">
          <Link
            href="/passages"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:border-cyan-700 hover:text-cyan-900"
          >
            Bekijk alle passages
            <ArrowRight size={16} />
          </Link>
        </div>
      </section>
      <section className="mt-8">
        <TrafficChart series={dashboardStats.series} initialRange="today" initialSplitByDirection />
        <div className="mt-4">
          <Link
            href="/stats"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:border-cyan-700 hover:text-cyan-900"
          >
            Bekijk alle statistieken
            <ArrowRight size={16} />
          </Link>
        </div>
      </section>
    </>
  );
}
