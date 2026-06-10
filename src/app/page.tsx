import { AppShell } from "@/components/app-shell";
import { LiveStatusBadge } from "@/components/live-status-badge";
import { PassageGrid } from "@/components/passage-grid";
import { StatCard } from "@/components/stat-card";
import { getLiveSnapshot, getStatsSummary, listPassages } from "@/lib/db";
import { formatTime, labelShipType } from "@/lib/format";
import { isSnapshotLive } from "@/lib/live-snapshot";
import { snapshotUrlWithCacheBuster } from "@/lib/viewer-cache";

export const revalidate = 15;

export default async function Home() {
  const [passages, stats, snapshot] = await Promise.all([
    listPassages(10),
    getStatsSummary(),
    getLiveSnapshot(),
  ]);
  const totalToday = stats.passagesPerDay[0]?.passageCount ?? 0;
  const topType = stats.passagesPerShipType[0];
  const snapshotUrl = snapshotUrlWithCacheBuster(snapshot.latestSnapshotUrl, snapshot.latestSnapshotUpdatedAt);
  const isLive = isSnapshotLive(snapshot.latestSnapshotUpdatedAt);

  return (
    <AppShell>
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
              label="Meest gezien type"
              value={topType ? labelShipType(topType.shipType) : "-"}
              detail={topType ? `${topType.passageCount} passages` : "Nog geen data"}
            />
            <StatCard label="Bekend / terugkerend" value={stats.newVsReturning.returningShips} detail="Passages met eerder gezien schip" />
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
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={snapshotUrl} alt="Laatste live snapshot van het IJ" className="aspect-video w-full rounded-md object-cover" />
              <div className="pointer-events-none absolute bottom-2 left-2">
                <LiveStatusBadge isLive={isLive} className="shadow-md ring-1 ring-black/10" />
              </div>
            </div>
          ) : (
            <div className="mt-3 flex aspect-video items-center justify-center rounded-md bg-slate-100 text-sm text-slate-500">
              Nog geen live snapshot beschikbaar
            </div>
          )}
        </aside>
      </section>
      <section className="mt-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Laatst gespotte schepen</h2>
        </div>
        <PassageGrid passages={passages} />
      </section>
    </AppShell>
  );
}
