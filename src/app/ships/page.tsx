import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { listShips } from "@/lib/db";
import { formatDateTime, labelShipType } from "@/lib/format";
export const revalidate = 15;

export default async function ShipsPage() {
  const ships = await listShips();

  return (
    <AppShell>
      <div className="mb-6">
        <p className="text-sm font-semibold uppercase tracking-wide text-cyan-800">AIS fase</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Terugkerende schepen</h1>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {ships.map((ship) => (
          <Link key={ship.id} href={`/ships/${ship.id}`} className="rounded-lg border border-slate-200 bg-white p-5 hover:border-cyan-700">
            <p className="text-lg font-semibold">{ship.name ?? ship.mmsi ?? "Onbekend schip"}</p>
            <p className="mt-1 text-sm text-slate-500">{labelShipType(ship.shipType)}</p>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-slate-500">Passages</dt>
                <dd className="font-semibold">{ship.passageCount}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Laatst gezien</dt>
                <dd className="font-semibold">{formatDateTime(ship.lastSeenAt)}</dd>
              </div>
            </dl>
          </Link>
        ))}
      </div>
    </AppShell>
  );
}
