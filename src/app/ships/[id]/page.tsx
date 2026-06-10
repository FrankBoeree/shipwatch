import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { PassageTable } from "@/components/passage-table";
import { getShip, listPassages } from "@/lib/db";
import { formatDateTime, labelShipType } from "@/lib/format";
export const revalidate = 15;

export default async function ShipDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ship = await getShip(id);

  if (!ship) {
    notFound();
  }

  const passages = (await listPassages(200)).filter((passage) => passage.shipId === ship.id);

  return (
    <AppShell>
      <div className="mb-6">
        <p className="text-sm font-semibold uppercase tracking-wide text-cyan-800">Schiprecord</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">{ship.name ?? ship.mmsi ?? "Onbekend schip"}</h1>
      </div>
      <section className="mb-8 rounded-lg border border-slate-200 bg-white p-5">
        <dl className="grid gap-4 text-sm md:grid-cols-4">
          <div>
            <dt className="text-slate-500">Type</dt>
            <dd className="font-semibold">{labelShipType(ship.shipType)}</dd>
          </div>
          <div>
            <dt className="text-slate-500">MMSI</dt>
            <dd className="font-semibold">{ship.mmsi ?? "-"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Passages</dt>
            <dd className="font-semibold">{ship.passageCount}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Laatst gezien</dt>
            <dd className="font-semibold">{formatDateTime(ship.lastSeenAt)}</dd>
          </div>
        </dl>
      </section>
      <PassageTable passages={passages} />
    </AppShell>
  );
}
